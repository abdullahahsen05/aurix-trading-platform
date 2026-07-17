import { describe, expect, test } from "vitest";
import { canManageCalendar, canReadCalendarEvent } from "@/lib/calendar/access";

describe("calendar access", () => {
  test("active traders only see published trader events", () => {
    expect(canReadCalendarEvent({ role: "TRADER", userStatus: "ACTIVE", eventStatus: "PUBLISHED", audience: "TRADER" })).toBe(true);
    expect(canReadCalendarEvent({ role: "TRADER", userStatus: "ACTIVE", eventStatus: "DRAFT", audience: "TRADER" })).toBe(false);
    expect(canReadCalendarEvent({ role: "TRADER", userStatus: "ACTIVE", eventStatus: "CANCELLED", audience: "ALL" })).toBe(false);
  });

  test("partners cannot read or manage the trader calendar", () => {
    expect(canReadCalendarEvent({ role: "PARTNER", userStatus: "ACTIVE", eventStatus: "PUBLISHED", audience: "ALL" })).toBe(false);
    expect(canManageCalendar("PARTNER", "ACTIVE")).toBe(false);
  });

  test("admins and super admins can manage drafts", () => {
    expect(canReadCalendarEvent({ role: "ADMIN", userStatus: "ACTIVE", eventStatus: "DRAFT", audience: "ALL" })).toBe(true);
    expect(canManageCalendar("SUPER_ADMIN", "ACTIVE")).toBe(true);
  });

  test("suspended users cannot access calendar events", () => {
    expect(canReadCalendarEvent({ role: "ADMIN", userStatus: "SUSPENDED", eventStatus: "PUBLISHED", audience: "ALL" })).toBe(false);
  });
});
