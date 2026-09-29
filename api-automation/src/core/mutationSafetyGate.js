// src/core/mutationSafetyGate.js
//
// Defense-in-depth gate, independent of dataGenerator.js's own priority
// fix: given a schema and a fully-built payload, verify no field's value
// is byte-identical to a schema `example` that `isPotentiallyRealWorldExample`
// would flag unsafe. This should never actually trigger post-fix (the
// generator no longer returns rejected examples) — it exists so a future
// change to the generator, or a payload built by some OTHER path, can't
// silently regress this without a test/assertion catching it.
//
// Used by the generic mutating suites as a pre-flight check: if this comes
// back unsafe, the test SKIPs with a clear reason rather than firing the
// request.

import { flattenFields } from "./schemaUtils.js";
import { isPotentiallyRealWorldExample } from "./exampleSafety.js";

function getAtPath(obj, dotPath) {
  const segments = dotPath.split(".");
  let node = obj;
  for (const seg of segments) {
    if (node == null) return undefined;
    const isArraySeg = seg.endsWith("[]");
    const key = seg.replace("[]", "");
    node = isArraySeg ? node[key]?.[0] : node[key];
  }
  return node;
}

/**
 * @param {any} schema - the request-body schema the payload was built from
 * @param {any} payload - the fully-built payload about to be sent
 * @returns {{ safe: boolean, violations: Array<{ path: string, value: unknown, reasons: string[] }> }}
 */
export function assessGeneratedPayloadSafety(schema, payload) {
  const violations = [];
  if (!schema || payload == null) return { safe: true, violations };

  for (const field of flattenFields(schema)) {
    const example = field.schema?.example;
    if (example === undefined) continue;
    if (Array.isArray(field.schema?.enum) && field.schema.enum.length) continue; // enum values are always contract-safe

    const actual = getAtPath(payload, field.path);
    if (actual === undefined || actual !== example) continue; // generator already replaced it, or field wasn't set

    const verdict = isPotentiallyRealWorldExample(example, field.path.split(".").pop(), field.schema);
    if (verdict.unsafe) {
      violations.push({ path: field.path, value: example, reasons: verdict.reasons });
    }
  }

  return { safe: violations.length === 0, violations };
}
