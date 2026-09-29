const { defineConfig } = require("cypress");
require("dotenv").config();

const fs = require("fs");
const { sendReportEmail } = require("./cypress/plugins/sendReportEmail");
const { publishAllureReport, RESULTS_DIR } = require("./cypress/plugins/publishAllureReport");

const env = process.env.ENV || "dev";

// Frontend host per ENV. Override any entry via <ENV>_URL in .env
// (e.g. LOCAL_URL, DEV_URL, QA_URL, UAT_URL, STAGING_URL) — see README "Environments".
const ENV_URLS = {
  dev: "https://devvmsadmin.tractorfirst.com",
  prod: "https://vmsadmin.tractorjunction.in",
};

// Backend API host — separate from the frontend host above (prod: prodvms.* vs vmsadmin.*).
// Override via API_BASE_URL in .env.
const API_URLS = {
  dev: "https://devvms.tractorfirst.com",
  prod: "https://prodvms.tractorjunction.in",
};

// Path to land on after login — visited explicitly since baseUrl is origin-only
// (Cypress resolves an absolute cy.visit("/...") against the origin, dropping any
// path baseUrl itself might carry).
const LANDING_PATH = "/vms-admin/inventory";

// Viewport presets — pick one via `--env VIEWPORT=mobile` (defaults to desktop).
// Any spec runs unmodified in any of these; no per-spec cy.viewport() needed.
const VIEWPORT_PRESETS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
};

const envUrl = process.env[`${env.toUpperCase()}_URL`] || ENV_URLS[env];
const apiUrl = process.env.API_BASE_URL || API_URLS[env];
const viewport = VIEWPORT_PRESETS[process.env.VIEWPORT] || VIEWPORT_PRESETS.desktop;

if (!envUrl) throw new Error(`No frontend URL configured for ENV="${env}"`);
if (!apiUrl) throw new Error(`No API URL configured for ENV="${env}"`);

module.exports = defineConfig({
  reporter: "cypress-mochawesome-reporter",
  reporterOptions: {
    reportDir: "cypress/reports/mochawesome",
    overwrite: false,
    html: true,
    json: true,
    charts: true,
  },
  e2e: {
    baseUrl: envUrl,
    chromeWebSecurity: false,
    experimentalModifyObstructiveThirdPartyCode: true,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    defaultCommandTimeout: 15000,
    pageLoadTimeout: 30000,
    // Retry only smooths over flaky network hiccups on CI, not real app bugs
    retries: {
      runMode: 1,
      openMode: 0,
    },
    setupNodeEvents(on, config) {
      // Cypress only keeps ONE handler per event name — registering
      // "after:run" separately from cypress-mochawesome-reporter/plugin's
      // own "after:run" handler silently overwrote it (or vice versa),
      // so the report-email send never actually fired. Call both hooks
      // from a single combined handler instead of registering the event
      // twice.
      const { beforeRunHook, afterRunHook } = require("cypress-mochawesome-reporter/lib");
      require("cypress-terminal-report/src/installLogsPrinter")(on);

      // Allure results (raw JSON) → `npm run report:allure` builds the HTML
      // report from them. allureCypress registers its own "after:run", which
      // the combined handler below replaces — so forward into it there.
      // Headless runs start from empty results, so the report/email covers
      // THIS run only, not leftovers from earlier runs. (setupNodeEvents runs
      // once per `cypress run`, before allureCypress creates the dir.)
      if (config.isTextTerminal) {
        fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
      }

      const { allureCypress } = require("allure-cypress/reporter");
      const allureReporter = allureCypress(on, config, {
        resultsDir: "allure-results",
        environmentInfo: {
          ENV: env,
          Frontend: envUrl,
          API: apiUrl,
          Viewport: process.env.VIEWPORT || "desktop",
          Node: process.version,
        },
      });

      on("before:run", async (details) => {
        await beforeRunHook(details);
      });

      // Fires only for headless `cypress run` (not `cypress open`), once
      // the whole run finishes — pass or fail.
      on("after:run", async (results) => {
        allureReporter.onAfterRun(results);
        await afterRunHook(results);
        // Build Allure report → deploy to Netlify → link goes in the email.
        const reportUrl = await publishAllureReport();
        await sendReportEmail(results, { env, reportUrl });
      });

      config.env.ENV = env;
      config.env.API_BASE_URL = apiUrl;
      config.env.LANDING_PATH = LANDING_PATH;
      config.env.VIEWPORT = process.env.VIEWPORT || "desktop";
      return config;
    },
  },
});
