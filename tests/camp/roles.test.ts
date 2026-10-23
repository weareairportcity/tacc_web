import { describe, expect, it } from "vitest";
import { assertRole, resolveStaff } from "@/lib/camp/roles";
import { CampError, type Staff } from "@/lib/camp/types";

const coordinator: Staff = { email: "co@x.org", role: "coordinator", scope_kind: null, scope_value: null };
const leader: Staff = { email: "le@x.org", role: "leader", scope_kind: "fellowship", scope_value: "Qadash" };
const admin: Staff = { email: "ad@x.org", role: "admin", scope_kind: null, scope_value: null };

describe("assertRole", () => {
  it("refuses signed-out or unknown users", () => {
    expect(() => assertRole(null, ["coordinator"])).toThrow(CampError);
  });

  it("refuses leaders on coordinator actions", () => {
    expect(() => assertRole(leader, ["coordinator"])).toThrow("permission");
  });

  it("refuses coordinators on admin actions", () => {
    expect(() => assertRole(coordinator, ["admin"])).toThrow("permission");
  });

  it("lets coordinators and admins run coordinator actions", () => {
    expect(assertRole(coordinator, ["coordinator"])).toBe(coordinator);
    expect(assertRole(admin, ["coordinator"])).toBe(admin);
  });

  it("lets admins run admin actions", () => {
    expect(assertRole(admin, ["admin"])).toBe(admin);
  });
});

describe("resolveStaff", () => {
  it("treats CAMP_ADMIN_EMAILS as admins, case-insensitively", () => {
    expect(resolveStaff("Boss@X.org", null, " boss@x.org , other@x.org")?.role).toBe("admin");
  });

  it("overrides a lower camp_staff role for bootstrap admins", () => {
    expect(resolveStaff("co@x.org", coordinator, "co@x.org")?.role).toBe("admin");
  });

  it("falls back to the camp_staff row, or nobody", () => {
    expect(resolveStaff("le@x.org", leader, "")).toBe(leader);
    expect(resolveStaff("nobody@x.org", null, "")).toBeNull();
  });
});
