import http from "node:http";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { runMigrations } from "@/server/db/migrations";
import { studies, users, workspaceAi, workspaces } from "@/server/db/schema";
import { seal, unseal } from "@/server/crypto";
import { createWorkspace } from "@/server/services/workspaces";
import { acceptInvite, createInvite } from "@/server/services/members";
import { aiCredentials, aiStatus, removeAiKey, saveAiSettings } from "@/server/services/ai-settings";
import { canUsePlaceholder, providerFor } from "@/server/ai";
import { authenticateApiKey, createApiKey, createWebhook, dispatchWebhooks, listWebhooks, revokeApiKey, signPayload, webhookUrlAllowed } from "@/server/services/api";
import { deleteAccount, exportUserData } from "@/server/services/users";
import { AppError } from "@/server/services/errors";
import { GET as listProjectsApi } from "@/app/api/v1/projects/route";
import { GET as responsesApi } from "@/app/api/v1/studies/[studyId]/responses/route";
import { newId } from "@/lib/ids";
import { NextRequest } from "next/server";

const code = (p: Promise<unknown>, c: string) => expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === c);

async function owner(withDemo = true) {
  const [u] = await db.insert(users).values({ name: "Owner", email: `o-${newId("t")}@example.com` }).returning();
  const ws = await createWorkspace(u!.id, { name: "P8", withDemo });
  return { user: u!, ws };
}
async function member(wsId: string, ownerId: string, role: "editor" | "analyst") {
  const [u] = await db.insert(users).values({ name: role, email: `${role}-${newId("t")}@example.com` }).returning();
  const { invite } = await createInvite(ownerId, wsId, { email: u!.email!, role });
  await acceptInvite(u!.id, u!.email!, invite.token);
  return u!;
}

beforeAll(async () => {
  await runMigrations();
});

describe("AI settings", () => {
  it("encrypts keys at rest and decides between AI and placeholder", async () => {
    expect(unseal(seal("secret value"))).toBe("secret value");
    expect(unseal(seal("x").replace(/.$/, "A"))).toBeNull();

    const { user, ws } = await owner(false);
    const analyst = await member(ws.id, user.id, "analyst");
    await code(providerFor(user.id, ws.id, "ai"), "aiNotConfigured");
    expect((await providerFor(user.id, ws.id, "placeholder")).name).toBe("builtin");

    await code(saveAiSettings(analyst.id, ws.id, { apiKey: "sk-ant-test-0000000000000000000000001234" }), "forbidden");
    await saveAiSettings(user.id, ws.id, { apiKey: "sk-ant-test-0000000000000000000000001234", model: "claude-sonnet-5-5" });
    const [row] = await db.select().from(workspaceAi).where(eq(workspaceAi.workspaceId, ws.id));
    expect(row!.apiKeyEnc).not.toContain("sk-ant");
    expect(await aiStatus(ws.id)).toMatchObject({ configured: true, source: "workspace", hint: "1234", model: "claude-sonnet-5-5" });
    expect(await aiCredentials(ws.id)).toEqual({ apiKey: "sk-ant-test-0000000000000000000000001234", model: "claude-sonnet-5-5" });
    expect((await providerFor(analyst.id, ws.id, "ai")).name).toBe("claude");
    await removeAiKey(user.id, ws.id);
    expect((await aiStatus(ws.id)).configured).toBe(false);

    // Placeholder: owners always; everyone in development; nobody else in production.
    const env = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string>).NODE_ENV = "production";
      expect(canUsePlaceholder("owner")).toBe(true);
      expect(canUsePlaceholder("analyst")).toBe(false);
      await code(providerFor(analyst.id, ws.id, "placeholder"), "forbidden");
    } finally {
      (process.env as Record<string, string>).NODE_ENV = env!;
    }
  }, 30_000);
});

describe("API keys and the public API", () => {
  it("authenticates by key, serves projects and responses, and stops after revoking", { timeout: 30_000 }, async () => {
    const { user, ws } = await owner();
    const { id, secret } = await createApiKey(user.id, ws.id, "R script");
    expect(secret).toMatch(/^lyze_/);
    expect(await authenticateApiKey(`Bearer ${secret}`)).toBe(ws.id);
    expect(await authenticateApiKey("Bearer lyze_wrongwrongwrongwrongwrong")).toBeNull();

    const res = await listProjectsApi(new Request("http://x/api/v1/projects", { headers: { authorization: `Bearer ${secret}` } }));
    const body = await res.json();
    expect(body.data[0].studies.map((s: { type: string }) => s.type).sort()).toEqual(["interview", "survey"]);

    const [survey] = await db.select().from(studies).where(eq(studies.workspaceId, ws.id)).then((r) => r.filter((s) => s.type === "survey"));
    const req = new NextRequest(`http://x/api/v1/studies/${survey!.id}/responses?format=csv`, { headers: { authorization: `Bearer ${secret}` } });
    const csv = await (await responsesApi(req, { params: Promise.resolve({ studyId: survey!.id }) })).text();
    expect(csv.split("\n").length).toBeGreaterThan(40);

    await revokeApiKey(user.id, ws.id, id);
    expect((await listProjectsApi(new Request("http://x", { headers: { authorization: `Bearer ${secret}` } }))).status).toBe(401);
  });
});

describe("webhooks", () => {
  it("only allows public URLs in production", () => {
    expect(webhookUrlAllowed("https://hooks.example.com/x", false)).toBe(true);
    for (const bad of ["http://hooks.example.com", "https://localhost/x", "https://127.0.0.1/x", "https://10.1.2.3", "https://192.168.0.5", "https://[::1]/", "ftp://x"]) expect(webhookUrlAllowed(bad, false)).toBe(false);
    expect(webhookUrlAllowed("http://localhost:4000/hook", true)).toBe(true);
  });

  it("delivers signed events", async () => {
    const { user, ws } = await owner(false);
    const received: { body: string; sig: string; event: string }[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ body, sig: String(req.headers["x-lyze-signature"]), event: String(req.headers["x-lyze-event"]) });
        res.writeHead(204).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;
    try {
      const hook = await createWebhook(user.id, ws.id, { url: `http://localhost:${port}/hook`, events: ["response.submitted"] });
      await dispatchWebhooks(ws.id, "response.submitted", { responseId: "rsp_1" });
      await dispatchWebhooks(ws.id, "consent.signed", { participantId: "p" });
      expect(received).toHaveLength(1);
      expect(received[0]!.event).toBe("response.submitted");
      expect(received[0]!.sig).toBe(signPayload(hook.secret, received[0]!.body));
      expect(JSON.parse(received[0]!.body).data).toEqual({ responseId: "rsp_1" });
      expect((await listWebhooks(ws.id))[0]!.lastStatus).toBe(204);
    } finally {
      server.close();
    }
  });
});

describe("account data", () => {
  it("exports a person's data and deletes the account safely", { timeout: 30_000 }, async () => {
    const { user, ws } = await owner(false);
    const editor = await member(ws.id, user.id, "editor");
    const data = await exportUserData(user.id);
    expect(data.workspaces.map((w) => w.role)).toEqual(["owner"]);

    await code(deleteAccount(user.id, "wrong@example.com"), "invalid");
    await code(deleteAccount(user.id, user.email!), "lastOwner");
    // The editor's own account can go; the shared workspace stays.
    await deleteAccount(editor.id, editor.email!);
    // Now the owner is alone, so the workspace goes with the account.
    expect(await deleteAccount(user.id, user.email!)).toEqual({ deletedWorkspaces: 1 });
    expect(await db.select().from(workspaces).where(eq(workspaces.id, ws.id))).toEqual([]);
  });
});
