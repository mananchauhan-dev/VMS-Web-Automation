// tests/workflows/master-data-crud.spec.ts
//
// Stage 3B controlled-mutation candidate. MasterData is global app
// config (feature-flag-style key/value pairs), gated to SUPER_ADMIN/ADMIN
// or an allow-listed email — AuthToken required. Deterministic cleanup via
// `isActive: false`. CRITICAL: unlike Insurer/Bank, this endpoint's `key`
// field example is a REAL, live config key ("MAX_BOOKING_DAYS") — running
// the generic schema-driven engine here unmodified would target real
// config. This workflow explicitly overrides `key` with a unique,
// never-colliding value, exactly as Insurer/Bank/States already do for
// their name fields.
//
// Single-test / try-finally shape (see yard-crud.spec.ts header for why).
//
// GATED behind RUN_MUTATING=true. Requires AuthToken (ADMIN_EMAIL) AND that
// account having SUPER_ADMIN/ADMIN role or being on the endpoint's
// allow-list — if not, step 1 fails with 403 and nothing is created, so
// nothing needs cleanup (the finally block's `if (createdKey)` guard
// handles this correctly).

import { test, expect } from "@playwright/test";
import { buildInventory } from "../../src/core/specLoader.js";
import { callEndpoint } from "../../src/core/apiClient.js";
import { config } from "../../src/config/env.js";

const RUN_MUTATING = process.env.RUN_MUTATING === "true";
const inventory = buildInventory();
const byId = (id: string) => {
  const ep = inventory.find((e) => e.id === id);
  if (!ep) throw new Error(`Endpoint not found in inventory: ${id}`);
  return ep;
};

test.describe("@workflow MasterData CRUD (create -> read -> update -> verify -> soft-delete)", () => {
  test.skip(!RUN_MUTATING, "RUN_MUTATING not set — this workflow creates a real master-data config key.");
  test.beforeAll(() => {
    if (!config.adminEmail) test.skip(true, "ADMIN_EMAIL not configured — MasterData endpoints require AuthToken");
  });

  test("full lifecycle", async ({ request }) => {
    const uniqueKey = `QA_AUTOMATION_TEST_KEY_${Date.now()}`;
    let createdKey: string | undefined;

    try {
      await test.step("1. CREATE — PUT /api/v1/dashboard/master-data", async () => {
        const { status, json } = await callEndpoint(request, byId("PUT /api/v1/dashboard/master-data"), {
          body: { key: uniqueKey, valueType: "string", value: "qa-automation-initial-value", isActive: true },
        });
        if (status === 403) {
          test.skip(true, "ADMIN_EMAIL account is not SUPER_ADMIN/ADMIN and not on this endpoint's allow-list");
        }
        expect(status).toBe(200);
        expect(json.success).toBe(true);
        createdKey = uniqueKey; // this endpoint keys by the config `key` string, not a Mongo _id
      });

      await test.step("2. READ — GET /api/v1/dashboard/master-data?search=<key> finds it", async () => {
        const { status, json } = await callEndpoint(request, byId("GET /api/v1/dashboard/master-data"), {
          queryParams: { search: uniqueKey },
        });
        expect(status).toBe(200);
        const match = (json.data as any[]).find((m) => m.key === createdKey);
        expect(match, `Created key ${createdKey} not found`).toBeTruthy();
        expect(match.value).toBe("qa-automation-initial-value");
        expect(match.isActive).toBe(true);
      });

      await test.step("3. UPDATE — PUT /api/v1/dashboard/master-data changes the value", async () => {
        const { status, json } = await callEndpoint(request, byId("PUT /api/v1/dashboard/master-data"), {
          body: { key: uniqueKey, valueType: "string", value: "qa-automation-UPDATED-value", isActive: true },
        });
        expect(status).toBe(200);
        expect(json.success).toBe(true);
      });

      await test.step("4. VERIFY UPDATE — GET reflects the new value", async () => {
        const { json } = await callEndpoint(request, byId("GET /api/v1/dashboard/master-data"), {
          queryParams: { search: uniqueKey },
        });
        const match = (json.data as any[]).find((m) => m.key === createdKey);
        expect(match?.value).toBe("qa-automation-UPDATED-value");
      });
    } finally {
      if (createdKey) {
        await test.step("5. SOFT-DELETE — PUT sets isActive=false (cleanup)", async () => {
          const { status } = await callEndpoint(request, byId("PUT /api/v1/dashboard/master-data"), {
            body: { key: createdKey, valueType: "string", value: "qa-automation-UPDATED-value", isActive: false },
          });
          expect(status).toBe(200);
        });

        await test.step("6. VERIFY CLEANUP — the record's own isActive field now reads false", async () => {
          const { json } = await callEndpoint(request, byId("GET /api/v1/dashboard/master-data"), {
            queryParams: { search: createdKey },
          });
          const match = (json.data as any[]).find((m) => m.key === createdKey);
          expect(match, "Record should still exist (soft-delete, not hard-delete)").toBeTruthy();
          expect(match.isActive, "isActive should be false after soft-delete").toBe(false);
        });
      }
    }
  });
});
