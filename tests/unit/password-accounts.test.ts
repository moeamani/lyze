import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { runMigrations } from "@/server/db/migrations";
import { memberships, users } from "@/server/db/schema";
import { hashPassword, verifyPassword } from "@/server/password";
import { checkPassword, signUpWithPassword } from "@/server/services/password-accounts";
import { inviteOrAdd, listMembers } from "@/server/services/members";
import { createWorkspace } from "@/server/services/workspaces";
import { deleteAccount } from "@/server/services/users";
import { AppError } from "@/server/services/errors";
import { signUpSchema } from "@/lib/validation";
import { newId } from "@/lib/ids";

const code = (p: Promise<unknown>, c: string) => expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === c);
const uname = () => `r${newId("u").slice(-10).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;

beforeAll(async () => {
  await runMigrations();
});

describe("password hashing", () => {
  it("verifies the right password only, with a fresh salt each time", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).toMatch(/^scrypt\$16384\$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("correct horse batterY", a)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "garbage")).toBe(false);
  });
});

describe("username accounts", () => {
  it("validates names and passwords", () => {
    expect(signUpSchema.safeParse({ username: "Ana.R", password: "12345678" }).data?.username).toBe("ana.r");
    expect(signUpSchema.safeParse({ username: "ab", password: "12345678" }).error?.issues[0]?.message).toBe("usernameShort");
    expect(signUpSchema.safeParse({ username: "-ana", password: "12345678" }).error?.issues[0]?.message).toBe("username");
    expect(signUpSchema.safeParse({ username: "ana r", password: "12345678" }).error?.issues[0]?.message).toBe("username");
    expect(signUpSchema.safeParse({ username: "ana", password: "short" }).error?.issues[0]?.message).toBe("passwordShort");
  });

  it("signs up, refuses a taken name, and checks passwords case-insensitively by name", async () => {
    const name = uname();
    const { id } = await signUpWithPassword({ username: name.toUpperCase(), password: "s3cret-pass", name: "Ana" });
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row).toMatchObject({ username: name, email: null, name: "Ana", devMode: false });
    expect(row!.passwordHash).not.toContain("s3cret");
    await code(signUpWithPassword({ username: name, password: "another-pass" }), "conflict");
    expect(await checkPassword({ username: name.toUpperCase(), password: "s3cret-pass" })).toBe(id);
    expect(await checkPassword({ username: name, password: "wrong-pass" })).toBeNull();
    expect(await checkPassword({ username: `${name}x`, password: "s3cret-pass" })).toBeNull();
  });

  it("owners add a username account straight to a workspace; it can delete itself by typing its name", async () => {
    const [owner] = await db.insert(users).values({ name: "Owner", email: `o-${newId("t")}@example.com` }).returning();
    const ws = await createWorkspace(owner!.id, { name: "Usernames", withDemo: false });
    const name = uname();
    const { id } = await signUpWithPassword({ username: name, password: "s3cret-pass" });

    await code(inviteOrAdd(owner!.id, ws.id, { email: `${name}nobody`, role: "editor" }), "notFound");
    const result = await inviteOrAdd(owner!.id, ws.id, { email: name, role: "analyst" });
    expect(result).toMatchObject({ invite: null, added: { name } });
    expect((await listMembers(ws.id)).find((m) => m.userId === id)).toMatchObject({ role: "analyst", email: name });
    await code(inviteOrAdd(owner!.id, ws.id, { email: name, role: "editor" }), "conflict");
    // Only managers can add people.
    await code(inviteOrAdd(id, ws.id, { email: name, role: "editor" }), "forbidden");
    // An email still sends an invite link.
    expect((await inviteOrAdd(owner!.id, ws.id, { email: "someone@example.com", role: "editor" })).invite?.token).toBeTruthy();

    await code(deleteAccount(id, "wrong"), "invalid");
    await deleteAccount(id, name);
    expect(await db.select().from(memberships).where(eq(memberships.userId, id))).toHaveLength(0);
  }, 30_000);
});
