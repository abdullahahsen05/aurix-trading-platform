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

// ── AI Assistant ─────────────────────────────────────────────────────────────

export const aiChatSchema = z.object({
  message: z.string().trim().min(1, "Message is required").max(4000, "Message is too long"),
  pageContext: z.string().max(64).optional(),
  accountId: z.string().uuid().optional(),
});

// Used for the optional free-text focus on chart analysis (multipart field).
export const aiChartPromptSchema = z
  .string()
  .trim()
  .max(1000, "Focus prompt is too long")
  .optional();

const impactEnum = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const economicEventCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  countryCode: z.string().trim().max(8).optional().nullable(),
  currency: z.string().trim().min(2).max(8),
  impact: impactEnum,
  eventTime: z.string().datetime({ offset: true }),
  actual: z.string().trim().max(64).optional().nullable(),
  forecast: z.string().trim().max(64).optional().nullable(),
  previous: z.string().trim().max(64).optional().nullable(),
  source: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
  category: z.string().trim().max(64).optional().nullable(),
});

export const economicEventUpdateSchema = economicEventCreateSchema.partial();

export const aiUserLimitsUpdateSchema = z
  .object({
    chatDailyLimit: z.number().int().min(0).max(10000).nullable().optional(),
    chartDailyLimit: z.number().int().min(0).max(10000).nullable().optional(),
    aiEnabled: z.boolean().optional(),
  })
  .refine(
    (v) => v.chatDailyLimit !== undefined || v.chartDailyLimit !== undefined || v.aiEnabled !== undefined,
    { message: "No changes provided" },
  );

// ── Partner Dashboard (Phase 2) ──────────────────────────────────────────────

export const partnerTraderFilterSchema = z.object({
  status: z.enum(["ALL", "ACTIVE", "AT_RISK", "RESTRICTED"]).default("ALL"),
  range: z.enum(["7D", "30D", "90D", "ALL"]).default("ALL"),
  search: z.string().trim().max(120).optional(),
});

export const partnerNoteCreateSchema = z.object({
  traderId: z.string().uuid(),
  note: z.string().trim().min(1, "Note is required").max(2000, "Note is too long"),
});

export const setUserRoleSchema = z.object({
  role: z.enum(["TRADER", "ADMIN", "PARTNER"]),
});

export const assignPartnerSchema = z.object({
  partnerId: z.string().uuid().nullable(),
});

export const commissionStatusSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "PAID", "CANCELLED"]),
});

export const commissionCreateSchema = z.object({
  traderId: z.string().uuid().nullable().optional(),
  sourceType: z.string().trim().min(1).max(40).default("ADJUSTMENT"),
  grossAmount: z.number().min(0).default(0),
  commissionPercent: z.number().min(0).max(100).default(0),
  commissionAmount: z.number().min(0),
  currency: z.string().trim().length(3).default("USD"),
  periodStart: z.string().date().nullable().optional(),
  periodEnd: z.string().date().nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

export const referralClaimSchema = z.object({
  code: z.string().trim().min(2).max(40),
});

// ── Copy Trading (Phase 3) ───────────────────────────────────────────────────

const scalingModeEnum = z.enum([
  "FIXED_MULTIPLIER",
  "BALANCE_PROPORTIONAL",
  "EQUITY_PROPORTIONAL",
  "FIXED_LOT",
]);

const upperStringArray = z
  .array(z.string().trim().min(1).max(20))
  .max(100)
  .transform((arr) => arr.map((s) => s.toUpperCase()));

export const copyStrategyCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  masterAccountId: z.string().uuid(),
  riskMultiplier: z.number().positive().max(100).default(1),
  defaultScalingMode: scalingModeEnum.default("EQUITY_PROPORTIONAL"),
  maxFollowerLot: z.number().positive().max(1000).optional().nullable(),
  maxOpenCopiedTrades: z.number().int().min(0).max(10000).optional().nullable(),
  symbolAllowlist: upperStringArray.optional().nullable(),
  symbolBlocklist: upperStringArray.optional().nullable(),
});

export const copyStrategyUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(1000).optional().nullable(),
    status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
    mode: z.enum(["SIMULATION", "LIVE"]).optional(),
    liveEnabled: z.boolean().optional(),
    riskMultiplier: z.number().positive().max(100).optional(),
    defaultScalingMode: scalingModeEnum.optional(),
    maxFollowerLot: z.number().positive().max(1000).optional().nullable(),
    maxOpenCopiedTrades: z.number().int().min(0).max(10000).optional().nullable(),
    symbolAllowlist: upperStringArray.optional().nullable(),
    symbolBlocklist: upperStringArray.optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No changes provided" });

export const copyGlobalSettingsSchema = z
  .object({
    liveCopyEnabled: z.boolean().optional(),
    emergencyStopEnabled: z.boolean().optional(),
  })
  .refine((v) => v.liveCopyEnabled !== undefined || v.emergencyStopEnabled !== undefined, {
    message: "No changes provided",
  });

export const copyFollowSchema = z.object({
  followerAccountId: z.string().uuid(),
  consentAccepted: z.literal(true),
  scalingMode: scalingModeEnum.optional(),
  riskMultiplier: z.number().positive().max(100).optional(),
  fixedLot: z.number().positive().max(1000).optional(),
  maxLot: z.number().positive().max(1000).optional(),
});

export const copySubscriptionUpdateSchema = z
  .object({
    status: z.enum(["ACTIVE", "PAUSED", "REVOKED"]).optional(),
    riskMultiplier: z.number().positive().max(100).optional(),
    maxLot: z.number().positive().max(1000).optional().nullable(),
    scalingMode: scalingModeEnum.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No changes provided" });

// ── Background jobs (Phase 4.6) ──────────────────────────────────────────────

const jobTypeEnum = z.enum([
  "SYNC_ACCOUNT",
  "SYNC_ALL_CONNECTED_ACCOUNTS",
  "MONITOR_COPY_STRATEGY",
  "MONITOR_ALL_ACTIVE_COPY_STRATEGIES",
  "SIMULATE_COPY_EVENT",
  "SIMULATE_COPY_STRATEGY",
  "EXECUTE_COPY_EVENT",
  "RETRY_COPY_LOG",
  "CLEANUP_STALE_JOBS",
]);

export const jobEnqueueSchema = z.object({
  type: jobTypeEnum,
  // Payload holds IDs only — never secrets. Bounded shape.
  payload: z
    .object({
      accountId: z.string().uuid().optional(),
      strategyId: z.string().uuid().optional(),
      masterEventId: z.string().uuid().optional(),
      copyExecutionLogId: z.string().uuid().optional(),
    })
    .strict()
    .optional()
    .default({}),
});

export const jobRunSchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional(),
  types: z.array(jobTypeEnum).max(20).optional(),
});
