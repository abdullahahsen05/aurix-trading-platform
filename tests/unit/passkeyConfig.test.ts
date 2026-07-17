import { describe, expect, test } from "vitest";
import { canUseTraderPasskeys, PasskeyConfigurationError, resolvePasskeyConfig } from "@/lib/auth/passkeyConfig";

describe("passkey configuration", () => {
  test("derives localhost defaults outside production", () => {
    expect(resolvePasskeyConfig({}, "development")).toEqual({
      rpID: "localhost",
      rpName: "WSA Global",
      expectedOrigin: "http://localhost:3000",
    });
  });

  test("requires HTTPS and a matching RP ID in production", () => {
    expect(() => resolvePasskeyConfig({ NEXT_PUBLIC_APP_URL: "http://aurix.example" }, "production")).toThrow(PasskeyConfigurationError);
    expect(() => resolvePasskeyConfig({ NEXT_PUBLIC_APP_URL: "https://app.aurix.example", WEBAUTHN_RP_ID: "other.example" }, "production")).toThrow(PasskeyConfigurationError);
    expect(resolvePasskeyConfig({ NEXT_PUBLIC_APP_URL: "https://app.aurix.example", WEBAUTHN_RP_ID: "aurix.example" }, "production").rpID).toBe("aurix.example");
  });

  test("only active traders can use trader passkeys", () => {
    expect(canUseTraderPasskeys("TRADER", "ACTIVE")).toBe(true);
    expect(canUseTraderPasskeys("ADMIN", "ACTIVE")).toBe(false);
    expect(canUseTraderPasskeys("PARTNER", "ACTIVE")).toBe(false);
    expect(canUseTraderPasskeys("TRADER", "SUSPENDED")).toBe(false);
  });
});
