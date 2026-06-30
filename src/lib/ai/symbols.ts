// ─────────────────────────────────────────────────────────────────────────────
// AI Assistant — trading-symbol → currency mapping
//
// Used to derive the set of currencies a trader is exposed to from their open
// and recent trade symbols, so the AI can surface relevant economic-calendar
// news. Best-effort: handles standard 6-char FX pairs, metals, and common
// broker suffixes (e.g. "EURUSD.m", "XAUUSD-RAW").
// ─────────────────────────────────────────────────────────────────────────────

// Common ISO 4217 currency codes traded as Forex, plus metals (XAU/XAG/XPT/XPD)
// and a few common crypto/base codes that appear in pairs.
const KNOWN_CODES = new Set<string>([
  "USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD",
  "SEK", "NOK", "DKK", "SGD", "HKD", "MXN", "ZAR", "TRY",
  "PLN", "CZK", "HUF", "CNH", "CNY", "RUB", "INR", "THB",
  "XAU", "XAG", "XPT", "XPD", // metals
  "BTC", "ETH", "XRP", "LTC", // common crypto bases
]);

/**
 * Normalize a raw broker symbol to its uppercase alphabetic core.
 * Strips digits, dots, dashes, underscores and trailing broker suffixes.
 * "EURUSD.m" → "EURUSD", "XAUUSD-RAW" → "XAUUSDRAW" → core handled below.
 */
function normalize(symbol: string): string {
  return symbol.toUpperCase().replace(/[^A-Z]/g, "");
}

/**
 * Map a single trading symbol to the currency codes it involves.
 * Returns an empty array if no known codes can be derived.
 */
export function symbolToCurrencies(symbol: string): string[] {
  if (!symbol) return [];
  const core = normalize(symbol);
  if (core.length < 6) {
    // Could be a single known code (rare) — return it if recognized.
    return KNOWN_CODES.has(core) ? [core] : [];
  }

  // Standard pair: first 3 + next 3 (covers EURUSD, GBPJPY, XAUUSD, BTCUSD).
  const base = core.slice(0, 3);
  const quote = core.slice(3, 6);

  const result: string[] = [];
  if (KNOWN_CODES.has(base)) result.push(base);
  if (KNOWN_CODES.has(quote) && quote !== base) result.push(quote);
  return result;
}

/**
 * Derive the de-duplicated set of currencies from a list of symbols.
 */
export function currenciesFromSymbols(symbols: string[]): string[] {
  const set = new Set<string>();
  for (const s of symbols) {
    for (const c of symbolToCurrencies(s)) set.add(c);
  }
  return [...set];
}
