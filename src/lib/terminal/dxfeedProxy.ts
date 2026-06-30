/**
 * Shared HTTP proxy helper for dxFeed Candelabra data provider endpoints.
 * Strips hop-by-hop headers, forwards query params, and injects auth server-side.
 * SERVER ONLY.
 */

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade",
]);

function forwardHeaders(src: Headers, authHeader: string): Record<string, string> {
  const out: Record<string, string> = {};
  src.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k.toLowerCase()) && k.toLowerCase() !== "host") {
      out[k] = v;
    }
  });
  if (authHeader) out["Authorization"] = authHeader;
  return out;
}

export async function proxyGet(
  req: Request,
  upstreamBase: string,
  authHeader: string,
): Promise<Response> {
  if (!upstreamBase) {
    return new Response(JSON.stringify({ error: "dxFeed endpoint not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const incoming = new URL(req.url);
  const target = new URL(upstreamBase);
  // Forward all query params from the browser request
  incoming.searchParams.forEach((v, k) => target.searchParams.set(k, v));

  const upstream = await fetch(target.toString(), {
    method: "GET",
    headers: forwardHeaders(req.headers, authHeader),
  });

  const body = await upstream.arrayBuffer();
  const resHeaders = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k.toLowerCase())) resHeaders.set(k, v);
  });
  resHeaders.set("Cache-Control", "no-store");

  return new Response(body, { status: upstream.status, headers: resHeaders });
}

export async function proxyPost(
  req: Request,
  upstreamBase: string,
  authHeader: string,
): Promise<Response> {
  if (!upstreamBase) {
    return new Response(JSON.stringify({ error: "dxFeed endpoint not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const incoming = new URL(req.url);
  const target = new URL(upstreamBase);
  incoming.searchParams.forEach((v, k) => target.searchParams.set(k, v));

  const body = await req.arrayBuffer();
  const upstream = await fetch(target.toString(), {
    method: "POST",
    headers: forwardHeaders(req.headers, authHeader),
    body,
  });

  const resBody = await upstream.arrayBuffer();
  const resHeaders = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k.toLowerCase())) resHeaders.set(k, v);
  });
  resHeaders.set("Cache-Control", "no-store");

  return new Response(resBody, { status: upstream.status, headers: resHeaders });
}
