// src/core/auth.js
//
// Reusable authentication for every test. Two flows, both documented in the
// spec (nothing invented here):
//
// 1. Admin-panel login: POST /api/v1/login { email } -> raw JWT (no "Bearer "
//    prefix; used verbatim as the Authorization header per the spec's
//    AuthToken securityScheme description). Requires ADMIN_EMAIL in .env to
//    be a real, already-provisioned user in the target environment.
//
// 2. Role impersonation: once authenticated as that admin,
//    POST /api/v1/user/fake-user { role } creates/reuses a fake sub-user for
//    the given role and returns a token scoped to it. This is the spec's own
//    mechanism for RBAC testing — used instead of maintaining a full set of
//    real per-role credentials.
//
// 3. VMT (customer app) OTP login: POST /api/v1/vmt/login-by-otp then
//    /api/v1/vmt/verify-otp with the documented static non-prod OTP "12345".
//
// Tokens are cached per role for the lifetime of the test run.

import { config } from "../config/env.js";

const tokenCache = new Map(); // role|"admin"|"vmt" -> token string

/** Raw fetch helper — deliberately not routed through ApiClient to avoid a circular dependency. */
async function rawPost(pathname, body) {
  const res = await fetch(`${config.baseUrl}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/** Log in as the configured admin user and return the raw JWT. Cached. */
export async function getAdminToken() {
  if (tokenCache.has("admin")) return tokenCache.get("admin");
  if (!config.adminEmail) {
    throw new Error(
      "ADMIN_EMAIL is not set in .env — cannot authenticate. See .env.example. " +
        "Tests requiring auth will fail/skip until this is configured."
    );
  }
  const { status, json } = await rawPost("/api/v1/login", { email: config.adminEmail });
  if (status !== 200 || !json?.data?.token) {
    throw new Error(`Admin login failed (status ${status}): ${JSON.stringify(json)}`);
  }
  tokenCache.set("admin", json.data.token);
  return json.data.token;
}

/**
 * Get a token scoped to `role` (e.g. "PROCUREMENT_EXECUTIVE", "DRIVER",
 * "CENTRE_MANAGER") via the spec's fake-user impersonation endpoint.
 * Falls back to throwing a descriptive error if the admin token can't be
 * obtained — callers should catch and `test.skip()` in that case (see
 * tests/rbac/rbac.spec.ts) rather than fail hard, since RBAC coverage is
 * opt-in on top of an already-provisioned environment.
 */
export async function getTokenForRole(role) {
  const cacheKey = `role:${role}`;
  if (tokenCache.has(cacheKey)) return tokenCache.get(cacheKey);

  const adminToken = await getAdminToken();
  const res = await fetch(`${config.baseUrl}/api/v1/user/fake-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: adminToken },
    body: JSON.stringify({ role }),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status !== 200 || !json?.data?.token) {
    throw new Error(`fake-user impersonation for role "${role}" failed (status ${res.status}): ${JSON.stringify(json)}`);
  }
  tokenCache.set(cacheKey, json.data.token);
  return json.data.token;
}

/** VMT customer-app token via OTP login (mobile + static non-prod OTP "12345"). */
export async function getVmtToken() {
  if (tokenCache.has("vmt")) return tokenCache.get("vmt");
  if (!config.vmtMobile) {
    throw new Error("VMT_TEST_MOBILE is not set in .env — cannot authenticate VMT flows.");
  }
  await rawPost("/api/v1/vmt/login-by-otp", { mobile: config.vmtMobile });
  const { status, json } = await rawPost("/api/v1/vmt/verify-otp", {
    mobile: config.vmtMobile,
    otp: "12345",
  });
  const token = json?.data?.user?.token;
  if (status !== 200 || !token) {
    throw new Error(`VMT OTP login failed (status ${status}): ${JSON.stringify(json)}`);
  }
  tokenCache.set("vmt", token);
  return token;
}

/**
 * Resolve the right Authorization header value for a given security scheme
 * name as documented on the endpoint (AuthToken, VmsAuthToken, ApiKeyAuth).
 * Returns undefined for ApiKeyAuth (partner routes) since no static
 * VMS_TOKEN_FOR_RECONCILIATION_MS-style key is safe to assume without config.
 */
export async function tokenForScheme(schemeName) {
  switch (schemeName) {
    case "AuthToken":
      return { header: "Authorization", value: await getAdminToken() };
    case "VmsAuthToken":
      return { header: "Authorization", value: await getVmtToken() };
    case "ApiKeyAuth":
      if (!process.env.PARTNER_API_KEY) return undefined;
      return { header: "x-api-key", value: process.env.PARTNER_API_KEY };
    default:
      return undefined;
  }
}
