// tests/regression/generated-get-endpoints.spec.ts
//
// Data-driven, spec-derived regression + contract suite for EVERY documented
// GET endpoint (read-only => safe to run against the real environment with
// no RUN_MUTATING flag needed). One Playwright test per endpoint — each
// shows individually in the report, so this is genuine per-endpoint
// coverage, not one generic smoke ping.
//
// What each test actually verifies (this is contract testing, Step 27):
//   1. The endpoint responds with one of the *documented* status codes.
//      An undocumented status is a real contract violation and fails.
//   2. When the returned status has a documented response schema, the body
//      is validated against it via Ajv (missing/extra/wrong-typed fields
//      are reported).
//
// Auth: resolved automatically per the endpoint's security scheme
// (see src/core/auth.js). If the required credentials aren't configured in
// .env, the test is SKIPPED (not failed) with a clear reason — see README
// "What needs your credentials to run".

import { test, expect } from "@playwright/test";
import { buildInventory } from "../../src/core/specLoader.js";
import { callEndpoint } from "../../src/core/apiClient.js";
import { validateAgainstSchema } from "../../src/core/schemaValidator.js";
import { config } from "../../src/config/env.js";
import { fallbackValue as fallbackPathValue } from "../../src/core/testValueHelpers.js";

const inventory = buildInventory().filter((ep) => ep.method === "get");

test.describe("@regression @contract Generated GET endpoint suite", () => {
  for (const ep of inventory) {
    test(`${ep.id} — documented status + response contract`, async ({ request }) => {
      const pathParams: Record<string, unknown> = {};
      for (const p of ep.parameters.filter((p) => p.in === "path")) {
        pathParams[p.name] = fallbackPathValue(p.name, p.schema);
      }

      const queryParams: Record<string, unknown> = {};
      for (const p of ep.parameters.filter((p) => p.in === "query" && p.required)) {
        queryParams[p.name] = fallbackPathValue(p.name, p.schema);
      }

      // Pre-flight: skip (don't fail) when required auth isn't configured.
      if (ep.security) {
        const schemeName = Object.keys(ep.security[0] || {})[0];
        if (schemeName === "AuthToken" && !config.adminEmail) {
          test.skip(true, "ADMIN_EMAIL not set in .env — see .env.example");
        }
        if (schemeName === "VmsAuthToken" && !config.vmtMobile) {
          test.skip(true, "VMT_TEST_MOBILE not set in .env — see .env.example");
        }
        if (schemeName === "ApiKeyAuth" && !process.env.PARTNER_API_KEY) {
          test.skip(true, "PARTNER_API_KEY not set in .env — see .env.example");
        }
      }

      const { status, json } = await callEndpoint(request, ep, { pathParams, queryParams });

      const documentedStatuses = Object.keys(ep.responses).map(Number);
      expect(
        documentedStatuses,
        `${ep.id} returned undocumented status ${status}. Documented: [${documentedStatuses.join(", ")}]. Body: ${JSON.stringify(json)}`
      ).toContain(status);

      const respSpec = ep.responses[String(status)];
      if (respSpec?.schema) {
        const { valid, errors } = validateAgainstSchema(respSpec.schema, json);
        expect(valid, `${ep.id} response failed contract validation:\n${errors.join("\n")}`).toBe(true);
      }
    });
  }
});
