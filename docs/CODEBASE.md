# Aurix Trading Platform — Codebase Reference

**Stack:** Next.js 16 · Supabase (Postgres + Auth + Realtime) · TypeScript · Tailwind CSS  
**Auth model:** RBAC with three roles — `TRADER`, `ADMIN`, `PARTNER`  
**Build output:** 135 pages · 266 Vitest tests  
**Execution gate:** `BROKER_EXECUTION_ENABLED=false` (default — never flip without explicit approval)

---

## Directory layout

```
src/
├── app/
│   ├── (admin)/admin/          # Admin-only pages (requireAdmin guard)
│   ├── (auth)/                 # Unauthenticated auth pages
│   ├── (partner)/partner/      # Partner-role pages (requireAuth + PARTNER check)
│   ├── (public)/               # No auth required
│   ├── (trader)/               # Trader-role pages (requireAuth guard)
│   ├── api/                    # REST API routes
│   └── page.tsx                # Root redirect (→ /dashboard or /login)
├── components/
│   ├── app/                    # WorkspaceUI primitives (Panel, DataTable, StatusPill…)
│   ├── charts/                 # TradingChart (lightweight-charts wrapper)
│   ├── dashboard/              # DashboardKpiStrip, PerformanceRings, ModeOverlay
│   └── trading/                # TradingViewAdvancedChart
├── hooks/                      # useRealtimeUpdates, useNotifications…
├── lib/
│   ├── auth/session.ts         # requireAuth() / requireAdmin() — throw AuthError
│   ├── copy/                   # Copy trading domain types
│   ├── domain/                 # Core types, metrics, dashboard computations
│   ├── partner/                # Partner types, referral utilities
│   ├── services/               # Server-side service layer (DB calls)
│   └── utils/                  # format, cn helpers
├── middleware.ts                # Route protection + role redirects
└── proxy.ts                    # dxFeed proxy (server-only)
```

---

## UI Component primitives (`src/components/app/WorkspaceUI`)

| Component | Purpose |
|---|---|
| `WorkspacePage` | Page shell — eyebrow, title, description, optional action slot |
| `Panel` | Surface card with rounded border |
| `InlineStatusStrip` | Horizontal KPI strip; tones: `default` `accent` `lime` `danger` |
| `FilterChipRow` | Chip row for list filters |
| `DataTable` | Generic table with headers + row arrays |
| `StatusPill` | Badge; tones: `lime` `accent` `muted` `danger` |
| `GhostButton` / `PrimaryButton` | CTA buttons |
| `EmptyState` | Illustrated empty list placeholder |
| `PageActionGroup` | Right-aligned page header actions |
| `StatTile` | Single large stat with label |

All confirmation dialogs use `@radix-ui/react-dialog` with pattern:  
overlay `fixed inset-0 z-40 bg-black/75 backdrop-blur-sm`  
content `rounded-3xl border border-danger/30 bg-panel p-6` (destructive) or `border-line` (neutral)

---

## Auth pages `(auth)`

### `/login` — `(auth)/login/page.tsx`
Sign-in form. Email + password, submits to Supabase Auth. Redirects to `/dashboard` on success. Shows inline error on failure.

### `/register` — `(auth)/register/page.tsx`
New account registration. Accepts optional `?partner=CODE` query param to credit a referral. Creates Supabase user + profile row.

### `/forgot-password` — `(auth)/forgot-password/page.tsx`
Sends a Supabase password-reset email. Single email input, shows confirmation message.

### `/reset-password` — `(auth)/reset-password/page.tsx`
Consumes the reset token from URL fragment, lets user set a new password.

---

## Trader pages `(trader)`

### `/dashboard` — `(trader)/dashboard/page.tsx`
Main trader workspace.
- **Account selector** — dropdown when user has >1 connected account
- **KPI strip** — Balance, Equity, Floating PnL (live, refetched every 60 s)
- **Market sentiment strip** — Session, Trend Bias (derived), Volatility, Performance Score
- **Performance rings** — Win %, Profit Factor, Win/Loss ratio for selected period
- **TradingChart** — lightweight-charts equity curve (dynamically imported, SSR off)
- **Mode overlays** — Current Equity / Check Limits / Profit Summary / Calendar Tracker drawers
- **Realtime** — subscribes to `useRealtimeUpdates()` for live account state

### `/accounts` — `(trader)/accounts/page.tsx`
List of trader's connected MT5 accounts as cards.
- Status badges using tone map: `CONNECTED→lime`, `SYNCING/PENDING→accent`, `RESTRICTED→danger`, `DISCONNECTED/INACTIVE→muted`
- "Connect account" action opens Broker Connect flow
- No duplicate DataTable (removed in UX Phase 3)

### `/accounts/[accountId]` — `(trader)/accounts/[accountId]/page.tsx`
Detail view for a single trading account.
- Full account stats: balance, equity, drawdown, open/closed trades count
- Syncs trades via `/api/trading-accounts/[id]/sync`
- Broker credential management (view / update encrypted credentials)
- Trade history table

### `/trades` — `(trader)/trades/page.tsx`
Full trade history across all accounts.
- Filter by symbol, direction, date range
- P&L per trade, open/closed status
- Pagination

### `/copy-trading` — `(trader)/copy-trading/page.tsx`
Copy trading hub.
- **Available strategies** — cards with mode badge (LIVE=danger, SIMULATION=muted) + tooltip
- **Follow dialog** — account selector + risk consent checkbox before subscribing
- **My following** — subscription cards with PREMIUM/NORMAL tier badge, pause/resume/stop actions
- **Stop following confirmation** — Radix Dialog warns open positions are not auto-closed
- **Copy logs** — status filter (ALL/SUCCESS/SKIPPED/FAILED) + "Showing X of Y" count

### `/ai` — `(trader)/ai/page.tsx`
AI trading assistant chat.
- **Token credit balance** in `InlineStatusStrip` (danger tone when < 5 000 credits), fetches `/api/ai/credits`
- **Chart analysis** — uploads chart image, returns AI analysis
- **Chat interface** — streaming AI responses via `/api/ai/chat`
- Credit deduction tracked in `ai_user_limits.ai_token_credits`

### `/marketplace` — `(trader)/marketplace/page.tsx`
Bot marketplace browser.
- **Platform filter** — MT4 / MT5 / All
- **Risk filter** — LOW / MEDIUM / HIGH / All (added UX Phase 4)
- Product cards with rating, price, category
- "Request access" action opens modal

### `/marketplace/[slug]` — `(trader)/marketplace/[slug]/page.tsx`
Single product detail page.
- Full description, screenshots, stats
- License type, MT5 lock status
- Request-access button (POST `/api/marketplace/products/[slug]/request-access`)

### `/my-bots` — `(trader)/my-bots/page.tsx`
Trader's purchased / licensed bots.
- Active licenses with expiry dates
- MT5 verification key display
- Download links when available
- License re-issue request

### `/risk` — `(trader)/risk/page.tsx`
Risk management dashboard.
- Active risk rules (daily loss limit, max drawdown, open trade limit)
- Risk event log with acknowledge action
- Create / edit / delete rules

### `/evaluations` — `(trader)/evaluations/page.tsx`
Trader evaluation programs list.
- Browse active evaluation programs
- Start a new attempt
- List of user's own attempts with status (ACTIVE / PASSED / FAILED / NEEDS_REVIEW)

### `/evaluations/[attemptId]` — `(trader)/evaluations/[attemptId]/page.tsx`
Live evaluation attempt detail.
- Real-time rule pass/fail against linked demo account
- Progress bars per metric
- Admin-linked demo account info
- Submit for review action

### `/evaluations/certificates` — `(trader)/evaluations/certificates/page.tsx`
Trader's earned certificates.
- List of passed evaluations with certificate number
- Link to public verify page
- Download / share actions

### `/academy` — `(trader)/academy/page.tsx`
Learning management system home.
- Course grid with progress indicators
- Enrolled vs available courses
- Filter by category / difficulty

### `/academy/[courseSlug]` — `(trader)/academy/[courseSlug]/page.tsx`
Course overview page.
- Syllabus with module and lesson list
- Enroll / continue CTA
- Course stats (duration, lessons, enrolled count)

### `/academy/[courseSlug]/lessons/[lessonSlug]` — `(trader)/academy/[courseSlug]/lessons/[lessonSlug]/page.tsx`
Individual lesson player.
- Video / text / material content
- Knowledge-check quiz (quiz questions, submit, score)
- Notes panel (create / edit personal notes)
- Lesson completion tracking (POST `/api/academy/lessons/[id]/complete`)
- Next lesson navigation

### `/academy/webinars` — `(trader)/academy/webinars/page.tsx`
Live and recorded webinar browser.
- Upcoming webinar schedule
- Join link (POST `/api/academy/webinars/[id]/join`)
- Recording playback for past sessions

### `/analytics` — `(trader)/analytics/page.tsx`
Advanced analytics.
- Equity curve chart with date range selector
- Period summary: total trades, win rate, profit factor, avg win/loss
- Fetches `/api/analytics/equity-curve` and `/api/analytics/summary`

### `/reports` — `(trader)/reports/page.tsx`
Downloadable trade reports.
- Date-range selector
- CSV / PDF export of trade history
- P&L breakdown by symbol

### `/settings` — `(trader)/settings/page.tsx`
Trader account settings.
- Profile (name, email, timezone)
- Notification preferences
- Password change
- API key management

### `/terminal` — `(trader)/terminal/page.tsx`
Institutional-grade trading terminal.
- **Symbol search** — fetches symbol list from provider
- **Candle chart** — lightweight-charts OHLCV via `/api/terminal/candles`
- **DOM / order book heatmap** — `/api/terminal/dom` + `/api/terminal/heatmap`
- **Volume profile** — `/api/terminal/volume-profile`
- **Macro / news feed** — `/api/terminal/macro` + `/api/terminal/news`
- **Provider badge** — "Demo Market Data" when dxFeed live not enabled
- **dxFeed gate** — Professional Data lock button (modal) if live feed not subscribed
- Layout preferences persisted via `/api/terminal/preferences`

---

## Admin pages `(admin)/admin`

All admin routes are guarded by `requireAdmin()` which throws `AuthError` if role ≠ ADMIN.

### `/admin` — `(admin)/admin/page.tsx`
Admin overview dashboard.
- **Platform health badge** — dynamic: `lime / "Stable"` when 0 open risk events; `danger / "Needs attention"` otherwise
- **Risk queue badge** — live count: `"X open"` (danger) or `"Clear"` (lime)
- Summary tiles: traders, accounts, equity AUM, open risk events
- Quick-links to sub-sections

### `/admin/accounts` — `(admin)/admin/accounts/page.tsx`
Full account management.
- **Status filter chips** — ALL / CONNECTED / SYNCING / PENDING / DISCONNECTED / RESTRICTED / **INACTIVE**
- **Status tone map** — `CONNECTED→lime`, `SYNCING/PENDING→accent`, `RESTRICTED→danger`, `DISCONNECTED/INACTIVE→muted`
- **Deactivate confirmation dialog** — danger-bordered, warns about open positions
- **Reactivate confirmation dialog** — accent-bordered
- **Credential dialog** — amber warning when account is CONNECTED
- **Humanized sync messages** — "MetaAPI is still deploying…" / "N trade(s) updated"
- **Success message auto-dismiss** — 6-second timeout
- DirectorySearchOverlay includes INACTIVE filter option
- InlineStatusStrip shows Inactive count

### `/admin/copy` — `(admin)/admin/copy/page.tsx`
Copy trading control panel.
- **Execution banner** — dynamic: danger-bordered when live-configured, accent when simulation
- **Enable live copy confirmation** — Radix Dialog before enabling (disable goes direct)
- **Success notices auto-dismiss** — 6 seconds
- Strategy list with follower counts
- **Events panel** — "Showing X of Y" count header, simulate / execute actions
- **Logs panel** — "Showing X of Y" count header, retry action

### `/admin/ai` — `(admin)/admin/ai/page.tsx`
AI usage management.
- User AI enable/disable toggles
- **Disable AI confirmation** — Radix Dialog before disabling
- **Success notices auto-dismiss** — 6 seconds
- Token credit top-up per user
- Usage statistics

### `/admin/evaluations` — `(admin)/admin/evaluations/page.tsx`
Evaluation program management.
- Programs tab — create / edit / delete programs, set pass thresholds
- **Attempts tab** — **status filter** (ALL / ACTIVE / PASSED / FAILED / NEEDS_REVIEW) with counts
- Attempt detail: link demo account, override pass/fail, revoke certificate
- Analytics tab — pass rates, avg attempt duration

### `/admin/users` — `(admin)/admin/users/page.tsx`
User account management.
- List all platform users with role badges
- Change role (TRADER / ADMIN / PARTNER)
- Enable / disable account
- Search by name / email

### `/admin/traders` — `(admin)/admin/traders/page.tsx`
Trader-specific admin view.
- All traders with account count, equity, risk status
- Assign / unassign partner
- View linked partner

### `/admin/marketplace` — `(admin)/admin/marketplace/page.tsx`
Bot marketplace admin.
- Create / edit / delete products
- Grant / revoke access per user
- License management (reissue, revoke)
- Verification log viewer
- Marketplace analytics

### `/admin/academy` — `(admin)/admin/academy/page.tsx`
LMS admin.
- Courses CRUD (title, slug, description, category, difficulty)
- Modules CRUD within course
- Lessons CRUD (content, video URL, quiz questions, materials)
- Webinars CRUD (schedule, join link)
- Student analytics (completion rates, quiz scores)
- Instructor remarks on attempts

### `/admin/risk` — `(admin)/admin/risk/page.tsx`
Platform-wide risk management.
- All open risk events across all traders
- Acknowledge / escalate events
- Global risk rule templates

### `/admin/audit` — `(admin)/admin/audit/page.tsx`
Audit log viewer.
- All admin actions with actor, timestamp, target
- Filter by action type, actor, date range

### `/admin/crm` — `(admin)/admin/crm/page.tsx`
Internal CRM for traders.
- Trader notes (create / edit)
- Contact history
- Admin-to-trader notes visible to partners with access

### `/admin/economic-calendar` — `(admin)/admin/economic-calendar/page.tsx`
Economic event management.
- Create / edit / delete calendar events
- Impact level (HIGH / MEDIUM / LOW)
- Events visible to traders in terminal

### `/admin/subscriptions` — `(admin)/admin/subscriptions/page.tsx`
Platform subscription / billing overview.
- Active subscription tiers per user
- dxFeed professional data subscription status

### `/admin/jobs` — `(admin)/admin/jobs/page.tsx`
Background job queue.
- List all jobs with status (PENDING / RUNNING / DONE / FAILED / CANCELLED)
- Cancel / retry individual jobs
- Enqueue new job manually
- Run-now for immediate execution

### `/admin/terminal` — `(admin)/admin/terminal/page.tsx`
Terminal provider settings.
- dxFeed configuration (API key, endpoint)
- Health-check button
- Live vs mock provider toggle
- Connection status

---

## Partner pages `(partner)/partner`

All partner routes require `PARTNER` role.

### `/partner` — `(partner)/partner/page.tsx`
Partner overview dashboard.
- **InlineStatusStrip** — Assigned traders, Connected accounts, Team equity, Aggregate PnL, Open risk events, Pending commission
- **Referral code panel** — displays code with one-click copy button, shows `/register?partner=CODE` share URL
- **Trader watchlist** — table (up to 12); shows "Showing 12 of N" when truncated
- **Recent activity** — last 10 events across all assigned traders
- **Risk queue** — open risk events for assigned traders

### `/partner/traders` — `(partner)/partner/traders/page.tsx`
Full trader list for the partner.
- All assigned traders with account counts, equity, risk status
- Click-through to trader detail (read-only)

### `/partner/commissions` — `(partner)/partner/commissions/page.tsx`
Commission ledger.
- **Status filter chips** — ALL / PENDING / APPROVED / PAID / CANCELLED with counts
- Commission records with type (CPA / REBATE / PROFIT_SHARE), amount, period
- CSV export via `/api/partner/commissions/export`

### `/partner/crm` — `(partner)/partner/crm/page.tsx`
Partner CRM view.
- Notes on assigned traders (create / edit)
- Read-only admin notes visible if shared

---

## Public pages `(public)`

### `/certificates/verify/[verificationId]` — `(public)/certificates/verify/[verificationId]/page.tsx`
Public certificate verification page.
- No auth required
- Fetches certificate by verification ID
- Displays trader name, program, pass date, certificate number
- "Valid" / "Revoked" status badge

---

## Root

### `/` — `src/app/page.tsx`
Root redirect. Checks session role and redirects to `/dashboard`, `/admin`, or `/partner` as appropriate. Falls back to `/login` if unauthenticated.

---

## API routes `src/app/api`

### Auth & Session

| Route | Method | Function |
|---|---|---|
| `/api/auth/session` | GET | Returns current session user + role |
| `/api/auth/profile` | GET / PATCH | Read or update display name, timezone |
| `/api/auth/referral` | GET | Returns referral code for current user |

### Trading Accounts

| Route | Method | Function |
|---|---|---|
| `/api/trading-accounts` | GET / POST | List or create trading accounts |
| `/api/trading-accounts/[accountId]` | GET / PATCH / DELETE | Read, update, or remove an account |
| `/api/trading-accounts/[accountId]/sync` | POST | Trigger MetaAPI sync for account |
| `/api/trading-accounts/[accountId]/broker-credentials` | GET / POST | Read or store encrypted broker credentials |
| `/api/trading-accounts/[accountId]/broker-credentials/verify` | POST | Test broker credentials against MetaAPI |

### Trades

| Route | Method | Function |
|---|---|---|
| `/api/trades` | GET | All trades for current user (with filters) |
| `/api/trader/daily-pnl` | GET | Daily P&L aggregation |
| `/api/trader/sync-trades` | POST | Manual trade sync trigger |

### Risk

| Route | Method | Function |
|---|---|---|
| `/api/risk/rules` | GET / POST | List or create risk rules |
| `/api/risk/rules/[id]` | PATCH / DELETE | Update or delete a risk rule |
| `/api/risk/events` | GET | List risk events for current user |
| `/api/risk/events/[id]/acknowledge` | POST | Mark a risk event acknowledged |

### Copy Trading

| Route | Method | Function |
|---|---|---|
| `/api/copy/strategies` | GET | Public strategy list |
| `/api/copy/strategies/[id]/follow` | POST | Subscribe to a strategy |
| `/api/copy/my-subscriptions` | GET | Current user's subscriptions |
| `/api/copy/subscriptions/[id]` | PATCH | Update subscription status (ACTIVE/PAUSED/REVOKED) |
| `/api/copy/logs` | GET | Copy execution logs for current user |

### AI

| Route | Method | Function |
|---|---|---|
| `/api/ai/chat` | POST | Streaming AI chat (deducts credits) |
| `/api/ai/chart-analysis` | POST | Chart image analysis (deducts credits) |
| `/api/ai/credits` | GET | Returns `{ credits: number }` for current user |

### Analytics

| Route | Method | Function |
|---|---|---|
| `/api/analytics/equity-curve` | GET | Equity curve data points for charting |
| `/api/analytics/summary` | GET | Period stats (win rate, PF, trades) |

### Terminal

| Route | Method | Function |
|---|---|---|
| `/api/terminal/symbols` | GET | Symbol search list |
| `/api/terminal/candles` | GET | OHLCV candle data for symbol+timeframe |
| `/api/terminal/quote` | GET | Latest quote for symbol |
| `/api/terminal/dom` | GET | Depth of market / order book |
| `/api/terminal/heatmap` | GET | Market heatmap data |
| `/api/terminal/volume-profile` | GET | Volume-at-price profile |
| `/api/terminal/macro` | GET | Macro indicators |
| `/api/terminal/news` | GET | News feed for symbol |
| `/api/terminal/preferences` | GET / PUT | Terminal layout preferences |
| `/api/terminal/provider/status` | GET | Current data provider status (mock/live) |

### dxFeed (gated)

| Route | Method | Function |
|---|---|---|
| `/api/dxfeed/config` | GET | dxFeed configuration |
| `/api/dxfeed/feed-token` | GET | Auth token for dxFeed WebSocket |
| `/api/dxfeed/ipf` | GET | Instrument profile feed |
| `/api/dxfeed/news` | GET | dxFeed news stream |
| `/api/dxfeed/scanner` | GET | Market scanner results |
| `/api/dxfeed/schedule` | GET | Trading schedule data |

### Marketplace

| Route | Method | Function |
|---|---|---|
| `/api/marketplace/products` | GET | Public product listing |
| `/api/marketplace/products/[slug]` | GET | Single product detail |
| `/api/marketplace/products/[slug]/request-access` | POST | Submit access request |
| `/api/my-bots` | GET | Trader's licensed bots |
| `/api/my-bots/licenses` | GET | All license records |
| `/api/my-bots/[accessId]/licenses` | GET | Licenses for a specific access grant |
| `/api/licenses/verify` | GET | Public license verification endpoint |

### Academy (Trader)

| Route | Method | Function |
|---|---|---|
| `/api/academy/courses` | GET | List published courses |
| `/api/academy/courses/[courseSlug]` | GET | Course detail with modules |
| `/api/academy/courses/[courseSlug]/lessons/[lessonSlug]` | GET | Lesson content |
| `/api/academy/lessons/[lessonId]/start` | POST | Mark lesson started |
| `/api/academy/lessons/[lessonId]/complete` | POST | Mark lesson completed |
| `/api/academy/lessons/[lessonId]/questions` | GET / POST | Quiz questions / submit answers |
| `/api/academy/lessons/[lessonId]/notes` | GET / POST / PATCH | Personal lesson notes |
| `/api/academy/webinars` | GET | Webinar list |
| `/api/academy/webinars/[id]/join` | POST | Register/join a webinar |

### Evaluations (Trader)

| Route | Method | Function |
|---|---|---|
| `/api/evaluations/programs` | GET | List active evaluation programs |
| `/api/evaluations/programs/[id]` | GET | Program detail and rules |
| `/api/evaluations/attempts` | GET / POST | List or start an attempt |
| `/api/evaluations/attempts/[id]` | GET | Attempt detail with live rule checks |
| `/api/evaluations/attempts/[id]/certificate` | GET | Generate / fetch certificate PDF |
| `/api/evaluations/certificates` | GET | All certificates for current user |
| `/api/certificates/verify/[verificationId]` | GET | Public certificate verification |

### Notifications

| Route | Method | Function |
|---|---|---|
| `/api/notifications` | GET | Unread notifications for current user |
| `/api/notifications/[id]/read` | PATCH | Mark single notification read |
| `/api/notifications/read-all` | POST | Mark all notifications read |

### Partner

| Route | Method | Function |
|---|---|---|
| `/api/partner/summary` | GET | Partner KPI summary (includes `referralCode`) |
| `/api/partner/traders` | GET | Assigned traders list |
| `/api/partner/traders/[id]` | GET | Single trader detail |
| `/api/partner/commissions` | GET | Commission ledger |
| `/api/partner/commissions/export` | GET | CSV export of commissions |
| `/api/partner/activities` | GET | Recent activity feed |
| `/api/partner/risk-events` | GET | Risk events for assigned traders |
| `/api/partner/crm/notes` | GET / POST | CRM notes on assigned traders |

### Realtime

| Route | Method | Function |
|---|---|---|
| `/api/realtime/token` | GET | Supabase Realtime auth token |

### Economic Calendar

| Route | Method | Function |
|---|---|---|
| `/api/economic-calendar` | GET | Public event list |

### CRM (Admin)

| Route | Method | Function |
|---|---|---|
| `/api/crm/traders` | GET | All traders for CRM view |
| `/api/crm/notes` | GET / POST | Notes across traders |

### Admin — Accounts

| Route | Method | Function |
|---|---|---|
| `/api/admin/accounts` | GET | All trading accounts |
| `/api/admin/accounts/[accountId]/status` | GET | Account status detail |
| `/api/admin/accounts/[accountId]/deactivate` | POST | Deactivate account (sets INACTIVE) |
| `/api/admin/accounts/[accountId]/reactivate` | POST | Reactivate a deactivated account |

### Admin — Copy Trading

| Route | Method | Function |
|---|---|---|
| `/api/admin/copy/settings` | GET / PATCH | Global copy trading settings |
| `/api/admin/copy/strategies` | GET / POST | List or create strategies |
| `/api/admin/copy/strategies/[id]` | GET / PATCH / DELETE | Strategy CRUD |
| `/api/admin/copy/strategies/[id]/followers` | GET / POST | Follower list or add follower |
| `/api/admin/copy/strategies/[id]/events` | GET | Strategy events |
| `/api/admin/copy/strategies/[id]/simulate` | POST | Run simulation |
| `/api/admin/copy/strategies/[id]/monitor` | GET | Live monitor data |
| `/api/admin/copy/events/[id]/execute` | POST | Execute a copy event |
| `/api/admin/copy/events/[id]/simulate` | POST | Simulate a copy event |
| `/api/admin/copy/logs` | GET | All copy logs |
| `/api/admin/copy/logs/[id]/retry` | POST | Retry a failed log entry |

### Admin — AI

| Route | Method | Function |
|---|---|---|
| `/api/admin/ai/users` | GET | All users with AI config |
| `/api/admin/ai/users/[id]/limits` | PATCH | Update AI limits for user |
| `/api/admin/ai/users/[id]/credits` | PATCH | Top-up or deduct credits |
| `/api/admin/ai/usage` | GET | Platform-wide AI usage stats |

### Admin — Evaluations

| Route | Method | Function |
|---|---|---|
| `/api/admin/evaluations/programs` | GET / POST | List or create programs |
| `/api/admin/evaluations/programs/[id]` | PATCH / DELETE | Update or delete program |
| `/api/admin/evaluations/attempts` | GET | All attempts |
| `/api/admin/evaluations/attempts/[id]/check` | POST | Re-evaluate rules for attempt |
| `/api/admin/evaluations/attempts/[id]/link-account` | POST | Link demo account to attempt |
| `/api/admin/evaluations/attempts/[id]/override` | POST | Manual pass/fail override |
| `/api/admin/evaluations/certificates` | GET | All certificates |
| `/api/admin/evaluations/certificates/[id]/revoke` | POST | Revoke a certificate |
| `/api/admin/evaluations/analytics` | GET | Pass rates, durations, stats |

### Admin — Academy

| Route | Method | Function |
|---|---|---|
| `/api/admin/academy/courses` | GET / POST | Course CRUD |
| `/api/admin/academy/courses/[id]` | PATCH / DELETE | Update or delete course |
| `/api/admin/academy/modules` | GET / POST | Module CRUD |
| `/api/admin/academy/modules/[id]` | PATCH / DELETE | Update or delete module |
| `/api/admin/academy/lessons` | GET / POST | Lesson CRUD |
| `/api/admin/academy/lessons/[id]` | PATCH / DELETE | Update or delete lesson |
| `/api/admin/academy/materials` | GET / POST | Lesson material CRUD |
| `/api/admin/academy/materials/[id]` | PATCH / DELETE | Update or delete material |
| `/api/admin/academy/questions` | GET / POST | Quiz question CRUD |
| `/api/admin/academy/questions/[id]` | PATCH / DELETE | Update or delete question |
| `/api/admin/academy/webinars` | GET / POST | Webinar CRUD |
| `/api/admin/academy/webinars/[id]` | PATCH / DELETE | Update or delete webinar |
| `/api/admin/academy/remarks` | GET / POST | Instructor remarks |
| `/api/admin/academy/remarks/[id]` | PATCH / DELETE | Update or delete remark |
| `/api/admin/academy/analytics` | GET | LMS analytics (completion, quiz scores) |

### Admin — Marketplace

| Route | Method | Function |
|---|---|---|
| `/api/admin/marketplace/products` | GET / POST | Product CRUD |
| `/api/admin/marketplace/products/[id]` | PATCH / DELETE | Update or delete product |
| `/api/admin/marketplace/access` | GET / POST | Access grants list or create |
| `/api/admin/marketplace/access/[id]` | PATCH / DELETE | Update or revoke grant |
| `/api/admin/marketplace/licenses` | GET | All license records |
| `/api/admin/marketplace/licenses/[id]/revoke` | POST | Revoke license |
| `/api/admin/marketplace/licenses/[id]/reissue` | POST | Reissue license key |
| `/api/admin/marketplace/verification-logs` | GET | License verification audit log |
| `/api/admin/marketplace/analytics` | GET | Marketplace revenue/access analytics |

### Admin — Jobs

| Route | Method | Function |
|---|---|---|
| `/api/admin/jobs` | GET | Job queue list |
| `/api/admin/jobs/enqueue` | POST | Add a job to the queue |
| `/api/admin/jobs/run-now` | POST | Execute a job immediately |
| `/api/admin/jobs/[id]/cancel` | POST | Cancel a queued job |
| `/api/admin/jobs/[id]/retry` | POST | Retry a failed job |

### Admin — Terminal

| Route | Method | Function |
|---|---|---|
| `/api/admin/terminal/settings` | GET / PATCH | Terminal provider settings |
| `/api/admin/terminal/status` | GET | Provider connection status |
| `/api/admin/terminal/health-check` | POST | Test provider connectivity |

### Admin — Users / Traders

| Route | Method | Function |
|---|---|---|
| `/api/admin/users` | GET | All platform users |
| `/api/admin/users/[id]/role` | PATCH | Change user role |
| `/api/admin/users/[id]/status` | PATCH | Enable/disable user |
| `/api/admin/traders/[id]/partner` | GET / PATCH | Read or assign trader's partner |
| `/api/admin/summary` | GET | Platform-wide KPI summary |
| `/api/admin/audit` | GET | Audit log |

### Admin — Partners & Commissions

| Route | Method | Function |
|---|---|---|
| `/api/admin/partners` | GET | All partner profiles |
| `/api/admin/partners/[id]/commissions` | GET | Commissions for a partner |
| `/api/admin/partner-commissions/[id]/status` | PATCH | Approve / pay / cancel commission |

### Admin — Economic Calendar

| Route | Method | Function |
|---|---|---|
| `/api/admin/economic-calendar` | GET / POST | Event CRUD |
| `/api/admin/economic-calendar/[id]` | PATCH / DELETE | Update or delete event |

### Worker (internal)

| Route | Method | Function |
|---|---|---|
| `/api/worker/jobs/run` | POST | Internal worker: run a job |
| `/api/worker/jobs/schedule` | POST | Internal worker: schedule recurring jobs |

---

## Key service layer (`src/lib/services`)

| File | Responsibilities |
|---|---|
| `brokerSyncService.ts` | MetaAPI account sync, position fetch, credential verification |
| `copyTradingService.ts` | Strategy management, follower tier logic, simulation/live dispatch |
| `crmService.ts` | CRM note creation/retrieval for traders |
| `partnerService.ts` | Partner summary DTO assembly (includes `referralCode`), risk events, activities |
| `evaluationService.ts` | Rule evaluation engine, pass/fail computation, certificate generation |
| `academyService.ts` | Course/lesson/quiz data access, completion tracking |
| `marketplaceService.ts` | Product listing, access grant logic, license generation |
| `notificationService.ts` | Create and deliver in-app notifications |

---

## Domain logic (`src/lib/domain`)

| File | Purpose |
|---|---|
| `types.ts` | Shared DTOs: `TraderAccountSummary`, `TradeDto`, `RiskRuleDto`, etc. |
| `metrics.ts` | `calculateProfitFactor`, `calculateAverageWinLossRatio`, `calculateConsistencyScore` |
| `dashboard.ts` | `computePeriodStats`, `filterClosedTradesForPeriod`, period/view types |

---

## Environment variables (summary)

| Variable | Effect |
|---|---|
| `BROKER_EXECUTION_ENABLED` | `"false"` = simulation only; `"true"` = live trade execution (never enable without approval) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role (admin client) |
| `METAAPI_TOKEN` | MetaAPI access token for broker sync |
| `DXFEED_API_KEY` | dxFeed data feed key (gated — not active in demo) |
| `OPENAI_API_KEY` | OpenAI key for AI chat and chart analysis |

---

## Database tables (key)

`trading_accounts` · `trades` · `risk_rules` · `risk_events`  
`copy_strategies` · `copy_followers` · `copy_logs`  
`ai_user_limits` · `ai_usage_logs`  
`evaluation_programs` · `evaluation_rules` · `evaluation_attempts` · `evaluation_certificates`  
`academy_courses` · `academy_modules` · `academy_lessons` · `academy_enrollments`  
`academy_lesson_progress` · `academy_quiz_questions` · `academy_quiz_attempts`  
`academy_lesson_notes` · `academy_webinars` · `academy_webinar_registrations`  
`marketplace_products` · `marketplace_access` · `marketplace_licenses` · `marketplace_verification_logs`  
`partner_profiles` · `partner_trader_assignments` · `partner_commissions` · `partner_activities`  
`crm_notes` · `notifications` · `audit_logs` · `jobs` · `economic_calendar_events`

---

*Generated 2026-07-04. Update when new pages or API routes are added.*
