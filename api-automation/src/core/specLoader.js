// src/core/specLoader.js
//
// Single source of truth: reads spec/vms-openapi.json and flattens it into an
// array of EndpointDescriptor objects. Every generator, test, and coverage
// report in this framework is derived from this module — nothing about the
// API surface is hand-maintained separately from the spec.
//
// JSDoc typedefs below are consumed by TypeScript (via `allowJs` +
// `checkJs`-free inference) so tests/**/*.ts get real property types on the
// EndpointDescriptor objects this module returns, without needing a
// duplicate .d.ts or a build step.

/**
 * @typedef {Object} SchemaParameter
 * @property {string} name
 * @property {"path"|"query"|"header"} in
 * @property {boolean} required
 * @property {any} schema
 * @property {string} [description]
 */

/**
 * @typedef {Object} RequestBodyDescriptor
 * @property {boolean} required
 * @property {string} [contentType]
 * @property {any} [schema]
 */

/**
 * @typedef {Object} ResponseDescriptor
 * @property {string} [description]
 * @property {string} [contentType]
 * @property {any} [schema]
 */

/**
 * @typedef {Object} EndpointDescriptor
 * @property {string} id - e.g. "GET /api/v1/yard"
 * @property {string} path
 * @property {"get"|"post"|"put"|"patch"|"delete"|"options"|"head"} method
 * @property {string} tag
 * @property {string} summary
 * @property {string} description
 * @property {Array<Record<string,string[]>>} [security] - undefined => no auth documented
 * @property {SchemaParameter[]} parameters
 * @property {RequestBodyDescriptor} [requestBody]
 * @property {Record<string, ResponseDescriptor>} responses
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = path.resolve(__dirname, "../../spec/vms-openapi.json");

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

/** Load and parse the raw OpenAPI JSON document. */
export function loadRawSpec() {
  const raw = readFileSync(SPEC_PATH, "utf-8");
  return JSON.parse(raw);
}

/**
 * Resolve a local "#/a/b/c" $ref against the full spec document.
 * The VMS spec only uses local refs (components/responses/*), so a full
 * external-file / remote-URL resolver is intentionally not implemented.
 */
function resolveRef(spec, ref) {
  if (!ref || !ref.startsWith("#/")) return undefined;
  const segments = ref.slice(2).split("/");
  let node = spec;
  for (const seg of segments) {
    if (node == null) return undefined;
    node = node[seg];
  }
  return node;
}

/** Deep-resolve every $ref found anywhere inside a schema/response fragment. */
function deref(spec, node, seen = new Set()) {
  if (node == null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((item) => deref(spec, item, seen));

  if (typeof node.$ref === "string") {
    if (seen.has(node.$ref)) return {}; // guard against cycles (none expected in this spec)
    const resolved = resolveRef(spec, node.$ref);
    if (resolved === undefined) return node;
    const nextSeen = new Set(seen);
    nextSeen.add(node.$ref);
    return deref(spec, resolved, nextSeen);
  }

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = deref(spec, value, seen);
  }
  return out;
}

function extractRequestBody(spec, requestBody) {
  if (!requestBody) return undefined;
  const resolved = deref(spec, requestBody);
  const contentType = Object.keys(resolved.content || {})[0];
  if (!contentType) return { required: !!resolved.required, contentType: undefined, schema: undefined };
  return {
    required: !!resolved.required,
    contentType,
    schema: resolved.content[contentType]?.schema,
  };
}

function extractResponses(spec, responses) {
  const out = {};
  for (const [status, respRef] of Object.entries(responses || {})) {
    const resolved = deref(spec, respRef);
    const contentType = Object.keys(resolved.content || {})[0];
    out[status] = {
      description: resolved.description,
      contentType,
      schema: contentType ? resolved.content[contentType]?.schema : undefined,
    };
  }
  return out;
}

/**
 * Build the flat endpoint inventory from the raw spec.
 * @returns {EndpointDescriptor[]}
 */
export function buildInventory() {
  const spec = loadRawSpec();
  /** @type {EndpointDescriptor[]} */
  const endpoints = [];

  for (const [routePath, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op) continue;

      const parameters = (op.parameters || []).map((p) => {
        const resolved = deref(spec, p);
        return {
          name: resolved.name,
          in: resolved.in,
          required: !!resolved.required,
          schema: resolved.schema,
          description: resolved.description,
        };
      });

      endpoints.push({
        id: `${method.toUpperCase()} ${routePath}`,
        path: routePath,
        method,
        tag: (op.tags && op.tags[0]) || "(untagged)",
        summary: op.summary || "",
        description: op.description || "",
        security: op.security, // undefined => not documented as requiring auth
        parameters,
        requestBody: extractRequestBody(spec, op.requestBody),
        responses: extractResponses(spec, op.responses),
      });
    }
  }

  return endpoints;
}

/**
 * Group inventory entries by their primary OpenAPI tag (module).
 * @param {EndpointDescriptor[]} inventory
 * @returns {Map<string, EndpointDescriptor[]>}
 */
export function groupByTag(inventory) {
  const groups = new Map();
  for (const ep of inventory) {
    if (!groups.has(ep.tag)) groups.set(ep.tag, []);
    groups.get(ep.tag).push(ep);
  }
  return groups;
}

/**
 * True if the endpoint's `security` block references a scheme requiring a bearer/apiKey token.
 * @param {EndpointDescriptor} endpoint
 * @returns {boolean}
 */
export function requiresAuth(endpoint) {
  return Array.isArray(endpoint.security) && endpoint.security.length > 0;
}

/**
 * Name of the first security scheme documented on the endpoint (e.g. "AuthToken", "VmsAuthToken", "ApiKeyAuth").
 * @param {EndpointDescriptor} endpoint
 * @returns {string|undefined}
 */
export function securitySchemeName(endpoint) {
  if (!requiresAuth(endpoint)) return undefined;
  return Object.keys(endpoint.security?.[0] ?? {})[0];
}
