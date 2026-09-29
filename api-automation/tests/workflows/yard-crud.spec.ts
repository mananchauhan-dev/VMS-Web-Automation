// tests/workflows/yard-crud.spec.ts
//
// Hand-crafted CRUD workflow, chosen because Yard is the one module whose
// create/read/update endpoints require NO authentication per the spec
// (GET /api/v1/yard, POST /api/v1/yard/add, PUT /api/v1/yard/edit — no
// `security` block documented on any of them) — so this workflow is
// runnable with zero .env configuration, no admin creds needed.
//
// Deliberately NOT used in this workflow:
//   - POST /api/v1/yard        (bulk-updates the `active` status of EVERY
//                                yard in the system — far too destructive)
//   - PUT  /api/v1/yard        (drops a hardcoded Mongo index — a
//                                maintenance-only endpoint, not a CRUD op)
//
// Cleanup: the spec documents no DELETE for Yard. As a soft-delete, the
// final step sets active="depricated", which both list-mode filters
// (default `active`-only, and `all=true` which "excludes only depricated")
// hide — so the created record stops appearing in normal listings even
// though it isn't physically removed.
//
// Single-test / try-finally shape (fixed after a Stage 2 finding): the
// entire lifecycle runs inside ONE test() using test.step() for each
// phase, with the created id held in a local variable scoped to that one
// test invocation — not a `let` shared across separate test() blocks.
// Playwright restarts its worker PROCESS after a test failure, which wipes
// any module-level variable; splitting the lifecycle across multiple
// test()s meant a failure partway through silently skipped cleanup (a real
// orphaned-record incident during Stage 2 mutation testing on Bank/
// AccessoriesCheckList). The `finally` block here guarantees soft-delete
// cleanup is attempted whenever a record was actually created, regardless
// of what failed afterward — and never touches anything else.
//
// GATED behind RUN_MUTATING=true — this still writes a real record.

import { test, expect } from "@playwright/test";
import { buildInventory } from "../../src/core/specLoader.js";
import { callEndpoint } from "../../src/core/apiClient.js";

const RUN_MUTATING = process.env.RUN_MUTATING === "true";
const inventory = buildInventory();
const byId = (id: string) => {
  const ep = inventory.find((e) => e.id === id);
  if (!ep) throw new Error(`Endpoint not found in inventory: ${id}. Did the spec change? Re-run npm run inventory.`);
  return ep;
};

test.describe("@workflow Yard CRUD (create -> get -> update -> verify -> soft-delete)", () => {
  test.skip(!RUN_MUTATING, "RUN_MUTATING not set — this workflow creates a real Yard record.");

  test("full lifecycle", async ({ request }) => {
    const uniqueName = `QA-AUTOMATION-${Date.now()}`;
    let createdYardId: string | undefined;

    try {
      await test.step("1. CREATE — POST /api/v1/yard/add", async () => {
        const { status, json } = await callEndpoint(request, byId("POST /api/v1/yard/add"), {
          body: {
            yardDetails: {
              name: uniqueName,
              state: "Rajasthan",
              district: "Jaipur",
              tehsil: "Sanganer",
              address: "QA automation test address",
              spocName: "QA Automation",
              spocNum: "9999999999",
              active: "active",
            },
          },
        });
        expect(status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.data?._id).toBeTruthy();
        createdYardId = json.data._id; // set only on confirmed creation — this is what "owns" the record for cleanup
      });

      await test.step("2. READ — GET /api/v1/yard?search=<name> finds the created record", async () => {
        const { status, json } = await callEndpoint(request, byId("GET /api/v1/yard"), {
          queryParams: { search: uniqueName },
        });
        expect(status).toBe(200);
        const match = (json.data as any[]).find((y) => y._id === createdYardId);
        expect(match, `Created yard ${createdYardId} not found via search`).toBeTruthy();
        expect(match.name).toBe(uniqueName);
        expect(match.active).toBe("active");
      });

      await test.step("3. UPDATE — PUT /api/v1/yard/edit changes the address", async () => {
        const updatedAddress = "QA automation UPDATED address";
        const { status, json } = await callEndpoint(request, byId("PUT /api/v1/yard/edit"), {
          body: { yardDetails: { yardId: createdYardId, address: updatedAddress } },
        });
        expect(status).toBe(200);
        expect(json.success).toBe(true);
      });

      await test.step("4. VERIFY UPDATE — GET /api/v1/yard reflects the new address", async () => {
        const { json } = await callEndpoint(request, byId("GET /api/v1/yard"), {
          queryParams: { search: uniqueName },
        });
        const match = (json.data as any[]).find((y) => y._id === createdYardId);
        expect(match?.address).toBe("QA automation UPDATED address");
      });
    } finally {
      // Runs even if a step above threw — cleanup must not depend on the happy path.
      // Never touches anything unless THIS test actually created it.
      if (createdYardId) {
        await test.step("5. SOFT-DELETE — PUT /api/v1/yard/edit sets active=depricated (cleanup)", async () => {
          const { status } = await callEndpoint(request, byId("PUT /api/v1/yard/edit"), {
            body: { yardDetails: { yardId: createdYardId, active: "depricated" } },
          });
          expect(status).toBe(200);
        });

        await test.step("6. VERIFY CLEANUP — GET /api/v1/yard (default, active-only) no longer lists it", async () => {
          const { json } = await callEndpoint(request, byId("GET /api/v1/yard"), {
            queryParams: { search: uniqueName },
          });
          const match = (json.data as any[]).find((y) => y._id === createdYardId);
          expect(match, "Soft-deleted yard should not appear in the default active-only listing").toBeFalsy();
        });
      }
    }
  });
});
