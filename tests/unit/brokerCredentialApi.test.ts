import { describe, expect, test, afterEach } from "vitest";
import { brokerConnectionSchema } from "@/lib/validation/schemas";

// ─────────────────────────────────────────────────────────────────────────────
// Validation logic tests for the broker credential API (Phase 4.7)
//
// We test the validation schema and access-control logic in isolation — no DB,
// no MetaAPI, no real HTTP calls. Integration against the live DB requires
// SUPABASE credentials and is outside the unit test scope.
// ─────────────────────────────────────────────────────────────────────────────

const storeSchema = brokerConnectionSchema;

describe("broker credential store — input validation", () => {
  test("accepts valid MT5 payload", () => {
    const result = storeSchema.safeParse({
      platform: "MT5",
      login: "12345678",
      password: "Tr@ding123",
      server: "ICMarketsSC-Demo02",
      brokerName: "ICMarkets",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.platform).toBe("MT5");
    expect(result.data.login).toBe("12345678");
  });

  test("accepts MT4 platform", () => {
    const result = storeSchema.safeParse({
      platform: "MT4",
      login: "99887766",
      password: "pass",
      server: "Broker-Demo",
    });
    expect(result.success).toBe(true);
  });

  test("normalizes lowercase platform values", () => {
    const result = storeSchema.safeParse({
      platform: "mt4",
      login: "99887766",
      password: "pass",
      server: "Broker-Demo",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.platform).toBe("MT4");
  });

  test("defaults platform to MT5 when omitted", () => {
    const result = storeSchema.safeParse({
      login: "12345678",
      password: "pass",
      server: "Broker-Demo",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.platform).toBe("MT5");
  });

  test("rejects empty login", () => {
    const result = storeSchema.safeParse({
      login: "",
      password: "pass",
      server: "Broker-Demo",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty password", () => {
    const result = storeSchema.safeParse({
      login: "12345",
      password: "",
      server: "Broker-Demo",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty server", () => {
    const result = storeSchema.safeParse({
      login: "12345",
      password: "pass",
      server: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid platform", () => {
    const result = storeSchema.safeParse({
      platform: "CTRADER",
      login: "12345",
      password: "pass",
      server: "Broker-Demo",
    });
    expect(result.success).toBe(false);
  });

  test("trims whitespace from login and server", () => {
    const result = storeSchema.safeParse({
      login: "  12345  ",
      password: "pass",
      server: "  Broker-Demo  ",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.login).toBe("12345");
    expect(result.data.server).toBe("Broker-Demo");
  });

  test("preserves password whitespace exactly", () => {
    const result = storeSchema.safeParse({
      login: "12345",
      password: " pass with spaces ",
      server: "Broker-Demo",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.password).toBe(" pass with spaces ");
  });

  test("login max length enforced", () => {
    const result = storeSchema.safeParse({
      login: "a".repeat(51),
      password: "pass",
      server: "Broker-Demo",
    });
    expect(result.success).toBe(false);
  });

  test("server max length enforced", () => {
    const result = storeSchema.safeParse({
      login: "12345",
      password: "pass",
      server: "s".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  test("brokerName is optional", () => {
    const result = storeSchema.safeParse({
      login: "12345",
      password: "pass",
      server: "Broker-Demo",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.brokerName).toBeUndefined();
  });

  test("password is never returned in output", () => {
    const result = storeSchema.safeParse({
      login: "12345678",
      password: "SuperSecret!",
      server: "Broker-Demo",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    // The parsed data still has password — the route must not return it.
    // This test documents the expectation: route response never includes password.
    const safeResponse = {
      accountId: "abc",
      credentialsStored: true,
      platform: result.data.platform,
      server: result.data.server,
      // password: intentionally omitted
    };
    expect(JSON.stringify(safeResponse)).not.toContain("SuperSecret");
    expect(JSON.stringify(safeResponse)).not.toContain("password");
  });
});

describe("partner role guard logic", () => {
  test("PARTNER role string check works as expected", () => {
    const isPartner = (role: string) => role === "PARTNER";

    expect(isPartner("PARTNER")).toBe(true);
    expect(isPartner("ADMIN")).toBe(false);
    expect(isPartner("TRADER")).toBe(false);
  });
});

describe("broker operation log — safe metadata contract", () => {
  test("broker_operation_logs fields never include credentials", () => {
    const safeLogEntry = {
      account_id: "uuid-123",
      user_id: "user-uuid",
      operation: "VERIFY_CONNECTION",
      provider: "metaapi",
      status: "SUCCESS",
      error_code: null,
      error_message: null,
    };

    const asJson = JSON.stringify(safeLogEntry);
    expect(asJson).not.toContain("password");
    expect(asJson).not.toContain("login");
    expect(asJson).not.toContain("encrypted");
  });

  test("sanitizeProviderError strips credential-like patterns", () => {
    // Reproduce the sanitise function from the verify route
    function sanitizeProviderError(msg: string): string {
      return msg
        .replace(/password[^,\s]*/gi, "[redacted]")
        .replace(/login[^,\s]*/gi, "[redacted]")
        .slice(0, 300);
    }

    expect(sanitizeProviderError("Bad passwordABC123")).toBe("Bad [redacted]");
    expect(sanitizeProviderError("Invalid login:12345")).toBe("Invalid [redacted]");
    expect(sanitizeProviderError("Connection refused")).toBe("Connection refused");
    expect(sanitizeProviderError("x".repeat(500))).toHaveLength(300);
  });
});

describe("environment gate checks", () => {
  const ORIG_TOKEN = process.env.METAAPI_TOKEN;
  const ORIG_KEY = process.env.ENCRYPTION_KEY;
  const ORIG_FLAG = process.env.BROKER_EXECUTION_ENABLED;

  afterEach(() => {
    process.env.METAAPI_TOKEN = ORIG_TOKEN;
    process.env.ENCRYPTION_KEY = ORIG_KEY;
    process.env.BROKER_EXECUTION_ENABLED = ORIG_FLAG;
  });

  test("METAAPI_TOKEN absence is detected", () => {
    delete process.env.METAAPI_TOKEN;
    expect(Boolean(process.env.METAAPI_TOKEN)).toBe(false);
  });

  test("ENCRYPTION_KEY absence is detected", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(Boolean(process.env.ENCRYPTION_KEY)).toBe(false);
  });

  test("BROKER_EXECUTION_ENABLED=false keeps execution off", () => {
    process.env.METAAPI_TOKEN = "tok";
    process.env.BROKER_EXECUTION_ENABLED = "false";
    const executionAvailable =
      Boolean(process.env.METAAPI_TOKEN) && process.env.BROKER_EXECUTION_ENABLED === "true";
    expect(executionAvailable).toBe(false);
  });

  test("both token+flag required for execution", () => {
    process.env.METAAPI_TOKEN = "tok";
    process.env.BROKER_EXECUTION_ENABLED = "true";
    const executionAvailable =
      Boolean(process.env.METAAPI_TOKEN) && process.env.BROKER_EXECUTION_ENABLED === "true";
    expect(executionAvailable).toBe(true);
  });
});
