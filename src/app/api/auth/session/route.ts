import { jsonOk } from "@/lib/api/envelope";

export async function GET() {
  return jsonOk({
    user: {
      id: "trader-001",
      email: "ayan@example.com",
      name: "Ayan Malik",
      role: "TRADER",
    },
  });
}
