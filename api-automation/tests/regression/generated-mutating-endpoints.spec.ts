// tests/regression/generated-mutating-endpoints.spec.ts
//
// Data-driven regression + contract suite for POST/PUT/PATCH/DELETE
// endpoints, built from the spec the same way as the GET suite.
//
// GATED behind RUN_MUTATING=true (default: off). These endpoints create,
// update, or delete real records in whatever environment API_BASE_URL
// points at (several have "No request-level validator is applied" per the
// spec's own descriptions, meaning even a minimal/garbage payload can
// persist). Never enable this against prod; use a disposable dev/staging
// dataset. See README "Safety model".

import { test, expect } from "@playwright/test";
import { buildInventory } from "../../src/core/specLoader.js";
import { minimalValidObjectFor } from "../../src/core/dataGenerator.js";
import { callEndpoint } from "../../src/core/apiClient.js";
import { validateAgainstSchema } from "../../src/core/schemaValidator.js";
import { config } from "../../src/config/env.js";
import { fallbackValue } from "../../src/core/testValueHelpers.js";
import { assessGeneratedPayloadSafety } from "../../src/core/mutationSafetyGate.js";

const RUN_MUTATING = process.env.RUN_MUTATING === "true";

const inventory = buildInventory().filter((ep) => ep.method !== "get");

test.describe("@regression @contract Generated mutating-endpoint suite (POST/PUT/PATCH/DELETE)", () => {
  test.skip(!RUN_MUTATING, "RUN_MUTATING not set — these tests write real data. Set RUN_MUTATING=true to enable.");

  for (const ep of inventory) {
    test(`${ep.id} — documented status + response contract (minimal valid payload)`, async ({ request }) => {
      if (ep.security) {
        const schemeName = Object.keys(ep.security[0] || {})[0];
        if (schemeName === "AuthToken" && !config.adminEmail) test.skip(true, "ADMIN_EMAIL not set in .env");
        if (schemeName === "VmsAuthToken" && !config.vmtMobile) test.skip(true, "VMT_TEST_MOBILE not set in .env");
        if (schemeName === "ApiKeyAuth" && !process.env.PARTNER_API_KEY) test.skip(true, "PARTNER_API_KEY not set in .env");
      }

      const pathParams: Record<string, unknown> = {};
      for (const p of ep.parameters.filter((p) => p.in === "path")) {
        pathParams[p.name] = fallbackValue(p.name, p.schema);
      }
      const queryParams: Record<string, unknown> = {};
      for (const p of ep.parameters.filter((p) => p.in === "query" && p.required)) {
        queryParams[p.name] = fallbackValue(p.name, p.schema);
      }

      let body: unknown;
      if (ep.requestBody?.schema?.type === "object") {
        body = minimalValidObjectFor(ep.requestBody.schema);
        const safety = assessGeneratedPayloadSafety(ep.requestBody.schema, body);
        if (!safety.safe) {
          test.skip(
            true,
            `SKIP - unsafe generated mutation: ${safety.violations.map((v) => `${v.path}="${v.value}" (${v.reasons.join("; ")})`).join(" | ")}`
          );
        }
      }

      const { status, json } = await callEndpoint(request, ep, { pathParams, queryParams, body });

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
