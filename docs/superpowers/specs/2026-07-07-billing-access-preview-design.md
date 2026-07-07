# Billing Access And Platform Preview Design

## Goal

Adjust Aurix billing/payment UX and access control so that:

- the billing page is records/status only
- payment entry points stay contextual to the feature being purchased
- unpaid traders can browse selected pages but core trading workspace routes are locked
- a trader-facing platform preview page explains the $50/month platform subscription
- duplicate payment attempts are blocked consistently in UI and API

## Approved access model

### Allowed without active `PLATFORM_MONTHLY`

- `/billing`
- `/platform-preview`
- `/marketplace`
- `/my-bots`
- `/academy`
- `/evaluations`
- auth/basic settings pages as already needed

### Locked without active `PLATFORM_MONTHLY`

- `/dashboard`
- `/accounts`
- `/accounts/[accountId]`
- `/copy-trading`
- `/ai`
- `/terminal`
- `/trades`
- `/analytics`
- `/risk`
- `/reports`

### Locking behavior

- Do not hard-redirect from middleware for locked trader routes.
- Let unpaid traders reach the route.
- Render a shared locked-state component instead of real feature content.
- Keep bot purchases, mentorship, and evaluations independent from platform subscription access.
- Do not revoke or delete data when a subscription expires.

## Billing UX rules

### Billing page

The billing page is records/status only. It shows:

- payment history
- current platform subscription status
- pending approvals
- active copy entitlements
- bot access
- renewal/period-end dates
- failed/cancelled/refunded history

It does not show generic purchase option cards or pay buttons.

### Contextual payments

- Platform subscription CTA appears on locked core pages, dashboard banner, and platform preview.
- Copy account payments appear only inside the copy-trading flow and are scoped to a specific trading account.
- Bot purchase appears only on marketplace/product surfaces.
- Mentorship purchase appears only in academy/mentorship UI.
- Evaluations remain free.

## Shared billing access layer

Add/standardize server-driven normalized access helpers in `billingService`:

- `getPlatformSubscriptionAccess(userId)`
- `getCopyEntitlementAccess(userId, tradingAccountId)`
- `getBotPurchaseAccess(userId, botProductId)`
- `getMentorshipAccess(userId)`
- `getTraderAccessSummary(userId)`

### Normalized states

- `NONE`
- `PENDING_PAYMENT`
- `PENDING_APPROVAL`
- `ACTIVE`
- `EXPIRED`
- `CANCELLED`
- `FAILED`
- `REFUNDED`

UI labels such as `Owned` or `Access granted` may be derived from normalized active/granted states for one-time products.

### Normalization rules

- Platform subscription is `ACTIVE` only when a subscription row exists with `status=ACTIVE` and `current_period_end` in the future.
- Platform subscription is `PENDING_APPROVAL` when payment is complete but admin approval has not activated it yet.
- Platform subscription is `PENDING_PAYMENT` when a pending checkout exists.
- Platform subscription is `EXPIRED` when a prior monthly subscription exists but the current period ended.
- Copy entitlement is scoped to `user + trading_account_id`.
- Bot purchase is scoped to `user + bot_product_id`.
- Mentorship is one-time per user.

### Copy trading rule

Copy trading requires both:

1. active platform subscription
2. active per-account copy entitlement

If platform subscription is inactive, the copy page shows the platform locked-state panel instead of entitlement purchase UI.

## Shared UI layer

### `PlatformSubscriptionCheckoutCTA`

Reusable client component wrapping the `$50/month` platform checkout flow.

Used in:

- dashboard locked/banner states
- locked core pages
- platform preview hero

### `PlatformSubscriptionLocked`

Reusable locked-state panel for gated trader pages.

Shows:

- `Platform subscription required`
- `$50/month`
- primary CTA: activate or renew
- secondary CTA: preview platform features
- pending approval message
- expired state message

This component uses existing Aurix UI primitives only.

## Platform preview page

Add `/platform-preview` as a trader-facing read-only product tour.

### Requirements

- Use existing Aurix theme/components only
- No real account fetches
- No broker sync
- No copy actions
- No dxFeed activation
- No Gemini/AI calls
- No live trading state

### Content

1. Hero
   - `Unlock the Aurix Trading Platform`
   - price `$50/month`
   - state-aware CTA
2. Feature cards
   - Dashboard
   - MT5 Accounts
   - Copy Trading
   - AI Assistant
   - Terminal
   - Analytics
   - Marketplace
   - Academy & Evaluations
3. Read-only preview panels
   - KPI strip
   - sample account card
   - sample copy strategy card
   - sample AI assistant summary
   - locked/pro terminal preview
4. Pricing explainer
   - Platform subscription: `$50/month`
   - Copy Normal: `$10/month`
   - Copy Ultra Fast: `$15/month`
   - Bot/EA: `$500 one-time`
   - Mentorship: `€2,500 one-time`
   - Evaluations/challenges: free

## Duplicate prevention

Checkout must be blocked when the user already has an active or in-flight purchase/access state.

### Block duplicate checkout for

- `ACTIVE`
- `PENDING_PAYMENT`
- `PENDING_APPROVAL`
- granted/owned access derived from active one-time records

### Allow retry or repurchase only for

- `FAILED`
- `CANCELLED`
- `REFUNDED`
- `EXPIRED` for renewable monthly products

The API remains authoritative. Frontend hides buttons but backend still enforces the rule with `409` and a clear message.

## Page integration

### Locked pages

Each locked trader page checks platform subscription access summary and:

- renders real content when `ACTIVE`
- otherwise renders `PlatformSubscriptionLocked`

### Accessible pages

These pages stay available and use product-specific billing states:

- billing
- platform preview
- marketplace
- my bots
- academy
- evaluations

## Verification scope

### Backend

- normalized access resolution tests for platform, copy, bot, mentorship
- duplicate-prevention tests for checkout
- copy-trading combined gate tests

### UI

- locked pages show shared subscription lock state
- platform preview renders read-only content and state-aware CTA
- marketplace/academy hide pay buttons when access already exists
- billing page remains logs/status only

### Safe verification

- `npx tsc --noEmit`
- `npx eslint .`
- `npm run build`
- `npm run test`
- `npx playwright test tests/e2e/qa-smoke.spec.ts`

## Safety constraints

- Keep `BROKER_EXECUTION_ENABLED=false`
- Do not trigger MetaApi broker sync
- Do not enable live copy execution
- Do not activate dxFeed
- Do not expose Airwallex keys to frontend
- Do not trust frontend amount/currency
- Do not modify `.env.local`
