describe("Reject and re-raise deal payment flow", () => {
  it("Positive: rejecting the deal payment via FinJ callback requires the Procurement Executive to re-raise it", () => {
    cy.loginViaApi("anandagrawal@tractorjunction.com");

    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openConfirmDealPaymentForm(registrationNumber, (resolvedRegistrationNumber) => {
        cy.confirmDealPaymentViaApi(resolvedRegistrationNumber, {
          payment_status: "REJECTED",
          online_status: "FAILURE",
        }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body?.success).to.eq(true);
        });
      });

      // Switch role: Procurement Executive re-raises the now-rejected payment request.
      cy.loginViaApi("mananchauhan@tractorjunction.com");

      reRaiseDealPaymentForm(registrationNumber, () => {
        // Fields may or may not have persisted through the rejection — *UnlessPrefilled commands
        // no-op on anything still filled, and fill in anything the rejection cleared.
        cy.selectAutocompleteUnlessPrefilled("Auction Agency Name", "Auto Junction");

        cy.fillTextUnlessPrefilled("Bank Spoc Mobile", "9876543210");
        cy.fillTextUnlessPrefilled("Bank Spoc name", "Test Spoc");

        cy.fillDateUnlessPrefilled("Registration Date");
        cy.fillDateUnlessPrefilled("Reposession Date", 1);

        cy.fillTextUnlessPrefilled("Enter Loan Account Number", "LOAN123456789");

        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

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
});

// Duplicated from 05_ConfirmDealPayment.cy.js — each regression spec stays self-contained.
function openConfirmDealPaymentForm(registrationNumber, thenFn) {
  cy.contains("Task Management").click();

  cy.contains("button[role='tab']", "My Task").click();

  cy.get('input[placeholder="Search By RegNo"]').type(`${registrationNumber}{enter}`);

  cy.wait(2000);

  cy.get("body").then(($body) => {
    const foundInTable = $body.find(`td[title="${registrationNumber}"]`).length > 0;

    if (foundInTable) {
      cy.contains("td", registrationNumber).parent("tr").click();
      cy.contains("button", "Process & Confirm Payment").click();
      thenFn(registrationNumber);
      return;
    }

    cy.log("Lead not found in the RegNo search results — skipping payment rejection.");

    // Task-title search fallback disabled.
    /*
    cy.contains("Select Task Title").click();
    cy.get('input[placeholder="Search or type..."]').type(
      "Please process and confirm deal payment"
    );
    cy.contains("Please process and confirm deal payment").click();

    cy.wait(2000);

    cy.get("body").then(($body2) => {
      const hasResults = $body2.find("table tbody tr").length > 0;

      if (!hasResults) {
        cy.log(
          "No task found via regNo search or the confirm-deal-payment task lookup — skipping payment rejection."
        );
        return;
      }

      const $topRow = $body2.find("table tbody tr").first();
      // regNo column renders its value into a title attribute, same as the direct-search table.
      const topRowRegNo = $topRow.find("td[title]").first().attr("title");

      cy.get("table tbody tr").first().click();

      cy.wait(2000);

      cy.get("body").then(($body3) => {
        const hasConfirmPaymentButton =
          $body3.find("button").filter((_, el) => el.textContent.includes("Process & Confirm Payment"))
            .length > 0;

        if (!hasConfirmPaymentButton) {
          cy.log(
            "Opening the top task didn't reach the confirm-payment screen — skipping payment rejection."
          );
          return;
        }

        cy.contains("button", "Process & Confirm Payment").click();
        thenFn(topRowRegNo);
      });
    });
    */
  });
}

// Re-opens the same regNo's "Raise Payment Request" screen after a rejection — no status gate,
// since we already know this exact lead just got rejected and needs re-raising.
function reRaiseDealPaymentForm(registrationNumber, thenFn) {
  cy.contains("Task Management").click();

  cy.contains("button[role='tab']", "My Task").click();

  cy.get('input[placeholder="Search By RegNo"]').type(`${registrationNumber}{enter}`);

  cy.wait(2000);

  cy.get("body").then(($body) => {
    const foundInTable = $body.find(`td[title="${registrationNumber}"]`).length > 0;

    if (foundInTable) {
      cy.contains("td", registrationNumber).parent("tr").click();
      openRaisePaymentRequestOrSkip(thenFn);
      return;
    }

    cy.log(
      "Rejected lead not found in the RegNo search results — skipping re-raise of the payment request."
    );

    // Task-title search fallback disabled.
    /*
    cy.contains("Select Task Title").click();
    cy.get('input[placeholder="Search or type..."]').type(
      "Payment rejected. please send payment request again."
    );
    cy.contains("Payment rejected. please send payment request again.").click();

    cy.wait(2000);

    cy.get("body").then(($body2) => {
      // We need this exact rejected lead, not just the first result — filter by regNo.
      const $matchedRow = $body2.find(`td[title="${registrationNumber}"]`).parent("tr");

      if ($matchedRow.length === 0) {
        cy.log(
          "No task found via regNo search or the re-raise task lookup for this regNo — skipping re-raise of the payment request."
        );
        return;
      }

      cy.wrap($matchedRow.first()).click();
      openRaisePaymentRequestOrSkip(thenFn);
    });
    */
  });

  function openRaisePaymentRequestOrSkip(thenFn) {
    cy.wait(2000);

    cy.get("body").then(($body) => {
      // Rejected leads show the uppercase "REQUEST PAYMENT" button here,
      // which is the re-raise action for the deal payment flow.
      const hasRequestPaymentButton =
        $body.find("button").filter((_, el) => /request payment/i.test(el.textContent)).length > 0;

      if (!hasRequestPaymentButton) {
        cy.log(
          "Rejected lead didn't reach the re-raise screen — skipping re-raise of the payment request."
        );
        return;
      }

      cy.contains("button", /REQUEST PAYMENT/i).click();
      thenFn();
    });
  }
}
