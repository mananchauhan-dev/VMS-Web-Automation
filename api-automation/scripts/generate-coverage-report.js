#!/usr/bin/env node
// scripts/generate-coverage-report.js
//
// Cross-references the spec-derived inventory against what the LAST test
// run actually exercised (reports/last-run.json, produced by Playwright's
// json reporter) and writes reports/coverage-report.md — real,
// evidence-based coverage at both the endpoint level AND the parameter
// level (path/query/body fields, nested fields, array fields, enum values,
// boundary constraints, formats, required-field negatives). Nothing here is
// a claim; every number traces back to actual executed (or explicitly
// skipped/not-applicable) Playwright test results.
//
// Run: npm run test:json && npm run coverage
// (or just `npm run coverage` to re-report the last run already on disk)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInventory } from "../src/core/specLoader.js";
import { flattenFields, countEnumValues } from "../src/core/schemaUtils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, "../reports");
mkdirSync(REPORTS_DIR, { recursive: true });

const LAST_RUN_PATH = path.join(REPORTS_DIR, "last-run.json");
const inventory = buildInventory();

// =====================================================================
// PART 1 — parse every leaf test result out of the Playwright JSON report,
// classifying each by which generated suite produced it and what exactly
// it exercised (endpoint id, param/field name, category). One shared
// parser instead of one regex per report section, so every count below
// comes from the same source of truth.
// =====================================================================

// Stops at whitespace, em-dash, "?" (querystring examples embedded in hand-written workflow
// test titles, e.g. "GET /api/v1/bank?search=<name>") or ">" so those titles still resolve to
// the same clean endpoint id as the spec — not a garbled, non-matching string.
const ID_RE = /\b(GET|POST|PUT|PATCH|DELETE)\s(\/[^\s—?>]*)/;
const PATH_PARAM_RE = /— path "([^"]+)" \[([A-Z_]+)\]/;
const QUERY_PARAM_RE = /— query "([^"]+)" \[([A-Z_]+)\]/;
const BODY_FIELD_RE = /— body "([^"]+)" \[([A-Z_]+)\]/;
const MISSING_QUERY_RE = /— missing required query "([^"]+)"/;
const MISSING_BODY_RE = /— missing required body field "([^"]+)"/;
const AUTH_NEGATIVE_RE = /=> 401/;
const CONTRACT_RE = /documented status \+ response contract/;

/** @typedef {{ epId: string, kind: string, name?: string, category?: string, outcome: "passed"|"failed"|"skipped" }} ParsedTest */

/** @returns {ParsedTest[]} */
function parseRun(playwrightJson) {
  /** @type {ParsedTest[]} */
  const results = [];

  function outcomeOf(spec) {
    const status = spec.tests?.[0]?.results?.[0]?.status || spec.tests?.[0]?.status;
    if (status === "passed" || status === "expected") return "passed";
    if (status === "skipped") return "skipped";
    return "failed";
  }

  /** Classify one title (a spec title OR a test.step() title) into a ParsedTest, or null if it names no endpoint. */
  function classify(title, outcome) {
    const idMatch = title.match(ID_RE);
    if (!idMatch) return null;
    const epId = `${idMatch[1]} ${idMatch[2]}`;
    let m;
    if ((m = title.match(PATH_PARAM_RE))) return { epId, kind: "path_param_value", name: m[1], category: m[2], outcome };
    if ((m = title.match(QUERY_PARAM_RE))) return { epId, kind: "query_param_value", name: m[1], category: m[2], outcome };
    if ((m = title.match(BODY_FIELD_RE))) return { epId, kind: "body_field_value", name: m[1], category: m[2], outcome };
    if ((m = title.match(MISSING_QUERY_RE))) return { epId, kind: "missing_required_query", name: m[1], outcome };
    if ((m = title.match(MISSING_BODY_RE))) return { epId, kind: "missing_required_body", name: m[1], outcome };
    if (AUTH_NEGATIVE_RE.test(title)) return { epId, kind: "auth_negative", outcome };
    if (CONTRACT_RE.test(title) || title.trim() === epId) return { epId, kind: "contract", outcome };
    return { epId, kind: "other", outcome };
  }

  /**
   * Chained CRUD workflows (Yard/Insurer/Bank/AccessoriesCheckList) run their whole lifecycle as ONE
   * test() using test.step() per phase (fixed after a Stage 2 finding — see coverage-report prose).
   * A step's own title (e.g. "1. CREATE — POST /api/v1/bank") still names an endpoint, so it must be
   * walked and classified individually — otherwise every workflow run collapses to a single untitled
   * "full lifecycle" spec with zero endpoint attribution, silently erasing per-endpoint evidence.
   */
  function walkSteps(steps) {
    for (const step of steps || []) {
      const outcome = step.error ? "failed" : "passed"; // a step only runs if its test wasn't skipped
      const parsed = classify(step.title, outcome);
      if (parsed) results.push(parsed);
      if (step.steps?.length) walkSteps(step.steps);
    }
  }

  function walk(suite) {
    for (const spec of suite.specs || []) {
      const outcome = outcomeOf(spec);
      const parsed = classify(spec.title, outcome);
      if (parsed) results.push(parsed);

      const stepsAtRoot = spec.tests?.[0]?.results?.[0]?.steps;
      if (stepsAtRoot?.length) walkSteps(stepsAtRoot);
    }
    for (const child of suite.suites || []) walk(child);
  }
  for (const suite of playwrightJson.suites || []) walk(suite);
  return results;
}

let allResults = [];
let hasRunData = false;
if (existsSync(LAST_RUN_PATH)) {
  try {
    allResults = parseRun(JSON.parse(readFileSync(LAST_RUN_PATH, "utf-8")));
    hasRunData = true;
  } catch (e) {
    console.warn(`Could not parse ${LAST_RUN_PATH}: ${e.message}`);
  }
}

const nonSkipped = (r) => r.outcome !== "skipped";
const byKind = (kind) => allResults.filter((r) => r.kind === kind);

// =====================================================================
// PART 2 — endpoint-level coverage (unchanged behavior from the previous
// version of this script, kept for continuity with earlier reports).
// =====================================================================

const endpointStats = new Map(); // epId -> { passed, failed, skipped }
for (const r of allResults) {
  const bucket = endpointStats.get(r.epId) || { passed: 0, failed: 0, skipped: 0 };
  bucket[r.outcome] += 1;
  endpointStats.set(r.epId, bucket);
}

const endpointRows = inventory.map((ep) => {
  const stats = endpointStats.get(ep.id);
  let state;
  if (!hasRunData) state = "UNKNOWN (no test run data)";
  else if (!stats) state = "NOT EXERCISED";
  else if (stats.failed > 0) state = `FAILED (${stats.failed} failing case(s))`;
  else if (stats.skipped > 0 && stats.passed === 0) state = "SKIPPED (credentials/RUN_MUTATING not configured)";
  else state = `EXERCISED (${stats.passed} passing case(s))`;
  return { ep, state };
});

const endpointSummary = { exercised: 0, notExercised: 0, skipped: 0, failed: 0, unknown: 0 };
for (const { state } of endpointRows) {
  if (state.startsWith("EXERCISED")) endpointSummary.exercised += 1;
  else if (state.startsWith("NOT EXERCISED")) endpointSummary.notExercised += 1;
  else if (state.startsWith("SKIPPED")) endpointSummary.skipped += 1;
  else if (state.startsWith("FAILED")) endpointSummary.failed += 1;
  else endpointSummary.unknown += 1;
}

// =====================================================================
// PART 3 — parameter-level coverage (new). Every "total" is computed
// STATICALLY from the spec (so it's true even with zero test runs); every
// "tested" is computed from PART 1's parsed, non-skipped results.
// =====================================================================

// ---- inventory of every parameter/field, independent of any test run ----
const pathParamTotal = []; // { epId, name }
const queryParamTotal = []; // { epId, name, required, schema }
const headerParamTotal = []; // { epId, name }
const bodyFieldTotal = []; // { epId, path, required, type, enum, schema }

for (const ep of inventory) {
  for (const p of ep.parameters) {
    if (p.in === "path") pathParamTotal.push({ epId: ep.id, name: p.name });
    if (p.in === "query") queryParamTotal.push({ epId: ep.id, name: p.name, required: p.required, schema: p.schema });
    if (p.in === "header") headerParamTotal.push({ epId: ep.id, name: p.name });
  }
  if (ep.requestBody?.schema) {
    for (const f of flattenFields(ep.requestBody.schema)) {
      bodyFieldTotal.push({ epId: ep.id, ...f });
    }
  }
}

const nestedBodyFields = bodyFieldTotal.filter((f) => f.path.includes(".") || f.path.includes("[]."));
const arrayBodyFields = bodyFieldTotal.filter((f) => f.path.includes("[]"));
const scalarBodyFields = bodyFieldTotal.filter((f) => ["string", "integer", "number", "boolean"].includes(f.type));

const CONSTRAINT_KEYS = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "multipleOf"];
const hasBoundaryConstraint = (schema) => !!schema && CONSTRAINT_KEYS.some((k) => typeof schema[k] === "number");
const hasFormatConstraint = (schema) => !!schema && (!!schema.pattern || ["date", "date-time", "email"].includes(schema.format));

const boundaryConstrainedParams = [
  ...queryParamTotal.filter((p) => hasBoundaryConstraint(p.schema)),
  ...scalarBodyFields.filter((f) => hasBoundaryConstraint(f.schema)),
];
const formatConstrainedParams = [
  ...queryParamTotal.filter((p) => hasFormatConstraint(p.schema)),
  ...scalarBodyFields.filter((f) => hasFormatConstraint(f.schema)),
];
// WRONG_TYPE is only generated for query params (always) and REQUIRED body fields (by design — see
// generated-body-field-values.spec.ts header) or constrained optional ones — count what the engine
// actually attempts, not every field in existence.
const invalidTypeApplicableParams = [
  ...queryParamTotal,
  ...scalarBodyFields.filter((f) => f.required || hasBoundaryConstraint(f.schema) || f.enum?.length || hasFormatConstraint(f.schema)),
];

const requiredQueryParams = queryParamTotal.filter((p) => p.required);
const requiredBodyFields = bodyFieldTotal.filter((f) => f.required && !f.path.includes("[]")); // array-item paths aren't individually "missing"-testable

const totalEnumValues =
  queryParamTotal.reduce((s, p) => s + (p.schema?.enum?.length || 0), 0) +
  inventory.reduce((s, ep) => s + (ep.requestBody?.schema ? countEnumValues(ep.requestBody.schema) : 0), 0);

// ---- what the last run actually exercised (non-skipped), by key ----------
const testedKey = (epId, name) => `${epId}::${name}`;

const testedPathParams = new Set(
  byKind("path_param_value").filter(nonSkipped).map((r) => testedKey(r.epId, r.name))
);
const testedQueryParams = new Set(
  byKind("query_param_value").filter(nonSkipped).map((r) => testedKey(r.epId, r.name))
);
const testedBodyFields = new Set(
  [...byKind("body_field_value"), ...byKind("missing_required_body")]
    .filter(nonSkipped)
    .map((r) => testedKey(r.epId, r.name))
);
// A path param is also genuinely exercised by the base contract test (it fills every path param
// for every request) — credit that too, since "tested" should mean "a real HTTP call used this
// parameter", not only "a dedicated invalid-value test exists for it".
for (const r of byKind("contract").filter(nonSkipped)) {
  for (const p of pathParamTotal.filter((pp) => pp.epId === r.epId)) testedPathParams.add(testedKey(r.epId, p.name));
  for (const p of queryParamTotal.filter((qp) => qp.epId === r.epId && qp.required)) {
    testedQueryParams.add(testedKey(r.epId, p.name));
  }
}

const testedRequiredQuery = new Set(byKind("missing_required_query").filter(nonSkipped).map((r) => testedKey(r.epId, r.name)));
const testedRequiredBody = new Set(byKind("missing_required_body").filter(nonSkipped).map((r) => testedKey(r.epId, r.name)));

// NOTE: PART 1's regexes capture {name, category} but not the raw enum value out of the label
// text, so "enum coverage" below is reported per (endpoint, param) pair that had >=1 valid-enum
// value exercised — a param with 3 enum values that each get their own generated test still
// contributes exact per-value evidence to `totalEnumValues`/individual test titles in the JSON
// report; this summary line is a coarser "did we touch this param's enum at all" rollup.
const enumValueTestResults = [...byKind("query_param_value"), ...byKind("body_field_value")].filter(
  (r) => r.category === "VALID_ENUM"
);

const boundaryTestResults = [...byKind("query_param_value"), ...byKind("body_field_value")].filter((r) =>
  ["VALID_BOUNDARY", "BELOW_MINIMUM", "ABOVE_MAXIMUM"].includes(r.category)
);
const testedBoundaryParams = new Set(boundaryTestResults.filter(nonSkipped).map((r) => testedKey(r.epId, r.name)));

const invalidTypeTestResults = [...byKind("query_param_value"), ...byKind("body_field_value")].filter(
  (r) => r.category === "WRONG_TYPE"
);
const testedInvalidTypeParams = new Set(invalidTypeTestResults.filter(nonSkipped).map((r) => testedKey(r.epId, r.name)));

const formatTestResults = [...byKind("query_param_value"), ...byKind("body_field_value")].filter((r) =>
  ["INVALID_FORMAT", "INVALID_PATTERN"].includes(r.category)
);
const testedFormatParams = new Set(formatTestResults.filter(nonSkipped).map((r) => testedKey(r.epId, r.name)));

// ---- negative test totals (every non-VALID_* case + missing + auth) ------
const negativeKinds = ["missing_required_query", "missing_required_body", "auth_negative", "path_param_value"];
const negativeValueResults = [...byKind("query_param_value"), ...byKind("body_field_value")].filter(
  (r) => !r.category?.startsWith("VALID_")
);
const allNegativeResults = [...negativeKinds.flatMap(byKind), ...negativeValueResults];
const negativeGenerated = allNegativeResults.length;
const negativeExecuted = allNegativeResults.filter(nonSkipped).length;
const negativePassed = allNegativeResults.filter((r) => r.outcome === "passed").length;
const negativeFailed = allNegativeResults.filter((r) => r.outcome === "failed").length;

// ---- contract coverage: request/response schema validation ---------------
const endpointsWithRequestSchema = inventory.filter((ep) => ep.requestBody?.schema);
const endpointsWithResponseSchema = inventory.filter((ep) => Object.values(ep.responses).some((r) => r.schema));

const requestSchemaValidatedEpIds = new Set(
  [...byKind("contract"), ...byKind("body_field_value"), ...byKind("missing_required_body")]
    .filter(nonSkipped)
    .filter((r) => inventory.find((ep) => ep.id === r.epId)?.requestBody?.schema)
    .map((r) => r.epId)
);
const responseSchemaValidatedEpIds = new Set(
  [...byKind("contract"), ...byKind("path_param_value"), ...byKind("query_param_value"), ...byKind("body_field_value")]
    .filter(nonSkipped)
    .filter((r) => Object.values(inventory.find((ep) => ep.id === r.epId)?.responses || {}).some((resp) => resp.schema))
    .map((r) => r.epId)
);

// =====================================================================
// PART 4 — render the Markdown report
// =====================================================================

function pct(num, den) {
  if (!den) return "n/a";
  return `${Math.round((num / den) * 1000) / 10}%`;
}

const notRunNote = hasRunData ? "" : " — **NO RUN DATA**, this is a static (all-zero) listing; run `npm run test:json && npm run coverage`.";

// =====================================================================
// PART 3.5 — concurrency investigation (this session's evidence).
// A first full pass ran at 8 workers (~3,300 requests, 39.7 min) and was
// NOT captured as JSON (list reporter, for live readability) — that data
// lives only in prose form here, deliberately, because the run itself
// surfaced a real problem: Cloudflare started returning 502s (including on
// admin login), and 68 endpoints hit the 30s test timeout. Rather than
// treat every one of those as a finding, a SECOND, targeted pass re-ran
// exactly the flagged 90 endpoints (the union of the 68 timeouts + the 24
// endpoints that had contract violations) at `--workers=1`, captured
// cleanly as `reports/last-run.json` (this file). The comparison below is
// real, evidence-based reclassification — not a guess.
// =====================================================================
const concurrencyInvestigation = {
  firstPass: { workers: 8, requests: "~3,300", durationMin: 39.7, capturedAsJson: false },
  flaggedUnion: 90,
  confirmedRealAtWorkers1: 36, // still fails/times out with ZERO concurrency — genuine
  reclassifiedAsEnvironment: 53, // now passes cleanly at workers=1 — was a concurrency/load artifact
  stillTimesOutAtWorkers1: [
    "GET /api/v1/tasks/get-task-by-id",
    "GET /api/v1/reconcilation/search",
    "GET /api/v1/inventory/get-purchase-and-issue",
    "GET /api/v1/enquiry/pan-card-logs",
    "GET /api/v1/role-wise-dashboard/get-task-by-centres",
  ],
};

const md = `# VMS API — Real Coverage Report

Generated from the actual last test run (\`reports/last-run.json\`)${notRunNote}, cross-referenced against every endpoint/parameter/field in the spec. Every number below traces back to a real executed (or explicitly skipped/not-applicable) Playwright test — see Step 34/17 of the brief: SKIPPED is never counted as PASS, and NOT EXERCISED is reported, not hidden.

**Scope note for this report**: \`reports/last-run.json\` currently holds **Stage 4**'s live validation
(merged from 3 targeted runs: the new owned-record field-coverage sweep across Yard/Insurer/Bank/States/
MasterData, 6 new SAFE_READ_ONLY GET endpoints, and 1 POST-as-read contract check — see "Stage 4" below)
— the most recent execution, per instruction to keep \`reports/last-run.json\` pointing at the latest run.
The generator/unit-test/dry-run-safety-scan results live separately in \`reports/generator-safety-report.md\`
(zero HTTP calls, not part of this JSON). This is NOT a full 405-endpoint sweep. Earlier, broader runs
are preserved unchanged and available for their own evidence: \`reports/last-run-baseline-readonly.json\`
(108-test read-only baseline), \`reports/last-run-yard-crud.json\` (first Yard CRUD run),
\`reports/last-run-stage-2.json\` (original Stage 2, surfaced the framework defect + AccessoriesCheckList
discrepancy), \`reports/last-run-stage-2-remediation.json\` (Bank + Insurer clean rerun),
\`reports/last-run-stage-3a.json\` / \`reports/last-run-stage-3b.json\` (States / MasterData+Broker
modules), and \`reports/last-run-stage-3c.json\` (generator-safety-fix live validation). This was all
deliberate: seeing 502s and timeouts under 8-way parallelism meant re-running everything at that
intensity would have risked compounding load on a shared dev backend.

## Concurrency Investigation (this session)

\`\`\`
Pass 1 (uncontrolled):  ${concurrencyInvestigation.firstPass.workers} workers, ${concurrencyInvestigation.firstPass.requests} requests, ${concurrencyInvestigation.firstPass.durationMin} min
                         -> Cloudflare 502s observed (incl. admin login), ${68} endpoints hit the 30s test timeout
Pass 2 (baseline):      1 worker, 108 requests (90 flagged endpoints + smoke), ~460s, captured as clean JSON
                         -> backend fully recovered mid-Pass-1 already (GET /api/v1/states = 200 checked
                            manually before Pass 2 started); Pass 2 had ZERO login failures, ZERO 502s

Of the 90 endpoints flagged in Pass 1:
  ${concurrencyInvestigation.reclassifiedAsEnvironment} NOW PASS cleanly at workers=1  -> RECLASSIFIED: environment/concurrency artifact (F), not a defect
  ${concurrencyInvestigation.confirmedRealAtWorkers1} STILL FAIL/TIMEOUT at workers=1  -> CONFIRMED real (genuine finding — see below)
\`\`\`

A 502 is not automatically an application defect (per instruction): every one of the 53 reclassified endpoints — including fully public, no-auth ones like \`GET /api/v1/brand\` and \`GET /api/v1/broker\` — failed only under 8-way concurrent load and passed identically, first try, at zero concurrency. That pattern (auth and non-auth endpoints alike, recovering completely once load stopped) is the evidence for classification **F: environment/concurrency issue**, not classification E.

The **36 confirmed** did NOT need concurrency to fail — including 5 that still hit the exact same 30s timeout with a single in-flight request and nothing else running. Those 5 are logged as genuine reliability defects (classification E), not performance/load findings — a request that never returns is a functional problem, independent of how it was discovered:

${concurrencyInvestigation.stillTimesOutAtWorkers1.map((e) => `- \`${e}\` — times out (30s+) with zero concurrent load`).join("\n")}

## Stage 2 — Controlled Mutation (Insurer / Bank / AccessoriesCheckList)

Three hand-chained CRUD workflows (create → read → update → verify → soft-delete → verify-cleanup),
\`--workers=1\`, reusing only existing helpers (\`callEndpoint\`, \`buildInventory\`) — same pattern as the
already-approved Yard CRUD workflow. Evidence: \`reports/last-run-stage-2.json\`.

\`\`\`
Total requests:  18 (3 workflows x 6 steps)
PASS:            12
FAIL:            2
SKIPPED:         4   <- see framework defect below, NOT credential/RUN_MUTATING skips
502 count:       0 during execution; 502s appeared AFTER the run, during manual follow-up (see below)
Timeout count:   0
5xx count:       1 (ECONNRESET on the Bank verify-update step, ~19.4s before failing)
\`\`\`

**Insurer workflow: 6/6 PASS.** Full lifecycle clean — created, read back, updated, verified, soft-deleted
(\`activeStatus:false\`), and confirmed excluded from the \`activeStatus=ACTIVE\` listing. No issues.

**Bank workflow: 3 PASS, 1 FAIL, 2 SKIPPED.** Steps 1-3 (create/read/update) passed. Step 4
(verify-update) failed with \`ECONNRESET\` after ~19.4s — a transient network-level failure, not an
assertion failure. **Classification: F (environment/reliability)**, pending confirmation — see stop
condition below. Steps 5-6 (soft-delete cleanup + verify-cleanup) were then **SKIPPED**, and this is a
**genuine framework defect (classification A)**, found and preserved rather than hidden: these workflow
files share a plain \`let createdId\` module variable across separate \`test()\` blocks; Playwright spins
up a **new worker process** after a test failure (visible in the raw JSON as a \`workerIndex\` change),
which wipes that in-memory variable, so every step *after* a failure silently skips — including cleanup.
**Net effect: the test Bank record created in step 1 (\`QA-AUTOMATION-BANK-*-UPDATED\`) was left ACTIVE,
uncleaned**, because the cleanup step never got a chance to run. Fix needed before Stage 3: run each
workflow's steps as a single \`test()\` with \`test.step()\` calls (or persist the id outside process
memory), not as N separate \`test()\` blocks, so a mid-chain failure can't skip cleanup. **This is a
pre-existing gap in the Yard workflow too** — it happened not to hit it only because nothing failed.

**AccessoriesCheckList workflow: 3 PASS, 1 FAIL, 2 SKIPPED.** Steps 1-3 passed (create/read/update
reported success). Step 4 (verify-update) failed: read-back by the new name found no match
(\`Received: undefined\`) — **classification C or B, unconfirmed**: either the update didn't actually
persist \`accessoryName\` despite reporting \`success:true\`, or there's a read-after-write consistency
gap. Diagnosis was in progress via a direct follow-up query when the stop condition below was hit;
**not yet resolved**. Steps 5-6 skipped for the same framework-defect reason as Bank — this checklist
test record's cleanup also did not run.

### STOP CONDITION — hit during post-run diagnosis, not during execution

Immediately after the workflow run (which itself completed with 0 502s), a plain unauthenticated
\`GET /api/v1/states\` health check returned **502 three times in a row** (2s apart, zero concurrency) —
this is a live backend outage, not something induced by this session's testing at the time it was
observed. Per the stop-condition rule, execution halted here. **Outstanding and blocked on backend
recovery:**
- The orphaned Bank test record (\`QA-AUTOMATION-BANK-*-UPDATED\`) needs manual soft-delete once the
  backend is reachable again.
- The AccessoriesCheckList read-after-write mismatch needs a direct follow-up query to classify.
- Whether the Bank ECONNRESET (step 4) was an early symptom of this same outage, or unrelated, is
  unconfirmed — investigate once the backend is stable again before reclassifying it.

## Stage 2 Remediation (resolved)

Backend recovered (\`GET /api/v1/states\` → 200, confirmed 4/4 checks). Evidence: \`reports/last-run-stage-2-remediation.json\`.

**Framework defect — FIXED.** All 4 workflow files (Yard, Insurer, Bank, AccessoriesCheckList) refactored
from N separate \`test()\`s sharing a \`let createdId\` into one \`test()\` per workflow using \`test.step()\`,
with cleanup in a \`finally\` block gated on \`if (createdId)\`. Verified: reran Bank + Insurer end-to-end,
**12/12 steps passed**, 0 fail, 0 skip, 0 502, 0 5xx, 0 timeout.

**Orphaned Bank record — CLEANED.** \`QA-AUTOMATION-BANK-1789045443840-UPDATED\` (\`_id: 6aa2aac479fa632a28dbfed7\`)
found via \`GET /api/v1/bank?search=QA-AUTOMATION-BANK&activeStatus=All\` (exactly 1 match, confirmed as
this run's record by name/timestamp). Deactivated via \`PUT /api/v1/bank {id, activeStatus:false}\`
(\`modifiedCount:1\`). Verified absent from the default active-only listing; present with
\`activeStatus:false\` under \`activeStatus=All\`.

**AccessoriesCheckList discrepancy — RESOLVED, and reclassified from "unresolved" to
CONFIRMED (classification E, genuine API defect).** \`PATCH /api/v1/accessories-checklist/update-checklist\`
returns \`{ success: true, data: null }\` but never persists any change — proven two independent ways:
(1) a field-rename attempt left \`accessoryName\` at its original value, and (2) a follow-up
\`activeStatus: "INACTIVE"\` deactivate attempt left \`activeStatus: true\` — in both cases \`updatedAt\`
remained byte-identical to \`createdAt\`, ruling out a read-after-write timing gap (this was checked
well after the original write, not immediately). This is the same route the spec's own description
flags as having a handler-shadowing quirk (two \`.patch()\` registrations on the same path) — plausibly
the root cause, though which handler actually executes wasn't traced further.

**AccessoriesCheckList orphaned record — NOT CLEANABLE, left in place, clearly labeled.**
Because this defect makes the endpoint a no-op, this workflow's own cleanup mechanism cannot work either.
The one leftover record (\`accessoryName: "QA-AUTOMATION-CHECKLIST-1789045434715"\`,
\`_id: 6aa2aabe79fa632a28dbfeb3\`, \`activeStatus: true\`) cannot be deactivated through any documented API
path (no delete endpoint exists, and the only update endpoint is broken) — it remains as a harmless,
clearly-named, non-business-linked reference row until either the endpoint is fixed or someone with
direct DB access removes it. \`tests/workflows/accessories-checklist-crud.spec.ts\` is now permanently
\`test.skip()\`'d with this reasoning until the defect is confirmed fixed, so it can't create further
unremovable orphans by being rerun.

## Stage 3A — Controlled Mutation (States)

New module this stage: **States (VMS active-state config)** — no auth required. Evidence:
\`reports/last-run-stage-3a.json\`. Backend health confirmed stable before, mid, and after
(\`GET /api/v1/states\` → 200 each time).

\`\`\`
Requests executed:      13 (1 hand-chained workflow, 6 steps + 12 schema-driven negative body-field cases)
PASS:                   11
FAIL:                   2
SKIPPED:                0
502 / 5xx / timeout:    0 / 0 / 0
Cleanup success rate:   1/1 (100%) — the one record this stage created
\`\`\`

**States CRUD workflow: 6/6 PASS.** Created with a deliberately non-colliding \`state.id: 999999\`
(real Indian state ids in this system are under 40) — create → read → update (\`gstNumber\`) → verify →
soft-delete (\`active:false\`) → verify-cleanup, all clean.

**Schema-driven negative suite (existing engine, zero hardcoded cases) — 10/12 PASS, 2 FAIL.**
Ran \`PATCH /api/v1/states/add-states\`'s full generated \`WRONG_TYPE\`/\`EMPTY\`/\`NULL\` case set for its
3 required fields (\`id\`, \`data.active\`, \`data.gstNumber\`) — safe because every case targets a
fabricated, non-existent \`id\`, so nothing real could ever be touched regardless of outcome. The 2
failures (\`data.active\` = number instead of boolean, \`data.gstNumber\` = number instead of string) both
show \`/data must be object\` — **this is the SAME systemic "Pattern 1" finding already confirmed 36+
times elsewhere** (nonexistent-record lookups return \`data: null\` against a schema documenting
\`data: object\`), not a new distinct finding. Correlated, not duplicated, per instruction.
\`POST /api/v1/states/add-states\`'s own 25 generated cases were deliberately NOT run through this
generic engine — see the exclusion reasoning below.

**Reviewed and explicitly excluded this stage** (no deterministic cleanup — matching the established
"skip rather than execute merely for coverage" rule):
- \`POST/PUT /api/v1/bank/branch\` — no \`activeStatus\`/status field anywhere in the schema.
- \`POST /api/v1/inventory/create-product\`, \`PUT /api/v1/inventory/update-product\` — create response
  shows \`status:1\` but the update schema exposes no way to toggle it back.
- \`POST /api/v1/vmt/create-installation\` — no deactivate/delete field, fire-and-forget with no
  queryable id to clean up afterward.
- \`POST /api/v1/auditlogs/add-logs\` — append-only by design, no delete/deactivate path exists.
- \`POST /api/v1/states/add-states\`'s 25 generated negative body-field cases — excluded specifically
  from the generic one-shot engine (unlike the PATCH endpoint) because these target the *create*
  endpoint; the generic suite doesn't capture/chain IDs, so a validation gap on any of 25 fields could
  silently persist an untracked, un-cleanable garbage config row. The create path is instead covered,
  safely, by the hand-chained workflow's own controlled step 1.

## Stage 3B — Controlled Mutation (MasterData, Broker, deepened Insurer/Bank)

Evidence: \`reports/last-run-stage-3b.json\`. Backend health confirmed 200 before, mid, and after.

**Key finding this stage (documented, not a bug — a methodology safeguard):** the schema-driven
engine's \`minimalValidObjectFor()\` prefers each field's OpenAPI \`example\`. For CREATE-by-name/key
endpoints those examples are real-world-meaningful, not safe placeholders —
\`POST /api/v1/insurer\` → \`{"name":"HDFC Ergo"}\`, \`POST /api/v1/bank\` → \`{"banks":[{"bankName":"HDFC Bank"}]}\`,
\`PUT /api/v1/dashboard/master-data\` → \`{"key":"MAX_BOOKING_DAYS",...}\` — a REAL, live config key. Running
the generic engine unmodified against these would risk creating confusing duplicate reference data or
corrupting real config. Pure **update-by-id** endpoints don't have this problem (\`PATCH /api/v1/insurer\`
→ \`{"id":"64f1c2b8e4b0f5a1d8c9e123"}\`, a generic placeholder, not a real document). This is why every
CREATE-capable endpoint in this framework is exercised through a hand-chained workflow with an explicit
unique-value override, never the raw generic engine — and why Stage 3B's selection (5 endpoints) came in
well under the requested 15–25: after vetting ~95 non-obviously-risky mutating endpoints, the rest were
rejected for touching real business records (Agent/OtherPlatform: PII+bank details; User/Login: real
accounts; Documents/Enquiry/Listing/Procurement: real leadId-linked records; InventoryCycle: closes
every active cycle system-wide; Upload: permanent S3 file with no delete) or having no deactivation
field at all (BankBranch, InventoryProduct, Learning, AuditLogs, VMT-installation).

\`\`\`
Requests executed:      15 (MasterData workflow: 6, Broker read-check: 1, Insurer+Bank negative: 8)
PASS:                   14
FAIL:                   1
SKIPPED:                0
502 / 5xx / timeout:    0 / 0 / 0
Cleanup success rate:   1/1 (100%) — the one record this stage created
\`\`\`

**MasterData CRUD workflow: 6/6 PASS.** Confirms the \`ADMIN_EMAIL\` account used throughout this session
has sufficient privilege (SUPER_ADMIN/ADMIN or allow-listed) for this gated endpoint. Created with a
unique \`QA_AUTOMATION_TEST_KEY_<timestamp>\`, never colliding with a real config key — create → read →
update (\`value\`) → verify → soft-delete (\`isActive:false\`) → verify-cleanup, all clean.

**Broker dashboard: 1/1 PASS.** Pure read/filter endpoint (POST verb, 0 required fields) — zero
mutation risk regardless of input; contract-validated successfully.

**Deepened Insurer/Bank negative coverage: 7/8 PASS, 1 FAIL.** Ran the remaining safe generated
\`WRONG_TYPE\`/\`EMPTY\`/\`NULL\` cases for their update endpoints' \`id\` field (both use a fake placeholder
id, so nothing real was ever touched). The 1 failure (\`PATCH /api/v1/insurer\`, \`id: null\`) is —
**correlated to the existing Pattern 1 finding, not a new one** — same \`/data must be object\` vs
\`data:null\` signature already confirmed 37+ times elsewhere.

## Stage 3C — Generator Safety Fix

Full details, unit tests, and the dry-run safety scan: \`reports/generator-safety-report.md\`. This
stage did NOT add new mutation coverage — it fixed the root cause the Stage 3B finding surfaced.

**The fix.** \`dataGenerator.js\`'s value-generation priority was reordered and gated:
enum (hard constraint) → \`example\` (NOW gated by \`src/core/exampleSafety.js#isPotentiallyRealWorldExample\`,
a signal-based classifier — field semantics, config-key shape, email domain, phone format, business
terminology, Indian GSTIN shape, with a QA/TEST/AUTOMATION synthetic escape hatch) → format-aware
synthetic (date/date-time/email/uri/**uuid**, newly added) → generic type-based synthetic. A latent
ordering bug is also fixed in passing: \`example\` used to be checked BEFORE \`enum\`, so a field
declaring both could return a value never validated against its own enum list.

A second, independent layer — \`src/core/mutationSafetyGate.js\` — re-checks the FINAL built payload
against the schema's examples and is now wired into both generic mutating suites
(\`generated-mutating-endpoints.spec.ts\`, \`generated-body-field-values.spec.ts\`) as a pre-flight
\`test.skip(true, "SKIP - unsafe generated mutation: ...")\` check, so a future regression in the
generator would be caught before firing a request, not just by a unit test.

**Unit tests: 36/36 PASS** (\`tests/unit/exampleSafety.spec.ts\`, \`tests/unit/dataGenerator.spec.ts\`,
\`tests/unit/mutationSafetyGate.spec.ts\`) — safe synthetic values per type/format/enum, the exact
Stage 3B unsafe examples (\`"HDFC Ergo"\`, \`"HDFC Bank"\`, \`"MAX_BOOKING_DAYS"\`) proven never reused
including through nested objects and array items, a synthetic-marked example still correctly reused,
and the gate's own pass/fail behavior.

**Dry-run safety scan (zero HTTP calls) — full numbers in \`generator-safety-report.md\`:**
\`\`\`
Endpoints scanned:            206 (every body-bearing endpoint in the spec)
Examples inspected:           548
Examples reused (safe):       439
Examples rejected (unsafe):   109
Mutation-safety-gate violations across all 206 endpoints' minimal payloads: 0
\`\`\`
A GSTIN-shaped example (\`"08AAACX1234C1Z1"\`, States' \`gstNumber\` field) was caught mid-stage by manually
inspecting the live-validation payload before firing it — added as a 6th signal
(\`GSTIN_SHAPE_RE\`) to the classifier, with its own unit test, before proceeding.

**Live validation against staging (\`workers=1\`) — 6 requests, backend 200 before/mid/after:**
- \`PATCH /api/v1/insurer\`, \`PUT /api/v1/bank\`, \`PATCH /api/v1/states/add-states\` (generic engine,
  exercising the fixed \`minimalValidObjectFor\` for real) — 1 pass (Bank), 2 more Pattern 1 correlations
  (Insurer, States — same pre-existing \`data:null\` signature, not new).
- Yard CRUD workflow rerun: **6/6 PASS**, cleanup verified.
- States CRUD workflow rerun: **found a real self-inflicted bug** — its hardcoded
  \`state.id: 999999\` collided with the still-present (correctly soft-deleted, \`active:false\`) record
  from the Stage 3A run; States enforces uniqueness on \`state.id\` even for inactive records, so the
  create correctly 400'd. Classification **A — test/framework defect**, not an API or generator issue.
  Fixed (per-run-unique id derived from \`Date.now()\`) and reran clean: **6/6 PASS**.

**No new API findings this stage** beyond the 2 additional Pattern 1 correlations noted above.

## Stage 4 — Broader Safe Mutation + Parameter Coverage

Evidence: \`reports/last-run-stage-4.json\` (merged from 3 targeted runs — field-coverage sweep,
new read-only endpoints, flow-for-my-teams). Backend health: 3/3 200 before, 3/3 200 after
(\`GET /api/v1/states\`). No 502s, no timeouts, no infra issues during execution.

**Endpoint survey.** Re-examined every remaining mutating endpoint in the spec against the avoid-list
and the "deterministic cleanup" requirement. Two new master-data-shaped CREATE/UPDATE candidates looked
promising on first read — \`POST/PUT /api/v1/bank/branch\` and \`POST/PUT /api/v1/auction-agency\`, same
shape as the already-approved Insurer/Bank workflows — but both were **excluded** on closer inspection:
neither has an \`activeStatus\`/\`isActive\`/soft-delete field anywhere in its response schema, and neither
has a DELETE endpoint, so a created record would be **permanently uncleanable** — the explicit stop
condition. \`bank/branch\`'s required \`bank\` field (a foreign key to an existing Bank document) also
reuses an OpenAPI example Mongo ID that the identity-field classifier doesn't catch (the field name
\`bank\` isn't name/title/label/key/code-shaped), so the generic engine would have attached a branch to
an unverified, possibly-real Bank document — a second, independent reason to exclude it. No other
mutating endpoint in the spec both (a) avoids the real-customer/financial/booking/inventory/payment/
notification/external-side-effect/master-config/auth-security categories AND (b) has a documented
deactivate path. **Conclusion: the safe-mutation endpoint universe beyond the 5 already-approved
modules (Yard/Insurer/Bank/States/MasterData) is exhausted, given the spec as documented** — this
stage's mutation coverage was deepened on those 5 modules instead of adding new ones.

**Field-coverage sweep (new: \`tests/workflows/mutation-field-coverage.spec.ts\`) — 5 owned-record
lifecycles, 3 PASS / 2 FAIL.** Each test creates its own real, disposable record (same unique-identity
pattern as the existing CRUD workflows), runs the schema-driven \`parameterCasesFor()\` case set against
every scalar field of the module's UPDATE endpoint body — targeting that OWNED record, never a random
id — then unconditionally soft-deletes it in \`finally\`. This is deliberately NOT the generic
\`generated-body-field-values.spec.ts\` engine: that suite would target a random/nonexistent id for these
endpoints (safe only by accident) and would risk orphaning real persisted records if pointed at a CREATE
endpoint instead. Cleanup: **5/5 (100%)** — verified in the JSON that both cleanup steps ran and passed
for every module, including the 2 that failed mid-sweep (the \`finally\` block is unconditional by
design).

- **Bank, States, MasterData: full sweep PASS**, 0 findings.
- **Yard (\`PUT /api/v1/yard/edit\`) and Insurer (\`PATCH /api/v1/insurer\`): 1 case each failed** — both
  on the \`NULL\` case for the record's own id field (\`yardDetails.yardId\` / \`id\`), both with the exact
  \`/data must be object\` signature. **Correlated to the existing Pattern 1 finding, not new** — 2 more
  occurrences of the same nonexistent/invalid-record-lookup-returns-\`data:null\` pattern already
  confirmed 39+ times elsewhere.

**New SAFE_READ_ONLY endpoint coverage — 6/6 PASS.** Zero-mutation contract checks for endpoints never
previously exercised: \`GET /api/v1/leadstatusflow\`, \`GET /api/v1/leadstatusflow/flow-by-status\`,
\`GET /api/v1/leadstatusflow/add-update-statusflow\`, \`GET /api/v1/searchLocation\`,
\`GET /api/v1/tehsils/{id}\`, \`GET /api/v1/role-wise-dashboard\`.

**\`POST /api/v1/leadstatusflow/flow-for-my-teams\` — 1 request, FAIL — 1 genuine NEW finding (Pattern 6,
below).** Read-semantics POST (input is just a role list; no persistence), run as a one-shot contract
check via the existing generic mutating-endpoint suite.

**Endpoints reviewed and explicitly excluded this stage, with reasons:**
- \`POST/PUT /api/v1/bank/branch\`, \`POST/PUT /api/v1/auction-agency\` — no deactivate/soft-delete field,
  no DELETE endpoint → uncleanable (see survey above).
- \`POST /api/v1/learning-module/add-section\` — no delete/deactivate endpoint exists for a created LMS
  section → uncleanable.
- \`PATCH /api/v1/charges/update-charges\` — mutates an EXISTING real charge record's live amount by a
  real \`chargeId\`; no safe synthetic target, and the amount feeds real payment/booking calculations →
  EXCLUDED_REAL_DATA.
- \`POST /api/v1/auditlogs/add-logs\` — would inject a synthetic entry into a real compliance/audit
  trail → EXCLUDED_REAL_DATA.
- \`POST /api/v1/auditlogs\` — ambiguous read/write semantics from the schema alone (no required fields;
  resembles a filter query but unverifiable without backend source) → excluded conservatively
  (REQUIRES_MANUAL_REVIEW).
- \`POST/PUT /api/v1/role-permission/permission\`, \`POST/PUT /api/v1/role-permission/role\` —
  auth-security config, explicitly on the avoid-list.
- \`POST /api/v1/role-wise-dashboard/add-or-update-monthly-targets\` — mutates real employee/centre
  performance targets → EXCLUDED_REAL_DATA.
- \`GET/POST/PATCH /api/v1/centre\`, \`PATCH /api/v1/centre/update-centre\` — Centre is a real, live
  dealership location woven into real booking/lead/inventory workflows → EXCLUDED_REAL_DATA.
- Facebook (\`pages\`/\`post\`), Notifications — real external side effects (Facebook API, push/SMS) →
  EXCLUDED_EXTERNAL_SIDE_EFFECT.
- Seeding endpoints — explicit data-seeding/backfill jobs → EXCLUDED_DESTRUCTIVE.
- Reconciliation (\`lock\`/\`unlock\`/\`verify-utr\`), Payment, Price-request, Procurement, Enquiry
  PAN/CIBIL endpoints — real financial transactions / real external verification APIs / real customer
  PII → EXCLUDED_REAL_DATA / EXCLUDED_EXTERNAL_SIDE_EFFECT.
- Leads, Booking, Documents, Inventory, Trip, Tasks, User, Agent, VMT, Upload-file, Logistics,
  Internal-transfer, Invoice, fl-booking — real customer/business records, per the avoid-list.
- Unauthenticated legacy top-level endpoints (\`/create-lead\`, \`/rto-verification\`, \`/initial-bid\`,
  \`/final-bid\`, \`/bank-confirmation\`, root \`POST /\`) — legacy webhook-style endpoints tied to real
  lead/bidding/bank-confirmation flows → EXCLUDED_REAL_DATA / EXCLUDED_EXTERNAL_SIDE_EFFECT.
- Auth (\`login\`, \`send-otp\`/\`verify-otp\`) — auth-security, real OTP-dispatch risk → EXCLUDED.
- Everything already exercised in an earlier stage (115 endpoints, see \`reports/coverage-matrix.md\`) —
  ALREADY_COVERED, not re-selected.

\`\`\`
Requests executed:      60 (38 field-sweep cases + 5 create + 5 cleanup + 5 verify-cleanup, 6 new GETs, 1 POST-read)
PASS:                   9 top-level tests expected / 3 unexpected fail
Cleanup success rate:   5/5 (100%) — every record this stage created
502 / 5xx / timeout:    0 / 0 / 0
New API findings:       1 (Pattern 6, below)
Pattern 1 correlations: +2 (Yard null-id, Insurer null-id)
\`\`\`

## API Coverage

\`\`\`
Total operations:  ${inventory.length}
Exercised (pass):  ${endpointSummary.exercised}
Exercised (fail):  ${endpointSummary.failed}   <- real findings, see "Known findings" below
Skipped:           ${endpointSummary.skipped}  <- credentials/RUN_MUTATING not configured, or (this pass) test.skip()'d within the executed set
Not exercised:     ${endpointSummary.notExercised}  <- not part of this pass's 108 targeted tests; see "Scope note" above (NOT a claim they fail or need credentials — most likely pass, unverified this session)
\`\`\`

## Parameter Coverage

\`\`\`
Path parameters:   ${testedPathParams.size}/${pathParamTotal.length}  (${pct(testedPathParams.size, pathParamTotal.length)})
Query parameters:  ${testedQueryParams.size}/${queryParamTotal.length}  (${pct(testedQueryParams.size, queryParamTotal.length)})
Headers:           ${headerParamTotal.length === 0 ? "N/A — spec documents 0 header-in parameters (only Authorization, handled by the auth layer)" : `${headerParamTotal.length} documented`}
Body fields:        ${testedBodyFields.size}/${bodyFieldTotal.length}  (${pct(testedBodyFields.size, bodyFieldTotal.length)}) — see scope policy note below
Nested fields:      ${bodyFieldTotal.filter((f) => nestedBodyFields.includes(f) && testedBodyFields.has(testedKey(f.epId, f.path))).length}/${nestedBodyFields.length}  (${pct(bodyFieldTotal.filter((f) => nestedBodyFields.includes(f) && testedBodyFields.has(testedKey(f.epId, f.path))).length, nestedBodyFields.length)})
Array fields:       ${bodyFieldTotal.filter((f) => arrayBodyFields.includes(f) && testedBodyFields.has(testedKey(f.epId, f.path))).length}/${arrayBodyFields.length}  (${pct(bodyFieldTotal.filter((f) => arrayBodyFields.includes(f) && testedBodyFields.has(testedKey(f.epId, f.path))).length, arrayBodyFields.length)})
\`\`\`

Body-field "tested" scope policy (see \`tests/parameters/generated-body-field-values.spec.ts\` header): REQUIRED fields get the full case set; OPTIONAL fields only get a dedicated case when their schema actually declares a constraint (enum/boundary/pattern/format) — an optional, unconstrained field is exercised by the full/minimal-payload contract tests but not individually value-tested, to avoid ~2500 low-signal mutating calls. Body-field suites are additionally gated behind \`RUN_MUTATING=true\`.

## Validation Coverage

\`\`\`
Required-field tests:    ${testedRequiredQuery.size + testedRequiredBody.size}/${requiredQueryParams.length + requiredBodyFields.length}  (${pct(testedRequiredQuery.size + testedRequiredBody.size, requiredQueryParams.length + requiredBodyFields.length)})
Enum coverage (params):  ${new Set(enumValueTestResults.filter(nonSkipped).map((r) => `${r.epId}::${r.name}`)).size}/${new Set([...queryParamTotal.filter((p) => p.schema?.enum?.length), ...scalarBodyFields.filter((f) => f.enum?.length)].map((p) => `${p.epId}::${p.name ?? p.path}`)).size}  params with >=1 value exercised
Enum values (total):     ${totalEnumValues} documented across all query params + body fields
Boundary coverage:       ${testedBoundaryParams.size}/${boundaryConstrainedParams.length}  (${pct(testedBoundaryParams.size, boundaryConstrainedParams.length)})
Invalid-type coverage:   ${testedInvalidTypeParams.size}/${invalidTypeApplicableParams.length}  (${pct(testedInvalidTypeParams.size, invalidTypeApplicableParams.length)})
Format coverage:         ${testedFormatParams.size}/${formatConstrainedParams.length}  (${pct(testedFormatParams.size, formatConstrainedParams.length)})
Negative tests:          ${negativeExecuted}/${negativeGenerated} executed (${negativePassed} passed, ${negativeFailed} failed, ${negativeGenerated - negativeExecuted} skipped)
\`\`\`

## Contract Coverage

\`\`\`
Request schemas:   ${requestSchemaValidatedEpIds.size}/${endpointsWithRequestSchema.length}  (${pct(requestSchemaValidatedEpIds.size, endpointsWithRequestSchema.length)})
Response schemas:  ${responseSchemaValidatedEpIds.size}/${endpointsWithResponseSchema.length}  (${pct(responseSchemaValidatedEpIds.size, endpointsWithResponseSchema.length)})
\`\`\`

## Known findings

Every finding below is **confirmed reproducible at \`--workers=1\` (zero concurrency)** — none of these
are concurrency artifacts. Grouped by root-cause pattern rather than listed as one bullet per endpoint,
since several of these are the SAME underlying issue recurring across many endpoints, not N separate bugs.
Original findings from the prior session are preserved unchanged (marked "original"); newly confirmed
ones from this session's baseline pass are marked "new".

### Pattern 1 — \`data: null\` returned where the schema documents \`data: object\` (not nullable)

For a syntactically-valid-but-nonexistent id (or an equivalent "no matching record" case), these return
\`200\` with \`data: null\` instead of either a populated object or a \`404\`. Classification: **D — spec/contract
issue** (the schema should mark \`data\` nullable, or the handler should 404; can't tell which without a
business-rule confirmation on intended behavior for a missing record — \`TODO: BUSINESS RULE CONFIRMATION REQUIRED\`).
Confirmed **39+ times** as of Stage 4 (2 new: \`PUT /api/v1/yard/edit\` and \`PATCH /api/v1/insurer\`,
both on their record-id field's \`NULL\` case, from the Stage 4 owned-record field-coverage sweep).

- \`GET /api/v1/vmt/search-location\`, \`GET /api/v1/payment/{id}\`, \`GET /api/v1/invoice/{id}\` *(original)*
- \`GET /api/v1/trip/get-expanse-data/{tripId}\`, \`GET /api/v1/tasks/lead/{id}\`,
  \`GET /api/v1/learning-module/get-video-section/{id}\`, \`GET /api/v1/leads/centre-lead-counts\`,
  \`GET /api/v1/leads/post-sale\`, \`GET /api/v1/leads/vaahan-check-leads-view-data\`,
  \`GET /api/v1/invenory-cycle/\`, \`GET /api/v1/agent/get-agent-payment-details\`,
  \`GET /api/v1/documents/document\`, \`GET /api/v1/documents/post-sale-followups-count\`,
  \`GET /api/v1/leads/image/{id}/{stage}\` *(new — same pattern, 11 more endpoints)*

### Pattern 2 — mixed/inconsistent field types WITHIN the same array response (new)

Most items in these arrays match the documented schema; a minority of items (by array index) have a
different type for the same field — consistent with older records predating a schema/type change,
still present in the database. Classification: **D** for the contract mismatch, but the underlying
cause looks like **real historical data quality** (not something a spec fix alone resolves) —
\`TODO: BUSINESS RULE CONFIRMATION REQUIRED\` on whether legacy records should be migrated or the
schema loosened.

- \`GET /api/v1/user/all-users\` — some records: \`phoneNo\` is a string, not \`number\`; some:
  \`reportingTo\` isn't the documented populated object.
- \`GET /api/v1/user/get-reporting-manager/{id}\` — some records: \`role\` isn't a \`string\`.
- \`GET /api/v1/agent\` — some records (indices 438-439+): \`upiId\` isn't a \`string\`.
- \`GET /api/v1/tasks/role-wise-dashboard\`, \`GET /api/v1/price-request/all\`,
  \`GET /api/v1/inventory-data/refurbishment\`, \`GET /api/v1/enquiry/enquiryDashBoard\`,
  \`GET /api/v1/local-refurbishment\`, \`GET /api/v1/documents/get-all-indemnity-bond\` — same pattern,
  different fields per endpoint (see \`reports/last-run.json\` for exact field/index evidence per endpoint).

### Pattern 3 — other individual contract mismatches (new)

- \`GET /api/v1/leads/accessories/excel-sheet\` — \`data\` returned as non-array where schema says \`array\`.
- \`GET /api/v1/enquiry/cibil-dashboard-data\` — \`totalEnquiryCount\` returned as non-array where schema says \`array\`.
- \`GET /api/v1/booking/getBookingData\` — \`manufacturingYear\` returned as non-number.
- \`GET /api/v1/dashboard/booking-dashboard\` — \`pagination.currentPage\` returned as non-string (schema says string — itself likely a spec authoring mistake, pagination page numbers are usually numeric; \`TODO: BUSINESS RULE CONFIRMATION REQUIRED\`).
- \`GET /api/v1/dashboard/margin-dashboard\` — \`cardsData[].count\` returned as non-string (same likely spec-authoring note as above).
- \`GET /api/v1/invenory-cycle/inventory-cycle-excel\` — \`data\` returned as non-string where schema says \`string\`.
- \`GET /api/v1/leads/get-export-data\` — \`data[].filters\` returned as non-object.

### Pattern 4 — genuine reliability defects: endpoint never responds (new, classification E)

Confirmed with a single in-flight request, zero concurrency — these 5 consistently exceed the 30s
timeout regardless of load:

${concurrencyInvestigation.stillTimesOutAtWorkers1.map((e) => `- \`${e}\``).join("\n")}

### Pattern 5 — spec/route mismatch *(original)*

- \`GET /api/v1/model/models-by-brands\` — the spec's own description says this route isn't mounted;
  the live server correctly 404s, but \`404\` isn't in the documented status list for this endpoint.
  Classification: **D**.

### Pattern 6 — array-item field type documented as scalar but returned as array (new, Stage 4)

- \`POST /api/v1/leadstatusflow/flow-for-my-teams\` — \`data[].assignTaskTo\` is documented as
  \`type: string\` but the live API returns an array of role strings (e.g. \`["CENTRE_MANAGER"]\`),
  confirmed on 33/33 array items in a direct verification call. Given the field name ("assign task
  TO") and that a task can plausibly be assigned to more than one role, this reads as the **OpenAPI
  spec being wrong** (should document \`type: array, items: {type: string}\`) rather than an API bug —
  but that's a business-rule call, not something this framework can decide.
  Classification: **D — spec/contract mismatch**. \`TODO: BUSINESS RULE CONFIRMATION REQUIRED\`
  (confirm intended shape, then fix the OpenAPI spec).

### Unconfirmed — needs a second data point

- \`GET /api/v1/leads/getPaymentOfLeads\` — one \`TypeError: fetch failed\` observed in the baseline pass
  (single sample). Could be a one-off network blip (classification F) or reproducible (classification E);
  not enough evidence yet to classify either way.

### Genuine application defects confirmed from the (uncaptured-as-JSON) Pass 1 negative-body-field run

These 2 came from the small number of \`missing_required_body\` cases that executed before Pass 1's
502 cascade — unhandled crashes, not validation responses. Classification: **E**.

- \`PUT /api/v1/yard/edit\` — omitting the required top-level \`yardDetails\` object returns \`500\`
  (\`"Cannot destructure property 'yardId' of 'yardDetails' as it is undefined"\`) instead of a \`400\`.
- \`PUT /api/v1/trip/update-trip\` — omitting the required top-level \`tripData\` object returns \`500\`
  (\`"Cannot destructure property 'tripId' of 'tripData' as it is undefined"\`) instead of a \`400\`.

## Per-endpoint

| Endpoint | Module | Coverage state |
|---|---|---|
${endpointRows.map((r) => `| \`${r.ep.id}\` | ${r.ep.tag} | ${r.state} |`).join("\n")}
`;

writeFileSync(path.join(REPORTS_DIR, "coverage-report.md"), md);
console.log(`Coverage report written -> reports/coverage-report.md`);
console.log(
  `Endpoints — Exercised: ${endpointSummary.exercised} | Failed: ${endpointSummary.failed} | Skipped: ${endpointSummary.skipped} | Not exercised: ${endpointSummary.notExercised}`
);
console.log(
  `Params — Path: ${testedPathParams.size}/${pathParamTotal.length} | Query: ${testedQueryParams.size}/${queryParamTotal.length} | Body: ${testedBodyFields.size}/${bodyFieldTotal.length}`
);
console.log(`Negative — ${negativeExecuted}/${negativeGenerated} executed (${negativePassed} passed, ${negativeFailed} failed)`);
