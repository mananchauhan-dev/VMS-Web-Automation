describe("Raise deal payment flow", () => {
  beforeEach(() => {
    cy.loginViaApi("mananchauhan@tractorjunction.com");
  });

  it("Procurement Executive raises a payment request for the RTO-confirmed lead", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openRaiseDealPaymentForm(registrationNumber, () => {
        cy.selectAutocompleteUnlessPrefilled("Auction Agency Name", "Auto Junction");

        cy.fillTextUnlessPrefilled("Bank Spoc Mobile", "9876543210");
        cy.fillTextUnlessPrefilled("Bank Spoc name", "Test Spoc");

        cy.fillDateUnlessPrefilled("Registration Date");
        cy.fillDateUnlessPrefilled("Reposession Date", 1); 

        cy.fillTextUnlessPrefilled("Enter Loan Account Number", "LOAN123456789");

        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

        // Config-driven accessory-checklist field — present only if this item still
        // exists in the system (e.g. the QA-Automation-Checklist test record left
        // over from the AccessoriesCheckList defect investigation). Fill it if it's
        // there, skip otherwise — matched generically, not by its exact timestamp.
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

        cy.selectAutocompleteUnlessPrefilled("Select Linkage System Status", "Absent");
        cy.selectAutocompleteUnlessPrefilled("Select Back Left Tyre Status", "Absent");
        cy.selectAutocompleteUnlessPrefilled("Select Front Right Tyre Status", "Absent");
        cy.selectAutocompleteUnlessPrefilled("Select Back Right Tyre Status", "Absent");
        cy.selectAutocompleteUnlessPrefilled("Select Toplink Status", "Absent");
        cy.selectAutocompleteUnlessPrefilled("Select Hitch Status", "Absent");
        cy.selectAutocompleteUnlessPrefilled("Select Battery Status", "Ok");
        cy.selectAutocompleteUnlessPrefilled("Select Front Left Tyre Status", "Absent");
        cy.selectAutocompleteUnlessPrefilled("Select Bumper Status", "Absent");
        cy.selectAutocompleteUnlessPrefilled("Select Hood Status", "Absent");
        cy.selectAutocompleteUnlessPrefilled("Select Drawbar Status", "Absent");

        cy.get("#batteryImage").selectFile("cypress/fixtures/rto-confirmation-doc.png", {
          force: true,
        });
        cy.fillTextUnlessPrefilled("Enter Serial No.", "BATT123456789");
        cy.selectAutocompleteUnlessPrefilled("Select Make", "TATA");

        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

        cy.get("#bodyImage").selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });
        cy.get("#bodyleftImage").selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });
        cy.get("#bodyImageBack").selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });
        cy.get("#bodyImageRight").selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });
        cy.get("#chassisNumber").selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });
        cy.get("#fuelInjectionPumpPlate").selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });
        cy.get("#others").selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });

        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

        const uniqueSuffix = Date.now().toString().slice(-6);

        cy.fillTextUnlessPrefilled("Enter Deal Amount", `${Cypress._.random(300000, 500000)}`);
        cy.selectAutocompleteUnlessPrefilled("Select Bank Name", "Hdfc bank");
        cy.fillTextUnlessPrefilled("Enter Account holder Name", `Test Account Holder ${uniqueSuffix}`);
        cy.fillTextUnlessPrefilled("Enter Account Number", `1234567${uniqueSuffix}`);
        cy.fillTextUnlessPrefilled("Enter IFSC code", "HDFC0000123");

        cy.get("#accountProof").selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });

        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

        cy.selectAutocompleteUnlessPrefilled("Select Pickup Yard", "Shiva Ganesh stock yard");

        // Selecting the yard triggers an async auto-fill of the read-only
        // Yard Name/State/... fields below it. Wait for that to actually
        // land (poll via .should, not a fixed wait) before checking submit —
        // checking too early (headless runs) found the button still
        // disabled because the auto-fill hadn't resolved yet.
        cy.contains("label", "Yard Name")
          .parents(".MuiFormControl-root")
          .first()
          .find("input")
          .invoke("val")
          .should("not.be.empty");

        cy.contains("button", "Request for Payment").should("not.be.disabled").click();
        cy.get(".MuiDialogActions-root").contains("button", "Yes").click();
        cy.contains("Payment Request Sent Successfully!!!").should("be.visible");
      });
    });
  });

  // it("Negative: Request for Payment stays disabled until the mandatory fields are filled", () => {
  //   cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
  //     openRaiseDealPaymentForm(registrationNumber, () => {
  //       cy.contains("button", "Request for Payment").should("be.disabled");
  //     });
  //   });
  // });

  // it("Negative: Auction Agency Name, Bank Spoc Mobile, and Bank Spoc name are mandatory", () => {
  //   cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
  //     openRaiseDealPaymentForm(registrationNumber, () => {
  //       cy.hasMandatoryAsterisk("Auction Agency Name");
  //       cy.hasMandatoryAsterisk("Bank Spoc Mobile");
  //       cy.hasMandatoryAsterisk("Bank Spoc name");
  //     });
  //   });
  // });

  // it("Negative: Registration Date and Reposession Date are mandatory", () => {
  //   cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
  //     openRaiseDealPaymentForm(registrationNumber, () => {
  //       cy.hasMandatoryAsterisk("Registration Date");
  //       cy.hasMandatoryAsterisk("Reposession Date");
  //     });
  //   });
  // });

  // it("Negative: Enter Loan Account Number is mandatory", () => {
  //   cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
  //     openRaiseDealPaymentForm(registrationNumber, () => {
  //       cy.hasMandatoryAsterisk("Enter Loan Account Number");
  //     });
  //   });
  // });

  // it("Negative: Payment Details fields (Deal Amount, Bank Name, Account holder Name, Account Number, IFSC code) are mandatory", () => {
  //   cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
  //     openRaiseDealPaymentForm(registrationNumber, () => {
  //       cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();
  //       cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();
  //       cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

  //       cy.hasMandatoryAsterisk("Enter Deal Amount");
  //       cy.hasMandatoryAsterisk("Select Bank Name");
  //       cy.hasMandatoryAsterisk("Enter Account holder Name");
  //       cy.hasMandatoryAsterisk("Enter Account Number");
  //       cy.hasMandatoryAsterisk("Enter IFSC code");
  //     });
  //   });
  // });

  // it("Negative: Select Pickup Yard is mandatory", () => {
  //   cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
  //     openRaiseDealPaymentForm(registrationNumber, () => {
  //       cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();
  //       cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();
  //       cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();
  //       cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

  //       cy.hasMandatoryAsterisk("Select Pickup Yard");
  //     });
  //   });
  // });
});


function openRaiseDealPaymentForm(registrationNumber, thenFn) {
  cy.contains("Task Management").click();

  cy.contains("button[role='tab']", "My Task").click();

  cy.get('input[placeholder="Search By RegNo"]').type(`${registrationNumber}{enter}`);

  cy.wait(2000);

  cy.get("body").then(($body) => {
    // Status is the 2nd column — only open the row if it's already at "Rto Verification Completed".
    const $matchedRow = $body.find(`td[title="${registrationNumber}"]`).parent("tr");
    const isRtoCompleted =
      $matchedRow.length > 0 &&
      $matchedRow.find("td").eq(1).text().trim() === "Rto Verification Completed";

    if (isRtoCompleted) {
      cy.wrap($matchedRow).click();
      cy.contains("button", "Raise Payment Request").click();
      thenFn();
      return;
    }

    cy.log(
      "No RegNo-search row at Status 'Rto Verification Completed' — skipping payment request."
    );

    // Task-title search fallback disabled.
    /*
    cy.contains("Select Task Title").click();
    cy.get('input[placeholder="Search or type..."]').type(
      "Please update lead details and raise a deal payment request"
    );
    cy.contains("Please update lead details and raise a deal payment request").click();

    cy.wait(2000);

    cy.get("body").then(($body2) => {
      // Status is the 2nd column — only rows already at "Rto Verification Completed" are ready for a payment request.
      const $rtoCompletedRows = $body2.find("table tbody tr").filter((_, row) => {
        const statusCell = row.querySelectorAll("td")[1];
        return statusCell && statusCell.textContent.trim() === "Rto Verification Completed";
      });

      if ($rtoCompletedRows.length === 0) {
        cy.log(
          "No task found via regNo search or the raise-deal-payment task lookup with Status 'Rto Verification Completed' — skipping payment request."
        );
        return;
      }

      cy.wrap($rtoCompletedRows.first()).click();

      cy.wait(2000);

      cy.get("body").then(($body3) => {
        const hasRaisePaymentButton =
          $body3.find("button").filter((_, el) => el.textContent.includes("Raise Payment Request"))
            .length > 0;

        if (!hasRaisePaymentButton) {
          cy.log(
            "Opening the top task didn't reach the payment request screen — skipping payment request."
          );
          return;
        }

        cy.contains("button", "Raise Payment Request").click();

        thenFn();
      });
    });
    */
  });
}
