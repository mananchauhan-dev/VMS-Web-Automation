// tests/smoke/public-endpoints.spec.ts
//
// Fast, always-green (no .env / credentials required) smoke gate: every
// GET endpoint the spec documents with NO security requirement. Real HTTP
// calls against the live environment, contract-validated. This is what CI
// runs first, before anything that needs ADMIN_EMAIL.

import { test, expect } from "@playwright/test";
import { buildInventory, requiresAuth } from "../../src/core/specLoader.js";
import { callEndpoint } from "../../src/core/apiClient.js";
import { validateAgainstSchema } from "../../src/core/schemaValidator.js";
import { fallbackValue } from "../../src/core/testValueHelpers.js";

const publicGetEndpoints = buildInventory().filter((ep) => ep.method === "get" && !requiresAuth(ep));

test.describe("@smoke Public (no-auth) GET endpoints", () => {
  for (const ep of publicGetEndpoints) {
    test(`${ep.id}`, async ({ request }) => {
      const pathParams: Record<string, unknown> = {};
      for (const p of ep.parameters.filter((p) => p.in === "path")) {
        pathParams[p.name] = fallbackValue(p.name, p.schema);
      }
      const queryParams: Record<string, unknown> = {};
      for (const p of ep.parameters.filter((p) => p.in === "query" && p.required)) {
        queryParams[p.name] = fallbackValue(p.name, p.schema);
      }

      const { status, json } = await callEndpoint(request, ep, { pathParams, queryParams });

      const documentedStatuses = Object.keys(ep.responses).map(Number);
      expect(documentedStatuses, `Undocumented status ${status}: ${JSON.stringify(json)}`).toContain(status);

      const respSpec = ep.responses[String(status)];
      if (respSpec?.schema) {
        const { valid, errors } = validateAgainstSchema(respSpec.schema, json);
        expect(valid, `Contract violation:\n${errors.join("\n")}`).toBe(true);
      }
    });
  }
});
