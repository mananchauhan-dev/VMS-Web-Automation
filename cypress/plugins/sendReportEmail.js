// Sends the regression-run summary to the CRS email API after a headless
// `cypress run` finishes (wired into cypress.config.js's `after:run` event —
// see setupNodeEvents). Never throws: a failed/misconfigured email must not
// fail the test run itself.
//
// Recipients and the API key live in .env (gitignored) — CRS_API_KEY,
// CRS_REPORT_RECIPIENTS (comma-separated). Neither is committed.
//
// Recipients per git branch: CRS_REPORT_RECIPIENTS_<BRANCH> (e.g.
// CRS_REPORT_RECIPIENTS_MAIN, CRS_REPORT_RECIPIENTS_STAGE) wins when set for
// the branch being run; otherwise CRS_REPORT_RECIPIENTS is used.
//
// reportUrl is the Netlify-hosted Allure report (publishAllureReport.js);
// the main site URL when the build/deploy was skipped or failed. Failure
// screenshots are attached inside that report; screenshotUrl isn't sent.
const { execSync } = require("child_process");
const { SITE_URL } = require("./publishAllureReport");

// CI checks out a detached HEAD, so prefer the branch name GitHub Actions
// provides; locally, ask git.
function currentBranch() {
  if (process.env.REPORT_BRANCH) return process.env.REPORT_BRANCH; // set by Jenkinsfile
  if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF; // PR source branch
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

function recipientsFor(branch) {
  const key = `CRS_REPORT_RECIPIENTS_${branch.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  const list = (branch && process.env[key]) || process.env.CRS_REPORT_RECIPIENTS || "";
  return list
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

async function sendReportEmail(results, { env, reportUrl }) {
  const apiKey = process.env.CRS_API_KEY;
  const branch = currentBranch();
  const recipients = recipientsFor(branch);

  if (!apiKey || recipients.length === 0) {
    console.log(
      `[send-report-email] CRS_API_KEY or recipients for branch "${branch}" not set in .env — skipping report email.`
    );
    return;
  }

  // IST, not toISOString() (UTC — showed 5:30 behind local time).
  const now = new Date();
  const executionDateTime = `${now.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })} IST`;
  const subjectDate = now
    .toLocaleDateString("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .replace(/ /g, "-");

  const environment = (env || "dev").toUpperCase();
  const totalTestCases = results?.totalTests ?? 0;
  const failedCount = results?.totalFailed ?? 0;
  const passedCount = results?.totalPassed ?? 0;
  const skippedCount = results?.totalSkipped ?? 0;
  const description = `${totalTestCases} test case(s) executed on ${environment}${branch ? ` (branch: ${branch})` : ""} — ${passedCount} passed, ${failedCount} failed, ${skippedCount} skipped`;

  const form = new FormData();
  recipients.forEach((email) => form.append("email[]", email));
  form.append("source", "Finj");
  // Confirmed working identifier (registered template on the CRS backend) —
  // "vms-automation-report" was never registered there, giving a 404
  // "Email template not found" on every send.
  form.append("identifier", "qa-automation-report");
  form.append("data[projectName]", "VMS");
  form.append("data[executionDateTime]", executionDateTime);
  form.append("data[environment]", environment);
  form.append("data[priority]", "High");
  form.append("data[description]", description);
  // "View Report" in the template is a link — never send non-URL text
  // (the old "Not hosted" placeholder became http://Not%20hosted). If this
  // run's deploy failed, link the main site (latest successful report).
  if (!reportUrl) {
    reportUrl = SITE_URL;
    console.warn(
      `[send-report-email] This run's report wasn't deployed — linking ${SITE_URL} (latest successful report) instead.`
    );
  }
  form.append("data[reportUrl]", reportUrl);
  // screenshotUrl intentionally not sent — "Failed Test Cases Screenshots"
  // removed from the email; failure screenshots are inside the Allure report.
  form.append("data[failedCount]", String(failedCount));
  form.append("data[totalTestCases]", String(totalTestCases));
  form.append("data[senderName]", "Mujjamil");
  form.append("subject", `Automation Execution Report - VMS${branch ? ` [${branch}]` : ""} - ${subjectDate}`);

  try {
    const response = await fetch("https://crs.farmjunction.in/api/send/email", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        Accept: "application/json",
      },
      body: form,
    });

    const body = await response.text();

    if (!response.ok) {
      console.error(`[send-report-email] Failed (${response.status}): ${body}`);
      return;
    }

    console.log(`[send-report-email] Report email (branch: ${branch}) sent to: ${recipients.join(", ")}`);
  } catch (err) {
    console.error("[send-report-email] Error sending report email:", err.message);
  }
}

module.exports = { sendReportEmail };
