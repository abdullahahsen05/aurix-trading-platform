import { z } from "zod";

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const accountIdSchema = z.object({
  accountId: z.string().min(1),
});

export const analyticsSummaryQuerySchema = accountIdSchema.extend({
  period: z.enum(["DAILY", "WEEKLY", "MONTHLY", "ALL_TIME"]).default("ALL_TIME"),
});

export const tradeQuerySchema = paginationSchema.extend({
  accountId: z.string().optional(),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
});

export const crmNoteCreateSchema = z.object({
  traderId: z.string().min(1),
  note: z.string().min(1).max(2000),
});

export const riskRuleSchema = z.object({
  name: z.string().min(1),
  scope: z.enum(["PLATFORM", "ACCOUNT"]),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
  metric: z.enum(["DAILY_LOSS", "MAX_DRAWDOWN", "OPEN_TRADES"]),
  threshold: z.number().positive(),
  enabled: z.boolean(),
});
