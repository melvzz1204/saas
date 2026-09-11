# Plan: "My Subscription" Panel — Clinic Owner View (Subscription Only)

## Context

The clinic dashboard already has a "My Subscription" panel at
[`panel-subscription`](frontend/adminClinicDashboard.html:1188), rendered by
[`clinicSubscription.js`](frontend/src/pages/clinicSubscription.js:1). Backend
data comes from `GET /api/v1/billing/me/subscription`
([`billingRoutes.js`](backend/src/routes/billingRoutes.js:112)) which returns
`{ subscription, invoices, notifications, unread, paymentMethod, now }`.

Goal: make the panel answer the four questions a clinic owner actually has:

1. **What am I paying and when is the next charge?**
2. **What's my status right now, in plain language?**
3. **What do I get for this plan?**
4. **What can I do about it myself?**

Scope is subscription-only (no usage meters, no financial reports). No real
money moves — test mode.

## Current State

| Element                          | Where                                                                   | Status |
| -------------------------------- | ----------------------------------------------------------------------- | ------ |
| Status pill + plan name/price    | [`clinicSubscription.js`](frontend/src/pages/clinicSubscription.js:157) | Exists |
| Renewal countdown                | line 163-165                                                            | Exists |
| Payment method + auto-renew      | lines 166-175                                                           | Exists |
| Alert slot (dunning/trial)       | lines 180-205                                                           | Exists |
| Actions: Pay/Pause/Resume/Cancel | lines 258-273                                                           | Exists |
| Subscribe form (empty state)     | lines 212-238                                                           | Exists |
| Payment method picker            | lines 443-453                                                           | Exists |
| Invoices list                    | lines 275-315                                                           | Exists |
| Billing notices                  | lines 317-357                                                           | Exists |

## Recommended Content (Decision)

Adopt all of the following. Each item lists the data field(s) already returned
by the backend — **no schema changes required**.

### 1. Status banner — plain language + next charge (new, high value)

- Keep the priority alert slot
  ([`sub-alert-slot`](frontend/adminClinicDashboard.html:1190)) but add a
  one-line human explanation for every status, not just dunning states. Map enum
  → plain text:
  - `pending` → "Payment is processing — your plan activates shortly."
  - `trialing` → "Free trial — no charge until {date}."
  - `active` → "All good. Next charge {date}: {amount} via {method}."
  - `past_due` / `payment_failed` / `unpaid` → "Your {date} payment failed. Pay
    {amount} to keep access."
  - `paused` → "Billing is on hold. Resume anytime."
  - `canceled` / `expired` → "Subscription ended on {date}."
- **Next charge line**: combine `nextRenewalDate` (or
  `currentPeriodEnd`/`trialEndsAt`) + `amount` + `paymentMethod` into one
  sentence. The data exists but is split across cards today.

### 2. Current plan card (tighten existing)

- Plan name, billing cycle, price — keep
  ([`my-sub-plan-name`](frontend/adminClinicDashboard.html:1200),
  [`my-sub-price`](frontend/adminClinicDashboard.html:1204)).
- **Respect `cancelAtPeriodEnd`**: when true, label the anchor date "Ends
  {date}" instead of "Renews {date}". This field exists in the schema
  ([`billingModels.js`](backend/src/models/billingModels.js:138)) but is never
  surfaced in the UI.
- Label trials explicitly: "Trial ends {date}" when `status === "trialing"` and
  `trialEndsAt` is set.
- Auto-renew toggle — keep
  ([`my-sub-autorenew`](frontend/adminClinicDashboard.html:1222)).

### 3. What's included (new, high value)

- Add a "What's included" list on the plan card (or under it) rendered from
  `meta.plans[].features` — already fetched via `ensureMeta()`
  ([`clinicSubscription.js`](frontend/src/pages/clinicSubscription.js:56)) and
  currently unused except for pricing.
- Match the active plan by `planKey`. Fall back to the first active plan if not
  found.
- Do **not** add usage meters (staff seats used, storage, etc.) — no reliable
  data source; would be fabricated.

### 4. Payment method card (enrich existing)

- Keep current method + change picker.
- **Add card expiry display**: `paymentMethod.expMonth` / `expYear` and a
  warning when `isExpired()` would be true within 30 days
  (`paymentMethod.status === "expired"` already exists in schema).
- Keep the test-mode footnote.

### 5. Invoices (enrich existing list)

- Current row: number, due date, amount, status
  ([`clinicSubscription.js`](frontend/src/pages/clinicSubscription.js:283)).
- **Add period covered**: `invoice.periodStart` → `periodEnd` rendered as "Pro ·
  Sep 25 – Oct 25" (fields exist in
  [`billingModels.js`](backend/src/models/billingModels.js:180)). Also show
  `lineItems[].description` when present.
- For paid invoices show `amountPaid` and `paidAt`.
- Keep the Pay button for `open` invoices.

### 6. Billing notices (keep as-is)

### 7. Change plan / upgrade (new — small UI, existing endpoint)

- `POST /me/change-plan` already exists
  ([`billingRoutes.js`](backend/src/routes/billingRoutes.js:179)) but has **no
  UI**.
- Add a "Change plan" button in actions for non-`canceled`/`expired` subs →
  modal with plan picker (from `meta.plans`) → calls the endpoint. Reuse
  existing DashboardUI modal pattern used by `cancelFlow()`
  ([`clinicSubscription.js`](frontend/src/pages/clinicSubscription.js:419)).
- Guard: closed subs (canceled/expired) get the backend's 409 message; handle it
  in the catch block.

## Out of Scope (explicitly)

- Usage meters / seat limits / storage quotas — no data.
- Financial reports, revenue charts — different panel.
- Real payment integration — stays simulated.
- SaaS-admin side of billing — unaffected.

## Data Flow (unchanged)

1. `load()` → `GET /me/subscription` returns
   `{ subscription, invoices, notifications, unread, paymentMethod, now }`.
2. `ensureMeta()` → `GET /meta` returns plans (incl. `features`) + test payment
   methods.
3. All new UI renders from these two existing responses; no new endpoints
   needed.
4. `serverOffsetMs` sync
   ([`clinicSubscription.js`](frontend/src/pages/clinicSubscription.js:367))
   stays — all countdowns must keep using it.

## Failure Modes & Handling

- **Meta fetch fails** → `ensureMeta()` already throws; `load()` catches and
  shows retry
  ([`renderLoadError`](frontend/src/pages/clinicSubscription.js:381)). The
  "What's included" section must render an empty state ("—") without breaking
  the rest.
- **Status with no matching plain-language mapping** → fall back to
  `status.replace(/_/g, " ")` (current behavior).
- **Missing dates** → render "—" (existing `fmtDate` returns "—" for null).
- **Change-plan on closed sub** → backend 409; toast the message, keep UI
  unchanged.

## Validation Plan

1. Fresh clinic (no subscription): empty state shows Subscribe form + "No active
   subscription"; "What's included" shows plan features with price.
2. Subscribe via a test method → status active; next-charge line shows amount +
   date + method.
3. Use a delayed/failing test token → verify status banner reads plainly and Pay
   button appears.
4. Toggle `cancelAtPeriodEnd` (via SaaS admin or seed) → renewal label flips to
   "Ends {date}".
5. Pause/Resume/Cancel → banner + actions update without reload errors.
6. Change plan → new plan name/price render; invoice list shows new period.
7. Verify countdowns use server clock: advance the simulation clock, confirm "X
   d left" shifts.
8. Manual regression: payment method update, mark-notice-read, pay-invoice — all
   still work.

## Implementation Notes

- Single-file change:
  [`clinicSubscription.js`](frontend/src/pages/clinicSubscription.js) (render
  logic) + [`adminClinicDashboard.html`](frontend/adminClinicDashboard.html)
  (add "What's included" container + any new card markup).
- No backend changes required.
- Keep script classic-IIFE style, share `DashboardUI` globals, no new
  dependencies.

## Open Question (recommended default)

- Include "Change plan / upgrade" UI in this pass? **Recommended: yes** —
  endpoint exists, small surface, closes an obvious self-service gap. If
  deferred, everything else ships as-is.
