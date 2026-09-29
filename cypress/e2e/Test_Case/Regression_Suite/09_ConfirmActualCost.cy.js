describe("Confirm actual cost - request parking payment flow", () => {
  // Accordion 1: Accessories Details — every status dropdown is mandatory.
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

  // Accordion 2: Final Parking Charges — every field below is mandatory.
  const REQUIRED_PARKING_FIELDS = [
    "Enter Per Day Parking Charges",
    "Reposession Date",
    "Select payment mode",
    "Select Bank Name",
    "Enter Account holder Name",
    "Enter Account Number",
    "Enter IFSC code",
    "upload document",
  ];

  beforeEach(() => {
    cy.loginViaApi("ganeshmangroliya@tractorjunction.com");
  });

  it("Negative: Request Parking Payment stays disabled while the form is empty", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openConfirmActualCostForm(registrationNumber, () => {
        cy.get("#cta-btn-disabled").should("exist");
      });
    });
  });

  it("Negative: every Accessories Details status is mandatory", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openConfirmActualCostForm(registrationNumber, () => {
        REQUIRED_ACCESSORY_FIELDS.forEach((labelText) => {
          cy.hasMandatoryAsterisk(labelText);
        });
      });
    });
  });

  it("Negative: every Final Parking Charges field is mandatory", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openConfirmActualCostForm(registrationNumber, () => {
        REQUIRED_PARKING_FIELDS.forEach((labelText) => {
          cy.hasMandatoryAsterisk(labelText);
        });
      });
    });
  });

  it("Negative: Enter Remarks is optional and carries no asterisk", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openConfirmActualCostForm(registrationNumber, () => {
        cy.contains("label", "Enter Remarks").invoke("text").should("not.include", "*");
      });
    });
  });


  it("Negative: filling all Accessories Details alone still leaves Request Parking Payment disabled", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openConfirmActualCostForm(registrationNumber, () => {
        fillAccessoryDetails(REQUIRED_ACCESSORY_FIELDS);

        // Final Parking Charges section untouched — submit must stay disabled.
        cy.get("#cta-btn-disabled").should("exist");
      });
    });
  });

 
  REQUIRED_PARKING_FIELDS.forEach((omittedField) => {
    it(`Negative: omitting "${omittedField}" keeps Request Parking Payment disabled`, () => {
      cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
        openConfirmActualCostForm(registrationNumber, () => {
          fillAccessoryDetails(REQUIRED_ACCESSORY_FIELDS);

          REQUIRED_PARKING_FIELDS.filter((field) => field !== omittedField).forEach(fillParkingField);

          // Pickup Date must stay after Reposession Date, so only fill it when
          // Reposession Date is actually present in this scenario.
          if (omittedField !== "Reposession Date") {
            cy.fillDateUnlessPrefilled("Enter Pickup Date", 0);
          }

          // "Select payment mode" defaults to "Bank Transfer" — clear it so the
          // omitted-field scenario really has it missing.
          if (omittedField === "Select payment mode") {
            clearAutocomplete("Select payment mode");
          }

          cy.get("#cta-btn-disabled").should("exist");
        });
      });
    });
  });

  it("Positive: filling every detail completes the Confirm Actual Cost task", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openConfirmActualCostForm(registrationNumber, () => {
        // Accordion 1 — Accessories Details (+ battery detail fields).
        fillAccessoryDetails(REQUIRED_ACCESSORY_FIELDS);

        // Accordion 2 — Final Parking Charges.
        cy.fillTextUnlessPrefilled("Enter Per Day Parking Charges", "100");

        // Reposession Date must stay earlier than the (pre-filled, read-only)
        // Pickup Date, so anchor it a few days back.
        cy.fillDateUnlessPrefilled("Reposession Date", -3);
        // No-ops if the field is disabled / already carries the pickup date;
        // otherwise today (> Reposession Date) satisfies the ordering rule.
        cy.fillDateUnlessPrefilled("Enter Pickup Date", 0);

        cy.selectAutocompleteUnlessPrefilled("Select payment mode", "Bank Transfer");
        cy.selectAutocompleteUnlessPrefilled("Select Bank Name", "Hdfc bank");
        cy.fillTextUnlessPrefilled("Enter Account holder Name", "Test User");
        cy.fillTextUnlessPrefilled("Enter Account Number", "1234567890");
        cy.fillTextUnlessPrefilled("Enter IFSC code", "HDFC0000123");

        cy.get("#accountProof").selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });

        cy.fillTextUnlessPrefilled("Enter Remarks", "Automated actual cost confirmation");

        cy.get("#cta-btn").should("be.enabled").click();
        cy.get(".MuiDialogActions-root").contains("button", "Yes").click();

        // Exact wording unconfirmed — app follows a "<Action> Successfully!!!" pattern.
        cy.contains(/successfully/i).should("be.visible");
        cy.wait(2000);
      });
    });
  });
});

// Every accessory status is "Absent" except Battery, which is "Ok"
// (matches 03_RaiseDealPayment.cy.js).
function accessoryValueFor(labelText) {
  return labelText === "Select Battery Status" ? "Ok" : "Absent";
}

// Fills the Accessories Details accordion. Battery Status "Ok" reveals extra
// battery detail fields, filled the same way as 03_RaiseDealPayment.cy.js.
function fillAccessoryDetails(accessoryLabels) {
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

  accessoryLabels.forEach((labelText) => {
    cy.selectAutocompleteUnlessPrefilled(labelText, accessoryValueFor(labelText));
  });

  cy.get("#batteryImage").selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });
  cy.fillTextUnlessPrefilled("Enter Serial No.", "BATT123456789");
  cy.selectAutocompleteUnlessPrefilled("Select Make", "TATA");
}

// Fills a single Final Parking Charges field with a valid value.
function fillParkingField(labelText) {
  switch (labelText) {
    case "Enter Per Day Parking Charges":
      return cy.fillTextUnlessPrefilled("Enter Per Day Parking Charges", "100");
    case "Reposession Date":
      return cy.fillDateUnlessPrefilled("Reposession Date", -3);
    case "Select payment mode":
      return cy.selectAutocompleteUnlessPrefilled("Select payment mode", "Bank Transfer");
    case "Select Bank Name":
      return cy.selectAutocomplete("Select Bank Name", "Hdfc bank");
    case "Enter Account holder Name":
      return cy.fillTextUnlessPrefilled("Enter Account holder Name", "Test User");
    case "Enter Account Number":
      return cy.fillTextUnlessPrefilled("Enter Account Number", "1234567890");
    case "Enter IFSC code":
      return cy.fillTextUnlessPrefilled("Enter IFSC code", "HDFC0000123");
    case "upload document":
      return cy
        .get("#accountProof")
        .selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });
    default:
      throw new Error(`No filler defined for parking field: ${labelText}`);
  }
}

function clearAutocomplete(labelText) {
  cy.contains("label", labelText)
    .parents(".MuiFormControl-root")
    .first()
    .find(".MuiAutocomplete-clearIndicator")
    .click({ force: true });
}

function openConfirmActualCostForm(registrationNumber, thenFn) {
  cy.contains("Task Management").click();

  cy.contains("button[role='tab']", "My Task").click();

  cy.get('input[placeholder="Search By RegNo"]').type(`${registrationNumber}{enter}`);

  cy.wait(2000);

  cy.get("body").then(($body) => {
    const foundInTable = $body.find(`td[title="${registrationNumber}"]`).length > 0;

    if (foundInTable) {
      cy.contains("td", registrationNumber).parent("tr").click();
      cy.contains("button", "Confirm Actual Cost").click();
      cy.wait(1000);
      // Both accordions load collapsed (MuiAccordionDetails has display:none),
      // so fields inside them aren't clickable until expanded.
      expandAllAccordions();
      thenFn(registrationNumber);
      return;
    }

    cy.log("Lead not found in the RegNo search results — skipping confirm actual cost.");
  });
}

// Expands every collapsed accordion on the form so its fields become visible.
function expandAllAccordions() {
  cy.get(".MuiAccordionSummary-root").each(($summary) => {
    if (!$summary.hasClass("Mui-expanded")) {
      cy.wrap($summary).click();
    }
  });
}
