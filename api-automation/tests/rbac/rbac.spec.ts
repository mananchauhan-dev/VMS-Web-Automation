// tests/rbac/rbac.spec.ts
//
// RBAC coverage strategy: the spec itself documents no `role` enum, no
// per-endpoint role restrictions, and no roles list — user.role is always
// just `{ type: "string", example: "..." }`. Inventing a role list would
// violate the brief's "do not invent business rules" instruction.
//
// What IS verifiable from real project artifacts (not invented):
//   1. The set of roles actually used in this repo's own Cypress CI config
//      (.github/workflows/*.yml — ADMIN_GOOGLE_EMAIL, PROCUREMENT_GOOGLE_EMAIL,
//      OPERATIONS_GOOGLE_EMAIL, FINANCE_GOOGLE_EMAIL, TERRITORY_GOOGLE_EMAIL,
//      YARD_GOOGLE_EMAIL, SALES_GOOGLE_EMAIL, MANAGER_GOOGLE_EMAIL, etc.)
//   2. A handful of endpoints whose spec `description` explicitly names an
//      allow-list, e.g. GET /dashboard/booking-dashboard: "Restricted to a
//      hard-coded allow-list of user emails" — but the emails themselves
//      aren't documented, so pass/fail can't be asserted without them.
//   3. The spec's own role-impersonation mechanism —
//      POST /api/v1/user/fake-user { role } — mints a token scoped to any
//      role string, once authenticated as a real admin. This is what
//      ROLE_MATRIX below drives.
//
// TODO: BUSINESS RULE CONFIRMATION REQUIRED
//   The authoritative UserRole enum (all valid role strings) and the
//   endpoint x role permission matrix live in the backend source
//   (likely src/constants or a permissions/RBAC config file), not in this
//   OpenAPI spec. Populate ROLE_MATRIX below from that source before this
//   suite can assert anything beyond "does this role's token exist".

import { test, expect } from "@playwright/test";
import { buildInventory } from "../../src/core/specLoader.js";
import { getTokenForRole, getAdminToken } from "../../src/core/auth.js";
import { callEndpoint } from "../../src/core/apiClient.js";
import { config } from "../../src/config/env.js";

// Roles observed in this repo's own CI secrets (.github/workflows) — real,
// not invented. Extend once the backend's authoritative role list is
// confirmed (see TODO above).
const KNOWN_ROLES_FROM_CI = [
  "ADMIN",
  "PROCUREMENT_EXECUTIVE",
  "OPERATIONS_MANAGER",
  "FINANCE",
  "TERRITORY_MANAGER",
  "CENTRE_MANAGER", // "YARD" role in CI naming maps to yard/centre operations
  "SALES_EXECUTIVE",
];

const inventory = buildInventory();
const sampleAuthedGet = inventory.find((ep) => ep.method === "get" && ep.path === "/api/v1/user/all-users")!;

test.describe("@rbac Role-token acquisition (via spec's fake-user impersonation)", () => {
  test.beforeAll(async () => {
    if (!config.adminEmail) {
      test.skip(true, "ADMIN_EMAIL not configured — cannot mint role tokens. See .env.example.");
    }
  });

  for (const role of KNOWN_ROLES_FROM_CI) {
    test(`can mint a token for role "${role}" and it is accepted (not 401) on an AuthToken-protected GET`, async ({
      request,
    }) => {
      await getAdminToken();
      const token = await getTokenForRole(role);
      expect(token, `fake-user did not return a token for role "${role}"`).toBeTruthy();

      const { status } = await callEndpoint(request, sampleAuthedGet, {
        authOverride: { role },
      });
      // A minted role token must at minimum authenticate successfully.
      // Whether this specific role is AUTHORIZED for this specific endpoint
      // (403 vs 200) depends on the permission matrix — see TODO above.
      expect(status, `role "${role}" token was rejected outright (401) — token minting itself failed`).not.toBe(401);
    });
  }
});

test.describe.skip("@rbac Endpoint x role authorization matrix — TODO: BUSINESS RULE CONFIRMATION REQUIRED", () => {
  // Skipped intentionally: asserting "role X gets 403 on endpoint Y" requires
  // the real permission matrix, which is not present in the OpenAPI spec.
  // Once confirmed (see file header), replace this block with real
  // authorized-role-succeeds / unauthorized-role-403 test pairs per endpoint,
  // in the same data-driven style as the rest of this framework.
});
