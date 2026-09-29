// Builds the Allure HTML report from ./allure-results and deploys it to
// Netlify, returning the deploy's permanent URL for the report email.
// Called from cypress.config.js's `after:run`, before sendReportEmail.
//
// Never throws — like sendReportEmail, a failed build/deploy must not fail
// the test run. Returns null when anything is missing or fails, and the
// email falls back to "Not hosted".
//
// Deploys through Netlify's REST API with plain fetch (file-digest deploy:
// send a SHA1 per file, upload only the ones Netlify doesn't already have)
// instead of netlify-cli, which is a very heavy dependency for one upload.
//
// Credentials live in .env (gitignored):
//   NETLIFY_AUTH_TOKEN — personal access token (User settings → Applications)
//   NETLIFY_SITE_ID    — the site's API ID (Site configuration → General)

const { execFile } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(__dirname, "../..");
const RESULTS_DIR = path.join(ROOT, "allure-results");
const REPORT_DIR = path.join(ROOT, "allure-report");
const NETLIFY_API = "https://api.netlify.com/api/v1";

async function publishAllureReport() {
  if (!fs.existsSync(RESULTS_DIR) || fs.readdirSync(RESULTS_DIR).length === 0) {
    console.log("[allure-report] No allure-results — skipping report build/deploy.");
    return null;
  }

  try {
    // Start clean — `allure generate` doesn't clear old output, and stale
    // files left at the root were being deployed instead of this run's report.
    fs.rmSync(REPORT_DIR, { recursive: true, force: true });
    await execFileAsync(path.join(ROOT, "node_modules/.bin/allure"), ["generate", RESULTS_DIR], {
      cwd: ROOT,
    });
    console.log(`[allure-report] Report generated: ${REPORT_DIR}`);
  } catch (err) {
    console.error("[allure-report] Report generation failed:", err.message);
    return null;
  }

  // Allure 3 writes each plugin's report into its own subfolder
  // (allure-report/allure2/ for the Allure 2 UI) — deploy that folder so it
  // becomes the site root.
  const deployDir = fs.existsSync(path.join(REPORT_DIR, "allure2", "index.html"))
    ? path.join(REPORT_DIR, "allure2")
    : REPORT_DIR;

  const token = process.env.NETLIFY_AUTH_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;
  if (!token || !siteId) {
    console.log(
      "[allure-report] NETLIFY_AUTH_TOKEN or NETLIFY_SITE_ID not set in .env — skipping deploy."
    );
    return null;
  }

  // Retried: a single failed upload (network blip, or another run rebuilding
  // allure-report mid-upload) otherwise left the deploy stuck in
  // "uploading" and the email with no link.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const url = await deployToNetlify(deployDir, { token, siteId });
      console.log(`[allure-report] Deployed: ${url}`);
      return url;
    } catch (err) {
      console.error(`[allure-report] Netlify deploy attempt ${attempt}/3 failed:`, err.message);
    }
  }
  return null;
}

async function deployToNetlify(dir, { token, siteId }) {
  const headers = { Authorization: `Bearer ${token}` };

  // "/data/foo.json" -> { sha1, absolutePath }
  const files = {};
  for (const absolutePath of listFiles(dir)) {
    const deployPath = "/" + path.relative(dir, absolutePath).split(path.sep).join("/");
    const sha1 = crypto.createHash("sha1").update(fs.readFileSync(absolutePath)).digest("hex");
    files[deployPath] = { sha1, absolutePath };
  }

  const createRes = await fetch(`${NETLIFY_API}/sites/${siteId}/deploys`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      files: Object.fromEntries(Object.entries(files).map(([p, f]) => [p, f.sha1])),
      title: `VMS automation report — ${new Date().toISOString()}`,
    }),
  });
  if (!createRes.ok) {
    throw new Error(`create deploy ${createRes.status}: ${await createRes.text()}`);
  }
  const deploy = await createRes.json();

  // Upload only what Netlify asked for (content it doesn't already store).
  const required = new Set(deploy.required || []);
  for (const [deployPath, { sha1, absolutePath }] of Object.entries(files)) {
    if (!required.has(sha1)) continue;
    required.delete(sha1); // identical files share a hash — upload once

    const encodedPath = deployPath.split("/").map(encodeURIComponent).join("/");
    const uploadRes = await fetch(`${NETLIFY_API}/deploys/${deploy.id}/files${encodedPath}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/octet-stream" },
      body: fs.readFileSync(absolutePath),
    });
    if (!uploadRes.ok) {
      throw new Error(`upload ${deployPath} ${uploadRes.status}: ${await uploadRes.text()}`);
    }
  }

  // Wait for Netlify to finish processing so the link works when the email lands.
  for (let attempt = 0; attempt < 60; attempt++) {
    const statusRes = await fetch(`${NETLIFY_API}/deploys/${deploy.id}`, { headers });
    const status = await statusRes.json();
    if (status.state === "ready") {
      // Per-deploy permalink — each email keeps pointing at its own run's
      // report, even after later runs replace the site's main URL.
      return status.deploy_ssl_url || status.ssl_url;
    }
    if (status.state === "error") throw new Error(`deploy error: ${status.error_message}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("deploy not ready after 120s");
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

// Main site URL — always serves the latest successful deploy. Email falls
// back to this if this run's own deploy failed, so the link still opens.
const SITE_URL = process.env.NETLIFY_SITE_URL || "https://vms-automation.netlify.app";

module.exports = { publishAllureReport, RESULTS_DIR, SITE_URL };
