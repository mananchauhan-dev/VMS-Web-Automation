const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RESULTS_DIR = path.join(ROOT, "reports", "allure-results");
const REPORT_DIR = path.join(ROOT, "reports", "allure-report");

function generateAllureReport() {
  if (!fs.existsSync(RESULTS_DIR) || fs.readdirSync(RESULTS_DIR).length === 0) {
    console.warn("No Allure results found in reports/allure-results — skipping HTML report.");
    return 0;
  }

  fs.rmSync(REPORT_DIR, { recursive: true, force: true });

  const allureBin = path.join(ROOT, "node_modules", ".bin", "allure");
  const result = spawnSync(allureBin, ["generate", RESULTS_DIR, "--output", REPORT_DIR], {
    stdio: "inherit",
    cwd: ROOT,
    env: process.env,
  });

  if (result.status !== 0) {
    console.error("Allure report generation failed.");
    return result.status ?? 1;
  }

  console.log(`Allure report generated: ${path.join(REPORT_DIR, "index.html")}`);
  return 0;
}

module.exports = { RESULTS_DIR, REPORT_DIR, generateAllureReport };

if (require.main === module) {
  process.exit(generateAllureReport());
}
