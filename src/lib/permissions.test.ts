import { describe, expect, it } from "vitest";
import { ROLES, can, isAtLeast, isRole } from "./permissions";

describe("permissions", () => {
  it("gives owners everything", () => {
    expect(can("owner", "members:manage")).toBe(true);
    expect(can("owner", "workspace:manage")).toBe(true);
  });

  it("lets editors edit and analyze but not manage members", () => {
    expect(can("editor", "content:edit")).toBe(true);
    expect(can("editor", "content:analyze")).toBe(true);
    expect(can("editor", "members:manage")).toBe(false);
    expect(can("editor", "workspace:manage")).toBe(false);
  });

  it("lets analysts analyze but not edit", () => {
    expect(can("analyst", "content:analyze")).toBe(true);
    expect(can("analyst", "content:edit")).toBe(false);
    expect(can("analyst", "audit:view")).toBe(false);
  });

  it("keeps viewers read-only", () => {
    expect(can("viewer", "workspace:view")).toBe(true);
    expect(can("viewer", "content:analyze")).toBe(false);
  });

  it("denies everything without a role", () => {
    expect(can(null, "workspace:view")).toBe(false);
    expect(can(undefined, "workspace:view")).toBe(false);
  });

  it("everyone can view the workspace", () => {
    for (const role of ROLES) expect(can(role, "workspace:view")).toBe(true);
  });

  it("ranks roles", () => {
    expect(isAtLeast("owner", "editor")).toBe(true);
    expect(isAtLeast("analyst", "editor")).toBe(false);
    expect(isAtLeast("viewer", "viewer")).toBe(true);
  });

  it("recognizes valid roles", () => {
    expect(isRole("editor")).toBe(true);
    expect(isRole("admin")).toBe(false);
    expect(isRole(3)).toBe(false);
  });
});
