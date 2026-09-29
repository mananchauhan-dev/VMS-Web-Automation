# Generator Safety Report

Dry-run scan of the entire OpenAPI spec (**zero HTTP calls**) — proves the Stage 3C fix by exercising
`dataGenerator.js` against every endpoint's request-body schema exactly as it would run for real, and
tallying every `example` value it inspected, reused, or rejected as potentially real-world.

Re-run: `node scripts/generate-safety-report.js`

## Summary (Phase 1 — every declared field, whole spec, one pass)

```
Endpoints scanned (body-bearing):       206
Total OpenAPI examples inspected:       548
Examples reused (classified safe):      439
Examples rejected (classified unsafe):  109
Synthetic values generated in their place: 109  (1:1 — every rejection falls through to synthetic generation)
```

**Do not read "0 rejected" as "0 risk" if it ever shows that** — it would mean either the spec stopped
using real-world-looking examples, or this classifier needs strengthening; it does NOT mean the
generator is unconditionally safe for every future spec change. Regenerate and review this report
whenever the spec changes materially.

## Unsafe-example categories (signal that fired, tallied across all rejections)

```
identity-field-name      61
email-domain             11
config-key-shape         33
other                    2
business-terminology     12
```
(A single rejection can trigger more than one signal, e.g. an identity-shaped field whose value also
matches the config-key shape — categories sum to more than "Examples rejected" above when that happens.)

## Endpoints requiring an explicit workflow override (Phase 2 — minimal payload only)

These endpoints have at least one identity-shaped required field whose `example` was rejected when
building the MINIMAL payload (exactly what the generic mutating suites send) — meaning a real
CREATE/UPDATE test against them needs a hand-chained workflow with an explicit unique override
(Yard/Insurer/Bank/States/MasterData already have one), not the raw generic engine:

- `POST /api/v1/yard/add` — ✅ has an approved workflow
- `PUT /api/v1/yard/edit` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/vmt/sign-up` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/user/add-user` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/user/fake-user` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/upload-file` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/tasks/create-new-task` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/tasks/approve-payment` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/states/add-states` — ✅ has an approved workflow
- `PATCH /api/v1/states/add-states` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/role-permission/fetch-permission` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/role-permission/permission` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `PUT /api/v1/role-permission/permission` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/procurement` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/procurement/bank-auction` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/other-platform/agent/create` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/notifications` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/login` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/listing/add` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/learning-module/add-section` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `PATCH /api/v1/leads/update-logistic-status-by-regno` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `PATCH /api/v1/leads/update-logistic-status-by-status` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `GET /api/v1/leadstatusflow/flow-by-status` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/invoice/send-sms` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/inventory/create-product` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/fl-booking` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/facebook/pages` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/enquiry/get-cibil-score` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/enquiry/add-enquiry` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `PUT /api/v1/enquiry/close-enquiry` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `PUT /api/v1/dashboard/master-data` — ✅ has an approved workflow
- `POST /api/v1/centre` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /create-lead` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /initial-bid` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/bank` — ✅ has an approved workflow
- `POST /api/v1/bank/branch` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/auction-agency` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `PUT /api/v1/auction-agency` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/agent` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `PUT /api/v1/accessories-checklist/get-accessory-checklist` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `PATCH /api/v1/accessories-checklist/update-checklist` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/accessories-checklist/create-checklist` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `GET /api/v1/invenory-cycle/count` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `GET /api/v1/invenory-cycle/` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `GET /api/v1/invenory-cycle/download-excel` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `GET /api/v1/invenory-cycle/inventory-cycle-excel` — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end
- `POST /api/v1/insurer` — ✅ has an approved workflow

## Mutation-safety-gate results (independent re-check of the exact minimal payload every generic mutating test sends)

```
Endpoints where the gate found a violation: 0 / 206
```

**0 violations** — every endpoint's minimal generated payload is gate-clean. This is the direct evidence for the acceptance criterion: no generic mutation sends a real-world example verbatim.

## What this report does NOT claim

- It does not claim every synthetic value is *semantically* valid for the target field (a synthetic
  string in a field expecting a specific real-world format the classifier doesn't recognize could still
  fail business validation — that's a correctness question for the individual test, not a safety one).
- It does not claim the classifier is complete. It is signal-based and generalizable (field semantics,
  identifier shape, email domain, phone format, business terminology, a synthetic escape hatch) rather
  than a hardcoded company list, per the brief — a new unsafe pattern may need a new signal added to
  `src/core/exampleSafety.js`.
- It does not claim 100% safety with zero evidence — every number above comes from actually running the
  generator against the real spec, not from an assertion.
