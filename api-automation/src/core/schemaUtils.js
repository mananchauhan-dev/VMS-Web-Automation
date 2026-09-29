// src/core/schemaUtils.js
//
// Recursively flattens a (already $ref-resolved) JSON Schema object into a
// list of field descriptors — dot-notation path, type, required-ness, enum
// values — used by the coverage report and the generated negative-field
// tests to enumerate literally every request-body field, including nested
// objects and array-of-object items.

/**
 * @param {object} schema
 * @param {string} [prefix]
 * @returns {Array<{ path: string, type: string, required: boolean, enum?: any[], schema: object }>}
 */
export function flattenFields(schema, prefix = "") {
  if (!schema || typeof schema !== "object") return [];
  const out = [];

  if (schema.type === "object" && schema.properties) {
    const required = new Set(schema.required || []);
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      out.push({
        path: fieldPath,
        type: propSchema.type || (propSchema.oneOf ? "oneOf" : "unknown"),
        required: required.has(key),
        enum: propSchema.enum,
        schema: propSchema,
      });
      out.push(...flattenFields(propSchema, fieldPath));
    }
  } else if (schema.type === "array" && schema.items) {
    out.push(...flattenFields(schema.items, `${prefix}[]`));
  } else if (Array.isArray(schema.oneOf)) {
    for (const sub of schema.oneOf) out.push(...flattenFields(sub, prefix));
  }

  return out;
}

/** Total count of distinct enum values documented across a schema tree (for coverage stats). */
export function countEnumValues(schema) {
  return flattenFields(schema).reduce((sum, f) => sum + (f.enum?.length || 0), 0);
}

/**
 * Only the "leaf" scalar fields (string/integer/number/boolean) from
 * flattenFields — i.e. fields a value can actually be assigned to, as
 * opposed to the `object`/`array` container entries flattenFields also
 * emits for structure. Used by the generated per-field value tests, which
 * operate on scalars only.
 */
export function flattenScalarFields(schema) {
  return flattenFields(schema).filter((f) => ["string", "integer", "number", "boolean"].includes(f.type));
}

/** Walk to the parent node of a dot-notation ("a.b", "a[].b") path's final segment, indexing into element [0] for "[]" segments. Returns { parent, key } or null if an intermediate node is missing. */
function resolveParent(root, dotPath) {
  const segments = dotPath.split(".");
  let node = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const isArraySeg = segments[i].endsWith("[]");
    const key = segments[i].replace("[]", "");
    node = isArraySeg ? node?.[key]?.[0] : node?.[key];
    if (node == null) return null;
  }
  const last = segments[segments.length - 1];
  const isArrayLast = last.endsWith("[]");
  const key = last.replace("[]", "");
  return isArrayLast ? { parent: node, key, arrayLast: true } : { parent: node, key, arrayLast: false };
}

/** Remove a dot-notation ("a.b", "a[].b") path from a deep clone of an object. Missing intermediate nodes are a no-op. */
export function omitPath(obj, dotPath) {
  const clone = JSON.parse(JSON.stringify(obj ?? {}));
  const resolved = resolveParent(clone, dotPath);
  if (resolved?.parent) delete resolved.parent[resolved.key];
  return clone;
}

/** Set a dot-notation ("a.b", "a[].b") path to `value` on a deep clone of an object, creating intermediate objects/single-item arrays as needed. */
export function setPath(obj, dotPath, value) {
  const clone = JSON.parse(JSON.stringify(obj ?? {}));
  const segments = dotPath.split(".");
  let node = clone;
  for (let i = 0; i < segments.length - 1; i++) {
    const isArraySeg = segments[i].endsWith("[]");
    const key = segments[i].replace("[]", "");
    if (isArraySeg) {
      node[key] = Array.isArray(node[key]) && node[key].length ? node[key] : [{}];
      node = node[key][0];
    } else {
      node[key] = typeof node[key] === "object" && node[key] !== null ? node[key] : {};
      node = node[key];
    }
  }
  const last = segments[segments.length - 1];
  if (last.endsWith("[]")) {
    node[last.replace("[]", "")] = [value];
  } else {
    node[last] = value;
  }
  return clone;
}
