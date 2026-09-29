// tests/workflows/accessories-checklist-crud.spec.ts
//
// Stage 2 controlled-mutation candidate #3. AccessoriesCheckList is
// reference/master data (checklist item definitions like "TROLLEY", used to
// build vehicle inspection checklists) — no financial or irreversible side
// effects. Uses the documented soft-delete path (`activeStatus: false` via
// the update endpoint's array-wrapped `checkListData`) and verifies state by
// reading the created record's own field back — the list endpoint's
// `activeStatus` query filter is documented as "accepted but not currently
// used by this handler's query filter", so cleanup is verified by field
// value rather than by absence from a filtered list (unlike Yard/Bank).
// Reuses only existing helpers — no new engine code, no hardcoded
// parameter-generation logic.
//
// Single-test / try-finally shape (see yard-crud.spec.ts header for why).
//
// Diagnostic note (Stage 2 finding, unresolved as of the last run): the
// verify-update step previously found no record at all under the new name
// after an update that reported success:true. Step 4 below additionally
// looks the record up by its OLD name and by raw _id-search, so a rerun
// distinguishes: (a) update didn't persist [old name still matches] vs.
// (b) a read-after-write consistency gap [neither matches immediately,
// but a follow-up read would] vs. (c) something else entirely. See the
// assertion messages for which case was actually observed.
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

test.describe("@workflow AccessoriesCheckList CRUD (create -> read -> update -> verify -> soft-delete)", () => {
  test.skip(!RUN_MUTATING, "RUN_MUTATING not set — this workflow creates a real checklist-item record.");
  // CONFIRMED (Stage 2 remediation, 2026-09-11): PATCH /api/v1/accessories-checklist/update-checklist
  // is a genuine API defect (classification E) — it returns { success: true, data: null } but never
  // persists any change. Verified twice independently: a field-rename attempt left accessoryName
  // unchanged, and a follow-up activeStatus=INACTIVE deactivate attempt left activeStatus:true and
  // updatedAt IDENTICAL to createdAt. Because this endpoint is also this workflow's own cleanup
  // mechanism, running it again would create another test record with no way to remove it via the
  // API. Disabled until the defect is fixed — see reports/coverage-report.md "Stage 2" section for
  // full evidence. Re-enable by removing this test.skip() once confirmed fixed.
  test.skip(true, "KNOWN API DEFECT: update-checklist confirmed to no-op — cannot clean up after itself. See Stage 2 findings.");
  test.beforeAll(() => {
    if (!config.adminEmail) test.skip(true, "ADMIN_EMAIL not configured — AccessoriesCheckList endpoints require AuthToken");
  });

  test("full lifecycle", async ({ request }) => {
    const uniqueName = `QA-AUTOMATION-CHECKLIST-${Date.now()}`;
    const updatedName = `${uniqueName}-UPDATED`;
    let createdId: string | undefined;

    try {
      await test.step("1. CREATE — POST /api/v1/accessories-checklist/create-checklist", async () => {
        const { status, json } = await callEndpoint(request, byId("POST /api/v1/accessories-checklist/create-checklist"), {
          body: { accessoryName: uniqueName, activeStatus: "ACTIVE", stage: "ALL", vehicleType: "ALL", source: "ALL" },
        });
        expect(status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.data?._id).toBeTruthy();
        createdId = json.data._id;
      });

      await test.step("2. READ — POST .../get-accessory-checklist?accessoryName=<name> finds it", async () => {
        const { status, json } = await callEndpoint(request, byId("POST /api/v1/accessories-checklist/get-accessory-checklist"), {
          queryParams: { accessoryName: uniqueName },
        });
        expect(status).toBe(200);
        const match = (json.data as any[]).find((c) => c._id === createdId);
        expect(match, `Created checklist item ${createdId} not found`).toBeTruthy();
        expect(match.activeStatus).toBe(true);
      });

      await test.step("3. UPDATE — PATCH .../update-checklist changes the name", async () => {
        const { status, json } = await callEndpoint(request, byId("PATCH /api/v1/accessories-checklist/update-checklist"), {
          body: { checkListData: [{ checkListId: createdId, accessoryName: updatedName }] },
        });
        expect(status).toBe(200);
        expect(json.success).toBe(true);
      });

      await test.step("4. VERIFY UPDATE — read back reflects the new name (with diagnostics)", async () => {
        const [byNewName, byOldName, unfiltered] = await Promise.all([
          callEndpoint(request, byId("POST /api/v1/accessories-checklist/get-accessory-checklist"), {
            queryParams: { accessoryName: updatedName },
          }),
          callEndpoint(request, byId("POST /api/v1/accessories-checklist/get-accessory-checklist"), {
            queryParams: { accessoryName: uniqueName },
          }),
          callEndpoint(request, byId("POST /api/v1/accessories-checklist/get-accessory-checklist"), {}),
        ]);

        const foundByNewName = (byNewName.json.data as any[])?.find((c) => c._id === createdId);
        const foundByOldName = (byOldName.json.data as any[])?.find((c) => c._id === createdId);
        const foundUnfiltered = (unfiltered.json.data as any[])?.find((c) => c._id === createdId);

        if (!foundByNewName && foundByOldName) {
          throw new Error(
            `DIAGNOSIS: update did NOT persist accessoryName — record ${createdId} still has the OLD name ` +
              `"${uniqueName}" despite the update call returning success:true. Classification: API contract defect (C).`
          );
        }
        if (!foundByNewName && !foundByOldName && foundUnfiltered) {
          throw new Error(
            `DIAGNOSIS: record ${createdId} exists (found via unfiltered list, current name ` +
              `"${foundUnfiltered.accessoryName}") but the accessoryName QUERY FILTER on this list endpoint doesn't ` +
              `match it under either the old or new name. Classification: query-filter defect, not update persistence (B).`
          );
        }
        if (!foundByNewName && !foundByOldName && !foundUnfiltered) {
          throw new Error(
            `DIAGNOSIS: record ${createdId} not found by any lookup (new name, old name, or unfiltered) — ` +
              `possible read-after-write consistency gap or the record vanished. Classification: unresolved (needs a delayed re-read).`
          );
        }
        expect(foundByNewName?.accessoryName).toBe(updatedName);
      });
    } finally {
      if (createdId) {
        await test.step("5. SOFT-DELETE — PATCH .../update-checklist sets activeStatus=INACTIVE (cleanup)", async () => {
          const { status } = await callEndpoint(request, byId("PATCH /api/v1/accessories-checklist/update-checklist"), {
            body: { checkListData: [{ checkListId: createdId, activeStatus: "INACTIVE" }] },
          });
          expect(status).toBe(200);
        });

        await test.step("6. VERIFY CLEANUP — the record's own activeStatus field now reads false", async () => {
          // The list endpoint's activeStatus query filter is documented as unused server-side, so
          // cleanup is verified by reading the record back (unfiltered) and checking its field value.
          const { json } = await callEndpoint(request, byId("POST /api/v1/accessories-checklist/get-accessory-checklist"), {});
          const match = (json.data as any[]).find((c) => c._id === createdId);
          expect(match, "Record should still exist (soft-delete, not hard-delete)").toBeTruthy();
          expect(match.activeStatus, "activeStatus should be false after soft-delete").toBe(false);
        });
      }
    }
  });
});
