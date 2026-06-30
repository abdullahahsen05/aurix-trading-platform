import { describe, expect, test } from "vitest";
import {
  canAccessAdminRoutes,
  canAccessPartnerRoutes,
  canAccessTraderRoutes,
  isPartner,
} from "@/lib/auth/rbac";

describe("isPartner", () => {
  test("true only for PARTNER", () => {
    expect(isPartner("PARTNER")).toBe(true);
    expect(isPartner("TRADER")).toBe(false);
    expect(isPartner("ADMIN")).toBe(false);
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
  });
});

describe("partners are isolated from other workspaces", () => {
  test("partner cannot access admin or trader routes", () => {
    expect(canAccessAdminRoutes("PARTNER", "ACTIVE")).toBe(false);
    expect(canAccessTraderRoutes("PARTNER", "ACTIVE")).toBe(false);
  });
});
