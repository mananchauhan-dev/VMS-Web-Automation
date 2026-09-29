# VMS API Automation

OpenAPI-driven functional API test automation for the VMS backend. Spec:
[`spec/vms-openapi.json`](spec/vms-openapi.json) (a copy of the file downloaded
from `https://devvms.tractorfirst.com/api-docs`, 405 operations / 343 paths /
53 modules).

This suite lives alongside (not instead of) the existing Cypress UI suite in
`../cypress`. Separate `package.json`/toolchain deliberately, to avoid mixing
Playwright + Mocha/Cypress dependency trees.

## Why this framework looks the way it does

**Everything is derived from the spec, at runtime, by code — not hand-authored
per endpoint.** `src/core/specLoader.js` parses `spec/vms-openapi.json` into a
flat list of `EndpointDescriptor`s; every generator, test suite, and report in
this repo consumes that list. Add an endpoint to the spec, re-run
`npm run inventory`, and it's automatically in-scope for the generated suites.
This is what "real coverage, not fake coverage" (brief Step 34) means in
practice: a single test file with a loop genuinely exercises all 196
documented `GET` endpoints, each showing as its own line in the report — not
one generic ping test claiming the whole API is "covered".

Hand-written tests exist where a data-driven loop can't do the job:
role-based workflows (`tests/workflows/yard-crud.spec.ts`), RBAC token
acquisition (`tests/rbac/rbac.spec.ts`), and the handful of business rules the
spec documents concretely enough to assert on (`tests/business-rules/`).

## Quick start

```bash
cd api-automation
npm install
cp .env.example .env        # fill in at least ADMIN_EMAIL — see below
npm run inventory           # rebuilds reports/inventory.json + coverage-matrix.md
npm run test:smoke          # runs right now, zero config needed
```

## Configuration — what each `.env` value unlocks

| Variable | Unlocks | Required for |
|---|---|---|
| `ADMIN_EMAIL` | `POST /api/v1/login` (AuthToken), and — via `POST /api/v1/user/fake-user` — role-impersonation tokens | Most GET/regression tests, all RBAC tests |
| `VMT_TEST_MOBILE` | VmsAuthToken (`/api/v1/vmt/*`) via OTP login (uses the spec-documented static non-prod OTP `"12345"` — no real OTP needed) | VMT-tagged endpoints |
| `PARTNER_API_KEY` | `ApiKeyAuth` (OtherPlatform partner routes) | `OtherPlatform`-tagged endpoints |
| `RUN_MUTATING=true` | POST/PUT/PATCH/DELETE generated suites + the Yard CRUD workflow | Write-path coverage |
| `API_ENV` / `ALLOW_PROD` | Target environment; prod refused unless `ALLOW_PROD=true` | — |

**Without any of these, `npm run test:smoke` and the no-auth-required portion
of `npm run test:negative` still run for real, against the real `dev`
environment** — see the run evidence below.

## What has actually been run (not a projection)

This was executed against `https://devvms.tractorfirst.com` with **no
credentials configured** (proving the framework end-to-end with zero setup)
before handing this off. Results are checked into
[`reports/coverage-report.md`](reports/coverage-report.md) /
[`reports/last-run.json`](reports/last-run.json) — regenerate anytime with:

```bash
npm run test:json && npm run coverage
```

Last run (endpoint level):

- **405** total spec endpoints
- **192** exercised with 100% passing assertions
- **4** exercised with a **failing** assertion — real findings against the
  live API, see below — not framework bugs
- **209** correctly `test.skip()`'d with a stated reason (needs `ADMIN_EMAIL`
  / `VMT_TEST_MOBILE` / `PARTNER_API_KEY` / `RUN_MUTATING=true`)
- **0** endpoints unaccounted for

Last run (parameter/field level — see `tests/parameters/`, the schema-driven
engine that tests every enum value, boundary, wrong-type, format, and
required-field case the spec's own constraints imply): **4,580 negative/
boundary/enum test cases generated** from the spec (nothing hand-authored
per field), of which **516 actually executed** (500 passed, 16 failed — the
same 4 known findings recurring under different input values, not new bugs)
and **4,064 skipped**, all with a stated credential/`RUN_MUTATING` reason.
Full breakdown — path/query/body/nested/array field counts, enum and
boundary coverage percentages, request/response schema validation counts —
is in [`reports/coverage-report.md`](reports/coverage-report.md), regenerated
by the same command above. **This low executed-fraction is expected and
honest**, not a shortfall in the engine: 339/405 endpoints require
`AuthToken`, so most parameter/field cases correctly skip without
`ADMIN_EMAIL` — the generator itself covers 100% of applicable
parameters/fields/enum-values/boundaries; what's pending is credentials to
actually fire the requests. Re-run `npm run test:safe && npm run coverage`
with `.env` filled in to watch those percentages jump.

### Real findings from this run (not automation bugs)

1. **`GET /api/v1/vmt/search-location`, `GET /api/v1/payment/{id}`,
   `GET /api/v1/invoice/{id}`** — for a syntactically-valid-but-nonexistent
   id, these return `200` with `data: null`, but the spec's `200` response
   schema declares `data` as `type: object` (not nullable). Either the schema
   should mark `data` nullable, or a `404` would be more correct for "no
   matching record". Contract violation as currently documented.
2. **`GET /api/v1/model/models-by-brands`** — the spec's own description says
   this route "is not currently mounted... not reachable at runtime", yet
   still documents a `200` response. The live server correctly 404s. The
   `404` just isn't in the documented status list — spec accuracy gap, not a
   server bug.

These are left **failing** in the suite deliberately (see Step 34: don't hide
real findings) rather than special-cased away.

## Framework layout

```
api-automation/
├── spec/vms-openapi.json         # source of truth
├── src/
│   ├── config/env.js             # .env loading, environment guard
│   └── core/
│       ├── specLoader.js         # spec -> flat EndpointDescriptor[] (single source of truth)
│       ├── dataGenerator.js      # parameterCasesFor(): THE schema-driven boundary/enum/negative-value engine
│       ├── schemaUtils.js        # field flattening (nested/array), omitPath/setPath for per-field overrides
│       ├── schemaValidator.js    # Ajv contract validation
│       ├── auth.js               # login / role-impersonation / VMT OTP — token cache
│       ├── apiClient.js          # path/query building, auth header resolution, request execution
│       └── testValueHelpers.js   # shared path/query fallback-value resolution
├── scripts/
│   ├── generate-inventory.js     # spec -> reports/inventory.json + coverage-matrix.md
│   └── generate-coverage-report.js  # last test run -> reports/coverage-report.md (endpoint AND parameter-level, evidence-based)
├── tests/
│   ├── smoke/                    # @smoke — no-auth GET endpoints, always runnable
│   ├── regression/                # @regression @contract — every GET (safe); every mutating op (gated)
│   ├── negative/                  # @negative — missing required query/body field, no/invalid auth
│   ├── parameters/                # @negative @contract — per-parameter/field VALUE coverage: every enum
│   │                               # value, every boundary, wrong-type, format, for path/query params (safe)
│   │                               # and body fields incl. nested/array (gated, see Safety model)
│   ├── rbac/                      # @rbac — role token acquisition via fake-user; TODO: permission matrix
│   ├── business-rules/            # @business — spec-confirmed rules only; rest marked TODO
│   └── workflows/                 # @workflow — hand-written multi-step CRUD (Yard, gated)
└── reports/                       # inventory.json, coverage-matrix.md, coverage-report.md (committed);
                                    # allure-results/, html-report/, last-run.json (gitignored, regenerated)
```

### The parameter/field value engine (`src/core/dataGenerator.js#parameterCasesFor`)

Dynamically inspects `type, format, enum, minimum, maximum, exclusiveMinimum,
exclusiveMaximum, minLength, maxLength, pattern, multipleOf` on any schema
fragment and returns every case that's actually **applicable** — nothing
hardcoded per field/module name, so it keeps working unchanged as the spec
changes. Every case is tagged with a category from the brief's taxonomy:

```
VALID_ENUM · INVALID_ENUM · VALID_BOUNDARY · BELOW_MINIMUM · ABOVE_MAXIMUM ·
WRONG_TYPE · INVALID_PATTERN · INVALID_FORMAT · EMPTY · NULL
```

(`MISSING` and `INVALID_ID`/`NON_EXISTING_ID` are handled by the calling test
files, not the engine, since they're about *omitting* a key or *path*-shaping
a value rather than substituting a value.) Three generated suites consume it:

- `tests/parameters/generated-path-param-values.spec.ts` — id-shaped path
  params get `INVALID_ID`/`NON_EXISTING_ID`; others get the engine's
  wrong-type/format cases. **Safe, GET-only, no `RUN_MUTATING` needed.**
- `tests/parameters/generated-query-param-values.spec.ts` — every case the
  engine derives, for every query parameter (required or optional) of every
  `GET` endpoint. **Safe.**
- `tests/parameters/generated-body-field-values.spec.ts` — same engine over
  every *scalar leaf* field (`src/core/schemaUtils.js#flattenScalarFields`),
  including nested objects and array-of-object items via dot-path
  (`omitPath`/`setPath` handle `"a.b"` and `"a[].b"` alike). Required fields
  get the full case set; optional-and-unconstrained fields are skipped (see
  the file's own header for the reasoning) to avoid ~2,500 low-signal
  mutating calls. **Gated behind `RUN_MUTATING=true`.**

All three use the same assertion policy as the rest of the framework:
documented-status membership + response-contract validation — never an
invented specific expected status, per the brief's "do not invent business
rules" (see each file's header for the full reasoning).

## Safety model — why some suites are gated behind `RUN_MUTATING`

`../cypress`'s CI already juggles per-role real credentials for a reason: this
backend has real side effects, and a handful of documented endpoints
explicitly say **"No request-level validator is applied"** — meaning even a
deliberately-broken negative-test payload can still persist a garbage record.
Rather than guess which of 209 non-GET endpoints are safe, **all** of them
default to skipped. Set `RUN_MUTATING=true` only against a disposable
dev/staging dataset, never prod (which is refused outright unless
`ALLOW_PROD=true` is also set — see `src/config/env.js`).

`tests/workflows/yard-crud.spec.ts` is the one fully-worked CRUD example
(create → read → update → verify → soft-delete), chosen because Yard's
create/read/update endpoints are the only module the spec documents with
**no auth requirement at all** — it's runnable with zero `.env` setup, once
`RUN_MUTATING=true` is set.

## Commands

```bash
npm run inventory        # regenerate reports/inventory.json + coverage-matrix.md from the spec
npm test                 # everything (respects RUN_MUTATING gate)
npm run test:smoke       # @smoke — no auth needed
npm run test:regression  # @regression — GET contract suite (+ mutating suite if RUN_MUTATING=true)
npm run test:negative    # @negative — missing required params/fields, no/invalid auth
npm run test:contract    # @contract — same tests as regression, contract-validation angle
npm run test:rbac        # @rbac — role-token acquisition
npm run test:business    # @business — spec-confirmed business rules
npm run test:workflow    # @workflow — Yard CRUD (gated)
npm run test:parameters  # tests/parameters/ — path + query param value coverage (safe subset only)
npm run test:safe        # smoke + GET regression + negative + rbac + business + safe parameter suites
npm run coverage         # cross-reference last run against the spec -> reports/coverage-report.md
npm run report           # build + open the Allure HTML report
npm run lint / format
```

## What's NOT done — outstanding work, stated plainly

Per Step 34/37, here is what real coverage does **not** yet include, rather
than claiming otherwise:

- **Field-level boundary/type/enum negative tests** (Steps 6–11) — DONE. The
  engine (`dataGenerator.js#parameterCasesFor`) is wired into
  `tests/parameters/*.spec.ts`, generating 4,580 cases from the spec's own
  constraints. What's outstanding here is purely **execution**, not
  engineering: 4,064 of those cases are `test.skip()`'d because 339/405
  endpoints need `ADMIN_EMAIL` and the body-field suite needs
  `RUN_MUTATING=true` — neither is configured in this environment. See
  `reports/coverage-report.md` for exact per-category percentages.
- **RBAC permission matrix** (who is authorized to do what) is scaffolded
  (`tests/rbac/rbac.spec.ts`) but marked `TODO: BUSINESS RULE CONFIRMATION
  REQUIRED` — the spec documents no role enum or per-endpoint permission
  table; it lives in backend source not covered by this OpenAPI file.
- **Business rules** beyond the 3 confirmed in `tests/business-rules/` (VMT
  static OTP, task-ageing bucket labels) are marked TODO for the same reason
  — pricing thresholds, charge-calculation formulas, and ageing-bucket
  boundary logic are referenced in spec prose but not given concrete
  numbers/formulas there.
- **State-transition testing** (Step 20) — the `LeadStatus` state machine is
  real and extensive (visible via `desire`/`current` fields across
  Procurement/Booking/Documents endpoints) but its valid-transition graph
  isn't enumerated in the spec (`leadstatusflow/add-update-statusflow` seeds
  it from backend source, not documented here). Needs that source.
- **Actually running the mutating + RBAC + business suites** against a real
  environment requires `ADMIN_EMAIL` (and ideally `VMT_TEST_MOBILE`) for a
  real provisioned dev-environment user — not available in this environment.
  Everything is wired and ready; `npm run test:safe` with `.env` filled in is
  the next command to run.

## CI

`.github/workflows/api-automation.yml` — smoke (no secrets) always runs;
regression/negative/rbac/business run with `API_ADMIN_EMAIL` /
`API_VMT_TEST_MOBILE` / `API_PARTNER_API_KEY` repo secrets; mutating suites
are opt-in per dispatch. Default environment is `dev`; `prod` requires
selecting it explicitly in `workflow_dispatch`.
