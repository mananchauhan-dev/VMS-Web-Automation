// tests/business-rules/business-rules.spec.ts
//
// Per Step 24: business rules are only automated here when they are
// CONFIRMABLE from the spec itself (descriptions, schema constraints,
// documented enums) — never invented. Each block below is either a real,
// spec-derived assertion, or an explicit TODO naming exactly what's needed
// to confirm it.
//
// This file is intentionally short. The spec documents very few numeric
// thresholds, pricing formulas, or approval rules as machine-checkable
// constraints — most "business rules" referenced in descriptions (pricing,
// approval limits, ageing buckets) are described in prose without the
// concrete numbers/formulas needed to assert against, e.g.:
//   "Task ageing counts (0-3, 4-7, 8-15, 16-30, 31-45, 46+ days)" — bucket
//   *boundaries* are documented (confirmed below); the *classification
//   logic* that assigns a given task to a bucket is not (TODO).

import { test, expect } from "@playwright/test";
import { buildInventory } from "../../src/core/specLoader.js";
import { callEndpoint } from "../../src/core/apiClient.js";
import { config } from "../../src/config/env.js";

const inventory = buildInventory();
const byId = (id: string) => inventory.find((e) => e.id === id)!;

test.describe("@business Spec-confirmed business rules", () => {
  test("VMT OTP verification: spec documents the static value \"12345\" always passes in non-production", async ({
    request,
  }) => {
    if (!config.vmtMobile) test.skip(true, "VMT_TEST_MOBILE not configured");
    const ep = byId("POST /api/v1/vmt/verify-otp");
    const { status, json } = await callEndpoint(request, ep, {
      body: { mobile: config.vmtMobile, otp: "12345" },
    });
    expect(status).toBe(200);
    expect(json.data?.success).toBe(true);
  });

  test("VMT OTP verification: a non-static OTP is rejected (contract: \"Otp expired\" on failure branch)", async ({
    request,
  }) => {
    if (!config.vmtMobile) test.skip(true, "VMT_TEST_MOBILE not configured");
    const ep = byId("POST /api/v1/vmt/verify-otp");
    const { status, json } = await callEndpoint(request, ep, {
      body: { mobile: config.vmtMobile, otp: "00000" },
    });
    expect(status).toBe(200); // spec: 200 either way, success flag distinguishes
    expect(json.data?.success).toBe(false);
  });

  test("Task ageing buckets: role-wise-dashboard groups tasks into the 6 documented buckets", async ({ request }) => {
    if (!config.adminEmail) test.skip(true, "ADMIN_EMAIL not configured");
    const ep = byId("GET /api/v1/tasks/role-wise-dashboard");
    const { status, json } = await callEndpoint(request, ep, {});
    expect(status).toBe(200);
    for (const role of json.data ?? []) {
      const buckets = Object.keys(role.totalAgeing || {});
      // Spec-documented bucket set, verbatim from the schema.
      expect(buckets.sort()).toEqual(["0-3", "16-30", "31-45", "4-7", "46+", "8-15"].sort());
    }
    // TODO: BUSINESS RULE CONFIRMATION REQUIRED — the spec documents the
    // bucket *labels* but not the day-count boundary logic (is "4-7"
    // inclusive of both ends? which timestamp field is the age computed
    // from?). Confirm against src/**/task*.controller.ts before asserting
    // that a task with a known age lands in the expected bucket.
  });
});

test.describe.skip("@business TODO: BUSINESS RULE CONFIRMATION REQUIRED", () => {
  // Referenced in the spec by description/name only, with no concrete
  // numbers or formula documented — confirm against backend source before
  // automating:
  //   - Pricing: PriceRequest approve/negotiate flow — no approval threshold
  //     documented (who can approve what price delta).
  //   - Charges: RTO_CHARGES / INSURANCE_CHARGES FLAT vs PERCENTAGE
  //     calculationType — formula for PERCENTAGE (of what base amount?) not
  //     documented.
  //   - Payment reconciliation ageing buckets (0-3 / 4-7 / >7 days) in
  //     leads/payment-dashboard — same boundary-inclusivity gap as tasks.
  //   - Booking cancellation / loan-drop eligibility rules
  //     (canCancelBooking / canDropLoan toggled by reverse-booking-delivery)
  //     — the triggering conditions aren't enumerated in the spec.
  //   - Duplicate-booking phone-number limit in
  //     does-customer-exists-and-valid/{phoneNumber} — references a
  //     "TOOGLE_SAME_PHONE_NUMBER_MULTIPLE_BOOKINGS_ON_OFF" permission limit
  //     whose actual configured value isn't in the spec.
});
