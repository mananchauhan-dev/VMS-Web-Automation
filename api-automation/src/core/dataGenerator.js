// src/core/dataGenerator.js
//
// Synthesizes request values from a JSON Schema fragment (as extracted by
// specLoader). Used for:
//   - VALID values (positive tests)
//   - INVALID variants (negative tests): wrong type, below/above boundary,
//     too short/long, invalid enum, empty, null
//
// VALUE-GENERATION PRIORITY (fixed after a Stage 3B finding — see
// exampleSafety.js header for the concrete real-world examples that
// triggered this):
//   1. Explicit test-safe override — handled OUTSIDE this module, by the
//      hand-chained workflows (yard/insurer/bank/states/masterdata CRUD),
//      which pass their own unique QA-AUTOMATION-<timestamp> value directly
//      and never call into this generator for their identity field.
//   2. Enum — a hard schema constraint, always wins when present (moved
//      ahead of `example`, which used to be checked first — a latent
//      ordering bug: a field with both `enum` and `example` could pick a
//      value never validated against the enum list).
//   3. OpenAPI `example` — ONLY when `isPotentiallyRealWorldExample()`
//      clears it. `example != automatically safe test value`.
//   4. Format-aware synthetic (date/date-time/email/uri/uuid).
//   5. Generic type-based synthetic (faker), as the final fallback.

import { faker } from "@faker-js/faker";
import { isPotentiallyRealWorldExample } from "./exampleSafety.js";

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---- example-safety stats, for reports/generator-safety-report.md --------
let exampleStats = { inspected: 0, reused: 0, rejected: 0, rejections: [] };

/** Reset the module-level example-safety tally — call before a fresh dry-run scan (e.g. the safety-report generator). */
export function resetExampleStats() {
  exampleStats = { inspected: 0, reused: 0, rejected: 0, rejections: [] };
}

/** @returns {{ inspected: number, reused: number, rejected: number, rejections: Array<{ fieldName: string, value: unknown, reasons: string[] }> }} */
export function getExampleStats() {
  return exampleStats;
}

/** A short, self-identifying synthetic value for identity/label-shaped fields — traceable and never colliding with real data. */
function syntheticIdentityValue(fieldNameHint) {
  return `QA-AUTOMATION-${(fieldNameHint || "FIELD").toUpperCase().replace(/[^A-Z0-9]/g, "_")}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const IDENTITY_FIELD_RE = /(^|[a-z0-9])(name|title|label|key|code)$/i;

/** Produce a single VALID value satisfying the given schema fragment. */
export function validValueFor(schema, fieldNameHint = "") {
  if (!schema) return faker.lorem.word();

  // Priority 2 — enum is a hard constraint, always wins.
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];

  if (Array.isArray(schema.oneOf) && schema.oneOf.length) {
    return validValueFor(schema.oneOf[0], fieldNameHint);
  }

  // Priority 3 — OpenAPI example, gated by the safety classifier.
  if (schema.example !== undefined) {
    exampleStats.inspected += 1;
    const verdict = isPotentiallyRealWorldExample(schema.example, fieldNameHint, schema);
    if (!verdict.unsafe) {
      exampleStats.reused += 1;
      return schema.example;
    }
    exampleStats.rejected += 1;
    exampleStats.rejections.push({ fieldName: fieldNameHint, value: schema.example, reasons: verdict.reasons });
    // Fall through to synthetic generation below — do NOT return the example.
  }

  if (schema.default !== undefined) return schema.default;

  switch (schema.type) {
    case "string": {
      // Priority 4 — format-aware synthetic.
      if (schema.format === "date-time") return new Date().toISOString();
      if (schema.format === "date") return new Date().toISOString().slice(0, 10);
      if (schema.format === "email") return `qa.automation.${Date.now()}@example.com`;
      if (schema.format === "uuid") return "00000000-0000-4000-8000-000000000000".replace(/0(?=[^-]*$)/g, () => Math.floor(Math.random() * 10));
      if (schema.format === "uri" || schema.format === "binary") return "https://cdn.example.com/qa-automation-test-asset.jpg";

      // Priority 5 — generic type-based synthetic, self-identifying for identity-shaped fields.
      if (IDENTITY_FIELD_RE.test(fieldNameHint || "")) return syntheticIdentityValue(fieldNameHint);

      const min = schema.minLength ?? 1;
      const max = schema.maxLength ?? Math.max(min, 12);
      let value = faker.lorem.words(2).replace(/\s+/g, "-");
      while (value.length < min) value += "x";
      return value.slice(0, max);
    }
    case "integer":
    case "number": {
      const min = schema.minimum ?? 1;
      const max = schema.maximum ?? Math.max(min + 100, 100);
      const value = faker.number.int({ min, max: Math.max(min, max) });
      return schema.type === "number" ? value : Math.trunc(value);
    }
    case "boolean":
      return true;
    case "array": {
      const item = validValueFor(schema.items, fieldNameHint);
      const min = schema.minItems ?? 1;
      return Array.from({ length: Math.max(min, 1) }, () => item);
    }
    case "object":
      return validObjectFor(schema);
    default:
      return faker.lorem.word();
  }
}

/** Build a full valid object for a `type: object` schema, filling every declared property. */
export function validObjectFor(schema) {
  if (!schema || schema.type !== "object" || !schema.properties) return {};
  const out = {};
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    out[key] = validValueFor(propSchema, key);
  }
  return out;
}

/** Build a MINIMAL valid object: only the fields listed in `required`. */
export function minimalValidObjectFor(schema) {
  if (!schema || schema.type !== "object" || !schema.properties) return {};
  const required = schema.required || [];
  const out = {};
  for (const key of required) {
    if (schema.properties[key]) out[key] = validValueFor(schema.properties[key], key);
  }
  return out;
}

/**
 * THE schema-driven boundary/negative-value engine (Step 14 of the brief).
 * Dynamically inspects: type, format, enum, minimum, maximum,
 * exclusiveMinimum, exclusiveMaximum, minLength, maxLength, pattern,
 * multipleOf, nullable — and generates every case that's actually
 * APPLICABLE to the given schema fragment. Nothing here is keyed off field
 * or module names, so it works unchanged when the spec changes.
 *
 * Every case is tagged with a `category` from the taxonomy the brief
 * specifies (MISSING is handled by callers, since it means "omit the key
 * entirely" — not expressible as a *value*):
 *   VALID_ENUM, INVALID_ENUM, VALID_BOUNDARY, BELOW_MINIMUM, ABOVE_MAXIMUM,
 *   WRONG_TYPE, INVALID_PATTERN, INVALID_FORMAT, EMPTY, NULL
 *
 * @param {any} schema
 * @param {{ includeGenericNegatives?: boolean }} [opts]
 *   includeGenericNegatives=false restricts output to constraint-DRIVEN
 *   cases only (enum/boundary/pattern/format) and omits the always-
 *   applicable-but-low-signal WRONG_TYPE/EMPTY/NULL cases — used for
 *   optional, unconstrained body fields so the generated suite doesn't
 *   explode across all ~1268 body fields (Step 35). Required fields and all
 *   query/path parameters use the default (true).
 * @returns {Array<{ category: string, label: string, value: unknown }>}
 */
export function parameterCasesFor(schema, opts = {}) {
  if (!schema) return [];
  const includeGeneric = opts.includeGenericNegatives !== false;
  const cases = [];

  // ---- enum: every valid value individually, plus one invalid ----------
  if (Array.isArray(schema.enum) && schema.enum.length) {
    for (const v of schema.enum) {
      cases.push({ category: "VALID_ENUM", label: `enum value "${v}"`, value: v });
    }
    cases.push({ category: "INVALID_ENUM", label: "invalid enum value", value: "__NOT_A_VALID_ENUM_VALUE__" });
  }

  // ---- numeric boundaries -------------------------------------------
  if (schema.type === "integer" || schema.type === "number") {
    if (typeof schema.minimum === "number") {
      cases.push({ category: "VALID_BOUNDARY", label: `at minimum (${schema.minimum})`, value: schema.minimum });
      cases.push({
        category: "BELOW_MINIMUM",
        label: `below minimum (${schema.minimum - 1})`,
        value: schema.minimum - 1,
      });
    }
    if (typeof schema.exclusiveMinimum === "number") {
      cases.push({
        category: "BELOW_MINIMUM",
        label: `at exclusiveMinimum (${schema.exclusiveMinimum}, must be > it)`,
        value: schema.exclusiveMinimum,
      });
      cases.push({
        category: "VALID_BOUNDARY",
        label: `just above exclusiveMinimum (${schema.exclusiveMinimum + 1})`,
        value: schema.exclusiveMinimum + 1,
      });
    }
    if (typeof schema.maximum === "number") {
      cases.push({ category: "VALID_BOUNDARY", label: `at maximum (${schema.maximum})`, value: schema.maximum });
      cases.push({
        category: "ABOVE_MAXIMUM",
        label: `above maximum (${schema.maximum + 1})`,
        value: schema.maximum + 1,
      });
    }
    if (typeof schema.exclusiveMaximum === "number") {
      cases.push({
        category: "ABOVE_MAXIMUM",
        label: `at exclusiveMaximum (${schema.exclusiveMaximum}, must be < it)`,
        value: schema.exclusiveMaximum,
      });
      cases.push({
        category: "VALID_BOUNDARY",
        label: `just below exclusiveMaximum (${schema.exclusiveMaximum - 1})`,
        value: schema.exclusiveMaximum - 1,
      });
    }
    if (typeof schema.multipleOf === "number" && schema.multipleOf > 0) {
      cases.push({
        category: "VALID_BOUNDARY",
        label: `multiple of ${schema.multipleOf}`,
        value: schema.multipleOf * 2,
      });
      cases.push({
        category: "INVALID_FORMAT",
        label: `not a multiple of ${schema.multipleOf}`,
        value: schema.multipleOf * 2 + 1,
      });
    }
    if (includeGeneric) {
      cases.push({ category: "WRONG_TYPE", label: "string instead of number", value: "not-a-number" });
      cases.push({ category: "WRONG_TYPE", label: "boolean instead of number", value: false });
      if (schema.type === "integer") {
        cases.push({ category: "WRONG_TYPE", label: "decimal instead of integer", value: 1.5 });
      }
    }
  }

  // ---- string boundaries/format/pattern -------------------------------
  if (schema.type === "string") {
    if (typeof schema.minLength === "number" && schema.minLength > 0) {
      cases.push({
        category: "VALID_BOUNDARY",
        label: `at minLength (${schema.minLength})`,
        value: "a".repeat(schema.minLength),
      });
      cases.push({
        category: "BELOW_MINIMUM",
        label: `below minLength (${schema.minLength - 1} chars)`,
        value: "a".repeat(Math.max(0, schema.minLength - 1)),
      });
    }
    if (typeof schema.maxLength === "number") {
      cases.push({
        category: "VALID_BOUNDARY",
        label: `at maxLength (${schema.maxLength})`,
        value: "a".repeat(schema.maxLength),
      });
      cases.push({
        category: "ABOVE_MAXIMUM",
        label: `above maxLength (${schema.maxLength + 1} chars)`,
        value: "a".repeat(schema.maxLength + 1),
      });
    }
    if (schema.pattern) {
      cases.push({ category: "INVALID_PATTERN", label: `violates pattern ${schema.pattern}`, value: "###INVALID###" });
    }
    if (schema.format === "date" || schema.format === "date-time") {
      cases.push({ category: "INVALID_FORMAT", label: `invalid ${schema.format}`, value: "not-a-date" });
    }
    if (schema.format === "email") {
      cases.push({ category: "INVALID_FORMAT", label: "invalid email", value: "not-an-email" });
    }
    if (includeGeneric) {
      cases.push({ category: "WRONG_TYPE", label: "number instead of string", value: 12345 });
      cases.push({ category: "WRONG_TYPE", label: "array instead of string", value: ["x"] });
    }
  }

  if (schema.type === "boolean" && includeGeneric) {
    cases.push({ category: "WRONG_TYPE", label: "string instead of boolean", value: "not-a-boolean" });
    cases.push({ category: "WRONG_TYPE", label: "number instead of boolean", value: 1 });
  }

  if (schema.type === "array" && includeGeneric) {
    cases.push({ category: "WRONG_TYPE", label: "object instead of array", value: { not: "an array" } });
    cases.push({ category: "EMPTY", label: "empty array", value: [] });
    if (typeof schema.minItems === "number" && schema.minItems > 0) {
      cases.push({ category: "BELOW_MINIMUM", label: `below minItems (${schema.minItems - 1})`, value: [] });
    }
    if (typeof schema.maxItems === "number") {
      const item = validValueFor(schema.items);
      cases.push({
        category: "ABOVE_MAXIMUM",
        label: `above maxItems (${schema.maxItems + 1})`,
        value: Array.from({ length: schema.maxItems + 1 }, () => item),
      });
    }
  }

  if (includeGeneric) {
    cases.push({ category: "EMPTY", label: "empty string", value: "" });
    cases.push({ category: "NULL", label: "null value", value: null });
  }

  return cases;
}

export { faker };
