import { describe, expect, test } from "vitest";
import {
  canAccessAdminRoutes,
  canAccessPartnerRoutes,
  canAccessTraderRoutes,
  isPartner,
  isAdmin,
  parseUserRole,
} from "@/lib/auth/rbac";

describe("isPartner", () => {
  test("true only for PARTNER", () => {
    expect(isPartner("PARTNER")).toBe(true);
    expect(isPartner("TRADER")).toBe(false);
    expect(isPartner("ADMIN")).toBe(false);
    expect(isPartner("SUPER_ADMIN")).toBe(false);
  });
});

describe("admin roles", () => {
  test("ADMIN and SUPER_ADMIN share admin access", () => {
    expect(isAdmin("ADMIN")).toBe(true);
    expect(isAdmin("SUPER_ADMIN")).toBe(true);
    expect(canAccessAdminRoutes("SUPER_ADMIN", "ACTIVE")).toBe(true);
  });

  test("unknown database roles fail closed", () => {
    expect(parseUserRole("SUPER_ADMIN")).toBe("SUPER_ADMIN");
    expect(parseUserRole("SUPERUSER")).toBeNull();
    expect(parseUserRole(null)).toBeNull();
  });
});

describe("canAccessPartnerRoutes", () => {
  test("active partner allowed", () => {
    expect(canAccessPartnerRoutes("PARTNER", "ACTIVE")).toBe(true);
  });
  test("suspended/pending partner blocked", () => {
    expect(canAccessPartnerRoutes("PARTNER", "SUSPENDED")).toBe(false);
    expect(canAccessPartnerRoutes("PARTNER", "PENDING")).toBe(false);
  });
  test("non-partners blocked", () => {
    expect(canAccessPartnerRoutes("TRADER", "ACTIVE")).toBe(false);
    expect(canAccessPartnerRoutes("ADMIN", "ACTIVE")).toBe(false);
    expect(canAccessPartnerRoutes("SUPER_ADMIN", "ACTIVE")).toBe(false);
  });
});

describe("partners are isolated from other workspaces", () => {
  test("partner cannot access admin or trader routes", () => {
    expect(canAccessAdminRoutes("PARTNER", "ACTIVE")).toBe(false);
    expect(canAccessTraderRoutes("PARTNER", "ACTIVE")).toBe(false);
  });
});
