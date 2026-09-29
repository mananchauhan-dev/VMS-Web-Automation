import { defineConfig } from "allure";

// Allure 3 CLI config — `npm run report:allure` reads ./allure-results
// (written by allure-cypress during `cypress run`) and builds a static HTML
// report into ./allure-report, ready to deploy to Netlify as-is.
//
// allure2 plugin = classic Allure 2 UI (Overview / Suites / Graphs /
// Timeline / Behaviors). Pure Node — no Java needed, unlike allure-commandline.
export default defineConfig({
  name: "VMS Web Automation Report",
  output: "./allure-report",
  // Keeps run history between builds so the Trend graphs fill in over time.
  historyPath: "./allure-history/history.jsonl",
  plugins: {
    allure2: {
      options: {
        reportName: "VMS Web Automation Report",
        reportLanguage: "en",
      },
    },
  },
});
