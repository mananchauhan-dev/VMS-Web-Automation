describe("Process & confirm parking payment flow", () => {
  // Mandatory fields on the Process & Confirm Payment form.
  const REQUIRED_PAYMENT_FIELDS = [
    "Select Payment Mode",
    "Enter Payment Amount in INR",
    "Enter Payment Date",
    "Payment Receipt",
  ];

  beforeEach(() => {
    cy.loginViaApi("ganeshmangroliya@tractorjunction.com");
  });

  it("Negative: Confirm stays disabled while the form is empty", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openProcessConfirmPaymentForm(registrationNumber, () => {
        cy.get("#cta-btn-disabled").should("exist");
      });
    });
  });

  it("Negative: a payment amount not equal to the approved parking amount is blocked", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openProcessConfirmPaymentForm(registrationNumber, () => {
        withApprovedParkingAmount((approved) => {
          cy.get('input[name="amount"]').clear().type(String(Number(approved) + 4));

          cy.contains("Amount must be equal to deal payment").should("be.visible");
          cy.get("#cta-btn-disabled").should("exist");
        });
      });
    });
  });

  it("Negative: a payment amount below the approved parking amount is blocked", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openProcessConfirmPaymentForm(registrationNumber, () => {
        withApprovedParkingAmount((approved) => {
          cy.get('input[name="amount"]').clear().type(String(Math.max(0, Number(approved) - 1)));

          cy.contains("Amount must be equal to deal payment").should("be.visible");
          cy.get("#cta-btn-disabled").should("exist");
        });
      });
    });
  });

  it("Negative: UTR Number and Remarks are optional", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openProcessConfirmPaymentForm(registrationNumber, () => {
        cy.contains("label", "Enter UTR Number").invoke("text").should("not.include", "*");
        cy.contains("label", "Enter Remarks").invoke("text").should("not.include", "*");
      });
    });
  });

  // One test per mandatory field: fill everything else with valid values (amount
  // matching the approved parking amount) and confirm the missing field alone
  // keeps Confirm disabled.
  REQUIRED_PAYMENT_FIELDS.forEach((omittedField) => {
    it(`Negative: omitting "${omittedField}" keeps Confirm disabled`, () => {
      cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
        openProcessConfirmPaymentForm(registrationNumber, () => {
          withApprovedParkingAmount((approved) => {
            REQUIRED_PAYMENT_FIELDS.filter((field) => field !== omittedField).forEach((field) =>
              fillPaymentField(field, approved)
            );

            // "Select Payment Mode" defaults to "Bank Transfer Imps" — clear it so
            // the omitted-field scenario really has it missing.
            if (omittedField === "Select Payment Mode") {
              clearAutocomplete("Select Payment Mode");
            }

            cy.get("#cta-btn-disabled").should("exist");
          });
        });
      });
    });
  });

  it("Positive: reject, re-raise Confirm Actual Cost, then process & confirm the parking payment", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      // 1. Reject the current parking payment request (reject pattern from 08_ConfirmPickup.cy.js).
      openProcessConfirmPaymentForm(registrationNumber, () => {
        rejectPayment("Automated reject to re-raise the parking payment");
      });

      // 2. Re-raise + process & confirm. Rejection drops the task back to
      //    "Add parking details"; openProcessConfirmPaymentForm completes the
      //    Confirm Actual Cost form itself before reaching the payment form.
      openProcessConfirmPaymentForm(registrationNumber, () => {
        withApprovedParkingAmount((approved) => {
          REQUIRED_PAYMENT_FIELDS.forEach((field) => fillPaymentField(field, approved));

          cy.contains("Amount must be equal to deal payment").should("not.exist");

          cy.get("#cta-btn").should("be.enabled").click();
          cy.get(".MuiDialogActions-root").contains("button", "Yes").click();

          // Exact wording unconfirmed — app follows a "<Action> Successfully!!!" pattern.
          cy.contains(/successfully/i).should("be.visible");
        });
      });
    });
  });
});

// Reads the "Approved Parking Amount:- ₹ N" banner and yields N (digits only).
function withApprovedParkingAmount(fn) {
  cy.contains(/Approved Parking Amount/i)
    .invoke("text")
    .then((text) => {
      const match = text.match(/([\d,]+(?:\.\d+)?)/);
      expect(match, "approved parking amount in the banner").to.not.be.null;
      fn(match[1].replace(/,/g, ""));
    });
}

// Fills a single mandatory Process & Confirm Payment field with a valid value.
function fillPaymentField(labelText, approvedAmount) {
  switch (labelText) {
    case "Select Payment Mode":
      return cy.selectAutocompleteUnlessPrefilled("Select Payment Mode", "Bank Transfer Imps");
    case "Enter Payment Amount in INR":
      return cy.get('input[name="amount"]').clear().type(approvedAmount);
    case "Enter Payment Date":
      return cy.fillDateUnlessPrefilled("Enter Payment Date", 0);
    case "Payment Receipt":
      return cy
        .get("#paymentReceipt")
        .selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });
    default:
      throw new Error(`No filler defined for payment field: ${labelText}`);
  }
}

function clearAutocomplete(labelText) {
  cy.contains("label", labelText)
    .parents(".MuiFormControl-root")
    .first()
    .find(".MuiAutocomplete-clearIndicator")
    .click({ force: true });
}

// Reject pattern mirrors 08_ConfirmPickup.cy.js.
function rejectPayment(remark) {
  cy.get("#reject").click();
  cy.wait(2000);

  // Scope to the "Confirm Reject Parking payment" dialog — the main form also
  // carries an input[name="remarks"] and there's a second .MuiDialogActions-root,
  // so an unscoped selector matches 2 elements.
  cy.contains("h2", "Confirm Reject Parking payment")
    .parent()
    .within(() => {
      cy.get('input[name="remarks"]').type(remark);
      cy.contains("button", "Yes").should("be.enabled").click();
    });

  cy.wait(2000);
}

// Retries reopening the task row (3s apart) until "Process & Confirm Payment"
// appears, up to `attemptsLeft` tries — the backend needs a moment to move
// the task from the actual-cost stage to the payment stage after re-raising
// it, and a single fixed wait wasn't consistently enough in headless runs.
function waitForProcessConfirmPaymentButton(registrationNumber, attemptsLeft) {
  cy.wait(3000);
  openMyTaskRow(registrationNumber);
  cy.contains("td", registrationNumber).parent("tr").click();
  cy.wait(1000);

  cy.get("body").then(($body) => {
    const hasButton = [...$body.find("button")].some((el) =>
      /Process & Confirm Payment/i.test(el.textContent)
    );

    if (hasButton || attemptsLeft <= 1) return;
    waitForProcessConfirmPaymentButton(registrationNumber, attemptsLeft - 1);
  });
}

function openMyTaskRow(registrationNumber) {
  cy.contains("Task Management").click();
  cy.wait(2000);
  cy.contains("button[role='tab']", "My Task").click();
  cy.get('input[placeholder="Search By RegNo"]').type(`${registrationNumber}{enter}`);
  cy.wait(2000);
}

function openProcessConfirmPaymentForm(registrationNumber, thenFn) {
  openMyTaskRow(registrationNumber);

  cy.get("body").then(($body) => {
    if ($body.find(`td[title="${registrationNumber}"]`).length === 0) {
      cy.log("Lead not found in the RegNo search results — skipping process & confirm payment.");
      return;
    }

    cy.contains("td", registrationNumber).parent("tr").click();
    cy.wait(1000);

    openProcessConfirmPaymentStage(registrationNumber, thenFn, 5);
  });
}

// Neither button may exist yet on the very first open: the backend can take
// a moment to move the task onto this stage right after a *prior* spec
// (09_ConfirmActualCost.cy.js) finishes its own submission, same lag
// waitForProcessConfirmPaymentButton already retries for after the re-raise
// below — this mirrors that retry for the initial open too, instead of
// failing immediately when the row hasn't caught up yet.
function openProcessConfirmPaymentStage(registrationNumber, thenFn, attemptsLeft) {
  cy.get("body").then(($detail) => {
    const hasAddParkingDetails = [...$detail.find("button")].some((el) =>
      /Add parking details/i.test(el.textContent)
    );
    const hasProcessConfirmPayment = [...$detail.find("button")].some((el) =>
      /Process & Confirm Payment/i.test(el.textContent)
    );

    if (!hasAddParkingDetails && !hasProcessConfirmPayment && attemptsLeft > 1) {
      cy.wait(3000);
      openMyTaskRow(registrationNumber);
      cy.contains("td", registrationNumber).parent("tr").click();
      cy.wait(1000);
      openProcessConfirmPaymentStage(registrationNumber, thenFn, attemptsLeft - 1);
      return;
    }

    if (hasAddParkingDetails) {
      // Parking payment not raised yet — complete the Confirm Actual Cost form
      // first (values per 09_ConfirmActualCost.cy.js), then reopen the task,
      // which now offers "Process & Confirm Payment".
      cy.contains("button", "Add parking details").click();
      cy.wait(2000);
      completeConfirmActualCostForm();

      // Backend needs a moment to move the task from the actual-cost stage
      // to the payment stage — a single fixed wait wasn't consistently
      // enough in headless runs, so retry the re-open instead of guessing
      // a bigger magic number.
      waitForProcessConfirmPaymentButton(registrationNumber, 5);
    }

    cy.contains("button", "Process & Confirm Payment").click();
    cy.wait(1000);
    thenFn(registrationNumber);
  });
}

// --- Confirm Actual Cost re-raise -------------------------------------------
// Duplicated from 09_ConfirmActualCost.cy.js — each regression spec stays self-contained.

const REQUIRED_ACCESSORY_FIELDS = [
  "Select Linkage System Status",
  "Select Back Left Tyre Status",
  "Select Front Right Tyre Status",
  "Select Back Right Tyre Status",
  "Select Toplink Status",
  "Select Hitch Status",
  "Select Battery Status",
  "Select Front Left Tyre Status",
  "Select Bumper Status",
  "Select Hood Status",
  "Select Drawbar Status",
];

// Fills and submits the already-open Confirm Actual Cost form. Field values
// mirror 09_ConfirmActualCost.cy.js (battery details per 03_RaiseDealPayment.cy.js).
function completeConfirmActualCostForm() {
  expandAllAccordions();

  // Config-driven accessory-checklist field — present only if this item still
  // exists in the system. Fill it if it's there, skip otherwise — matched
  // generically, not by its exact timestamp.
  cy.get("body").then(($body) => {
    const labelText = [...$body.find("label")]
      .map((el) => el.textContent.trim())
      .find((t) => /^Select Qa-Automation-Checklist-.+ Status\*$/i.test(t));

    if (labelText) {
      cy.selectAutocompleteUnlessPrefilled(labelText, "Absent");
    } else {
      cy.log("QA-Automation-Checklist dynamic field not present — skipping.");
    }
  });

  // Accordion 1 — Accessories Details (+ battery detail fields).
  REQUIRED_ACCESSORY_FIELDS.forEach((labelText) => {
    cy.selectAutocompleteUnlessPrefilled(
      labelText,
      labelText === "Select Battery Status" ? "Ok" : "Absent"
    );
  });
  cy.get("#batteryImage").selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });
  cy.fillTextUnlessPrefilled("Enter Serial No.", "BATT123456789");
  cy.selectAutocompleteUnlessPrefilled("Select Make", "TATA");

  // Accordion 2 — Final Parking Charges.
  cy.fillTextUnlessPrefilled("Enter Per Day Parking Charges", "100");
  cy.fillDateUnlessPrefilled("Reposession Date", -3);
  cy.fillDateUnlessPrefilled("Enter Pickup Date", 0);
  cy.selectAutocompleteUnlessPrefilled("Select payment mode", "Bank Transfer");
  cy.selectAutocompleteUnlessPrefilled("Select Bank Name", "Hdfc bank");
  cy.fillTextUnlessPrefilled("Enter Account holder Name", "Test User");
  cy.fillTextUnlessPrefilled("Enter Account Number", "1234567890");
  cy.fillTextUnlessPrefilled("Enter IFSC code", "HDFC0000123");
  cy.get("#accountProof").selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });
  cy.fillTextUnlessPrefilled("Enter Remarks", "Automated actual cost re-raise");

  cy.get("#cta-btn").should("be.enabled").click();
  cy.get(".MuiDialogActions-root").contains("button", "Yes").click();

  // Confirmed live: this flow's toast doesn't follow the generic
  // "<Action> Successfully!!!" pattern used elsewhere — it's
  // "Pickup Final Parking Charges Updated" (no "successfully" in it at
  // all), matching the Inventory Timeline entry left by this submit.
  cy.contains(/Pickup Final Parking Charges Updated/i).should("be.visible");
}

function expandAllAccordions() {
  cy.get(".MuiAccordionSummary-root").each(($summary) => {
    if (!$summary.hasClass("Mui-expanded")) {
      cy.wrap($summary).click();
    }
  });
}
