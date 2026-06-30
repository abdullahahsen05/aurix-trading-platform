import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { MetaApiBrokerAdapter } from "@/lib/broker/MetaApiBrokerAdapter";
import { MockBrokerAdapter } from "@/lib/broker/MockBrokerAdapter";

const ORIG_TOKEN = process.env.METAAPI_TOKEN;
const ORIG_FLAG = process.env.BROKER_EXECUTION_ENABLED;

afterEach(() => {
  process.env.METAAPI_TOKEN = ORIG_TOKEN;
  process.env.BROKER_EXECUTION_ENABLED = ORIG_FLAG;
});

describe("MetaApiBrokerAdapter.executionAvailable — live safety switch", () => {
  test("false when token missing", () => {
    delete process.env.METAAPI_TOKEN;
    process.env.BROKER_EXECUTION_ENABLED = "true";
    expect(new MetaApiBrokerAdapter().executionAvailable()).toBe(false);
  });

  test("false when flag not set, even with token", () => {
    process.env.METAAPI_TOKEN = "tok";
    delete process.env.BROKER_EXECUTION_ENABLED;
    expect(new MetaApiBrokerAdapter().executionAvailable()).toBe(false);
  });

  test("false when flag is not exactly 'true'", () => {
    process.env.METAAPI_TOKEN = "tok";
    process.env.BROKER_EXECUTION_ENABLED = "yes";
    expect(new MetaApiBrokerAdapter().executionAvailable()).toBe(false);
  });

  test("true only when token present AND flag enabled", () => {
    process.env.METAAPI_TOKEN = "tok";
    process.env.BROKER_EXECUTION_ENABLED = "true";
    expect(new MetaApiBrokerAdapter().executionAvailable()).toBe(true);
  });
});

describe("MockBrokerAdapter execution (test/dev only)", () => {
  beforeEach(() => {
    process.env.METAAPI_TOKEN = "tok";
  });

  test("openTrade returns a result without faking a real broker id pattern", async () => {
    const r = await new MockBrokerAdapter().openTrade({ accountId: "a", symbol: "EURUSD", side: "BUY", volume: 0.1 });
    expect(r.ok).toBe(true);
    expect(r.brokerOrderId).toContain("MOCK");
    expect(r.executedVolume).toBe(0.1);
  });
});
