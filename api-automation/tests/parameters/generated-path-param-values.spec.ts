// tests/parameters/generated-path-param-values.spec.ts
//
// Per-PATH-PARAMETER value coverage (Step 3 of the parameter-completeness
// brief). For every GET endpoint's path parameter, sends a deliberately
// INVALID value and a well-formed-but-NON-EXISTENT value.
//
// Read-only (GET), so this runs safely with no RUN_MUTATING flag.
//
// Assertion policy (same as the rest of the contract suites): a bad path
// value doesn't always have a documented 400 — the spec frequently
// documents 404/500/200-with-empty-data for a not-found resource instead,
// and inventing a specific expectation the spec doesn't state would violate
// the brief's "do not invent business rules". So every case here asserts
// the ONE thing that's always true regardless of *which* documented status
// the server picks: the status must be one the spec documents, and the body
// must match that status's schema. An undocumented status is a real
// contract violation and fails the test — which is exactly how this suite
// already caught 2 of the framework's 4 real findings.

import { test, expect } from "@playwright/test";
import { buildInventory } from "../../src/core/specLoader.js";
import { fallbackValue, NON_EXISTING_OBJECT_ID } from "../../src/core/testValueHelpers.js";
import { parameterCasesFor } from "../../src/core/dataGenerator.js";
import { callEndpoint } from "../../src/core/apiClient.js";
import { validateAgainstSchema } from "../../src/core/schemaValidator.js";
import { config } from "../../src/config/env.js";

const inventory = buildInventory().filter((ep) => ep.method === "get" && ep.parameters.some((p) => p.in === "path"));

/** Two bounded, meaningful cases per path param — INVALID_ID/NON_EXISTING_ID for id-shaped params, a schema-driven wrong-type/format case otherwise. */
function casesForPathParam(name: string, schema: any) {
  if (/id$/i.test(name)) {
    return [
      { category: "INVALID_ID", label: "malformed id", value: "not-a-valid-id" },
      { category: "NON_EXISTING_ID", label: "well-formed but non-existent id", value: NON_EXISTING_OBJECT_ID },
    ];
  }
  // Non-id path param (e.g. {stage}, {phoneNumber}): reuse the schema-driven
  // engine, but only the categories meaningful for a REQUIRED path segment.
  return parameterCasesFor(schema)
    .filter((c) => ["WRONG_TYPE", "INVALID_ENUM", "INVALID_FORMAT", "INVALID_PATTERN"].includes(c.category))
    .slice(0, 2);
}

test.describe("@negative @contract Generated: path parameter value coverage", () => {
  for (const ep of inventory) {
    const pathParamsList = ep.parameters.filter((p) => p.in === "path");

    for (const target of pathParamsList) {
      const cases = casesForPathParam(target.name, target.schema);
      if (cases.length === 0) continue; // not applicable — no meaningful invalid variant for this schema

      for (const c of cases) {
        test(`${ep.id} — path "${target.name}" [${c.category}] ${c.label}`, async ({ request }) => {
          if (ep.security) {
            const schemeName = Object.keys(ep.security[0] || {})[0];
            if (schemeName === "AuthToken" && !config.adminEmail) test.skip(true, "ADMIN_EMAIL not configured");
            if (schemeName === "VmsAuthToken" && !config.vmtMobile) test.skip(true, "VMT_TEST_MOBILE not configured");
            if (schemeName === "ApiKeyAuth" && !process.env.PARTNER_API_KEY) test.skip(true, "PARTNER_API_KEY not configured");
          }

          const pathParams: Record<string, unknown> = {};
          for (const p of pathParamsList) {
            pathParams[p.name] = p.name === target.name ? c.value : fallbackValue(p.name, p.schema);
          }
          const queryParams: Record<string, unknown> = {};
          for (const p of ep.parameters.filter((p) => p.in === "query" && p.required)) {
            queryParams[p.name] = fallbackValue(p.name, p.schema);
          }

          const { status, json } = await callEndpoint(request, ep, { pathParams, queryParams });

          const documentedStatuses = Object.keys(ep.responses).map(Number);
          expect(
            documentedStatuses,
            `${ep.id} with ${c.category} path "${target.name}" returned undocumented status ${status}: ${JSON.stringify(json)}`
          ).toContain(status);

          const respSpec = ep.responses[String(status)];
          if (respSpec?.schema) {
            const { valid, errors } = validateAgainstSchema(respSpec.schema, json);
            expect(valid, `Contract violation:\n${errors.join("\n")}`).toBe(true);
          }
        });
      }
    }
  }
});
