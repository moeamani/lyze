import { describe, expect, it } from "vitest";
import { createWorkspaceSchema, inviteSchema, projectSchema, slugSchema, studySchema } from "./index";

describe("validation", () => {
  it("normalizes emails in invites", () => {
    expect(inviteSchema.parse({ email: "  Ada@Example.COM ", role: "editor" }).email).toBe("ada@example.com");
  });

  it("does not allow inviting owners", () => {
    expect(inviteSchema.safeParse({ email: "a@b.co", role: "owner" }).success).toBe(false);
  });

  it("rejects bad emails with an i18n key", () => {
    const result = inviteSchema.safeParse({ email: "nope", role: "viewer" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("email");
  });

  it("requires a name", () => {
    const result = createWorkspaceSchema.safeParse({ name: "   " });
    expect(result.error?.issues[0]?.message).toBe("required");
  });

  it("defaults project color and drops empty descriptions", () => {
    const project = projectSchema.parse({ name: "Wellbeing", description: "  " });
    expect(project.color).toBe("violet");
    expect(project.description).toBeUndefined();
  });

  it("only accepts known study types", () => {
    expect(studySchema.safeParse({ name: "S", type: "survey" }).success).toBe(true);
    expect(studySchema.safeParse({ name: "S", type: "poll" }).success).toBe(false);
  });

  it("validates slugs", () => {
    expect(slugSchema.safeParse("my-lab").success).toBe(true);
    expect(slugSchema.parse("My-Lab")).toBe("my-lab");
    expect(slugSchema.safeParse("-lab").success).toBe(false);
    expect(slugSchema.safeParse("my lab").success).toBe(false);
    expect(slugSchema.safeParse("settings").error?.issues[0]?.message).toBe("slugReserved");
  });
});
