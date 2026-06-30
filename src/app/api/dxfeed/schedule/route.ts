import { requireAuth } from "@/lib/auth/session";
import { handleAuthError } from "@/lib/api/envelope";
import { proxyGet } from "@/lib/terminal/dxfeedProxy";
import { getUpstreamPaths } from "@/lib/terminal/dxfeedWidgetConfig";

// Schedule endpoint typically does not require auth per dxFeed Candelabra docs,
// but we still gate it behind session auth to avoid public exposure.
export async function GET(req: Request) {
  try {
    await requireAuth();
    const { schedule: upstream } = getUpstreamPaths();
    return proxyGet(req, upstream, "");
  } catch (err) {
    return handleAuthError(err);
  }
}
