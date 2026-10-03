import http from "node:http";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { db } from "@/server/db";
import { runMigrations } from "@/server/db/migrations";
import { users } from "@/server/db/schema";
import { createWorkspace } from "@/server/services/workspaces";
import { aiCredentials, aiStatus, assistantName, saveAiSettings } from "@/server/services/ai-settings";
import { providerFor } from "@/server/ai";
import { createLlm, extractJson, pingLlm } from "@/server/ai/llm";
import { AppError } from "@/server/services/errors";
import { AI_PROVIDERS, AI_PROVIDER_IDS, providerLabel } from "@/lib/ai-providers";
import { newId } from "@/lib/ids";

beforeAll(async () => {
  await runMigrations();
});

/** A stand-in for any OpenAI-compatible server (Ollama, Groq, OpenRouter…). */
async function fakeOpenAi(replies: string[]) {
  const seen: { path: string; auth?: string; body: Record<string, unknown> }[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seen.push({ path: req.url ?? "", auth: req.headers.authorization, body: raw ? JSON.parse(raw) : {} });
      res.setHeader("content-type", "application/json");
      if (req.url?.endsWith("/models")) return res.end(JSON.stringify({ data: [{ id: "m" }] }));
      res.end(JSON.stringify({ choices: [{ message: { content: replies.shift() ?? "{}" }, finish_reason: "stop" }] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  return { url: `http://localhost:${(server.address() as { port: number }).port}/v1`, seen, close: () => server.close() };
}

describe("AI providers", () => {
  it("lists free options and labels stored ids", () => {
    expect(AI_PROVIDER_IDS.filter((id) => AI_PROVIDERS[id].free)).toEqual(expect.arrayContaining(["gemini", "groq", "openrouter", "mistral", "ollama"]));
    expect(providerLabel("claude")).toBe("Claude");
    expect(providerLabel("ollama")).toBe("Ollama");
    expect(providerLabel("builtin")).toBe("Built-in");
  });

  it("pulls JSON out of chatty replies", () => {
    expect(extractJson('Sure! ```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":[1,2]} hope that helps')).toEqual({ a: [1, 2] });
    expect(() => extractJson("no json here")).toThrow();
  });

  it("talks to OpenAI-compatible servers, validates JSON and retries once", async () => {
    const fake = await fakeOpenAi(['```json\n{"points": "not an array"}\n```', '{"points": ["One", "Two"]}', "A written answer."]);
    try {
      const llm = createLlm({ provider: "custom", apiKey: "k-123", model: "my-model", baseUrl: fake.url });
      const r = await llm.json(z.object({ points: z.array(z.string()) }), "system", "summarise");
      expect(r.points).toEqual(["One", "Two"]);
      expect(fake.seen).toHaveLength(2);
      expect(fake.seen[0]!.path).toBe("/v1/chat/completions");
      expect(fake.seen[0]!.auth).toBe("Bearer k-123");
      expect(fake.seen[0]!.body).toMatchObject({ model: "my-model", response_format: { type: "json_object" } });
      expect(JSON.stringify(fake.seen[1]!.body)).toContain("previous answer was not valid");
      expect(await llm.write("system", "write")).toBe("A written answer.");
      expect(await pingLlm({ provider: "custom", apiKey: "", model: "m", baseUrl: fake.url })).toBe("ok");
    } finally {
      fake.close();
    }
  });

  it("saves any provider, and Ollama needs no key", async () => {
    const [u] = await db.insert(users).values({ name: "o", email: `o-${newId("t")}@example.com` }).returning();
    const ws = await createWorkspace(u!.id, { name: "Providers", withDemo: false });
    await expect(saveAiSettings(u!.id, ws.id, { provider: "gemini", model: "gemini-2.5-flash" })).rejects.toBeInstanceOf(AppError);
    await saveAiSettings(u!.id, ws.id, { provider: "gemini", model: "gemini-2.5-flash", apiKey: "AIza-test-key-0000000000000000wxyz" });
    expect(await aiStatus(ws.id)).toMatchObject({ provider: "gemini", hint: "wxyz", model: "gemini-2.5-flash" });
    expect(await assistantName(ws.id)).toBe("gemini");
    // Changing only the model keeps the key.
    await saveAiSettings(u!.id, ws.id, { provider: "gemini", model: "gemini-2.5-pro" });
    expect(await aiCredentials(ws.id)).toMatchObject({ apiKey: "AIza-test-key-0000000000000000wxyz", model: "gemini-2.5-pro" });

    const fake = await fakeOpenAi(['{"description": "A protected moment before the day starts."}']);
    try {
      await saveAiSettings(u!.id, ws.id, { provider: "ollama", model: "llama3.1", baseUrl: fake.url });
      expect(await aiCredentials(ws.id)).toMatchObject({ provider: "ollama", apiKey: "", baseUrl: fake.url });
      const assistant = await providerFor(u!.id, ws.id, "ai");
      expect(assistant.name).toBe("ollama");
      const text = await assistant.draftTheme({ name: "Pause", codes: [{ name: "Pause", definition: null, count: 3 }], quotes: ["ten minutes"] });
      expect(text).toBe("A protected moment before the day starts.");
      expect(fake.seen[0]!.auth).toBeUndefined();
    } finally {
      fake.close();
    }
  }, 30_000);
});
