# Firebase + Stripe Integration Plan

## 1. Stripe Flow Decision

- Hosted Checkout Session vs Payment Element: hosted gives Stripe-hosted UI, handles PCI, taxes, wallets, localization; Payment Element is fully embeddable but leaves validation, PCI SAQ-A and edge-case handling to us. Hosted Checkout also simplifies success/cancel URLs for Firebase hosting and comes with Stripe’s prebuilt tax receipt emails. We will proceed with Hosted Checkout Sessions as requested.

## 2. Firestore Data Model

- Add `billing` section inside each `users/{uid}` doc (`planTier`, `planState`, `lastPaymentAt`, `currentPeriodEnd`, cached `latestPaymentId`) so plan checks are O(1).
- Create top-level `payments` collection keyed by `IDGenerator.generateId()` with `userId`, `sessionId`, `amount`, `currency`, `planTier`, `status`, `createdAt`, `updatedAt`. Optional subcollection `subscriptions` if future recurring plans differ.
- Ensure composite index on `[userId, status]` if we ever need historical queries; primary O(1) lookups read directly via doc ID.

## 3. Stripe Cloud Functions

- In `functions/index.js`, register two new modules (`payments/createCheckoutSession.js`, `payments/stripeWebhook.js`).
- `createCheckoutSession`: HTTPS callable that validates Firebase Auth token, creates/upserts pending `payments/{id}`, then calls `stripe.checkout.sessions.create` with amount metadata, success/cancel URLs, and embeds `paymentId` & `userId` metadata for webhooks.
- `stripeWebhook`: HTTP endpoint verifying Stripe signatures, handling `checkout.session.completed` & `invoice.paid` events. On success mark `payments/{id}.status = "completed"`, update `users/{uid}.billing` atomically. On failed/expired events, set status accordingly.
- Keep Stripe secret keys + webhook secret in `functions/.runtimeconfig.json`; read via `functions.config()`.

## 4. Frontend Donation Flow

- Create `src/pages/Donate.jsx` showing preset amount chips (1/5/10/custom), short support note, and primary CTA (color #3498db, accent #2ecc71). Hook to Firebase callable to get session ID, then redirect via `@stripe/stripe-js` in `src/lib/stripe.js` helper.
- Add `src/pages/DonateSuccess.jsx` ("Thanks for donating" message) to handle `success_url` return, optionally show receipt info by reading `payments/{latestPaymentId}`.
- Update `src/App.jsx` routes and `src/components/Navbar.jsx` / CTA components so Donate button navigates to the new page.

## 5. Plan-Based Capability Gating

- Extend `src/context/AuthContext.jsx` to subscribe to the user doc and expose `billing.planTier` & `planState` on context.
- In `src/pages/CreateBook.jsx` (and other write-entry points), check `planTier`; if `free`, show read-only restriction plus CTA linking to Donate/Plans page; if `pro` or `enterprise`, allow writing. Provide UI hints in `src/pages/Dashboard.jsx` to show current plan and upgrade options.
- Optionally persist entitlement flags in local storage/cache but always trust Firestore source of truth for writes.

## 6. Testing & Verification

- Add local emulation guide: use Stripe CLI to forward webhooks (`stripe listen --forward-to localhost:5001/.../stripeWebhook`).
- Unit-test callable via `firebase-functions-test` stubs, verifying metadata + Firestore updates. Cypress (or React Testing Library) smoke tests should cover Donate page UI + gating logic.

---

## Implementation Notes (2025-11-15)

- `users/{uid}.billing` now follows `functions/payments/paymentService.js` plan configs (tier, label, entitlements, timestamps).
- Stripe backend modules live under `functions/payments/*` and always rely on `IDGenerator.generateId('pay')` before writing Firestore.
- Frontend routing adds `/donate` and `/donate/success`, and `Navbar` donate button navigates there.
- Auth context surfaces `billing` + `entitlements`; `CreateBook` and `Dashboard` react to the plan state.
- Remember to set `VITE_STRIPE_PUBLISHABLE_KEY`, `stripe.secret_key`, and `stripe.webhook_secret` before testing checkout end-to-end.

### To-dos

- [x] Design user & payments collections for plans
- [x] Implement checkout + webhook Firebase Functions
- [x] Build donate/success pages and Stripe redirect
- [x] Wire plan status into AuthContext & gating


