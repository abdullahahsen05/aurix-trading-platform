import { jsonOk } from "@/lib/api/envelope";

export async function GET() {
  return jsonOk({
    token: "mock-realtime-token",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
}
