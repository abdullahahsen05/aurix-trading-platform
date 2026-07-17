import { describe, expect, test } from "vitest";
import {
  TRADER_ROUTE_PREFIXES,
  roleHome,
  workspaceRedirect,
} from "@/lib/auth/routeAccess";

describe("role home routing", () => {
  test.each([
    ["TRADER", "/dashboard"],
    ["PARTNER", "/partner"],
    ["ADMIN", "/admin"],
    ["SUPER_ADMIN", "/admin"],
  ] as const)("routes %s to %s", (role, home) => {
    expect(roleHome(role)).toBe(home);
    expect(workspaceRedirect(role, "/login")).toBe(home);
  });
});

describe("workspace isolation", () => {
  test("partner is redirected away from every trader workspace", () => {
    for (const route of TRADER_ROUTE_PREFIXES) {
      expect(workspaceRedirect("PARTNER", route)).toBe("/partner");
    }
  });

  test("partner can remain inside partner routes", () => {
    expect(workspaceRedirect("PARTNER", "/partner")).toBeNull();
    expect(workspaceRedirect("PARTNER", "/partner/commissions")).toBeNull();
  });

  test("trader cannot enter partner or admin routes", () => {
    expect(workspaceRedirect("TRADER", "/partner")).toBe("/dashboard");
    expect(workspaceRedirect("TRADER", "/admin/users")).toBe("/dashboard");
  });

  test("admin roles cannot enter trader routes", () => {
    expect(workspaceRedirect("ADMIN", "/dashboard")).toBe("/admin");
    expect(workspaceRedirect("SUPER_ADMIN", "/academy")).toBe("/admin");
  });

  test("public demo routes stay public", () => {
    expect(workspaceRedirect("TRADER", "/demo")).toBeNull();
    expect(workspaceRedirect("PARTNER", "/demo")).toBe("/partner");
  });
});
