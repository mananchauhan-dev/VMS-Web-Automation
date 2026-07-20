const { defineConfig } = require("cypress");
require("dotenv").config();

const env = process.env.ENV || "dev";

// Frontend host per ENV. Override any entry via <ENV>_URL in .env
// (e.g. LOCAL_URL, DEV_URL, QA_URL, UAT_URL, STAGING_URL) — see README "Environments".
const ENV_URLS = {
  local: "http://localhost:3000",
  dev: "https://devvmsadmin.tractorfirst.com",
  prod: "https://vmsadmin.tractorjunction.in",
};

// Backend API host — separate from the frontend host above (prod: prodvms.* vs vmsadmin.*).
// Override via API_BASE_URL in .env.
const API_URLS = {
  local: "http://localhost:5000",
  dev: "https://devvms.tractorfirst.com",
  prod: "https://prodvms.tractorjunction.in",
};

// Path to land on after login — visited explicitly since baseUrl is origin-only
// (Cypress resolves an absolute cy.visit("/...") against the origin, dropping any
// path baseUrl itself might carry).
const LANDING_PATH = "/vms-admin/inventory";

const envUrl = process.env[`${env.toUpperCase()}_URL`] || ENV_URLS[env];
const apiUrl = process.env.API_BASE_URL || API_URLS[env];

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
    viewportWidth: 1280,
    viewportHeight: 800,
    defaultCommandTimeout: 15000,
    pageLoadTimeout: 30000,
    // Retry only smooths over flaky network hiccups on CI, not real app bugs
    retries: {
      runMode: 1,
      openMode: 0,
    },
    setupNodeEvents(on, config) {
      require("cypress-mochawesome-reporter/plugin")(on);
      require("cypress-terminal-report/src/installLogsPrinter")(on);

      config.env.ENV = env;
      config.env.API_BASE_URL = apiUrl;
      config.env.LANDING_PATH = LANDING_PATH;
      return config;
    },
  },
});
