import { requireAuth } from "@/lib/auth/session";
import { handleAuthError } from "@/lib/api/envelope";
import { proxyGet, proxyPost } from "@/lib/terminal/dxfeedProxy";
import { getUpstreamPaths, getServerAuthHeaders } from "@/lib/terminal/dxfeedWidgetConfig";

// Scanner accepts both GET (queries) and POST (filter payloads) from the Heatmap widget.
export async function GET(req: Request) {
  try {
    await requireAuth();
    const { scanner: upstream } = getUpstreamPaths();
    const { scanner: auth } = getServerAuthHeaders();
    return proxyGet(req, upstream, auth);
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAuth();
    const { scanner: upstream } = getUpstreamPaths();
    const { scanner: auth } = getServerAuthHeaders();
    return proxyPost(req, upstream, auth);
  } catch (err) {
    return handleAuthError(err);
  }
}
