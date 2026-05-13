# Session Handoff - Trading Platform

Use this file to continue the project in a fresh Codex/context window.

## Workspace

- Project root: `C:\Users\Victus\Documents\New project 3`
- Branch: `codex/setup-trading-platform`
- Main plan: `C:\Users\Victus\Desktop\fintech trade\docs\superpowers\plans\2026-05-11-trading-platform-master-plan.md`
- Client requirement PDF: `C:\Users\Victus\Desktop\fintech trade\doc (1).pdf`
- Important instruction: this is a production app, not an MVP. Ignore the old 7-day/MVP framing in the plan.
- User runs the app from VS Code/local host. Do not start a dev server unless the user asks.

## Current Product Direction

- Build the full UI first, then backend integration.
- Keep the client-approved visual direction:
  - minimalist black interface,
  - yellow/lime accents,
  - smooth typography,
  - subtle Framer Motion,
  - professional dashboard feel inspired by the screenshots previously shared by the user.
- Dashboard color direction is liked by the client and should be preserved for now.
- The UI can still be polished later, but production completeness matters: states, responsiveness, forms, modals, and real workflows should be added.

## Current App Stack

- Next.js 16 app router
- React 19
- TypeScript
- Tailwind CSS v4
- Framer Motion
- Radix primitives
- TanStack Query
- Zustand
- Zod
- Prisma
- Vitest
- Playwright installed
- Broker/realtime/auth/data layers are scaffolded, mostly mock-backed for now.

PowerShell note: use `npm.cmd`, not `npm`, because PowerShell execution policy blocks `npm.ps1`.

## Implemented UI Pages

Auth:

- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/register/page.tsx`
- `src/app/(auth)/forgot-password/page.tsx`

Trader:

- `src/app/(trader)/dashboard/page.tsx`
- `src/app/(trader)/accounts/page.tsx`
- `src/app/(trader)/accounts/[accountId]/page.tsx`
- `src/app/(trader)/trades/page.tsx`
- `src/app/(trader)/analytics/page.tsx`
- `src/app/(trader)/risk/page.tsx`
- `src/app/(trader)/reports/page.tsx`
- `src/app/(trader)/settings/page.tsx`

Admin:

- `src/app/(admin)/admin/page.tsx`
- `src/app/(admin)/admin/users/page.tsx`
- `src/app/(admin)/admin/traders/page.tsx`
- `src/app/(admin)/admin/accounts/page.tsx`
- `src/app/(admin)/admin/crm/page.tsx`
- `src/app/(admin)/admin/risk/page.tsx`
- `src/app/(admin)/admin/subscriptions/page.tsx`
- `src/app/(admin)/admin/audit/page.tsx`

App shell:

- `src/components/app/AppShell.tsx`
- `src/components/app/Sidebar.tsx`
- `src/components/app/Topbar.tsx`
- `src/components/app/navigation.ts`
- `src/components/app/WorkspaceUI.tsx`

The topbar includes a User/Admin switcher:

- User goes to `/dashboard`
- Admin goes to `/admin`

## Implemented Base Architecture

Domain/data:

- `src/lib/domain/types.ts`
- `src/lib/domain/metrics.ts`
- `src/lib/domain/risk.ts`
- `src/lib/data/mockData.ts`
- `src/lib/data/queryKeys.ts`
- `src/lib/utils/format.ts`

Services:

- `src/lib/services/tradingAccountService.ts`
- `src/lib/services/tradeService.ts`
- `src/lib/services/analyticsService.ts`
- `src/lib/services/crmService.ts`
- `src/lib/services/riskService.ts`
- `src/lib/services/adminService.ts`

Broker/realtime:

- `src/lib/broker/BrokerAdapter.ts`
- `src/lib/broker/MockBrokerAdapter.ts`
- `src/lib/broker/MetaApiBrokerAdapter.ts`
- `src/lib/realtime/events.ts`
- `src/lib/realtime/client.ts`
- `src/lib/realtime/server.ts`

API routes:

- `src/app/api/auth/session/route.ts`
- `src/app/api/trading-accounts/route.ts`
- `src/app/api/trading-accounts/[accountId]/route.ts`
- `src/app/api/trades/route.ts`
- `src/app/api/analytics/summary/route.ts`
- `src/app/api/analytics/equity-curve/route.ts`
- `src/app/api/risk/rules/route.ts`
- `src/app/api/risk/events/route.ts`
- `src/app/api/crm/traders/route.ts`
- `src/app/api/crm/notes/route.ts`
- `src/app/api/admin/users/route.ts`
- `src/app/api/realtime/token/route.ts`

Prisma/docs/tests:

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `.env.example`
- `README.md`
- `docs/requirements-summary.md`
- `docs/database-model.md`
- `docs/deployment.md`
- `tests/unit/metrics.test.ts`
- `tests/unit/risk.test.ts`

## Validation Commands

Run from `C:\Users\Victus\Documents\New project 3`:

```powershell
$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run lint
$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run test
$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run build
```

Last known status:

- `npm.cmd run lint` passed.
- `npm.cmd run test` passed.
- `npm.cmd run build` passed.

## Current UI Checklist

Done structurally:

- Dashboard page matching the black/yellow/lime inspiration.
- Main trader pages exist.
- Main admin pages exist.
- Auth pages exist.
- User/admin switcher exists.
- Shared app shell and reusable UI primitives exist.

Still needed before calling the UI production-complete:

- Loading states.
- Empty states.
- Error states.
- Mobile sidebar drawer/menu behavior.
- Responsive QA across desktop, tablet, and mobile.
- Form validation, disabled, loading, success, and error states.
- Modals/drawers for connect account, add CRM note, create risk rule, add user, verify account, create report/plan.
- Real table search/filter/sort/pagination/bulk-action UI.
- Page-specific detail views where needed.
- Accessibility pass.
- Visual pass to ensure all pages follow the approved dashboard design language.

## Suggested Next Step

Continue UI completion before backend:

1. Add reusable `LoadingState`, `EmptyState`, and `ErrorState` components in `WorkspaceUI.tsx`.
2. Add mobile sidebar drawer behavior in `AppShell`/`Topbar`/`Sidebar`.
3. Add reusable modal/drawer patterns using Radix Dialog.
4. Wire visible page actions to realistic UI flows, still mock-backed.
5. Run lint, test, and build.

## Important Working Rules

- Read `AGENTS.md` and follow it. It warns that this Next.js version has breaking changes, so read relevant Next docs in `node_modules/next/dist/docs/` before code changes involving Next APIs.
- Use `rg` first for searches.
- Use `apply_patch` for manual edits.
- Do not revert user changes.
- Do not call this an MVP.
- Do not start a local server unless the user explicitly asks.
