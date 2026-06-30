import { requireAdmin } from "@/lib/auth/session";
import { jsonOk, handleAuthError } from "@/lib/api/envelope";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMarketDataProvider } from "@/lib/terminal/marketDataService";

export async function GET() {
  try {
    await requireAdmin();

    const db = createAdminClient();
    const { data: settings } = await db
      .from("terminal_provider_settings")
      .select("provider, is_enabled, demo_mode, notes, updated_at")
      .limit(1)
      .maybeSingle();

    const provider = getMarketDataProvider();
    const providerStatus = await provider.getStatus();

    // Env var presence checks (values are never exposed — only boolean flags)
    const envChecks = {
      MARKET_DATA_PROVIDER: Boolean(process.env.MARKET_DATA_PROVIDER),
      DXFEED_API_BASE_URL: Boolean(process.env.DXFEED_API_BASE_URL),
      DXFEED_API_KEY: Boolean(process.env.DXFEED_API_KEY),
      DXFEED_ACCOUNT_ID: Boolean(process.env.DXFEED_ACCOUNT_ID),
      DXFEED_WIDGET_CDN_URL: Boolean(process.env.DXFEED_WIDGET_CDN_URL),
      DXFEED_ENVIRONMENT: Boolean(process.env.DXFEED_ENVIRONMENT),
    };

    const dxfeedReadyCount = [
      envChecks.DXFEED_API_BASE_URL,
      envChecks.DXFEED_API_KEY,
      envChecks.DXFEED_ACCOUNT_ID,
    ].filter(Boolean).length;

    return jsonOk({
      settings: settings ?? {
        provider: "mock",
        is_enabled: true,
        demo_mode: true,
        notes: null,
        updated_at: null,
      },
      providerStatus,
      envChecks,
      dxfeedReady: dxfeedReadyCount === 3,
      dxfeedReadyCount,
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
