import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { runMigrations } from "@/server/db/migrations";
import { auditEvents, invites, studies, users } from "@/server/db/schema";
import { createWorkspace, deleteWorkspace, listUserWorkspaces, updateWorkspace, workspaceCounts } from "@/server/services/workspaces";
import { createProject, deleteProject, getProject, listProjects, setProjectArchived } from "@/server/services/projects";
import { createStudy, recentStudies, updateStudy } from "@/server/services/studies";
import { acceptInvite, changeRole, createInvite, listMembers, removeMember } from "@/server/services/members";
import { requireWorkspace } from "@/server/services/access";
import { AppError } from "@/server/services/errors";
import { newId } from "@/lib/ids";

async function makeUser(name: string) {
  const email = `${name.toLowerCase()}-${newId("t")}@example.com`;
  const [user] = await db.insert(users).values({ name, email }).returning();
  return user!;
}

async function expectCode(promise: Promise<unknown>, code: AppError["code"]) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

beforeAll(async () => {
  await runMigrations();
});

describe("workspaces", () => {
  it("creates a workspace with the creator as owner and an optional demo project", async () => {
    const ada = await makeUser("Ada");
    const ws = await createWorkspace(ada.id, { name: "Learning Lab", withDemo: true });

    expect(ws.slug).toMatch(/^learning-lab/);
    const mine = await listUserWorkspaces(ada.id);
    expect(mine).toEqual([expect.objectContaining({ id: ws.id, role: "owner" })]);

    const counts = await workspaceCounts(ws.id);
    // The demo survey ships with seeded responses (48 started, 45 completed).
    expect(counts).toEqual({ projects: 1, studies: 2, liveStudies: 1, members: 1, responses: 45 });
  });

  it("gives clashing names unique slugs", async () => {
    const ada = await makeUser("Ada");
    const a = await createWorkspace(ada.id, { name: "Same Name" });
    const b = await createWorkspace(ada.id, { name: "Same Name" });
    expect(a.slug).not.toBe(b.slug);
    expect(b.slug).toBe(`${a.slug}-2`);
  });

  it("refuses slug changes that collide", async () => {
    const ada = await makeUser("Ada");
    const a = await createWorkspace(ada.id, { name: "Alpha" });
    const b = await createWorkspace(ada.id, { name: "Beta" });
    await expectCode(updateWorkspace(ada.id, { workspaceId: b.id, name: "Beta", slug: a.slug }), "conflict");
  });

  it("hides workspaces from non-members", async () => {
    const ada = await makeUser("Ada");
    const eve = await makeUser("Eve");
    const ws = await createWorkspace(ada.id, { name: "Private" });
    await expectCode(requireWorkspace(eve.id, ws.id), "notFound");
    await expectCode(deleteWorkspace(eve.id, ws.id), "notFound");
  });
});

describe("projects and studies", () => {
  it("runs the project lifecycle and records an audit trail", async () => {
    const ada = await makeUser("Ada");
    const ws = await createWorkspace(ada.id, { name: "Lifecycle" });
    const project = await createProject(ada.id, ws.id, { name: "Wellbeing", color: "emerald" });
    const study = await createStudy(ada.id, ws.id, project.id, { name: "Week one", type: "interview" });

    expect(study.status).toBe("draft");
    await updateStudy(ada.id, ws.id, project.id, study.id, { name: "Week one", status: "live" });
    expect((await recentStudies(ws.id))[0]).toMatchObject({ id: study.id, status: "live", projectName: "Wellbeing" });

    await setProjectArchived(ada.id, ws.id, project.id, true);
    expect(await listProjects(ws.id)).toHaveLength(0);
    expect(await listProjects(ws.id, { archived: true })).toHaveLength(1);

    await deleteProject(ada.id, ws.id, project.id);
    expect(await db.select().from(studies).where(eq(studies.projectId, project.id))).toHaveLength(0);

    const actions = (await db.select().from(auditEvents).where(eq(auditEvents.workspaceId, ws.id))).map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "workspace.created",
        "project.created",
        "study.created",
        "study.status_changed",
        "project.archived",
        "project.deleted",
      ]),
    );
  });

  it("does not let a project id from another workspace leak through", async () => {
    const ada = await makeUser("Ada");
    const wsA = await createWorkspace(ada.id, { name: "A" });
    const wsB = await createWorkspace(ada.id, { name: "B" });
    const project = await createProject(ada.id, wsA.id, { name: "Only in A" });
    await expectCode(getProject(wsB.id, project.id), "notFound");
    await expectCode(createStudy(ada.id, wsB.id, project.id, { name: "x", type: "survey" }), "notFound");
  });

  it("enforces roles: analysts and viewers cannot edit", async () => {
    const ada = await makeUser("Ada");
    const ana = await makeUser("Ana");
    const ws = await createWorkspace(ada.id, { name: "Roles" });
    const { invite } = await createInvite(ada.id, ws.id, { email: ana.email!, role: "analyst" });
    await acceptInvite(ana.id, ana.email, invite.token);

    await expectCode(createProject(ana.id, ws.id, { name: "Nope" }), "forbidden");
    await changeRole(ada.id, ws.id, { userId: ana.id, role: "editor" });
    await expect(createProject(ana.id, ws.id, { name: "Now allowed" })).resolves.toMatchObject({ name: "Now allowed" });
  });
});

describe("members and invites", () => {
  it("only lets the invited address accept, and only once", async () => {
    const ada = await makeUser("Ada");
    const bob = await makeUser("Bob");
    const eve = await makeUser("Eve");
    const ws = await createWorkspace(ada.id, { name: "Invites" });
    const { invite } = await createInvite(ada.id, ws.id, { email: bob.email!.toUpperCase(), role: "viewer" });

    await expectCode(acceptInvite(eve.id, eve.email, invite.token), "forbidden");
    await expect(acceptInvite(bob.id, bob.email, invite.token)).resolves.toEqual({ slug: ws.slug });
    await expectCode(acceptInvite(bob.id, bob.email, invite.token), "inviteInvalid");

    const members = await listMembers(ws.id);
    expect(members.map((m) => [m.userId, m.role])).toEqual(
      expect.arrayContaining([
        [ada.id, "owner"],
        [bob.id, "viewer"],
      ]),
    );
  });

  it("rejects expired invites", async () => {
    const ada = await makeUser("Ada");
    const bob = await makeUser("Bob");
    const ws = await createWorkspace(ada.id, { name: "Expired" });
    const { invite } = await createInvite(ada.id, ws.id, { email: bob.email!, role: "editor" });
    await db.update(invites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invites.id, invite.id));
    await expectCode(acceptInvite(bob.id, bob.email, invite.token), "inviteInvalid");
  });

  it("refuses to invite existing members", async () => {
    const ada = await makeUser("Ada");
    const ws = await createWorkspace(ada.id, { name: "Dupes" });
    await expectCode(createInvite(ada.id, ws.id, { email: ada.email!, role: "editor" }), "conflict");
  });

  it("protects the last owner", async () => {
    const ada = await makeUser("Ada");
    const bob = await makeUser("Bob");
    const ws = await createWorkspace(ada.id, { name: "Owners" });
    await expectCode(changeRole(ada.id, ws.id, { userId: ada.id, role: "editor" }), "lastOwner");
    await expectCode(removeMember(ada.id, ws.id, ada.id), "lastOwner");

    const { invite } = await createInvite(ada.id, ws.id, { email: bob.email!, role: "editor" });
    await acceptInvite(bob.id, bob.email, invite.token);
    await changeRole(ada.id, ws.id, { userId: bob.id, role: "owner" });
    await expect(removeMember(ada.id, ws.id, ada.id)).resolves.toBeUndefined();
  });

  it("lets non-owners leave but not remove others", async () => {
    const ada = await makeUser("Ada");
    const bob = await makeUser("Bob");
    const cat = await makeUser("Cat");
    const ws = await createWorkspace(ada.id, { name: "Leaving" });
    for (const u of [bob, cat]) {
      const { invite } = await createInvite(ada.id, ws.id, { email: u.email!, role: "editor" });
      await acceptInvite(u.id, u.email, invite.token);
    }
    await expectCode(removeMember(bob.id, ws.id, cat.id), "forbidden");
    await removeMember(bob.id, ws.id, bob.id);
    expect((await listMembers(ws.id)).map((m) => m.userId)).not.toContain(bob.id);
  });
});
