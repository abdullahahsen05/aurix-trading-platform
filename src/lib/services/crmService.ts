import { crmNotes, traders } from "@/lib/data/mockData";

export async function listTraderProfiles() {
  return traders;
}

export async function listCrmNotes(traderId?: string) {
  if (!traderId) return crmNotes;
  return crmNotes.filter((note) => note.traderId === traderId);
}
