# Aurix Trading Platform — UX / Usability Audit

> **Generated:** 2026-07-03  
> **Scope:** Admin, Trader, and Partner surfaces across all 9 category areas  
> **Rules:** Read-only audit — no code changes, no migrations, no UI modifications  

---

## Table of Contents

1. [High-Impact Quick Wins](#1-high-impact-quick-wins)
2. [Admin Experience](#2-admin-experience)
3. [Trader Experience](#3-trader-experience)
4. [Partner Experience](#4-partner-experience)
5. [Copy Trading Specific](#5-copy-trading-specific)
6. [MetaAPI / Account Management](#6-metaapi--account-management)
7. [Data Scaling](#7-data-scaling)
8. [Risk / Safety](#8-risk--safety)
9. [Demo / Client Presentation](#9-demo--client-presentation)
10. [Top Priorities Before Demo](#top-priorities-before-demo)

---

## 1. High-Impact Quick Wins

| # | Page/Area | Problem | Suggested Improvement | Priority | Effort | Safe before demo |
|---|---|---|---|---|---|---|
| 1.1 | `/admin/accounts` — status filter chips | `INACTIVE` is missing from the filter chip row even though it's now a valid status | Add `Inactive` chip | **High** | Small | Yes |
| 1.2 | `/admin/accounts` — deactivate button | "Deactivate (save MetaAPI cost)" is a long, awkward inline button label. No confirmation before firing a MetaAPI call | Rename to "Deactivate" and add a confirmation dialog | **High** | Small | Yes |
| 1.3 | `/admin/copy` — single strategy view | The page defaults to the first strategy silently. If a second admin adds a strategy, the other admin never knows which is selected | Show selected strategy name as a heading; add "N strategies" counter to the selector | **High** | Small | Yes |
| 1.4 | `/copy-trading` (trader) — copy logs table | Logs are sliced to 50 with no indication more exist. No filter on status (FAILED rows get buried) | Add "Showing 50 of N" note and a FAILED/SUCCESS status filter | **High** | Small | Yes |
| 1.5 | `/accounts` (trader) — double render | Accounts are rendered twice: once as cards AND then again as a DataTable below the cards | Remove the DataTable; the cards already show everything | **High** | Small | Yes |
| 1.6 | `/admin` — Risk queue "Needs attention" badge | `StatusPill tone="accent"` on Risk Queue says "Needs attention" even when `riskEvents.length === 0` — hardcoded, not reactive | Show "Stable" (lime) when 0 events, "Needs attention" based on count | **High** | Small | Yes |
| 1.7 | All admin pages — success messages | Success messages disappear only if the user navigates away. Stale messages stay visible indefinitely | Auto-dismiss after 6 seconds or add a close (×) button | **Medium** | Small | Yes |
| 1.8 | `/admin/ai` — credits column | Credits show raw numbers like `50000`. Hard to read at scale | Format with `toLocaleString()` and add a "Low credits" warning icon for users below 5,000 in the table row | **Medium** | Small | Yes |
| 1.9 | Global — empty state guidance | Several empty states tell users to "check back later" with no action link | Where a clear next action exists, add a CTA link | **Medium** | Small | Yes |
| 1.10 | `/partner/commissions` — export | CSV export link is an `<a>` with `download` attribute. No loading state; if the export fails, nothing happens | Add a mutation + pending state, catch errors | **Medium** | Small | Yes |

---

## 2. Admin Experience

| # | Page/Area | Problem | Suggested Improvement | Priority | Effort | Safe before demo |
|---|---|---|---|---|---|---|
| 2.1 | `/admin` — overview | Fetches 6 separate endpoints in parallel on page load. At scale this will be slow and the page will flash stale data | Consolidate into a single `/api/admin/summary` response with pre-aggregated counts | **High** | Medium | Not urgent |
| 2.2 | `/admin/accounts` — account list | No list view of all accounts. The supervision page only shows one account at a time | Add a compact account list/table above the selected panel showing all accounts with status indicators | **High** | Medium | Yes |
| 2.3 | `/admin/accounts` — "Remove from queue" | Button fires `setAccountMessage(...)` — no API call. This will confuse an admin in a real demo | Wire it to a real endpoint or remove the button | **High** | Small | Yes |
| 2.4 | `/admin/accounts` — "Verify selected" | Submits a form that calls `setVerifyOpen(false)` — no API call happens. It's a UX stub | Remove the button or clearly mark it "Coming soon" | **High** | Small | Yes |
| 2.5 | `/admin/copy` — broker credentials status | The master credentials status shows `credentialsStored: true/false` but no last-synced timestamp or deploy state label | Show "Credentials: ✓ Stored / ✗ Missing" with `lastSyncedAt` and "Provider: Deployed / Undeployed" state | **High** | Small | Yes |
| 2.6 | `/admin/copy` — events + logs | Events and logs load 50–100 rows unfiltered. One FAILED row among 80 SUCCESS rows is invisible | Add a status filter chip row above each table (SUCCESS / FAILED / PENDING) | **High** | Medium | Yes |
| 2.7 | `/admin/jobs` — job detail panel | The modal likely shows raw JSON metadata with no human-readable summary | Parse and display key fields (job type, target account, error message) in plain text | **Medium** | Small | Yes |
| 2.8 | `/admin/jobs` — no bulk cancel/retry | Failed jobs must be retried one at a time. At scale you may have dozens of failed syncs | Add "Retry all FAILED" and "Cancel all PENDING" bulk actions | **Medium** | Medium | No |
| 2.9 | `/admin/users` — partner assignment | Shows `partnerId: null` or a UUID, but no human-readable partner name | Resolve partner name server-side and show "Assigned to: [Partner Name]" or "Unassigned" | **Medium** | Small | Yes |
| 2.10 | `/admin/academy` — tabs (courses/lessons/webinars) | All three tabs load data on page mount even when not active | Lazy-load each tab's data only when the tab becomes active | **Medium** | Small | Yes |
| 2.11 | `/admin/evaluations` — attempts tab | The attempts table has no filter by program or by status. At scale this will have thousands of rows | Add program filter dropdown and status filter chips above the attempts table | **High** | Small | Yes |
| 2.12 | `/admin/marketplace` — access management | Access records are shown in a flat table with no ability to search by trader name or product | Add inline search field for trader name/email above the access table | **High** | Small | Yes |
| 2.13 | `/admin/terminal` — locked status panel | dxFeed tile statuses are static strings with no way to test them | Add a "Test connection" button per tile (can be a stub that signals this is actionable) | **Low** | Small | Yes |

---

## 3. Trader Experience

| # | Page/Area | Problem | Suggested Improvement | Priority | Effort | Safe before demo |
|---|---|---|---|---|---|---|
| 3.1 | `/dashboard` — no account selector | If a trader has 2+ accounts, the dashboard uses `accounts[0]` silently with no way to switch context | Add a compact account selector dropdown in the page header or KPI strip | **High** | Medium | Yes |
| 3.2 | `/dashboard` — "Fear & Greed" metric | Computed as a synthetic formula from win rate and profit factor — unrelated to real market sentiment | Rename to "Performance Score" or remove it entirely | **High** | Small | Yes |
| 3.3 | `/dashboard` — "Spread: 1.2 pts" | Hardcoded static value. A trader with an open position who sees a stale spread will distrust the platform | Remove or mark as "Illustrative" | **High** | Small | Yes |
| 3.4 | `/dashboard` — "Trend Bias: Bullish" | Derived from win rate and profit factor, not a real market data feed | Rename to "Momentum Signal" and add a tooltip explaining the calculation | **Medium** | Small | Yes |
| 3.5 | `/accounts` — two identical renders | Accounts are displayed as cards AND in a DataTable directly below with the same data | Remove the DataTable section below the cards | **High** | Small | Yes |
| 3.6 | `/accounts/[accountId]` — Server Component | If any fetch fails, the page shows `notFound()` which is confusing | Show a proper error state with a reload button instead of `notFound()` for fetch failures | **Medium** | Small | Yes |
| 3.7 | `/accounts/[accountId]` — Snapshot feed | Shows only 7 snapshots (`.slice(-7)`). No indication of how many exist | Show count: "Last 7 of N snapshots" with a link to view history | **Medium** | Small | Yes |
| 3.8 | `/copy-trading` — LIVE mode badge | Strategies in LIVE mode get a red pill but no explanation of what LIVE means vs SIMULATION | Add a tooltip or sub-label: "LIVE — real broker execution" / "SIMULATION — no real trades" | **High** | Small | Yes |
| 3.9 | `/copy-trading` — "Stop following" button | No confirmation dialog before revoking a subscription | Add a confirmation step: "Stop following [Strategy Name]? You'll need to re-subscribe to resume." | **High** | Small | Yes |
| 3.10 | `/copy-trading` — tier not shown to trader | A trader following a PREMIUM-tier strategy has no visual indication of their tier | Show a "PREMIUM" or "NORMAL" badge on each subscription entry | **Medium** | Small | Yes |
| 3.11 | `/ai` — credit balance not visible | Token credit balance is never shown to the trader (only admin can see it) | Add "Token credits: N remaining" to the status strip on the AI page | **High** | Small | Yes |
| 3.12 | `/evaluations` — "Locked" indicator | The "Locked" badge shows no link to the required course | Add "Requires: [Course Name] →" as a link inline below the locked badge | **High** | Small | Yes |
| 3.13 | `/marketplace` — no risk level filter | The only filter is platform (MT5/MT4). No risk level filter or search | Add "Risk level" filter chip row (LOW / MEDIUM / HIGH) using the existing `riskLevel` DTO field | **Medium** | Small | Yes |
| 3.14 | `/academy` — no completion progress on list | The card list shows title and difficulty but no completion % for started courses | Add a thin progress bar at the bottom of each course card | **Medium** | Small | Yes |
| 3.15 | `/terminal` — "Professional Data 🔒" | The overlay describes dxFeed but doesn't tell the trader what to do. Dead end | Add a "Contact support to unlock" CTA or a mailto link | **Medium** | Small | Yes |

---

## 4. Partner Experience

| # | Page/Area | Problem | Suggested Improvement | Priority | Effort | Safe before demo |
|---|---|---|---|---|---|---|
| 4.1 | `/partner` — overview | The referral code is never shown anywhere on the partner dashboard | Add a "Your referral link" panel to the overview page (read from `partner_profiles.referral_code`) | **High** | Small | Yes |
| 4.2 | `/partner/commissions` — commission rule | For CPA partners, the "Rate" tile is hidden with no context on what triggers the CPA | Add a "Trigger" field or one-line description below the rule panel | **Medium** | Small | Yes |
| 4.3 | `/partner/traders` — assigned-at date | The `assignedAt` date is fetched but never shown in the trader detail panel | Show "Assigned: [date]" in the trader detail panel header | **Low** | Small | Yes |
| 4.4 | `/partner/traders` — no commission per trader | A partner has no idea which trader is generating the most commission | Add "Commission attributed: [amount]" to the trader detail panel | **Medium** | Medium | No |
| 4.5 | `/partner/crm` — note entry UX | The CRM page uses a dropdown to select a trader and a textarea. No character count, no note type, no delete | Add character counter (max 1,000), note category (Call / Email / Meeting / Other), and delete option | **Medium** | Medium | No |
| 4.6 | `/partner` — no notification of new trader signup | Partners only find out about new traders by checking manually | Show "N new traders this month" in the InlineStatusStrip on the overview page | **Medium** | Small | Yes |
| 4.7 | `/partner/commissions` — no filter by status | Commission records are all mixed (PENDING, APPROVED, PAID, CANCELLED) | Add FilterChipRow above the table for PENDING / APPROVED / PAID / ALL | **High** | Small | Yes |

---

## 5. Copy Trading Specific

| # | Page/Area | Problem | Suggested Improvement | Priority | Effort | Safe before demo |
|---|---|---|---|---|---|---|
| 5.1 | `/admin/copy` — tier summary | No summary of "N PREMIUM / N NORMAL followers" at the strategy level | Add PREMIUM/NORMAL count to the strategy list row or strategy header | **Medium** | Small | Yes |
| 5.2 | `/admin/copy` — LIVE vs SIMULATION | Strategies appear in the same list with only a status badge. LIVE mode is the dangerous one | Add a red `LIVE` left border or background tint to any strategy row that is `mode=LIVE` | **High** | Small | Yes |
| 5.3 | `/admin/copy` — "Execute event" button | Pressing it during a demo without understanding would trigger a live broker order | Add a confirmation dialog: "This will execute a copy trade on all active follower accounts. Are you sure?" | **High** | Small | Yes |
| 5.4 | `/copy-trading` (trader) — no lot size shown | After subscribing, the follower card shows no lot size or risk multiplier | Show `scalingMode` and `riskMultiplier` / `fixedLot` in the subscription detail | **Medium** | Small | Yes |
| 5.5 | `/copy-trading` (trader) — no master account info | When following a strategy, the trader doesn't know whose trades they are copying | Show "Master account: [account name if public]" or strategy description prominently | **Medium** | Small | Yes |
| 5.6 | Copy log FAILED rows | Error reason is stored in the log but not shown in the admin copy logs table | Add a "Reason" / `errorMessage` column shown only for FAILED rows | **High** | Small | Yes |
| 5.7 | Admin copy — `live_enabled=false` | When live execution is disabled globally, the admin sees no clear indication in the UI | Show a persistent banner at the top of `/admin/copy`: "Live execution is DISABLED (SIMULATION mode)" | **High** | Small | Yes |
| 5.8 | Follower subscription consent | The consent timestamp is never shown back to the trader after accepting | Show "Risk accepted on [date]" on the subscription card | **Low** | Small | Yes |

---

## 6. MetaAPI / Account Management

| # | Page/Area | Problem | Suggested Improvement | Priority | Effort | Safe before demo |
|---|---|---|---|---|---|---|
| 6.1 | `/admin/accounts` — sync result messaging | Messages like "Sync pending: MetaAPI still deploying." use raw technical language | Humanise: "Account syncing — MetaAPI is starting up. Check back in 30 seconds." | **Medium** | Small | Yes |
| 6.2 | `/admin/accounts` — no "last synced" timestamp | The account detail shows "Last updated" (snapshot time) but not last broker sync time | Add "Last synced" from `broker_operation_logs` most recent SYNC_ACCOUNT for this account | **Medium** | Medium | No |
| 6.3 | `/admin/accounts` — PENDING status tone | PENDING uses `tone="accent"` (blue), same as SYNCING and RESTRICTED — 4 states look identical | Give DISCONNECTED → muted, RESTRICTED → danger, PENDING → accent, SYNCING → lime-pulse | **High** | Small | Yes |
| 6.4 | `/admin/accounts` — INACTIVE filter missing | An admin cannot see deactivated accounts without searching | Add INACTIVE chip to the filter row | **High** | Small | Yes |
| 6.5 | Account detail — no reconnect guidance | When status is DISCONNECTED or INACTIVE, there are no instructions shown | Show a contextual help block when status is DISCONNECTED with clear next steps | **High** | Small | Yes |
| 6.6 | Cost-saving language | "Deactivate (save MetaAPI cost)" label is too long and looks like a disclaimer | Separate into: button label "Deactivate" + sub-label beneath: "Pauses MetaAPI billing" | **Low** | Small | Yes |
| 6.7 | `/accounts` (trader) — PENDING explanation | When status is PENDING, the card itself shows no explanation | Add a tooltip or sub-label to the PENDING status pill: "Awaiting admin sync" | **Medium** | Small | Yes |

---

## 7. Data Scaling

| # | Page/Area | Problem | Suggested Improvement | Priority | Effort | Safe before demo |
|---|---|---|---|---|---|---|
| 7.1 | `/admin/accounts` — no pagination | Accounts are fetched in a single `limit(500)` call. The search overlay renders all results | Add cursor-based pagination; show "Showing 50 of N" with a "Load more" button | **High** | Large | No |
| 7.2 | `/admin/copy` — events table | Events are fetched with no limit and could be thousands of rows | Add `limit=100` and a "Show older events" button; add date-range filter | **High** | Medium | Yes |
| 7.3 | `/admin/copy` — copy logs table | All logs for a strategy returned at once | Paginate and add status filter | **High** | Medium | Yes |
| 7.4 | `/admin/jobs` — jobs table | Jobs page auto-refreshes every 5 seconds and fetches all jobs every time | Add status filter before fetching; default to PENDING + RUNNING only | **High** | Medium | No |
| 7.5 | `/admin/ai` — users table | Loads all users (up to `limit(500)`) every time AI page is opened | Add server-side search/filter to `/api/admin/ai/users` with a client search field | **Medium** | Medium | No |
| 7.6 | `/admin/evaluations` — attempts tab | All attempts loaded in one query. At scale this will be thousands of rows | Add pagination + program filter dropdown | **High** | Medium | No |
| 7.7 | Global trade tables | Trade tables show `slice(0, 50)` with no indicator of total count | Add "Showing 50 of N" caption below every trade table | **Medium** | Small | Yes |
| 7.8 | `/partner/commissions` — no date range filter | All commission records returned (up to `limit(5000)`) | Add month/year selector above the commission table | **Medium** | Medium | No |
| 7.9 | Copy logs — no export | Copy trading admins have no way to export execution logs | Add "Export CSV" button to the copy logs panel in `/admin/copy` | **Medium** | Medium | No |
| 7.10 | `/admin/users` — sort | Users returned by `created_at DESC`. No column sorting in the DataTable | Add clickable column headers for Name, Role, Status, Created date | **Low** | Medium | No |

---

## 8. Risk / Safety

| # | Page/Area | Problem | Suggested Improvement | Priority | Effort | Safe before demo |
|---|---|---|---|---|---|---|
| 8.1 | `/admin/copy` — execute event (live trade) | The "execute" icon button triggers a live broker order with no confirmation dialog | Require two-step confirmation: "You are about to execute a LIVE copy trade. This cannot be undone. Confirm?" | **Critical** | Small | Yes |
| 8.2 | `/admin/accounts` — deactivate | No confirmation before deactivating an account (which calls MetaAPI undeploy) | Add confirmation dialog: "Deactivate [Account Name]? This will stop MetaAPI billing but can be reactivated." | **High** | Small | Yes |
| 8.3 | `/admin/accounts` — store credentials warning | The credential dialog has a fine-print warning that admins can miss. Working credentials could be overwritten | Make the warning more prominent — amber banner if the account is currently CONNECTED | **High** | Small | Yes |
| 8.4 | `/copy-trading` (trader) — "Stop following" | No confirmation. If clicked accidentally, the subscription is REVOKED and the trader must re-follow | Add a confirmation dialog before revoking | **High** | Small | Yes |
| 8.5 | `/admin/copy` — LIVE strategy mode change | Admin can switch from SIMULATION to LIVE with no additional warning | Add a prominent warning dialog when switching `mode` to LIVE: "Real trades will be placed on all active follower accounts." | **Critical** | Small | Yes |
| 8.6 | `/admin/evaluations` — pass/fail attempt | Admin can set attempt status with no audit note required | Add an optional "Admin note" field in the status-change dialog | **Medium** | Small | Yes |
| 8.7 | `/admin/ai` — disable AI for a user | Toggle is a single click with no confirmation | Add: "Disable AI for [Name]? They will lose access immediately." | **Medium** | Small | Yes |
| 8.8 | Global — no session timeout warning | Users on long admin sessions may have stale tokens | Add a "Session expiring in 5 minutes — click to extend" banner | **Low** | Large | No |

---

## 9. Demo / Client Presentation

| # | Page/Area | Problem | Suggested Improvement | Priority | Effort | Safe before demo |
|---|---|---|---|---|---|---|
| 9.1 | `/dashboard` — hardcoded market data | "Spread: 1.2 pts", "Session: London", and synthetic Fear & Greed look like real data but aren't | Either remove them or add an "(illustrative)" label below each | **High** | Small | Yes |
| 9.2 | `/admin` — Platform health "Stable" pill | Always shows "Stable" regardless of real state | Make it dynamic: count open risk events → "Stable" (0), "Monitoring" (1–2), "Attention required" (3+) | **High** | Small | Yes |
| 9.3 | Admin accounts — single-account view | When only 1 account exists, the page looks sparse | Add a "No other accounts" tip with a "Sync or connect more accounts" CTA | **Low** | Small | Yes |
| 9.4 | `/partner` — commission summary | The commission rule type (CPA / Rebate) is not visible at a glance on the overview | Add the commission type as a subtitle in the pending commission tile: "Pending • Rebate model" | **Medium** | Small | Yes |
| 9.5 | `/admin/copy` — mode badge placement | The LIVE/SIMULATION badge is a small `StatusPill` easy to miss | Move it to the strategy name heading: "[Strategy Name] — LIVE" | **High** | Small | Yes |
| 9.6 | Breadcrumb / back navigation | Several pages open overlays or detail panels with no breadcrumb or back button | Add breadcrumb trail ("Admin > Copy Trading > [Strategy Name]") or at minimum a back link on detail panels | **Medium** | Medium | No |
| 9.7 | `/admin/terminal` — "Professional Tier — Locked" | The grayed-out tiles may look broken to a client rather than intentionally locked | Add a CTA: "Contact your account manager to activate the Professional Data tier" | **Medium** | Small | Yes |
| 9.8 | Loading skeletons — inconsistent | Some pages use `animate-pulse` skeleton loaders, others show plain text "Loading…" | Standardise all loading states to use the same skeleton pattern | **Low** | Small | Yes |
| 9.9 | Mobile — copy trading page | Copy log table has 6 columns that will overflow on mobile | Reduce to 4 columns on mobile (Date, Symbol, Status, Lot) | **Medium** | Small | Yes |
| 9.10 | `/accounts` (trader) — card click area | "View details" link is only in the bottom-right corner of the card | Make the whole card clickable with action buttons using `e.stopPropagation()` | **Low** | Small | Yes |

---

## Top Priorities Before Demo

These items should be addressed first — high impact, low effort, all safe to implement:

1. **Remove hardcoded market data** from the dashboard: Spread, Fear & Greed, Trend Bias, Session (items 9.1, 3.2, 3.3, 3.4)
2. **Add confirmation dialogs** for: execute copy event (8.1 — Critical), deactivate account (8.2), stop following (8.4), LIVE mode switch (8.5 — Critical)
3. **Remove the duplicate DataTable** below the account cards on `/accounts` (1.5, 3.5)
4. **Fix the "Verify selected" and "Remove from queue" stubs** on `/admin/accounts` (2.3, 2.4)
5. **Add INACTIVE to the account status filter chip row** on `/admin/accounts` (1.1, 6.4)
6. **Show the partner's referral code** on the `/partner` overview page (4.1)
7. **Add FAILED filter** to the copy logs table (1.4)
8. **Add "LIVE execution DISABLED" banner** to `/admin/copy` when simulation mode is active (5.7)
9. **Add INACTIVE chip** to the status filter on `/admin/accounts` — same as #5 but also covers the detail panel button visibility (6.4)
10. **Show AI token credit balance** to the trader on the `/ai` page (3.11)
