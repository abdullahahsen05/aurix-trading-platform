import { describe, expect, it } from "vitest";
import {
  brokerConnectionSchema,
  brokerProviderCreateSchema,
  brokerServerCreateSchema,
} from "@/lib/validation/schemas";

const providerId = "00000000-0000-4000-8000-000000000001";

describe("broker provider-first connection validation", () => {
  it("accepts catalog selections and explicitly marked manual entries", () => {
    expect(brokerConnectionSchema.safeParse({
      platform: "MT5",
      login: "12345",
      password: "secret",
      server: "Broker-Demo",
      brokerProviderId: providerId,
    }).success).toBe(true);
    expect(brokerConnectionSchema.safeParse({
      platform: "MT5",
      login: "12345",
      password: "secret",
      server: "Broker-Demo",
    }).success).toBe(false);
    expect(brokerConnectionSchema.safeParse({
      platform: "MT5",
      login: "12345",
      password: "secret",
      server: "Broker-Demo",
      brokerName: "Example Broker",
      useCustomBrokerServer: true,
    }).success).toBe(true);
  });

  it("requires at least one supported MetaTrader platform", () => {
    expect(brokerProviderCreateSchema.safeParse({
      displayName: "Example Broker",
      platformsSupported: [],
    }).success).toBe(false);
  });

  it("accepts only MT4 or MT5 configured servers", () => {
    expect(brokerServerCreateSchema.safeParse({
      platform: "MT5",
      serverName: "Example-Demo",
    }).success).toBe(true);
    expect(brokerServerCreateSchema.safeParse({
      platform: "CTRADER",
      serverName: "Example",
    }).success).toBe(false);
  });
});
