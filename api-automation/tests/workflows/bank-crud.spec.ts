// tests/workflows/bank-crud.spec.ts
//
// Stage 2 controlled-mutation candidate #2. Bank is pure reference/master
// data (bankName + activeStatus), and — unlike most modules — its
// create/read/update endpoints require NO authentication per the spec, so
// this workflow is runnable with zero ADMIN_EMAIL/token dependency. Uses
// the documented soft-delete path (`activeStatus: false`) and the `search`
// query param to verify state at every step. Reuses only existing helpers —
// no new engine code, no hardcoded parameter-generation logic.
//
// Single-test / try-finally shape (see yard-crud.spec.ts header for why):
// the whole lifecycle is one test() with test.step() phases and a finally
// block that attempts cleanup whenever a record was actually created,
// regardless of what failed afterward. (A Stage 2 run under the old
// multi-test() shape hit a real ECONNRESET on the verify-update step and,
// because the id lived in a `let` shared across separate test()s, the
// Playwright worker restart that follows a failure wiped it — cleanup
// silently never ran, orphaning a test Bank record. This shape fixes that.)
//
// GATED behind RUN_MUTATING=true.

import { test, expect } from "@playwright/test";
import { buildInventory } from "../../src/core/specLoader.js";
import { callEndpoint } from "../../src/core/apiClient.js";

const RUN_MUTATING = process.env.RUN_MUTATING === "true";
const inventory = buildInventory();
const byId = (id: string) => {
  const ep = inventory.find((e) => e.id === id);
  if (!ep) throw new Error(`Endpoint not found in inventory: ${id}`);
  return ep;
};

test.describe("@workflow Bank CRUD (create -> read -> update -> verify -> soft-delete)", () => {
  test.skip(!RUN_MUTATING, "RUN_MUTATING not set — this workflow creates a real Bank record.");

  test("full lifecycle", async ({ request }) => {
    const uniqueName = `QA-AUTOMATION-BANK-${Date.now()}`;
    let createdId: string | undefined;

    try {
      await test.step("1. CREATE — POST /api/v1/bank", async () => {
        const { status, json } = await callEndpoint(request, byId("POST /api/v1/bank"), {
          body: { banks: [{ bankName: uniqueName }] },
        });
        expect(status).toBe(200);
        expect(json.status).toBe(true);
        expect(Array.isArray(json.data)).toBe(true);
        expect(json.data?.[0]?._id).toBeTruthy();
        createdId = json.data[0]._id;
      });

      await test.step("2. READ — GET /api/v1/bank?search=<name> finds the created record", async () => {
        const { status, json } = await callEndpoint(request, byId("GET /api/v1/bank"), {
          queryParams: { search: uniqueName },
        });
        expect(status).toBe(200);
        const match = (json.data as any[]).find((b) => b._id === createdId);
        expect(match, `Created bank ${createdId} not found via search`).toBeTruthy();
      });

      await test.step("3. UPDATE — PUT /api/v1/bank changes the bankName", async () => {
        const { status, json } = await callEndpoint(request, byId("PUT /api/v1/bank"), {
          body: { id: createdId, bankName: `${uniqueName}-UPDATED` },
        });
        expect(status).toBe(200);
        expect(json.status).toBe(true);
      });

      await test.step("4. VERIFY UPDATE — GET /api/v1/bank (activeStatus=All) reflects the new name", async () => {
        const { json } = await callEndpoint(request, byId("GET /api/v1/bank"), {
          queryParams: { search: `${uniqueName}-UPDATED`, activeStatus: "All" },
        });
        const match = (json.data as any[]).find((b) => b._id === createdId);
        expect(match?.bankName).toBe(`${uniqueName}-UPDATED`);
      });
    } finally {
      if (createdId) {
        await test.step("5. SOFT-DELETE — PUT /api/v1/bank sets activeStatus=false (cleanup)", async () => {
          const { status } = await callEndpoint(request, byId("PUT /api/v1/bank"), {
            body: { id: createdId, activeStatus: false },
          });
          expect(status).toBe(200);
        });

        await test.step("6. VERIFY CLEANUP — GET /api/v1/bank (default, active-only) no longer lists it", async () => {
          const { json } = await callEndpoint(request, byId("GET /api/v1/bank"), {
            queryParams: { search: `${uniqueName}-UPDATED` },
          });
          const match = (json.data as any[]).find((b) => b._id === createdId);
          expect(match, "Soft-deleted bank should not appear in the default active-only listing").toBeFalsy();
        });
      }
    }
  });
});
