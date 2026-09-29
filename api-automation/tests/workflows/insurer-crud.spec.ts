// tests/workflows/insurer-crud.spec.ts
//
// Stage 2 controlled-mutation candidate #1. Insurer is pure reference/master
// data (name + activeStatus) — no financial, booking, or irreversible side
// effects, and the spec gives a deterministic soft-delete path
// (`activeStatus: false`) plus a `search` query param to verify state at
// every step, same shape as the Yard CRUD workflow. Reuses only existing
// helpers (callEndpoint, buildInventory) — no new engine code, no hardcoded
// parameter-generation logic.
//
// Single-test / try-finally shape (see yard-crud.spec.ts header for why):
// the whole lifecycle is one test() with test.step() phases and a finally
// block that attempts cleanup whenever a record was actually created,
// regardless of what failed afterward.
//
// GATED behind RUN_MUTATING=true. Requires AuthToken (ADMIN_EMAIL).

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

test.describe("@workflow Insurer CRUD (create -> read -> update -> verify -> soft-delete)", () => {
  test.skip(!RUN_MUTATING, "RUN_MUTATING not set — this workflow creates a real Insurer record.");
  test.beforeAll(() => {
    if (!config.adminEmail) test.skip(true, "ADMIN_EMAIL not configured — Insurer endpoints require AuthToken");
  });

  test("full lifecycle", async ({ request }) => {
    const uniqueName = `QA-AUTOMATION-INSURER-${Date.now()}`;
    let createdId: string | undefined;

    try {
      await test.step("1. CREATE — POST /api/v1/insurer", async () => {
        const { status, json } = await callEndpoint(request, byId("POST /api/v1/insurer"), {
          body: { name: uniqueName, activeStatus: true },
        });
        expect(status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.data?._id).toBeTruthy();
        createdId = json.data._id;
      });

      await test.step("2. READ — GET /api/v1/insurer?search=<name> finds the created record", async () => {
        const { status, json } = await callEndpoint(request, byId("GET /api/v1/insurer"), {
          queryParams: { search: uniqueName },
        });
        expect(status).toBe(200);
        const match = (json.data as any[]).find((i) => i._id === createdId);
        expect(match, `Created insurer ${createdId} not found via search`).toBeTruthy();
        expect(match.activeStatus).toBe(true);
      });

      await test.step("3. UPDATE — PATCH /api/v1/insurer changes the name", async () => {
        const { status, json } = await callEndpoint(request, byId("PATCH /api/v1/insurer"), {
          body: { id: createdId, name: `${uniqueName}-UPDATED` },
        });
        expect(status).toBe(200);
        expect(json.success).toBe(true);
      });

      await test.step("4. VERIFY UPDATE — GET /api/v1/insurer reflects the new name", async () => {
        const { json } = await callEndpoint(request, byId("GET /api/v1/insurer"), {
          queryParams: { search: `${uniqueName}-UPDATED` },
        });
        const match = (json.data as any[]).find((i) => i._id === createdId);
        expect(match?.name).toBe(`${uniqueName}-UPDATED`);
      });
    } finally {
      if (createdId) {
        await test.step("5. SOFT-DELETE — PATCH /api/v1/insurer sets activeStatus=false (cleanup)", async () => {
          const { status } = await callEndpoint(request, byId("PATCH /api/v1/insurer"), {
            body: { id: createdId, activeStatus: false },
          });
          expect(status).toBe(200);
        });

        await test.step("6. VERIFY CLEANUP — GET /api/v1/insurer?activeStatus=ACTIVE no longer lists it", async () => {
          const { json } = await callEndpoint(request, byId("GET /api/v1/insurer"), {
            queryParams: { search: `${uniqueName}-UPDATED`, activeStatus: "ACTIVE" },
          });
          const match = (json.data as any[]).find((i) => i._id === createdId);
          expect(match, "Soft-deleted insurer should not appear in the activeStatus=ACTIVE listing").toBeFalsy();
        });
      }
    }
  });
});
