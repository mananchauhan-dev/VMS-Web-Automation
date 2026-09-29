// src/config/env.js
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const ENV = process.env.API_ENV || "dev";

// Mirrors cypress.config.js's ENV_URLS/API_URLS so both suites target the
// same environments by the same name. "staging" is an explicit alias for
// "dev" (same https://devvms.tractorfirst.com host) — the team refers to
// this environment as "staging" in practice even though cypress.config.js
// and the rest of this framework key it as "dev". Kept as an explicit
// mapping rather than relying on the dev-fallback below, so this doesn't
// silently break if a real distinct staging URL is ever introduced.
const API_URLS = {
  dev: "https://devvms.tractorfirst.com",
  staging: "https://devvms.tractorfirst.com",
  prod: "https://prodvms.tractorjunction.in",
};

export const config = {
  env: ENV,
  baseUrl: process.env.API_BASE_URL || API_URLS[ENV] || API_URLS.dev,
  // A single real, logged-in-able admin email in the target environment.
  // Used to obtain an AuthToken, and (via /user/fake-user) to mint scoped
  // tokens for every other role — see src/core/auth.js.
  adminEmail: process.env.ADMIN_EMAIL,
  // Mobile number for the VMT (customer app) OTP login flow. The spec
  // documents that OTP verification always accepts "12345" in non-production.
  vmtMobile: process.env.VMT_TEST_MOBILE,
  isProd: ENV === "prod",
  allowProd: process.env.ALLOW_PROD === "true",
};

if (config.isProd && !config.allowProd) {
  throw new Error(
    "Refusing to run API automation with API_ENV=prod. This framework is " +
      "destructive-capable (create/update/delete/RBAC probing). " +
      "Set ALLOW_PROD=true explicitly to override. See README.md."
  );
}
