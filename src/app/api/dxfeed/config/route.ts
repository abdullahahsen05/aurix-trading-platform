/**
 * GET /api/dxfeed/config
 *
 * Returns the dataProviders object the browser-side Candelabra widgets need.
 * All HTTP endpoints point at our server-side proxy routes (auth injected there).
 * The WebSocket feed URL is fetched from /api/dxfeed/feed-token at widget mount time.
 *
 * Nothing secret is returned here:
 *   - HTTP proxy paths (/api/dxfeed/*) carry no credentials
 *   - ipfAuthHeader / scannerAuthHeader / newsAuthHeader are empty strings — proxy injects auth
 *   - feedPath is populated at mount time via the feed-token endpoint
 *   - cdnUrl is the public CDN script URL (not a credential)
 */
import { requireAuth } from "@/lib/auth/session";
import { jsonOk, jsonFail, handleAuthError } from "@/lib/api/envelope";
import { getDxfeedWidgetEnvStatus } from "@/lib/terminal/dxfeedWidgetConfig";

export async function GET() {
  try {
    await requireAuth();

    const status = getDxfeedWidgetEnvStatus();

    if (!status.configured) {
      return jsonOk({
        configured: false,
        missing: status.missing,
      });
    }

    return jsonOk({
      configured: true,
      cdnUrl: status.cdnUrl,
      // dataProviders shape per dxFeed Candelabra docs:
      // https://widgets.dxfeed.com/docs/widgets/
      dataProviders: {
        // IPF: HTTP proxy injects auth — browser sends no credentials
        ipfPath: "/api/dxfeed/ipf",
        ipfAuthHeader: "",
        // Schedule: no auth required for schedule endpoint (public trading hours data)
        schedulePath: "/api/dxfeed/schedule",
        // Scanner: HTTP proxy injects auth (used by Heatmap widget)
        scannerPath: "/api/dxfeed/scanner",
        scannerAuthHeader: "",
        // News: HTTP proxy injects auth
        newsPath: "/api/dxfeed/news",
        newsAuthHeader: "",
        // Feed (WebSocket): populated at mount time via POST /api/dxfeed/feed-token.
        // feedPath and feedAuthHeader are set dynamically — never hardcoded client-side.
        feedPath: "",        // filled in by DxfeedTerminal after feed-token call
        feedAuthHeader: "",  // empty — WS auth is handled via token in the URL
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
