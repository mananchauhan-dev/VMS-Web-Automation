// tests/negative/generated-missing-required-query.spec.ts
//
// For every GET endpoint, for every REQUIRED query parameter, omit exactly
// that parameter (all other required params stay filled) and verify the
// documented validation-error status is returned. Read-only (GET), so this
// runs safely with no RUN_MUTATING flag.
//
// Only asserts where the spec documents an error status for the endpoint
// (400/422) — if none is documented, the case is recorded as
// "not applicable" (skipped with reason) rather than guessed at, per the
// instruction not to invent behavior the spec doesn't describe.

import { test, expect } from "@playwright/test";
import { buildInventory } from "../../src/core/specLoader.js";
import { callEndpoint } from "../../src/core/apiClient.js";
import { fallbackValue } from "../../src/core/testValueHelpers.js";
import { config } from "../../src/config/env.js";

const inventory = buildInventory().filter(
  (ep) => ep.method === "get" && ep.parameters.some((p) => p.in === "query" && p.required)
);

test.describe("@negative Generated: missing required query parameter", () => {
  for (const ep of inventory) {
    const requiredQueryParams = ep.parameters.filter((p) => p.in === "query" && p.required);
    const errorStatus = ["400", "422"].find((s) => ep.responses[s]);

    for (const omitted of requiredQueryParams) {
      test(`${ep.id} — missing required query "${omitted.name}"`, async ({ request }) => {
        if (!errorStatus) {
          test.skip(true, `Spec documents no 400/422 for ${ep.id} — not applicable / cannot assert invented behavior`);
        }
        if (ep.security) {
          const schemeName = Object.keys(ep.security[0] || {})[0];
          if (schemeName === "AuthToken" && !config.adminEmail) test.skip(true, "ADMIN_EMAIL not configured");
          if (schemeName === "VmsAuthToken" && !config.vmtMobile) test.skip(true, "VMT_TEST_MOBILE not configured");
          if (schemeName === "ApiKeyAuth" && !process.env.PARTNER_API_KEY) {
            test.skip(true, "PARTNER_API_KEY not configured — auth would reject before param validation runs");
          }
        }

        const pathParams: Record<string, unknown> = {};
        for (const p of ep.parameters.filter((p) => p.in === "path")) {
          pathParams[p.name] = fallbackValue(p.name, p.schema);
        }
        const queryParams: Record<string, unknown> = {};
        for (const p of requiredQueryParams) {
          if (p.name === omitted.name) continue; // the one under test — omitted
          queryParams[p.name] = fallbackValue(p.name, p.schema);
        }

        const { status, json } = await callEndpoint(request, ep, { pathParams, queryParams });
        expect(
          status,
          `${ep.id} omitting required query "${omitted.name}" expected ${errorStatus}, got ${status}: ${JSON.stringify(json)}`
        ).toBe(Number(errorStatus));
      });
    }
  }
});
