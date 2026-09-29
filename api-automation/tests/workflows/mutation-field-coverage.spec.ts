// tests/workflows/mutation-field-coverage.spec.ts
//
// Stage 4 — schema-driven boundary/enum/negative FIELD coverage for the
// UPDATE endpoint of each already-approved SAFE_MUTATION module (Yard,
// Insurer, Bank, States, MasterData), executed against a record THIS TEST
// itself creates and unconditionally cleans up in a `finally` block —
// exactly the single-test()/test.step()/try-finally shape used by every
// other workflow spec in this suite, just with an extra sweep phase.
//
// WHY NOT the existing generic tests/parameters/generated-body-field-values.spec.ts
// for this: that suite builds a FRESH `minimalValidObjectFor()` payload per
// case and targets EVERY mutating endpoint in the spec, including CREATE
// endpoints — for a create, a case that happens to still be schema-valid
// (e.g. "at maxLength") actually PERSISTS a brand-new, uncleaned-up record
// (that file does a one-shot contract check, not a lifecycle). Running it
// against our approved modules' CREATE endpoints would silently orphan a
// record per still-valid case. Its UPDATE-endpoint tests are incidentally
// safe only because they target a RANDOM id that (almost certainly) matches
// no real record — safe, but that also means they test "record not found"
// behavior, not real field-value handling.
//
// This file instead: (1) creates ONE real, owned, disposable record per
// module (2) runs the schema-driven case set from
// src/core/dataGenerator.js#parameterCasesFor against every scalar field of
// that module's UPDATE request body, applied via
// src/core/schemaUtils.js#setPath on top of a hand-written valid base body
// pointing at the OWNED id — so every case actually exercises real
// field-value handling against a record that (3) gets soft-deleted in
// `finally` regardless of how the sweep went. No hardcoded case values —
// the case set itself is 100% generator-derived, same engine as every other
// parameter-coverage suite in this repo.
//
// Every case only asserts what the generic contract suites assert: the
// returned status is one of the endpoint's DOCUMENTED statuses, and the
// response body (when a schema is documented for that status) validates
// against it. Cases are not asserted to succeed OR fail — a schema-valid
// boundary case may legitimately return 200; a WRONG_TYPE/EMPTY/NULL case
// may legitimately return 400. Either is fine; an UNDOCUMENTED status is
// the only failure.
//
// No `assessGeneratedPayloadSafety` gate needed here: field values come
// exclusively from `parameterCasesFor()` (enum members / numeric-string
// boundary literals / WRONG_TYPE/EMPTY/NULL sentinels), never from an
// OpenAPI `example` — there is nothing "potentially real-world" for the
// gate to catch, by construction.
//
// GATED behind RUN_MUTATING=true, same as every other workflow file.

import { test, expect } from "@playwright/test";
import { buildInventory } from "../../src/core/specLoader.js";
import { callEndpoint } from "../../src/core/apiClient.js";
import { validateAgainstSchema } from "../../src/core/schemaValidator.js";
import { parameterCasesFor } from "../../src/core/dataGenerator.js";
import { flattenScalarFields, setPath } from "../../src/core/schemaUtils.js";
import { config } from "../../src/config/env.js";

const RUN_MUTATING = process.env.RUN_MUTATING === "true";
const inventory = buildInventory();
const byId = (id: string) => {
  const ep = inventory.find((e) => e.id === id);
  if (!ep) throw new Error(`Endpoint not found in inventory: ${id}`);
  return ep;
};

/** Runs the generator-driven case sweep for every scalar field of `updateEndpointId`'s body against `baseBody`, asserting only documented-status + contract. Returns { casesRun, casesSkipped }. */
async function sweepFields(
  request: import("@playwright/test").APIRequestContext,
  updateEndpointId: string,
  baseBody: Record<string, unknown>
) {
  const ep = byId(updateEndpointId);
  const scalarFields = flattenScalarFields(ep.requestBody!.schema);
  let casesRun = 0;
  let casesSkipped = 0;

  for (const field of scalarFields) {
    const cases = parameterCasesFor(field.schema, { includeGenericNegatives: field.required });
    if (cases.length === 0) {
      casesSkipped += 1;
      continue;
    }

    for (const c of cases) {
      await test.step(`sweep — body "${field.path}" [${c.category}] ${c.label}`, async () => {
        const body = setPath(baseBody, field.path, c.value);
        const { status, json } = await callEndpoint(request, ep, { body });

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
      casesRun += 1;
    }
  }
  return { casesRun, casesSkipped };
}

test.describe("@workflow @parameters Mutation field coverage (owned-record boundary/enum/negative sweep)", () => {
  test.skip(!RUN_MUTATING, "RUN_MUTATING not set — this workflow creates real records.");

  test("Yard — PUT /api/v1/yard/edit field sweep", async ({ request }) => {
    const uniqueName = `QA-AUTOMATION-FIELDSWEEP-YARD-${Date.now()}`;
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
              address: "QA automation field-sweep address",
              spocName: "QA Automation",
              spocNum: "9999999999",
              active: "active",
            },
          },
        });
        expect(status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.data?._id).toBeTruthy();
        createdYardId = json.data._id;
      });

      await test.step("2. FIELD SWEEP — PUT /api/v1/yard/edit", async () => {
        await sweepFields(request, "PUT /api/v1/yard/edit", {
          yardDetails: { yardId: createdYardId, address: "QA automation field-sweep address (post-sweep)" },
        });
      });
    } finally {
      if (createdYardId) {
        await test.step("3. SOFT-DELETE — PUT /api/v1/yard/edit sets active=depricated (cleanup)", async () => {
          const { status } = await callEndpoint(request, byId("PUT /api/v1/yard/edit"), {
            body: { yardDetails: { yardId: createdYardId, active: "depricated" } },
          });
          expect(status).toBe(200);
        });

        await test.step("4. VERIFY CLEANUP", async () => {
          const { json } = await callEndpoint(request, byId("GET /api/v1/yard"), {
            queryParams: { search: uniqueName },
          });
          const match = (json.data as any[]).find((y) => y._id === createdYardId);
          expect(match, "Soft-deleted yard should not appear in the default active-only listing").toBeFalsy();
        });
      }
    }
  });

  test("Insurer — PATCH /api/v1/insurer field sweep", async ({ request }) => {
    test.skip(!config.adminEmail, "ADMIN_EMAIL not configured — Insurer endpoints require AuthToken");
    const uniqueName = `QA-AUTOMATION-FIELDSWEEP-INSURER-${Date.now()}`;
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

      await test.step("2. FIELD SWEEP — PATCH /api/v1/insurer", async () => {
        await sweepFields(request, "PATCH /api/v1/insurer", { id: createdId, name: uniqueName, activeStatus: true });
      });
    } finally {
      if (createdId) {
        await test.step("3. SOFT-DELETE — PATCH /api/v1/insurer sets activeStatus=false (cleanup)", async () => {
          const { status } = await callEndpoint(request, byId("PATCH /api/v1/insurer"), {
            body: { id: createdId, activeStatus: false },
          });
          expect(status).toBe(200);
        });

        await test.step("4. VERIFY CLEANUP", async () => {
          const { json } = await callEndpoint(request, byId("GET /api/v1/insurer"), {
            queryParams: { search: uniqueName, activeStatus: "ACTIVE" },
          });
          const match = (json.data as any[]).find((i) => i._id === createdId);
          expect(match, "Soft-deleted insurer should not appear in the activeStatus=ACTIVE listing").toBeFalsy();
        });
      }
    }
  });

  test("Bank — PUT /api/v1/bank field sweep", async ({ request }) => {
    const uniqueName = `QA-AUTOMATION-FIELDSWEEP-BANK-${Date.now()}`;
    let createdId: string | undefined;

    try {
      await test.step("1. CREATE — POST /api/v1/bank", async () => {
        const { status, json } = await callEndpoint(request, byId("POST /api/v1/bank"), {
          body: { banks: [{ bankName: uniqueName }] },
        });
        expect(status).toBe(200);
        expect(json.status).toBe(true);
        expect(json.data?.[0]?._id).toBeTruthy();
        createdId = json.data[0]._id;
      });

      await test.step("2. FIELD SWEEP — PUT /api/v1/bank", async () => {
        await sweepFields(request, "PUT /api/v1/bank", { id: createdId, bankName: uniqueName, activeStatus: true });
      });
    } finally {
      if (createdId) {
        await test.step("3. SOFT-DELETE — PUT /api/v1/bank sets activeStatus=false (cleanup)", async () => {
          const { status } = await callEndpoint(request, byId("PUT /api/v1/bank"), {
            body: { id: createdId, activeStatus: false },
          });
          expect(status).toBe(200);
        });

        await test.step("4. VERIFY CLEANUP", async () => {
          const { json } = await callEndpoint(request, byId("GET /api/v1/bank"), {
            queryParams: { search: uniqueName },
          });
          const match = (json.data as any[]).find((b) => b._id === createdId);
          expect(match, "Soft-deleted bank should not appear in the default active-only listing").toBeFalsy();
        });
      }
    }
  });

  test("States — PATCH /api/v1/states/add-states field sweep", async ({ request }) => {
    const FAKE_STATE_ID = 900_000_000 + (Date.now() % 90_000_000);
    const uniqueName = `QA-AUTOMATION-FIELDSWEEP-STATE-${Date.now()}`;
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

      await test.step("2. FIELD SWEEP — PATCH /api/v1/states/add-states", async () => {
        await sweepFields(request, "PATCH /api/v1/states/add-states", {
          id: createdId,
          data: { active: true, gstNumber: "27AAACX9999D1Z5" },
        });
      });
    } finally {
      if (createdId) {
        await test.step("3. SOFT-DELETE — PATCH /api/v1/states/add-states sets active=false (cleanup)", async () => {
          const { status } = await callEndpoint(request, byId("PATCH /api/v1/states/add-states"), {
            body: { id: createdId, data: { active: false, gstNumber: "27AAACX9999D1Z5" } },
          });
          expect(status).toBe(200);
        });

        await test.step("4. VERIFY CLEANUP", async () => {
          const { json } = await callEndpoint(request, byId("GET /api/v1/states/active-state"), {});
          const match = (json.data as any[]).find((s) => s._id === createdId);
          expect(match, "Record should still exist (soft-delete, not hard-delete)").toBeTruthy();
          expect(match.active, "active should be false after soft-delete").toBe(false);
        });
      }
    }
  });

  test("MasterData — PUT /api/v1/dashboard/master-data field sweep", async ({ request }) => {
    test.skip(!config.adminEmail, "ADMIN_EMAIL not configured — MasterData endpoints require AuthToken");
    const uniqueKey = `QA_AUTOMATION_FIELDSWEEP_KEY_${Date.now()}`;
    let createdKey: string | undefined;

    try {
      await test.step("1. CREATE — PUT /api/v1/dashboard/master-data", async () => {
        const { status, json } = await callEndpoint(request, byId("PUT /api/v1/dashboard/master-data"), {
          body: { key: uniqueKey, valueType: "string", value: "qa-automation-fieldsweep-value", isActive: true },
        });
        if (status === 403) {
          test.skip(true, "ADMIN_EMAIL account is not SUPER_ADMIN/ADMIN and not on this endpoint's allow-list");
        }
        expect(status).toBe(200);
        expect(json.success).toBe(true);
        createdKey = uniqueKey;
      });

      await test.step("2. FIELD SWEEP — PUT /api/v1/dashboard/master-data", async () => {
        await sweepFields(request, "PUT /api/v1/dashboard/master-data", {
          key: createdKey,
          valueType: "string",
          value: "qa-automation-fieldsweep-value",
          isActive: true,
        });
      });
    } finally {
      if (createdKey) {
        await test.step("3. SOFT-DELETE — PUT sets isActive=false, valueType restored (cleanup)", async () => {
          const { status } = await callEndpoint(request, byId("PUT /api/v1/dashboard/master-data"), {
            body: { key: createdKey, valueType: "string", value: "qa-automation-fieldsweep-value", isActive: false },
          });
          expect(status).toBe(200);
        });

        await test.step("4. VERIFY CLEANUP", async () => {
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
