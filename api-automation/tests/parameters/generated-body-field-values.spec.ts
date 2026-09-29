// tests/parameters/generated-body-field-values.spec.ts
//
// Per-REQUEST-BODY-FIELD value coverage, including NESTED objects and
// array-item fields (Steps 4, 9, 10). Builds a minimal valid payload
// (src/core/dataGenerator.js#minimalValidObjectFor), then for every scalar
// leaf field overrides just that one field via dot-path
// (src/core/schemaUtils.js#setPath — handles "a.b.c" and "a[].b" alike) with
// each schema-driven case from `parameterCasesFor()`.
//
// Scope policy (Step 35 — avoid test explosion without losing signal):
//   - REQUIRED fields get the FULL case set: every enum value, every
//     boundary, wrong-type, empty, null — same depth as query params.
//   - OPTIONAL fields get only the CONSTRAINT-DRIVEN cases (enum/boundary/
//     pattern/format) — i.e. cases that only exist because the schema
//     itself declares a constraint. A blanket "send the wrong JS type into
//     every one of the ~1268 optional body fields" would be ~2500+ real
//     mutating HTTP calls with very little additional signal beyond what
//     the full/minimal-payload contract tests already establish; every
//     field that DOES declare a real constraint (enum, min/maxLength,
//     pattern, format) still gets it tested here regardless of required.
//
// GATED behind RUN_MUTATING=true — see generated-mutating-endpoints.spec.ts
// for why (some endpoints apply no server-side validator at all).

import { test, expect } from "@playwright/test";
import { buildInventory } from "../../src/core/specLoader.js";
import { minimalValidObjectFor, parameterCasesFor } from "../../src/core/dataGenerator.js";
import { flattenScalarFields, setPath } from "../../src/core/schemaUtils.js";
import { callEndpoint } from "../../src/core/apiClient.js";
import { validateAgainstSchema } from "../../src/core/schemaValidator.js";
import { fallbackValue } from "../../src/core/testValueHelpers.js";
import { config } from "../../src/config/env.js";
import { assessGeneratedPayloadSafety } from "../../src/core/mutationSafetyGate.js";

const RUN_MUTATING = process.env.RUN_MUTATING === "true";
const inventory = buildInventory().filter((ep) => ep.requestBody?.schema?.type === "object");

test.describe("@negative @contract Generated: request-body field value coverage (incl. nested/array)", () => {
  test.skip(!RUN_MUTATING, "RUN_MUTATING not set — see generated-mutating-endpoints.spec.ts");

  for (const ep of inventory) {
    const scalarFields = flattenScalarFields(ep.requestBody!.schema);

    for (const field of scalarFields) {
      const cases = parameterCasesFor(field.schema, { includeGenericNegatives: field.required });
      if (cases.length === 0) continue; // optional + unconstrained — no meaningful case, not applicable

      for (const c of cases) {
        test(`${ep.id} — body "${field.path}" [${c.category}] ${c.label}`, async ({ request }) => {
          if (ep.security) {
            const schemeName = Object.keys(ep.security[0] || {})[0];
            if (schemeName === "AuthToken" && !config.adminEmail) test.skip(true, "ADMIN_EMAIL not configured");
            if (schemeName === "VmsAuthToken" && !config.vmtMobile) test.skip(true, "VMT_TEST_MOBILE not configured");
            if (schemeName === "ApiKeyAuth" && !process.env.PARTNER_API_KEY) test.skip(true, "PARTNER_API_KEY not configured");
          }

          const pathParams: Record<string, unknown> = {};
          for (const p of ep.parameters.filter((p) => p.in === "path")) {
            pathParams[p.name] = fallbackValue(p.name, p.schema);
          }

          const baseBody = minimalValidObjectFor(ep.requestBody!.schema);
          const body = setPath(baseBody, field.path, c.value);

          const safety = assessGeneratedPayloadSafety(ep.requestBody!.schema, body);
          if (!safety.safe) {
            test.skip(
              true,
              `SKIP - unsafe generated mutation: ${safety.violations.map((v) => `${v.path}="${v.value}" (${v.reasons.join("; ")})`).join(" | ")}`
            );
          }

          const { status, json } = await callEndpoint(request, ep, { pathParams, body });

          const documentedStatuses = Object.keys(ep.responses).map(Number);
          expect(
            documentedStatuses,
            `${ep.id} with ${c.category} body field "${field.path}" returned undocumented status ${status}: ${JSON.stringify(json)}`
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
