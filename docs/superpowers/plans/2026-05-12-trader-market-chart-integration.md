# Trader Market Chart Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TradingView-style market chart to the trader dashboard as a full-width, minimally disruptive panel.

**Architecture:** Reuse the existing `TradingChart` client component so the market visualization stays self-contained. Place it in the trader dashboard as a full-width block directly below the performance rings and above the account sections, so it reads like part of the same dashboard flow rather than a separate feature page.

**Tech Stack:** Next.js App Router, React client components, Framer Motion, SVG-based candlesticks, existing mock trading data.

---

### Task 1: Place the chart in the trader dashboard

**Files:**
- Modify: `src/app/(trader)/dashboard/page.tsx`

- [ ] **Step 1: Replace the current dashboard gap with the market chart panel**

```tsx
// import { TradingChart } from "@/components/charts/TradingChart";
// ...
// <TradingChart />
```

- [ ] **Step 2: Keep the dashboard layout minimal**

```tsx
// Render the chart as one full-width section below the rings and above the selected view content.
```

- [ ] **Step 3: Remove unused imports after wiring the chart**

```tsx
// Remove any chart-related imports that are no longer used.
```

### Task 2: Verify the integration

**Files:**
- Test: `src/app/(trader)/dashboard/page.tsx`

- [ ] **Step 1: Run lint**

```bash
npm.cmd run lint
```

- [ ] **Step 2: Run tests**

```bash
npm.cmd run test
```

- [ ] **Step 3: Run a production build**

```bash
npm.cmd run build
```

