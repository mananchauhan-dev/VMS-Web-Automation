# VMS Web Automation

Cypress framework for the multi-role VMS admin app. Google OAuth is the
production login method; the framework avoids automating Google's
email/password screens on every test run by caching authenticated sessions
per role.

## Folder structure

```
cypress/
  e2e/
    Page_Object_Model/       # one folder per business domain (Procurement, Finance, ...)
    Test_Case/
      AuthFlow_TestCases/     # login/session specs
      Workflow_TestCases/     # cross-role, end-to-end business flows
      InventoryFlow_TestCases/
  fixtures/
    roles.json                # role -> env var names, landing path, auth strategy
    testData/                 # static seed data, if any
  support/
    commands/
      auth.js                 # cy.loginAs(role) — session + strategy layer
      api.js                  # cy.apiCreateLead(), etc — API-first setup/teardown
    commands.js                # barrel, imports the above
    e2e.js
  utils/
    constants.js               # ROLES — canonical role-name strings
    dataGenerator.js           # generateLead/Vehicle/Tenant/InventoryItem
.github/workflows/cypress.yml  # CI example, per-role secrets, parallel matrix
cypress.config.js
```

## Auth: `cy.loginAs(role)`

```js
import { ROLES } from "../../utils/constants";

cy.loginAs(ROLES.PROCUREMENT_EXECUTIVE);
```

What it does:
1. Looks up the role in `cypress/fixtures/roles.json` — `emailEnv`/`passwordEnv`
   point at `.env` variables, `authStrategy` picks the login mechanism.
2. Wraps the actual login in `cy.session(role, ...)`. First call for a role
   does the real login; every later call in the same run restores cookies —
   no repeat Google UI, no repeat CAPTCHA/MFA exposure.
3. `cacheAcrossSpecs: true` — session persists across every spec file in the
   run, not just within one file.
4. Ends on `roleConfig.landingPath`.

`cy.loginWithGoogle(role)` still exists as a back-compat alias for specs
written before this layer.

### Adding a role

1. Add a block to `cypress/fixtures/roles.json`:
   ```json
   "NewRole": {
     "emailEnv": "NEWROLE_GOOGLE_EMAIL",
     "passwordEnv": "NEWROLE_GOOGLE_PASSWORD",
     "landingPath": "/dashboard",
     "authStrategy": "google"
   }
   ```
2. Add `NEWROLE_GOOGLE_EMAIL` / `NEWROLE_GOOGLE_PASSWORD` to `.env` (and to
   CI secrets — see `.github/workflows/cypress.yml`).
3. Add the constant to `cypress/utils/constants.js`.

No test file changes needed.

### Swapping auth strategy (moving off Google UI automation)

`authStrategy` in `roles.json` is the switch. Today only `"google"` is
implemented (real UI login via `cy.origin`). `"api"` is stubbed in
`cypress/support/commands/auth.js` (`loginViaApi`) — once you have the
app's real OAuth-callback or token endpoint, fill in that function and
`AUTH_API_URL` in `.env`, flip the role's `authStrategy` to `"api"`. No
spec changes — every test still just calls `cy.loginAs(role)`.

This is the intended migration path off Google UI automation entirely,
which removes the CAPTCHA/MFA/bot-detection risk described below.

### Known limitation: Google bot detection

Google actively detects automated browsers (`navigator.webdriver`,
headless signatures) and can block scripted email/password entry with a
"this browser may not be secure" challenge or CAPTCHA. Session caching
reduces *how often* this trips (once per role per run instead of once per
test), but doesn't eliminate it. The real fix is the API/JWT strategy
above — Google UI automation should be treated as a stopgap, not the
long-term answer.

## Test data

`cypress/utils/dataGenerator.js` produces unique data per call
(`generateLead`, `generateVehicle`, `generateTenant`, `generateInventoryItem`)
so parallel/repeated runs never collide on unique fields (email, phone,
registration number).

## API-first setup

`cypress/support/commands/api.js` has stub commands
(`cy.apiCreateLead`, `cy.apiDeleteLead`, `cy.apiCreateVehicle`,
`cy.apiResetTestData`) for driving preconditions through the backend
instead of the UI. Fill in real endpoints under `API_BASE_URL` (`.env`) as
they're confirmed — use these for setup/teardown, reserve UI interaction
for the behavior actually under test.

## Environments

`ENV` env var picks the target: `local | dev | qa | uat | staging | prod`
(`cypress.config.js`). Run with:

```
npm run test:staging
npm run test:prod
```

`local`/`dev`/`qa`/`uat` URLs default to placeholders — set `LOCAL_URL`,
`DEV_URL`, `QA_URL`, `UAT_URL` in `.env` once those environments exist.

## Reporting

- `allure-cypress` — writes results to `allure-results/` (gitignored). After
  every headless run, `cypress/plugins/publishAllureReport.js` builds the
  Allure HTML report (`allure-report/`), deploys it to Netlify
  (https://vms-automation.netlify.app) and the report email links to that
  run's deploy. Needs `NETLIFY_AUTH_TOKEN` + `NETLIFY_SITE_ID` in `.env`.
  `npm run report:open` views it locally, `npm run report:deploy` re-deploys.
- `cypress-terminal-report` — console + network logs printed inline in CI
  output for failed tests.

## Retries

`retries.runMode: 1` — one retry in CI only, smooths over flaky network
requests without masking real app bugs (no retry in `cypress open`).

## CI/CD

`.github/workflows/cypress.yml` — parallel matrix (4 containers), one
secret pair per role. Needs a Cypress Cloud `projectId` in
`cypress.config.js` and `CYPRESS_RECORD_KEY` secret for `record`/`parallel`
to actually work — add those once you have a Cypress Cloud project.
Same secret-per-role pattern ports directly to Jenkins/GitLab CI/Azure
DevOps — inject as env vars, not files.

## Best practices this framework follows

- No hardcoded credentials in test files — everything routes through
  `.env` + `roles.json`.
- No hardcoded URLs — everything routes through `ENV` + `cypress.config.js`.
- Session reuse over repeat UI login — `cy.session()` per role.
- Page Object Model per business domain, not per test file.
- API-first setup for preconditions, UI reserved for the behavior under
  test.
- Dynamic test data — no shared fixture rows that collide across parallel
  runs.
- Retries scoped to CI network flakiness only, not used to paper over
  assertion failures.


## To run regression suit

npm run test:regression:report	Clears old results, runs the regression suite, builds the report
npm run report:allure        	  Builds allure-report/ from allure-results/
npm run report:open	            Opens the report locally
npm run report:deploy	          Deploys allure-report/ to Netlify as the live site