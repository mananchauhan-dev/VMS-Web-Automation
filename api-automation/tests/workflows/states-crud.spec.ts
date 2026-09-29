// tests/workflows/states-crud.spec.ts
//
// Stage 3A controlled-mutation candidate. States (VMS "active-state" config,
// distinct from the read-only /api/v1/states location-master list) is
// reference/master data (state.id/name/code + active flag + gstNumber) with
// NO authentication required. Deterministic cleanup via `active: false`
// (PATCH .../add-states), verified via GET .../active-state — same shape as
// Yard/Insurer/Bank. Uses a deliberately absurd, never-colliding `state.id`
// (99999) and a unique name/code so this can never touch a real Indian
// state's config.
//
// Single-test / try-finally shape (see yard-crud.spec.ts header for why):
// the whole lifecycle is one test() with test.step() phases and a finally
// block that attempts cleanup whenever a record was actually created.
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

test.describe("@workflow States CRUD (create -> read -> update -> verify -> soft-delete)", () => {
  test.skip(!RUN_MUTATING, "RUN_MUTATING not set — this workflow creates a real active-state record.");

  test("full lifecycle", async ({ request }) => {
    // A state.id no real Indian state uses (real ones top out well under 40) AND unique PER RUN.
    // Fixed after a live-validation finding: a hardcoded constant here collided with a still-present
    // (correctly soft-deleted, active:false) record from an earlier run — states.id has a uniqueness
    // constraint that a soft-delete doesn't lift, so a fixed id can never be reused for a fresh create.
    const FAKE_STATE_ID = 900_000_000 + (Date.now() % 90_000_000);
    const uniqueName = `QA-AUTOMATION-STATE-${Date.now()}`;
    const uniqueCode = `Q${Date.now().toString().slice(-4)}`;
    let createdId: string | undefined;

    try {
      await test.step("1. CREATE — POST /api/v1/states/add-states", async () => {
        const { status, json } = await callEndpoint(request, byId("POST /api/v1/states/add-states"), {
          body: {
            state: { id: FAKE_STATE_ID, name: uniqueName, code: uniqueCode },
            active: true,
            gstNumber: "08AAACX1234C1Z1",
          },
        });
        expect(status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.data?._id).toBeTruthy();
        createdId = json.data._id;
      });

      await test.step("2. READ — GET /api/v1/states/active-state finds the created record", async () => {
        const { status, json } = await callEndpoint(request, byId("GET /api/v1/states/active-state"), {});
        expect(status).toBe(200);
        const match = (json.data as any[]).find((s) => s._id === createdId);
        expect(match, `Created state ${createdId} not found`).toBeTruthy();
        expect(match.active).toBe(true);
        expect(match.state?.name).toBe(uniqueName);
      });

      await test.step("3. UPDATE — PATCH /api/v1/states/add-states changes gstNumber", async () => {
        const { status, json } = await callEndpoint(request, byId("PATCH /api/v1/states/add-states"), {
          body: { id: createdId, data: { active: true, gstNumber: "27AAACX9999D1Z5" } },
        });
        expect(status).toBe(200);
        expect(json.success).toBe(true);
      });

      await test.step("4. VERIFY UPDATE — GET /api/v1/states/active-state reflects the new gstNumber", async () => {
        const { json } = await callEndpoint(request, byId("GET /api/v1/states/active-state"), {});
        const match = (json.data as any[]).find((s) => s._id === createdId);
        expect(match?.gstNumber).toBe("27AAACX9999D1Z5");
        expect(match?.active).toBe(true);
      });
    } finally {
      if (createdId) {
        await test.step("5. SOFT-DELETE — PATCH /api/v1/states/add-states sets active=false (cleanup)", async () => {
          const { status } = await callEndpoint(request, byId("PATCH /api/v1/states/add-states"), {
            body: { id: createdId, data: { active: false, gstNumber: "27AAACX9999D1Z5" } },
          });
          expect(status).toBe(200);
        });

        await test.step("6. VERIFY CLEANUP — the record's own active field now reads false", async () => {
          // No filtered listing exists for this endpoint (GET .../active-state returns everything), so
          // cleanup is verified by reading the record back and checking its field value directly.
          const { json } = await callEndpoint(request, byId("GET /api/v1/states/active-state"), {});
          const match = (json.data as any[]).find((s) => s._id === createdId);
          expect(match, "Record should still exist (soft-delete, not hard-delete)").toBeTruthy();
          expect(match.active, "active should be false after soft-delete").toBe(false);
        });
      }
    }
  });
});
