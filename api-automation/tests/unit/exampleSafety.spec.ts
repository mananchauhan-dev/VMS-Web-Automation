// tests/unit/exampleSafety.spec.ts
//
// Unit tests for src/core/exampleSafety.js — pure function, no HTTP, no
// RUN_MUTATING gate needed. These are the acceptance tests for the Stage 3C
// fix: "no generic mutation may blindly send a real-world OpenAPI example
// value to the staging API".

import { test, expect } from "@playwright/test";
import { isPotentiallyRealWorldExample } from "../../src/core/exampleSafety.js";

test.describe("@unit exampleSafety — unsafe examples (the Stage 3B findings, verbatim)", () => {
  test("insurer name example (\"HDFC Ergo\") is flagged unsafe", () => {
    const { unsafe, reasons } = isPotentiallyRealWorldExample("HDFC Ergo", "name", { type: "string", example: "HDFC Ergo" });
    expect(unsafe).toBe(true);
    expect(reasons.length).toBeGreaterThan(0);
  });

  test("bank name example (\"HDFC Bank\") is flagged unsafe", () => {
    const { unsafe } = isPotentiallyRealWorldExample("HDFC Bank", "bankName", { type: "string", example: "HDFC Bank" });
    expect(unsafe).toBe(true);
  });

  test("config key example (\"MAX_BOOKING_DAYS\") is flagged unsafe", () => {
    const { unsafe, reasons } = isPotentiallyRealWorldExample("MAX_BOOKING_DAYS", "key", { type: "string", example: "MAX_BOOKING_DAYS" });
    expect(unsafe).toBe(true);
    expect(reasons.some((r) => /config-key shape/.test(r))).toBe(true);
  });

  test("real-looking business-name example is flagged unsafe even off a generic field name", () => {
    // "Corporation"/"Ltd" etc are generic business-entity-type nouns (not a hardcoded company list).
    const { unsafe } = isPotentiallyRealWorldExample("Acme Finance Corporation", "label", { type: "string" });
    expect(unsafe).toBe(true);
  });

  test("real-looking email example (non-reserved domain) is flagged unsafe", () => {
    const { unsafe, reasons } = isPotentiallyRealWorldExample("ramesh.kumar@tractorjunction.com", "spocEmailAddress", {
      type: "string",
      format: "email",
    });
    expect(unsafe).toBe(true);
    expect(reasons.some((r) => /email domain/.test(r))).toBe(true);
  });

  test("real-looking phone example on a phone-shaped field is flagged unsafe", () => {
    const { unsafe } = isPotentiallyRealWorldExample("9123456780", "spocContactNumber", { type: "string" });
    expect(unsafe).toBe(true);
  });

  test("real-looking identifier (state code \"RJ\") on an identity field is flagged unsafe", () => {
    const { unsafe } = isPotentiallyRealWorldExample("RJ", "code", { type: "string" });
    expect(unsafe).toBe(true);
  });

  test("Indian GSTIN-shaped example (\"08AAACX1234C1Z1\") is flagged unsafe even on a non-identity field name", () => {
    const { unsafe, reasons } = isPotentiallyRealWorldExample("08AAACX1234C1Z1", "gstNumber", { type: "string" });
    expect(unsafe).toBe(true);
    expect(reasons.some((r) => /GSTIN/.test(r))).toBe(true);
  });
});

test.describe("@unit exampleSafety — safe examples", () => {
  test("a value explicitly marked synthetic (contains QA/TEST/AUTOMATION) is safe regardless of field name", () => {
    const { unsafe } = isPotentiallyRealWorldExample("QA-AUTOMATION-TEST-INSURER", "name", { type: "string" });
    expect(unsafe).toBe(false);
  });

  test("a well-known placeholder phone (9876543210 / all-zeros) is safe", () => {
    expect(isPotentiallyRealWorldExample("9876543210", "spocNum", { type: "string" }).unsafe).toBe(false);
    expect(isPotentiallyRealWorldExample("0000000000", "mobile", { type: "string" }).unsafe).toBe(false);
  });

  test("a reserved test-domain email is safe", () => {
    expect(isPotentiallyRealWorldExample("someone@example.com", "email", { type: "string", format: "email" }).unsafe).toBe(false);
    expect(isPotentiallyRealWorldExample("qa@test.invalid", "email", { type: "string", format: "email" }).unsafe).toBe(false);
  });

  test("a non-identity, non-pattern-matching generic string is safe", () => {
    expect(isPotentiallyRealWorldExample("Near NH-8, Jaipur", "address", { type: "string" }).unsafe).toBe(false);
  });

  test("non-string example values (number/boolean) are always safe — the risk this classifier targets is string identity data", () => {
    expect(isPotentiallyRealWorldExample(30, "maxBookingDays", { type: "number" }).unsafe).toBe(false);
    expect(isPotentiallyRealWorldExample(true, "isActive", { type: "boolean" }).unsafe).toBe(false);
  });

  test("enum-constrained values are always safe, never blocked, regardless of content", () => {
    const schema = { type: "string", enum: ["ACTIVE", "INACTIVE"], example: "ACTIVE" };
    expect(isPotentiallyRealWorldExample("ACTIVE", "status", schema).unsafe).toBe(false);
  });
});
