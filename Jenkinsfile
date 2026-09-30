// VMS Web Automation — Regression Suite pipeline.
//
// Runs cypress/e2e/Test_Case/Regression_Suite on a chosen branch/environment,
// manually or every weekday at 9 AM IST. Report build, Netlify deploy and the
// report email all happen inside the Cypress run itself (cypress.config.js
// after:run → cypress/plugins/publishAllureReport.js + sendReportEmail.js),
// so this pipeline only has to supply the secrets those read from env.
//
// Jenkins credentials to create (Manage Jenkins → Credentials):
//   github-creds       — Username/Password (or token) with read access to the repo
//   vms-crs-api-key    — Secret text: CRS email API key
//   vms-netlify-token  — Secret text: Netlify personal access token
// Recipients per branch are set in the environment block below.

def cleanBranchName(String rawBranch, String defaultBranch = 'stage') {
    if (!rawBranch || rawBranch.trim().isEmpty()) {
        return defaultBranch
    }
    def branch = rawBranch.trim()
    ['refs/heads/', 'origin/', '*/'].each { prefix ->
        if (branch.startsWith(prefix)) {
            branch = branch.substring(prefix.length())
        }
    }
    return branch ?: defaultBranch
}

pipeline {
    agent any

    parameters {
        choice(name: 'BRANCH', choices: ['stage', 'main'], description: 'Git branch to test')
        choice(name: 'TEST_ENV', choices: ['dev', 'prod'], description: 'Target VMS environment (ENV in cypress.config.js)')
        choice(name: 'BROWSER', choices: ['electron', 'chrome'], description: 'Browser for cypress run')
    }

    triggers {
        // Every weekday (Mon–Fri) at 9:00 AM IST. Scheduled runs use the
        // parameter defaults above: stage / dev / electron.
        cron('''TZ=Asia/Kolkata
0 9 * * 1-5''')
    }

    options {
        timestamps()
        disableConcurrentBuilds() // runs share one test lead + report folders — never overlap
        timeout(time: 90, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '30'))
    }

    environment {
        REPO_URL        = 'https://github.com/mananchauhan-dev/VMS-Web-Automation.git'
        NETLIFY_SITE_ID = 'f0c72b6c-6dd0-4971-a592-1fbbb77b2248'

        // Report email recipients per branch (comma-separated) — see
        // cypress/plugins/sendReportEmail.js recipientsFor().
        CRS_REPORT_RECIPIENTS_MAIN  = 'mananchauhan@tractorjunction.com'
        CRS_REPORT_RECIPIENTS_STAGE = 'mananchauhan@tractorjunction.com'
    }

    stages {
        stage('Checkout') {
            steps {
                script {
                    env.TARGET_BRANCH = cleanBranchName(params.BRANCH)
                    echo "Checking out ${env.TARGET_BRANCH} from ${env.REPO_URL}"
                    git branch: env.TARGET_BRANCH, url: env.REPO_URL, credentialsId: 'github-creds'
                }
            }
        }

        stage('Install') {
            steps {
                sh 'npm ci --no-audit --no-fund'
                sh 'npx cypress verify'
            }
        }

        stage('Run Regression Suite') {
            steps {
                withCredentials([
                    string(credentialsId: 'vms-crs-api-key',   variable: 'CRS_API_KEY'),
                    string(credentialsId: 'vms-netlify-token', variable: 'NETLIFY_AUTH_TOKEN'),
                ]) {
                    script {
                        // REPORT_BRANCH: the `git` step leaves Jenkins on a
                        // detached HEAD in some setups, so tell the email which
                        // branch ran instead of relying on git.
                        def exitCode = withEnv(["ENV=${params.TEST_ENV}", "REPORT_BRANCH=${env.TARGET_BRANCH}"]) {
                            sh(
                                script: """#!/bin/bash
                                    xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" \\
                                    npx cypress run \\
                                      --spec "cypress/e2e/Test_Case/Regression_Suite/**/*.cy.js" \\
                                      --browser ${params.BROWSER}
                                """,
                                returnStatus: true
                            )
                        }

                        echo "Cypress exit code: ${exitCode} (number of failed tests, or 1+ on a crash)"
                        if (exitCode != 0) {
                            // Test failures → UNSTABLE (yellow), not FAILED — the
                            // pipeline itself worked and the report/email went out.
                            unstable("Regression Suite finished with failures (exit code ${exitCode})")
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'allure-report/**, cypress/screenshots/**', allowEmptyArchive: true
            echo 'Allure report: https://vms-automation.netlify.app (latest). Per-run link is in the report email and the [allure-report] log line above.'
        }
    }
}
