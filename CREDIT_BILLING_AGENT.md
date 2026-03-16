# CREDIT_BILLING_AGENT.md

Use this doc as the fast path for Airabook billing, credits, and pricing changes.

Open this before changing:
- plan tiers or prices
- Stripe checkout/webhook logic
- credit wallet fields
- credit packs
- billing UI copy
- Firebase-side AI/storage credit charging

## Current Product Model
- Billing is `subscription access + credit usage`, not credits-only.
- Public tiers are:
  - `free`
  - `creator` at `$7/month`
  - `pro` at `$15/month`
  - `premium` at `$25/month`
  - `enterprise` is manual/custom
- One-time support still exists, but it is separate from subscriptions and separate from credit packs.
- Voice-enabled writing and speech translation are available on `creator+`, but only while billing is active and credits are above the reserve threshold.
- Storage is still tracked in raw bytes with `quotaCounters.storageBytesUsed`, but economic charging is credit-based through the daily maintenance job.

## Source Of Truth
- Plan catalog and entitlements:
  - `/Users/adeshbhattarai/code/Airabook/functions/payments/catalog.js`
- Credit wallet, pricing catalog defaults, and usage charging:
  - `/Users/adeshbhattarai/code/Airabook/functions/payments/creditLedger.js`
- Billing snapshot shaping and Stripe sync:
  - `/Users/adeshbhattarai/code/Airabook/functions/payments/paymentService.js`
- Stripe entry points:
  - `/Users/adeshbhattarai/code/Airabook/functions/payments/createSubscriptionCheckoutSession.js`
  - `/Users/adeshbhattarai/code/Airabook/functions/payments/createCreditPackCheckoutSession.js`
  - `/Users/adeshbhattarai/code/Airabook/functions/payments/createCheckoutSession.js`
  - `/Users/adeshbhattarai/code/Airabook/functions/payments/createBillingPortalSession.js`
  - `/Users/adeshbhattarai/code/Airabook/functions/payments/stripeWebhook.js`
  - `/Users/adeshbhattarai/code/Airabook/functions/payments/refreshBillingState.js`
- Daily storage credit charging and monthly grant maintenance:
  - `/Users/adeshbhattarai/code/Airabook/functions/payments/processCreditMaintenance.js`
- Frontend plan catalog and gating:
  - `/Users/adeshbhattarai/code/Airabook/src/lib/billingCatalog.js`
  - `/Users/adeshbhattarai/code/Airabook/src/lib/billing.js`

## Billing Snapshot Contract
`users/{uid}.billing` now carries both subscription state and the credit wallet.

Important fields:
- `planTier`
- `planLabel`
- `planState`
- `status`
- `stripeCustomerId`
- `stripeSubscriptionId`
- `stripePriceId`
- `billingInterval`
- `currentPeriodEnd`
- `cancelAtPeriodEnd`
- `includedCreditsMonthly`
- `rolloverCap`
- `creditBalance`
- `rolloverCredits`
- `purchasedCredits`
- `usedCreditsThisCycle`
- `lastCreditGrantAt`
- `lastCreditGrantPeriod`
- `lowCreditState`
- `entitlements`

Compatibility rules:
- Continue mirroring both `planState` and `status`.
- Legacy `pro` subscribers on the old `$7` monthly price are treated as `creator`.
- Keep `quotaCounters.storageBytesUsed`, `books`, and `pages`; they still matter for raw limits and reporting.

## Stripe And Checkout Rules
- Subscription checkout is tier-aware.
- Stripe monthly price ids are environment-driven:
  - `STRIPE_CREATOR_MONTHLY_PRICE_ID`
  - `STRIPE_PRO_PLUS_MONTHLY_PRICE_ID`
  - `STRIPE_PREMIUM_MONTHLY_PRICE_ID`
- Legacy creator mapping can be preserved with:
  - `STRIPE_LEGACY_PRO_PRICE_IDS`
- Credit packs are separate Stripe payment sessions and add `purchasedCredits`.
- One-time support payments do not grant subscription access and do not grant credit packs.

Stripe metadata conventions:
- Subscription flow:
  - `flow=subscription`
  - `planTier=creator|pro|premium`
- Credit pack flow:
  - `flow=credit_pack`
  - `creditPackId`
  - `credits`
- One-time support flow:
  - `flow=support_payment`

## Credit Charging Rules
- AI text/genkit/function actions charge through `consumeCredits(...)`.
- If true provider token usage is not available, fallback is token estimation from text length.
- Storage is charged daily as retention through the scheduled maintenance function, not only at upload time.
- Monthly included credits are granted per cycle through the wallet logic, not by UI assumptions.
- Rollover is capped by plan.

Current public tier bundles:
- `free`: `150` monthly credits, no rollover
- `creator`: `2,500` monthly credits, `625` rollover cap
- `pro`: `7,000` monthly credits, `1,750` rollover cap
- `premium`: `16,000` monthly credits, `4,000` rollover cap

Current credit packs:
- `pack_1000`
- `pack_2750`
- `pack_5000`

## Frontend Business Logic
- Main pricing/billing page:
  - `/Users/adeshbhattarai/code/Airabook/src/pages/Donate.jsx`
- Success and recovery flow:
  - `/Users/adeshbhattarai/code/Airabook/src/pages/DonateSuccess.jsx`
- Profile billing summary:
  - `/Users/adeshbhattarai/code/Airabook/src/pages/ProfileSettings.jsx`
- Public marketing plan cards:
  - `/Users/adeshbhattarai/code/Airabook/src/pages/Home.jsx`
  - `/Users/adeshbhattarai/code/Airabook/src/pages/AiraHome.jsx`

When updating plan copy:
- Change both the frontend catalog and marketing cards.
- Do not leave one page saying `Pro` when the billing page says `Creator`.
- Keep `/billing` as the main route and `/donate` as the compatibility alias.

## Firebase Function Hooks Already Charging Credits
- Rewrite text:
  - `/Users/adeshbhattarai/code/Airabook/functions/textGenerator.js`
- Query book and chapter suggestion flows:
  - `/Users/adeshbhattarai/code/Airabook/functions/genkit.js`
- Image generation request path:
  - `/Users/adeshbhattarai/code/Airabook/functions/generateImage.js`
- Prompt-generated chapter creation:
  - `/Users/adeshbhattarai/code/Airabook/functions/createBook.js`

If a new AI feature is added in `functions/`, it should usually:
1. check auth
2. call `consumeCredits(...)`
3. persist a meaningful usage event source/feature/provider
4. only then call the expensive model/provider

## Usage Events
- Usage events are append-only in `usageEvents`.
- They should record:
  - `userId`
  - `feature`
  - `source`
  - `provider`
  - `rawUnits`
  - `estimatedCostUsd`
  - `creditsCharged`
  - `creditsDeducted`
  - `metadata`
  - `createdAt`

Use these events for:
- billing audits
- admin reporting
- future shadow-mode comparisons
- debugging unexpected credit burn

## Quick Change Guide
If you want to change prices:
- update `functions/payments/catalog.js`
- update `src/lib/billingCatalog.js`
- update Stripe env vars/deployment config
- update marketing copy if the public labels changed

If you want to change monthly included credits:
- update `functions/payments/catalog.js`
- update `src/lib/billingCatalog.js`
- check any tests that assert specific values

If you want to change credit pack sizes:
- update `functions/payments/catalog.js`
- update `src/lib/billingCatalog.js`
- check `createCreditPackCheckoutSession`

If you want to change how credits are burned:
- update `functions/payments/creditLedger.js`
- then review all call sites that pass `feature`, `source`, and `rawUnits`

If you want to change who gets voice:
- update `/Users/adeshbhattarai/code/Airabook/src/lib/billing.js`
- update `/Users/adeshbhattarai/code/AiraAI/Agent/docs/CREDIT_BILLING_AGENT.md`
- update backend guard logic in the Spring repo too

## Guardrails
- Do not treat one-time support as subscription access.
- Do not grant voice only from frontend checks; backend still enforces.
- Do not remove `status` fallback until both repos are fully migrated.
- Do not change tier names in only one repo.
- Do not hardcode Stripe price ids in source code.
