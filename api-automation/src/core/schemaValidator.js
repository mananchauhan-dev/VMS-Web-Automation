// src/core/schemaValidator.js
//
// Contract validation: compiles the (already $ref-resolved, via specLoader's
// deref) JSON Schema for a documented response and validates a live response
// body against it. Powers tests/contract/*.

import Ajv from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const compiledCache = new Map();

/**
 * @param {object} schema - JSON Schema fragment from EndpointDescriptor.responses[status].schema
 * @param {unknown} body - parsed response JSON
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAgainstSchema(schema, body) {
  if (!schema) return { valid: true, errors: [] }; // nothing documented to validate against
  const cacheKey = JSON.stringify(schema);
  let validateFn = compiledCache.get(cacheKey);
  if (!validateFn) {
    validateFn = ajv.compile(schema);
    compiledCache.set(cacheKey, validateFn);
  }
  const valid = validateFn(body);
  const errors = (validateFn.errors || []).map(
    (e) => `${e.instancePath || "(root)"} ${e.message} (${JSON.stringify(e.params)})`
  );
  return { valid, errors };
}
