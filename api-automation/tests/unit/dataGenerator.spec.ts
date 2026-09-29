// tests/unit/dataGenerator.spec.ts
//
// Unit tests for src/core/dataGenerator.js — pure functions, no HTTP.
// Covers both "safe synthetic values" (Steps 2-4 of the value-generation
// priority) and the end-to-end regression test for the Stage 3B finding:
// validValueFor/minimalValidObjectFor must NEVER return the exact unsafe
// example values discovered in Insurer/Bank/MasterData, including through
// nested objects and arrays.

import { test, expect } from "@playwright/test";
import { validValueFor, validObjectFor, minimalValidObjectFor, resetExampleStats, getExampleStats } from "../../src/core/dataGenerator.js";

test.describe("@unit dataGenerator — safe synthetic values by type/format", () => {
  test("generic string (no example, no format)", () => {
    const v = validValueFor({ type: "string" }, "description");
    expect(typeof v).toBe("string");
    expect(v.length).toBeGreaterThan(0);
  });

  test("number respects minimum/maximum", () => {
    const v = validValueFor({ type: "number", minimum: 10, maximum: 20 }, "amount");
    expect(v).toBeGreaterThanOrEqual(10);
    expect(v).toBeLessThanOrEqual(20);
  });

  test("boolean", () => {
    expect(typeof validValueFor({ type: "boolean" }, "isActive")).toBe("boolean");
  });

  test("email format produces a synthetic, never-real address", () => {
    const v = validValueFor({ type: "string", format: "email" }, "email");
    expect(v).toMatch(/^qa\.automation\.\d+@example\.com$/);
  });

  test("date format", () => {
    const v = validValueFor({ type: "string", format: "date" }, "dob");
    expect(v).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("date-time format", () => {
    const v = validValueFor({ type: "string", format: "date-time" }, "createdAt");
    expect(() => new Date(v).toISOString()).not.toThrow();
  });

  test("uuid format produces a well-formed v4-shaped UUID", () => {
    const v = validValueFor({ type: "string", format: "uuid" }, "traceId");
    expect(v).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test("enum returns a declared enum value, not a synthetic string", () => {
    const v = validValueFor({ type: "string", enum: ["ACTIVE", "INACTIVE"] }, "status");
    expect(["ACTIVE", "INACTIVE"]).toContain(v);
  });

  test("identity-shaped field (no example) gets a self-identifying QA-AUTOMATION- synthetic value", () => {
    const v = validValueFor({ type: "string" }, "accessoryName");
    expect(v).toMatch(/^QA-AUTOMATION-/);
  });
});

test.describe("@unit dataGenerator — regression: the exact Stage 3B unsafe examples are never reused", () => {
  test("Insurer POST — name never resolves to the real example \"HDFC Ergo\"", () => {
    const schema = { type: "object", required: ["name"], properties: { name: { type: "string", example: "HDFC Ergo" } } };
    for (let i = 0; i < 5; i++) {
      expect((minimalValidObjectFor(schema) as any).name).not.toBe("HDFC Ergo");
    }
  });

  test("Bank POST — bankName (nested inside an array item) never resolves to \"HDFC Bank\"", () => {
    const schema = {
      type: "object",
      required: ["banks"],
      properties: {
        banks: { type: "array", items: { type: "object", properties: { bankName: { type: "string", example: "HDFC Bank" } } } },
      },
    };
    const built = minimalValidObjectFor(schema) as any;
    expect(built.banks[0].bankName).not.toBe("HDFC Bank");
  });

  test("MasterData PUT — key never resolves to the real live config key \"MAX_BOOKING_DAYS\"", () => {
    const schema = {
      type: "object",
      required: ["key", "valueType"],
      properties: {
        key: { type: "string", example: "MAX_BOOKING_DAYS" },
        valueType: { type: "string", enum: ["number", "string"] },
      },
    };
    expect((minimalValidObjectFor(schema) as any).key).not.toBe("MAX_BOOKING_DAYS");
  });

  test("a clearly-synthetic example (contains QA/TEST) IS still reused, per priority 1 override", () => {
    const schema = { type: "object", required: ["label"], properties: { label: { type: "string", example: "QA-TEST-LABEL" } } };
    expect((minimalValidObjectFor(schema) as any).label).toBe("QA-TEST-LABEL");
  });
});

test.describe("@unit dataGenerator — nested objects and arrays never leak an unsafe example", () => {
  test("recursive nested object generation avoids an unsafe example several levels deep", () => {
    const schema = {
      type: "object",
      properties: {
        level1: {
          type: "object",
          properties: {
            level2: {
              type: "object",
              properties: { insurerName: { type: "string", example: "HDFC Ergo" } },
            },
          },
        },
      },
    };
    const built = validObjectFor(schema) as any;
    expect(built.level1.level2.insurerName).not.toBe("HDFC Ergo");
  });

  test("array item generation avoids an unsafe example for every generated item", () => {
    const schema = {
      type: "array",
      minItems: 3,
      items: { type: "object", properties: { bankName: { type: "string", example: "HDFC Bank" } } },
    };
    const built = validValueFor(schema, "banks");
    expect(built.length).toBeGreaterThanOrEqual(3);
    for (const item of built) expect(item.bankName).not.toBe("HDFC Bank");
  });
});

test.describe("@unit dataGenerator — example-safety stats (reports/generator-safety-report.md evidence source)", () => {
  test("inspected/reused/rejected counters track real vs synthetic decisions", () => {
    resetExampleStats();
    validValueFor({ type: "string", example: "HDFC Ergo" }, "name"); // rejected
    validValueFor({ type: "string", example: "Near NH-8, Jaipur" }, "address"); // reused (benign)
    const stats = getExampleStats();
    expect(stats.inspected).toBe(2);
    expect(stats.reused).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.rejections[0].fieldName).toBe("name");
  });
});
