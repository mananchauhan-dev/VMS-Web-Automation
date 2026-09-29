// URL Redirection smoke test.
//
// Data-driven rather than one it() per route — the app has ~90 routes, one
// test per route would be unreadable and slow to triage. Two live tests:
//   1. PublicRoute-marked pages are reachable WITHOUT authentication.
//   2. Every static (no :param) route is reachable once authenticated —
//      i.e. none of them unexpectedly bounce to /login. This is the
//      regression this file exists to catch: someone wraps a route in the
//      wrong guard, or a role check breaks, and a valid page silently
//      redirects to login.
//
// Deliberately NOT covered here (see comments at the bottom):
//   - Dynamic :param routes (:leadId, :id, :centreId, ...) — need real ids
//     that most of these don't have a lookup for yet.
//   - The NotFound catch-alls (/* and /vms-admin/*) — exact "not found"
//     marker text/component not confirmed live.
//   - The 5 base paths that self-redirect to a sub-route (cycle-count,
//     trips, users, yard, accessories) — still covered by the main loop
//     below (same "not redirected to login" assertion), just called out
//     since their pathname is EXPECTED to change after visiting.

// Reachable without logging in (App.jsx's PublicRoute wrapper).
const PUBLIC_ROUTES = ["/", "/login", "/loginScreen"];

// Every static route from the app's route table, minus:
//   - dynamic :param routes (see PARAMETERIZED_ROUTES_TODO below)
//   - the NotFound catch-alls (/* , /vms-admin/*)
// Included as-is even for the 5 self-redirecting base paths (cycle-count,
// trips, users, yard, accessories) — the assertion (not bounced to /login)
// holds regardless of which sub-path they land on.
const PROTECTED_STATIC_ROUTES = [
  "/simple-table",
  "/advanceTable",
  "/detail",
  "/vms-admin/inventory",
  "/vms-admin/inventory-status",
  "/vms-admin/booked-but-not-procured",
  "/vms-admin/in-transit-inventory",
  "/vms-admin/upcoming-inventory",
  "/vms-admin/other-center-inventory",
  "/vms-admin/other-center",
  "/vms-admin/vintage-dashboard",
  "/vms-admin/booking",
  "/vms-admin/booking-dashboard",
  "/vms-admin/bookings",
  "/vms-admin/enquiry",
  "/vms-admin/enquiry-dashboard",
  "/vms-admin/dashboard-enquiry",
  "/vms-admin/enquiry-dashboard-details",
  "/vms-admin/per-day-enquiry",
  "/vms-admin/date-wise-followup",
  "/vms-admin/sales-dashboard",
  "/vms-admin/sales-report",
  "/vms-admin/margin-dashboard",
  "/vms-admin/last-month-vs-current-month-details",
  "/vms-admin/refurbishment",
  "/vms-admin/refurbishment/accessory-dashboard",
  "/vms-admin/refurbishment/new-inventory",
  "/vms-admin/refurbishment/vehicle-accessory-tag",
  "/vms-admin/refurbishment/accessory-request",
  "/vms-admin/refurbishment/scrap-dashboard",
  "/vms-admin/refurbishment/ack-payments",
  "/vms-admin/refurbishment/cycle-count",
  "/vms-admin/refurbishment/accessory-config",
  "/vms-admin/refurbishment/acl",
  "/vms-admin/refurbishment-dashboard",
  "/vms-admin/refurbishment-comments-dashboard",
  "/vms-admin/refurbishment-accessory-dashboard",
  "/vms-admin/cycle-count", // self-redirects to a sub-route
  "/vms-admin/cycle-count/inventory",
  "/vms-admin/cycle-count/inventory-cycle-list",
  "/vms-admin/cycle-count/dashboard",
  "/vms-admin/cycle-count/daily",
  "/vms-admin/logistic-dashboard",
  "/vms-admin/logistic-leads-data",
  "/vms-admin/trips", // self-redirects to a sub-route
  "/vms-admin/trips/list",
  "/vms-admin/trips/details",
  "/vms-admin/trips/expense",
  "/vms-admin/trips/all-expense",
  "/vms-admin/driver-dashboard",
  "/vms-admin/driver-linked-dashboard",
  "/vms-admin/driver-trip-expense-mom",
  "/vms-admin/internal-transfer-dashboard",
  "/vms-admin/post-sale-dashboard",
  "/vms-admin/post-sale-followup",
  "/vms-admin/post-sale-mom",
  "/vms-admin/post-sale-rto-mom",
  "/vms-admin/ops-cost-mom",
  "/vms-admin/document-completion-mom",
  "/vms-admin/documents/inventory",
  "/vms-admin/documents/inventory/send-email-reminder",
  "/vms-admin/documents/pending-leads",
  "/vms-admin/documents/post-sale",
  "/vms-admin/document-dispatch",
  "/vms-admin/dms-dashboard",
  "/vms-admin/dms-followup",
  "/vms-admin/users", // self-redirects to a sub-route
  "/vms-admin/users/list",
  "/vms-admin/users/add",
  "/vms-admin/users/edit",
  "/vms-admin/users/profile",
  "/vms-admin/center",
  "/vms-admin/center/details",
  "/vms-admin/center/add",
  "/vms-admin/center/stock/add",
  "/vms-admin/centre-dashboard",
  "/vms-admin/centre-capacity-dashboard",
  "/vms-admin/yard", // self-redirects to a sub-route
  "/vms-admin/yard/list",
  "/vms-admin/yard/add",
  "/vms-admin/yard/edit",
  "/vms-admin/accessories", // self-redirects to a sub-route
  "/vms-admin/accessories/list",
  "/vms-admin/accessories/update",
  "/vms-admin/accessories-details",
  "/vms-admin/agent-list",
  "/vms-admin/agent-list/agent-creation",
  "/vms-admin/agent-list/agent-update",
  "/vms-admin/agent-payment",
  "/vms-admin/auction-agency",
  "/vms-admin/bank-list",
  "/vms-admin/branch-list",
  "/vms-admin/insurer-list",
  "/vms-admin/insurer-data",
  "/vms-admin/broker-dashboard",
  "/vms-admin/config-list",
  "/vms-admin/config-list/update",
  "/vms-admin/rtoInsuranceCharges",
  "/vms-admin/online-transaction",
  "/vms-admin/price-requests",
  "/vms-admin/cibil-pan-dashboard",
  "/vms-admin/vaahan-check-status-dashboard",
  "/vms-admin/vaahan-check-status-batch",
  "/vms-admin/vaahan-check-status-lead",
  "/vms-admin/duplicate-phone-no-dashboard",
  "/vms-admin/duplicate-phone-no-data",
  "/vms-admin/on-road-price-sheet-upload",
  "/vms-admin/export-management",
  "/vms-admin/bulk-upload-logs",
  "/vms-admin/logs-track",
  "/vms-admin/role-task-dashboard",
  "/vms-admin/task-management",
  "/vms-admin/dashboard",
  "/vms-admin/facebook/post",
  "/vms-admin/facebook/pages",
  "/vms-admin/learning-module/add-videos",
  "/vms-admin/learning-module/watch-videos",
];

describe("URL Redirection", () => {
  // This spec only checks routing (no bounce to /login). Some pages fire API
  // calls that fail without an id/context and the app doesn't catch them
  // (e.g. /vms-admin/users/profile → unhandled AxiosError 400) — an app bug
  // worth reporting, but not a routing failure. Ignore app-side uncaught
  // errors here only; every other spec still fails on them.
  beforeEach(() => {
    // No cy.* inside this handler — Cypress forbids commands in event callbacks.
    cy.on("uncaught:exception", (err) => {
      console.warn("[UrlRedirection] Ignored app error:", err.message);
      return false;
    });
  });

  it("Positive: public routes are reachable without authentication", () => {
    PUBLIC_ROUTES.forEach((route) => {
      cy.visit(route, { failOnStatusCode: false });
      cy.location("pathname").should("eq", route);
    });
  });

  it("Positive: every static protected route loads without redirecting to login", () => {
    cy.loginViaApi();

    PROTECTED_STATIC_ROUTES.forEach((route) => {
      cy.visit(route, { failOnStatusCode: false });
      cy.location("pathname", { timeout: 15000 }).should("not.include", "/login");
    });
  });
});

// --- Not covered above ------------------------------------------------------
//
// Dynamic :param routes — need a real id per route (most have no fixture
// lookup yet). Only inventory's own regNo is available via
// cypress/tmp/lastCreatedLead.json; the rest (:centreId, :taskId, :id, ...)
// have no confirmed source. TODO once ids are available:
//   /vms-admin/inventory/:leadId
//   /vms-admin/inventory/edit/:leadId
//   /vms-admin/inventory/center/:centreId/stock/:Id
//   /vms-admin/details/:leadId
//   /vms-admin/upcoming-inventory/:leadId
//   /vms-admin/enquiry/:id
//   /vms-admin/refurbishment/scrap-dashboard/:centreName/sale
//   /vms-admin/refurbishment/ack-payments/:taskId/submit
//   /vms-admin/refurbishment/ack-payments/:taskId/review
//   /vms-admin/refurbishment-accessory-dashboard/:centreId/:accessoryId/ledger
//   /vms-admin/cycle-count/:leadId
//   /vms-admin/center/edit/:id
//   /vms-admin/documents/:id
//   /vms-admin/learning-module/edit-video/:id
//
// it("Negative: an unmatched /vms-admin/* path renders NotFound", () => {
//   cy.loginViaApi();
//   cy.visit("/vms-admin/this-route-does-not-exist-xyz", { failOnStatusCode: false });
//   cy.contains(/not found|404/i).should("be.visible");
// });
//
// it("Negative: an unmatched top-level path renders NotFound", () => {
//   cy.visit("/this-route-does-not-exist-xyz", { failOnStatusCode: false });
//   cy.contains(/not found|404/i).should("be.visible");
// });
