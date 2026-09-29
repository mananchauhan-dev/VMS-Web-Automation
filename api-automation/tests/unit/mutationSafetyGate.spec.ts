// tests/unit/mutationSafetyGate.spec.ts
//
// Unit tests for src/core/mutationSafetyGate.js — the pre-flight check the
// generic mutating suites run before firing a request. This is the
// defense-in-depth layer: even if dataGenerator.js's own fix were somehow
// bypassed, this gate independently re-checks the FINAL built payload
// against the schema's examples.

import { test, expect } from "@playwright/test";
import { assessGeneratedPayloadSafety } from "../../src/core/mutationSafetyGate.js";

test.describe("@unit mutationSafetyGate", () => {
  test("flags a payload that still carries the raw unsafe example verbatim", () => {
    const schema = { type: "object", properties: { name: { type: "string", example: "HDFC Ergo" } } };
    const payload = { name: "HDFC Ergo" }; // simulates a regression — generator bypassed
    const result = assessGeneratedPayloadSafety(schema, payload);
    expect(result.safe).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].path).toBe("name");
  });

  test("passes a payload where the field was correctly replaced with a synthetic value", () => {
    const schema = { type: "object", properties: { name: { type: "string", example: "HDFC Ergo" } } };
    const payload = { name: "QA-AUTOMATION-NAME-12345" };
    expect(assessGeneratedPayloadSafety(schema, payload).safe).toBe(true);
  });

  test("does not flag enum fields even if the payload value equals the example", () => {
    const schema = { type: "object", properties: { status: { type: "string", enum: ["ACTIVE"], example: "ACTIVE" } } };
    const payload = { status: "ACTIVE" };
    expect(assessGeneratedPayloadSafety(schema, payload).safe).toBe(true);
  });

  test("checks nested and array-item fields via dot-path, not just top-level", () => {
    const schema = {
      type: "object",
      properties: {
        banks: { type: "array", items: { type: "object", properties: { bankName: { type: "string", example: "HDFC Bank" } } } },
      },
    };
    const unsafePayload = { banks: [{ bankName: "HDFC Bank" }] };
    const safePayload = { banks: [{ bankName: "QA-AUTOMATION-BANK-12345" }] };
    expect(assessGeneratedPayloadSafety(schema, unsafePayload).safe).toBe(false);
    expect(assessGeneratedPayloadSafety(schema, safePayload).safe).toBe(true);
  });

  test("a benign example that was legitimately reused (not identity-shaped) is not flagged", () => {
    const schema = { type: "object", properties: { address: { type: "string", example: "Near NH-8, Jaipur" } } };
    const payload = { address: "Near NH-8, Jaipur" };
    expect(assessGeneratedPayloadSafety(schema, payload).safe).toBe(true);
  });

  test("no schema or no payload is trivially safe (nothing to check)", () => {
    expect(assessGeneratedPayloadSafety(null, { a: 1 }).safe).toBe(true);
    expect(assessGeneratedPayloadSafety({ type: "object", properties: {} }, null).safe).toBe(true);
  });
});
