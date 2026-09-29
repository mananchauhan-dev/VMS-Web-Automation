// src/core/testValueHelpers.js
//
// Shared "what value do I put in this path/query param" fallback used by
// every generated test file. Extracted once several suites started
// duplicating it (smoke, regression, negative, parameters).

import { validValueFor } from "./dataGenerator.js";

export const FALLBACK_OBJECT_ID = "64f1a2b3c4d5e6f7a8b9c0d1";
/** A syntactically-valid-looking id that (almost certainly) matches no real record — for NON_EXISTING_ID cases. */
export const NON_EXISTING_OBJECT_ID = "000000000000000000000000";

/**
 * Resolve a concrete value for a path/query parameter: prefer the spec's own
 * example, then an id-shaped fallback for *Id-named params, then a
 * schema-driven synthesized value.
 * @param {string} name
 * @param {any} schema
 */
export function fallbackValue(name, schema) {
  if (schema?.example !== undefined) return schema.example;
  if (/id$/i.test(name)) return FALLBACK_OBJECT_ID;
  return validValueFor(schema, name);
}
