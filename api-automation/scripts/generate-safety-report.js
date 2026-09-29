#!/usr/bin/env node
// scripts/generate-safety-report.js
//
// Dry-run scan of the ENTIRE spec (zero HTTP calls) proving the Stage 3C
// generator fix: for every endpoint's request body, generate a full valid
// object (validObjectFor — touches every declared property, not just
// required ones) and tally every example the generator inspected, reused,
// or rejected as potentially real-world. Then independently re-verify each
// endpoint's MINIMAL payload through the mutation-safety gate, as the
// generic mutating suites would.
//
// Run: node scripts/generate-safety-report.js

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInventory } from "../src/core/specLoader.js";
import { validObjectFor, minimalValidObjectFor, resetExampleStats, getExampleStats } from "../src/core/dataGenerator.js";
import { assessGeneratedPayloadSafety } from "../src/core/mutationSafetyGate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, "../reports");
mkdirSync(REPORTS_DIR, { recursive: true });

const inventory = buildInventory().filter((ep) => ep.requestBody?.schema?.type === "object");

// =====================================================================
// PHASE 1 — comprehensive example-safety tally across the WHOLE spec.
// One clean pass, one call per endpoint (validObjectFor touches every
// declared property), so every example is inspected exactly once.
// =====================================================================
resetExampleStats();
for (const ep of inventory) {
  validObjectFor(ep.requestBody.schema);
}
const stats = getExampleStats();

const categoryTally = {};
for (const r of stats.rejections) {
  for (const reason of r.reasons) {
    const category = reason.startsWith("field ")
      ? "identity-field-name"
      : reason.includes("config-key")
        ? "config-key-shape"
        : reason.includes("business-entity")
          ? "business-terminology"
          : reason.includes("email domain")
            ? "email-domain"
            : reason.includes("phone-shaped")
              ? "phone-format"
              : "other";
    categoryTally[category] = (categoryTally[category] || 0) + 1;
  }
}

// =====================================================================
// PHASE 2 — per-endpoint isolation: does THIS endpoint's minimal payload
// (what the generic mutating suites actually send) trigger a rejection?
// Each endpoint gets its own reset so counts never bleed across endpoints.
// =====================================================================
const perEndpointNeedsOverride = [];
const gateViolationsByEndpoint = [];

for (const ep of inventory) {
  resetExampleStats();
  const minimalPayload = minimalValidObjectFor(ep.requestBody.schema);
  if (getExampleStats().rejected > 0) perEndpointNeedsOverride.push(ep.id);

  const gateResult = assessGeneratedPayloadSafety(ep.requestBody.schema, minimalPayload);
  if (!gateResult.safe) gateViolationsByEndpoint.push({ epId: ep.id, violations: gateResult.violations });
}
resetExampleStats(); // leave global stats clean for anything run after this script in the same process

const APPROVED_WORKFLOWS = [
  "POST /api/v1/yard/add",
  "POST /api/v1/insurer",
  "POST /api/v1/bank",
  "POST /api/v1/states/add-states",
  "PUT /api/v1/dashboard/master-data",
];

const md = `# Generator Safety Report

Dry-run scan of the entire OpenAPI spec (**zero HTTP calls**) — proves the Stage 3C fix by exercising
\`dataGenerator.js\` against every endpoint's request-body schema exactly as it would run for real, and
tallying every \`example\` value it inspected, reused, or rejected as potentially real-world.

Re-run: \`node scripts/generate-safety-report.js\`

## Summary (Phase 1 — every declared field, whole spec, one pass)

\`\`\`
Endpoints scanned (body-bearing):       ${inventory.length}
Total OpenAPI examples inspected:       ${stats.inspected}
Examples reused (classified safe):      ${stats.reused}
Examples rejected (classified unsafe):  ${stats.rejected}
Synthetic values generated in their place: ${stats.rejected}  (1:1 — every rejection falls through to synthetic generation)
\`\`\`

**Do not read "0 rejected" as "0 risk" if it ever shows that** — it would mean either the spec stopped
using real-world-looking examples, or this classifier needs strengthening; it does NOT mean the
generator is unconditionally safe for every future spec change. Regenerate and review this report
whenever the spec changes materially.

## Unsafe-example categories (signal that fired, tallied across all rejections)

\`\`\`
${Object.entries(categoryTally).map(([k, v]) => `${k.padEnd(24)} ${v}`).join("\n") || "(none — no rejections this run)"}
\`\`\`
(A single rejection can trigger more than one signal, e.g. an identity-shaped field whose value also
matches the config-key shape — categories sum to more than "Examples rejected" above when that happens.)

## Endpoints requiring an explicit workflow override (Phase 2 — minimal payload only)

These endpoints have at least one identity-shaped required field whose \`example\` was rejected when
building the MINIMAL payload (exactly what the generic mutating suites send) — meaning a real
CREATE/UPDATE test against them needs a hand-chained workflow with an explicit unique override
(Yard/Insurer/Bank/States/MasterData already have one), not the raw generic engine:

${perEndpointNeedsOverride.length === 0
    ? "(none this run)"
    : perEndpointNeedsOverride
        .map(
          (id) =>
            `- \`${id}\`${APPROVED_WORKFLOWS.includes(id) ? " — ✅ has an approved workflow" : " — ⚠️ no workflow yet; the generic engine substitutes a SAFE synthetic value instead of failing, but real create/update coverage for this endpoint's identity field is not yet exercised end-to-end"}`
        )
        .join("\n")}

## Mutation-safety-gate results (independent re-check of the exact minimal payload every generic mutating test sends)

\`\`\`
Endpoints where the gate found a violation: ${gateViolationsByEndpoint.length} / ${inventory.length}
\`\`\`

${gateViolationsByEndpoint.length === 0
    ? "**0 violations** — every endpoint's minimal generated payload is gate-clean. This is the direct evidence for the acceptance criterion: no generic mutation sends a real-world example verbatim."
    : gateViolationsByEndpoint.map((v) => `- \`${v.epId}\`: ${v.violations.map((x) => `${x.path}="${x.value}"`).join(", ")}`).join("\n")}

## What this report does NOT claim

- It does not claim every synthetic value is *semantically* valid for the target field (a synthetic
  string in a field expecting a specific real-world format the classifier doesn't recognize could still
  fail business validation — that's a correctness question for the individual test, not a safety one).
- It does not claim the classifier is complete. It is signal-based and generalizable (field semantics,
  identifier shape, email domain, phone format, business terminology, a synthetic escape hatch) rather
  than a hardcoded company list, per the brief — a new unsafe pattern may need a new signal added to
  \`src/core/exampleSafety.js\`.
- It does not claim 100% safety with zero evidence — every number above comes from actually running the
  generator against the real spec, not from an assertion.
`;

writeFileSync(path.join(REPORTS_DIR, "generator-safety-report.md"), md);
console.log(`Generator safety report written -> reports/generator-safety-report.md`);
console.log(
  `Examples: ${stats.inspected} inspected | ${stats.reused} reused | ${stats.rejected} rejected | Gate violations: ${gateViolationsByEndpoint.length}`
);
