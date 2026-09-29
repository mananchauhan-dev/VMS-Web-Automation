// tests/negative/generated-missing-required-body-field.spec.ts
//
// For every endpoint with a request body, for every REQUIRED field
// (including nested-object required fields), send the minimal valid payload
// with exactly that one field removed and verify the documented
// validation-error status.
//
// GATED behind RUN_MUTATING=true — see generated-mutating-endpoints.spec.ts
// for why (a handful of documented endpoints apply no server-side validator
// at all, so a "negative" case can still persist a record).

import { test, expect } from "@playwright/test";
import { buildInventory } from "../../src/core/specLoader.js";
import { minimalValidObjectFor } from "../../src/core/dataGenerator.js";
import { flattenFields, omitPath } from "../../src/core/schemaUtils.js";
import { callEndpoint } from "../../src/core/apiClient.js";
import { config } from "../../src/config/env.js";
import { fallbackValue } from "../../src/core/testValueHelpers.js";

const RUN_MUTATING = process.env.RUN_MUTATING === "true";

const inventory = buildInventory().filter((ep) => ep.requestBody?.schema?.type === "object");

test.describe("@negative Generated: missing required request-body field", () => {
  test.skip(!RUN_MUTATING, "RUN_MUTATING not set — see generated-mutating-endpoints.spec.ts");

  for (const ep of inventory) {
    const errorStatus = ["400", "422"].find((s) => ep.responses[s]);
    const requiredFields = flattenFields(ep.requestBody!.schema).filter((f) => f.required && !f.path.includes("[]"));

    for (const field of requiredFields) {
      test(`${ep.id} — missing required body field "${field.path}"`, async ({ request }) => {
        if (!errorStatus) {
          test.skip(true, `Spec documents no 400/422 for ${ep.id} — not applicable`);
        }
        if (ep.security) {
          const schemeName = Object.keys(ep.security[0] || {})[0];
          if (schemeName === "AuthToken" && !config.adminEmail) test.skip(true, "ADMIN_EMAIL not configured");
          if (schemeName === "VmsAuthToken" && !config.vmtMobile) test.skip(true, "VMT_TEST_MOBILE not configured");
        }

        const pathParams: Record<string, unknown> = {};
        for (const p of ep.parameters.filter((p) => p.in === "path")) {
          pathParams[p.name] = fallbackValue(p.name, p.schema);
        }

        const fullMinimal = minimalValidObjectFor(ep.requestBody!.schema);
        const body = omitPath(fullMinimal, field.path);

        const { status, json } = await callEndpoint(request, ep, { pathParams, body });
        expect(
          status,
          `${ep.id} omitting required "${field.path}" expected ${errorStatus}, got ${status}: ${JSON.stringify(json)}`
        ).toBe(Number(errorStatus));
      });
    }
  }
});
