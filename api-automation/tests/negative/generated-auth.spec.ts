// tests/negative/generated-auth.spec.ts
//
// For every GET endpoint documented as requiring auth, verify:
//   - no Authorization header  -> 401
//   - an invalid/malformed JWT -> 401
// Read-only + auth-rejected-before-any-side-effect, so this is safe to run
// unconditionally (no RUN_MUTATING flag, no valid credentials needed at all
// — these are exactly the tests that DON'T need .env configured).

import { test, expect } from "@playwright/test";
import { buildInventory, requiresAuth } from "../../src/core/specLoader.js";
import { callEndpoint } from "../../src/core/apiClient.js";
import { fallbackValue } from "../../src/core/testValueHelpers.js";

const inventory = buildInventory().filter((ep) => ep.method === "get" && requiresAuth(ep) && ep.responses["401"]);

test.describe("@negative @rbac Generated: unauthenticated / invalid-token access", () => {
  for (const ep of inventory) {
    for (const [label, override] of [
      ["no Authorization header", "none"],
      ["malformed JWT", "invalid"],
    ] as const) {
      test(`${ep.id} — ${label} => 401`, async ({ request }) => {
        const pathParams: Record<string, unknown> = {};
        for (const p of ep.parameters.filter((p) => p.in === "path")) {
          pathParams[p.name] = fallbackValue(p.name, p.schema);
        }
        const queryParams: Record<string, unknown> = {};
        for (const p of ep.parameters.filter((p) => p.in === "query" && p.required)) {
          queryParams[p.name] = fallbackValue(p.name, p.schema);
        }

        const { status, json } = await callEndpoint(request, ep, {
          pathParams,
          queryParams,
          authOverride: override,
        });

        expect(status, `${ep.id} with ${label} expected 401, got ${status}: ${JSON.stringify(json)}`).toBe(401);
      });
    }
  }
});
