# Stage 4 Report — Broader Safe Mutation + Parameter Coverage

Evidence: `reports/last-run-stage-4.json` (merged from `last-run-stage-4-sweep.json`,
`last-run-stage-4-readonly.json`, `last-run-stage-4-flowforteams.json`, all preserved individually
alongside the merge). `reports/last-run.json` now points at this stage. All execution at `workers=1`.

1. **Endpoint candidates surveyed**: every remaining POST/PUT/PATCH/DELETE endpoint in the 405-endpoint
   spec not already exercised in Stages 1–3C (~290 endpoints), plus a handful of previously-unexercised
   read-only GETs in reference-data modules.
2. **New SAFE_MUTATION endpoints found**: **0**. Two candidates (`bank/branch`, `auction-agency`) were
   investigated in depth and excluded — see finding #7.
3. **SAFE_MUTATION endpoints deepened (existing, already-approved)**: 5 — Yard, Insurer, Bank, States,
   MasterData (the same 5 approved in Stages 1–3C; no new modules added).
4. **New SAFE_READ_ONLY endpoints selected and executed**: 7 — `GET /api/v1/leadstatusflow`,
   `GET /api/v1/leadstatusflow/flow-by-status`, `GET /api/v1/leadstatusflow/add-update-statusflow`,
   `GET /api/v1/searchLocation`, `GET /api/v1/tehsils/{id}`, `GET /api/v1/role-wise-dashboard`,
   `POST /api/v1/leadstatusflow/flow-for-my-teams` (read-semantics despite POST verb).
5. **Endpoints explicitly excluded this stage, with reasons**: 20 categories / ~115 individual
   endpoints — full list in `reports/coverage-report.md` under "Stage 4 → Endpoints reviewed and
   explicitly excluded this stage". Two (`bank/branch`, `auction-agency`) were reviewed in detail
   rather than pattern-matched — see finding #7.
6. **Endpoints already covered by earlier stages, not re-selected**: 115 (`reports/coverage-matrix.md`
   reflects the cumulative set).
7. **Why the 25–50 target was not reached**: the OpenAPI spec's remaining mutating-endpoint universe,
   after removing every endpoint that touches real customer/employee/financial/booking/inventory/
   payment/notification/external-side-effect/master-config/auth-security data (per the avoid-list),
   contains almost no additional master-reference-data CRUD modules. The two closest candidates
   (`bank/branch`, `auction-agency`) both lack any documented deactivate/soft-delete field or DELETE
   endpoint — a created record would be **permanently uncleanable**, which is an explicit stop
   condition, not a coverage trade-off. Per the instruction ("use fewer if the safety classification
   does not provide enough safe endpoints"), this stage deepened the 5 already-approved modules'
   **field-level** coverage instead of adding endpoint count.
8. **New test file**: `tests/workflows/mutation-field-coverage.spec.ts` — 5 tests, single-`test()` +
   `test.step()` + `try/finally` per module, each creating and cleaning up its own disposable record.
9. **Total requests executed this stage**: 60 (38 field-sweep cases + 5 create + 5 cleanup +
   5 verify-cleanup across the 5 modules, + 6 new GET contract checks, + 1 POST-read contract check).
10. **Top-level test results**: 9 expected (pass), 3 unexpected (fail), 0 skipped, 0 flaky.
11. **502 count**: 0.
12. **5xx (non-502) count**: 0.
13. **Timeout count**: 0.
14. **Network-error count**: 0.
15. **Field-sweep case breakdown**: 38 cases — 16 WRONG_TYPE, 8 EMPTY, 8 NULL, 5 VALID_ENUM,
    1 INVALID_ENUM. **0 BOUNDARY cases** — none of the 5 modules' UPDATE-endpoint schemas declare
    `minLength`/`maxLength`/`minimum`/`maximum`/`pattern` constraints in the OpenAPI spec, so the
    generator correctly produced no boundary cases (nothing to bound).
16. **Nested field coverage**: yes — `states` sweep covered `data.active` / `data.gstNumber` (nested
    under `data`); `yard` sweep covered `yardDetails.yardId` (nested under `yardDetails`).
17. **Array field coverage**: not applicable this stage — none of the 5 modules' UPDATE bodies contain
    an array-typed field. (Bank's CREATE body has one, `banks[]`, but CREATE endpoints are deliberately
    excluded from field-sweeping — see finding #8/design note in the new spec file's header.)
18. **Enum coverage**: MasterData's `valueType` field — all 5 documented enum values exercised
    (`number`, `boolean`, `object`, `array`, `string`) plus 1 invalid-enum case. This is the only
    enum-constrained field across the 5 modules' UPDATE schemas.
19. **Negative-case coverage**: 33 of 38 sweep cases were negative (WRONG_TYPE/EMPTY/NULL/INVALID_ENUM);
    5 were VALID_ENUM (schema-valid, included for completeness of enum coverage).
20. **Safety-gate stats**: not applicable to the new field-sweep file by design — its case values come
    exclusively from `parameterCasesFor()` (enum members / type-mismatch / empty / null sentinels),
    never from an OpenAPI `example`, so there is nothing for `assessGeneratedPayloadSafety` to catch.
    The pre-existing gate remained wired, unmodified, in the two generic suites used for the 6 new GETs
    (N/A, GETs have no body) and the 1 POST-read check (0 violations — its only body field, `user.role`,
    is enum-driven, not example-driven).
21. **Cleanup stats**: 5/5 disposable records created this stage, 5/5 successfully soft-deleted and
    cleanup-verified (**100%**) — including the 2 modules (Yard, Insurer) whose sweep phase failed
    partway through, confirming the `try/finally` pattern worked exactly as designed.
22. **Orphaned records**: 0.
23. **Pattern 1 occurrences this stage**: +2 (`PUT /api/v1/yard/edit` and `PATCH /api/v1/insurer`,
    both on their record-id field's `NULL` case) — correlated to the existing, already-confirmed
    (37+ prior occurrences) finding, not counted as new. Running total: 39+.
24. **New findings this stage**: 1 — **Pattern 6**: `POST /api/v1/leadstatusflow/flow-for-my-teams`
    documents `data[].assignTaskTo` as `type: string`, but the live API returns an array
    (e.g. `["CENTRE_MANAGER"]`), confirmed on all 33 items of a direct verification call.
    Classification **D — spec/contract mismatch** (likely the OpenAPI spec is wrong, given the field
    plausibly supports multiple roles; `TODO: BUSINESS RULE CONFIRMATION REQUIRED`).
25. **AccessoriesCheckList**: untouched this stage, per instruction — remains permanently excluded,
    documented verbatim as: "Known excluded API defect: AccessoriesCheckList update endpoint returns
    success:true/data:null but does not persist changes." No new attempt at cleanup or re-classification.
26. **Framework defects found this stage**: 0.
27. **Framework defects fixed this stage**: 0 (none found — the single-test/step/try-finally pattern
    from Stage 2 remediation held up correctly under a genuinely new usage: an inner loop of 38
    sub-steps with 2 failures partway through, and cleanup still ran both times).
28. **Backend health — before**: 3/3 consecutive 200 (`GET /api/v1/states`, 2s apart).
29. **Backend health — during**: no health-check interruption needed — 0 infra failures observed
    across all 60 requests.
30. **Backend health — after**: 3/3 consecutive 200 (`GET /api/v1/states`, 2s apart).
31. **`npx tsc --noEmit`**: clean, 0 errors.
32. **`npx eslint .`**: clean, 0 errors (1 pre-existing warning, `dataGenerator.js:28` unused `pick`
    helper — present before this stage, not introduced by it, out of scope to fix unprompted).
33. **Git/safety review**: `api-automation/` is entirely untracked in this repo (no commit history to
    diff yet) — reviewed the new/changed files directly instead: no secrets, no `.env` changes, no
    production URLs, no safety guards removed or relaxed, no historical report files overwritten
    (`last-run-baseline-readonly.json` through `last-run-stage-3c.json` all confirmed present and
    untouched by content), no debug code left in. `.env` confirmed gitignored.
34. **Historical evidence files preserved**: `last-run-pre-auth.json`, `last-run-baseline-readonly.json`,
    `last-run-yard-crud.json`, `last-run-stage-2.json`, `last-run-stage-2-remediation.json`,
    `last-run-stage-3a.json`, `last-run-stage-3b.json`, `last-run-stage-3c.json` — all unmodified.
    New this stage: `last-run-stage-4.json` (merged), `last-run-stage-4-sweep.json`,
    `last-run-stage-4-readonly.json`, `last-run-stage-4-flowforteams.json` (the 3 pre-merge sources).
35. **Overall verdict**: **STAGE 4 PASS WITH FINDINGS**.

## Verdict rationale

No safety violations, no data-cleanup failures, no infrastructure instability, no framework defects.
One genuinely new API/spec contract finding (Pattern 6) and 2 new correlated occurrences of the
already-known Pattern 1 — both real, both evidence-based, neither blocking. The endpoint-count target
(25–50) was not reached and, based on this stage's survey, cannot be reached without relaxing the
avoid-list or accepting uncleanable test records — the instruction explicitly permits using fewer
endpoints under exactly this condition. Coverage was broadened instead along a different, equally
legitimate axis: field-level boundary/enum/negative depth on the already-approved modules, using a new
owned-record sweep pattern that is safe by construction (never touches a real or random record) and
reusable for future stages.

## Stage 5 recommendation

Not decided here — per instruction, this report is for review before scoping Stage 5. Candidate
directions, for consideration only:
- Extend the owned-record field-sweep pattern (`mutation-field-coverage.spec.ts`) to any of the 5
  approved modules' **CREATE** endpoints' optional/constrained fields (currently untested — the sweep
  only covers UPDATE bodies), using the same create-your-own-record-then-fuzz-then-cleanup shape.
  This would need a per-case-create-and-cleanup design (heavier than the current per-field-on-one-record
  design), since a CREATE case can't safely reuse one already-created record the way an UPDATE case can.
- Raise Pattern 6 and the accumulated Pattern 1/2/3/5 findings with the API/spec owners for a business-
  rule decision (each is marked `TODO: BUSINESS RULE CONFIRMATION REQUIRED` in `coverage-report.md`).
- If `bank/branch` or `auction-agency` gain a documented deactivate/delete path in a future spec
  revision, both become immediate SAFE_MUTATION candidates — re-survey then.
