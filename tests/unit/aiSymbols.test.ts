import { describe, expect, test } from "vitest";
import { currenciesFromSymbols, symbolToCurrencies } from "@/lib/ai/symbols";

describe("symbolToCurrencies", () => {
  test("splits a standard forex pair", () => {
    expect(symbolToCurrencies("EURUSD")).toEqual(["EUR", "USD"]);
  });

  test("handles cross pairs", () => {
    expect(symbolToCurrencies("GBPJPY")).toEqual(["GBP", "JPY"]);
  });

  test("maps metals like XAUUSD", () => {
    expect(symbolToCurrencies("XAUUSD")).toEqual(["XAU", "USD"]);
  });

  test("strips common broker suffixes", () => {
    expect(symbolToCurrencies("EURUSD.m")).toEqual(["EUR", "USD"]);
    expect(symbolToCurrencies("eurusd-raw")).toEqual(["EUR", "USD"]);
  });

  test("returns empty for unknown/garbage symbols", () => {
    expect(symbolToCurrencies("")).toEqual([]);
    expect(symbolToCurrencies("ZZZ")).toEqual([]);
  });
});

describe("currenciesFromSymbols", () => {
  test("de-duplicates across multiple symbols", () => {
    const result = currenciesFromSymbols(["EURUSD", "GBPUSD", "XAUUSD"]);
    expect(result.sort()).toEqual(["EUR", "GBP", "USD", "XAU"].sort());
  });

  test("ignores unmappable symbols", () => {
    expect(currenciesFromSymbols(["EURUSD", "???"])).toEqual(["EUR", "USD"]);
  });
});
