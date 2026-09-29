// src/core/apiClient.js
//
// Thin, generic request builder shared by every test. Nothing endpoint-
// specific lives here — it just knows how to turn an EndpointDescriptor +
// concrete parameter values into an HTTP call, and how to attach the right
// auth header for the endpoint's documented security scheme.

import { config } from "../config/env.js";
import { requiresAuth, securitySchemeName } from "./specLoader.js";
import { tokenForScheme } from "./auth.js";

/** Substitute {param} placeholders in a path template with concrete values. */
export function fillPath(pathTemplate, pathParams = {}) {
  return pathTemplate.replace(/\{([^}]+)\}/g, (_, name) => {
    if (!(name in pathParams)) {
      throw new Error(`Missing value for path parameter "${name}" in "${pathTemplate}"`);
    }
    return encodeURIComponent(String(pathParams[name]));
  });
}

/** Build a query string from a plain object, skipping undefined values. */
export function buildQuery(queryParams = {}) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) usp.append(key, String(v));
    } else {
      usp.append(key, String(value));
    }
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Attach the appropriate auth header for the endpoint's documented security
 * scheme. `authOverride` lets negative/RBAC tests force no-auth, a bad
 * token, or a specific role.
 */
export async function resolveAuthHeaders(endpoint, authOverride) {
  if (authOverride === "none") return {};
  if (authOverride === "invalid") return { Authorization: "invalid.jwt.token" };
  if (authOverride && typeof authOverride === "object" && authOverride.role) {
    const { getTokenForRole } = await import("./auth.js");
    const token = await getTokenForRole(authOverride.role);
    return { Authorization: token };
  }
  if (!requiresAuth(endpoint)) return {};
  const scheme = securitySchemeName(endpoint);
  const resolved = await tokenForScheme(scheme);
  if (!resolved) return {};
  return { [resolved.header]: resolved.value };
}

/**
 * Execute a request for an EndpointDescriptor using Playwright's
 * APIRequestContext (`request` fixture).
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {object} endpoint - EndpointDescriptor from specLoader
 * @param {object} opts
 * @param {object} [opts.pathParams]
 * @param {object} [opts.queryParams]
 * @param {unknown} [opts.body]
 * @param {"none"|"invalid"|{role:string}} [opts.authOverride]
 * @param {object} [opts.extraHeaders]
 */
export async function callEndpoint(request, endpoint, opts = {}) {
  const { pathParams = {}, queryParams = {}, body, authOverride, extraHeaders = {} } = opts;

  const url = `${config.baseUrl}${fillPath(endpoint.path, pathParams)}${buildQuery(queryParams)}`;
  const authHeaders = await resolveAuthHeaders(endpoint, authOverride);
  const headers = { ...authHeaders, ...extraHeaders };

  const fetchOptions = { method: endpoint.method.toUpperCase(), headers };
  if (body !== undefined) {
    fetchOptions.data = body;
    if (!headers["Content-Type"] && endpoint.requestBody?.contentType === "application/json") {
      headers["Content-Type"] = "application/json";
    }
  }

  const response = await request.fetch(url, fetchOptions);
  let json;
  try {
    json = await response.json();
  } catch {
    json = undefined;
  }
  return { response, status: response.status(), json, url };
}
