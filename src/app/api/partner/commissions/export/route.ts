import { jsonFail } from "@/lib/api/envelope";
import { requirePartner, AuthError } from "@/lib/auth/session";
import { listPartnerCommissions } from "@/lib/services/partnerService";

function csvCell(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/partner/commissions/export — CSV of the partner's own commission ledger.
export async function GET() {
  try {
    const partner = await requirePartner();
    const records = await listPartnerCommissions(partner.id);

    const header = [
      "Date",
      "Trader",
      "Source",
      "Gross",
      "Commission %",
      "Commission",
      "Currency",
      "Status",
      "Period start",
      "Period end",
    ];
    const rows = records.map((r) => [
      new Date(r.createdAt).toISOString().slice(0, 10),
      r.traderName ?? "",
      r.sourceType,
      r.grossAmount,
      r.commissionPercent,
      r.commissionAmount,
      r.currency,
      r.status,
      r.periodStart ?? "",
      r.periodEnd ?? "",
    ]);

    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="aurix-commissions-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
