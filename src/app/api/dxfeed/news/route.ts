import { requireAuth } from "@/lib/auth/session";
import { handleAuthError } from "@/lib/api/envelope";
import { proxyGet } from "@/lib/terminal/dxfeedProxy";
import { getUpstreamPaths, getServerAuthHeaders } from "@/lib/terminal/dxfeedWidgetConfig";

export async function GET(req: Request) {
  try {
    await requireAuth();
    const { news: upstream } = getUpstreamPaths();
    const { news: auth } = getServerAuthHeaders();
    return proxyGet(req, upstream, auth);
  } catch (err) {
    return handleAuthError(err);
  }
}
