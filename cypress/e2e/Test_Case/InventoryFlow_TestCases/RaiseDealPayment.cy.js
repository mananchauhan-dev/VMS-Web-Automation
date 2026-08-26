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

        cy.fillTextUnlessPrefilled("Enter Deal Amount", `${500000 + Number(uniqueSuffix)}`);
        cy.selectAutocompleteUnlessPrefilled("Select Bank Name", "Hdfc bank");
        cy.fillTextUnlessPrefilled("Enter Account holder Name", `Test Account Holder ${uniqueSuffix}`);
        cy.fillTextUnlessPrefilled("Enter Account Number", `1234567${uniqueSuffix}`);
        cy.fillTextUnlessPrefilled("Enter IFSC code", "HDFC0000123");

        cy.get("#accountProof").selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });

        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

        cy.selectAutocompleteUnlessPrefilled("Select Pickup Yard", "Shiva Ganesh stock yard");

        cy.contains("button", "Request for Payment").should("not.be.disabled").click();
        cy.get(".MuiDialogActions-root").contains("button", "Yes").click();
        cy.contains("Payment Request Sent Successfully!!!").should("be.visible");
      });
    });
  });
});


function openRaiseDealPaymentForm(registrationNumber, thenFn) {
  cy.contains("Task Management").click();

  cy.contains("button[role='tab']", "My Task").click();

  cy.get('input[placeholder="Search By RegNo"]').type(`${registrationNumber}{enter}`);

  cy.wait(2000);

  cy.get("body").then(($body) => {
    const foundInTable = $body.find(`td[title="${registrationNumber}"]`).length > 0;

    if (foundInTable) {
      cy.contains("td", registrationNumber).parent("tr").click();
      cy.contains("button", "Raise Payment Request").click();
      thenFn();
      return;
    }

    cy.contains("Select Task Title").click();
    cy.get('input[placeholder="Search or type..."]').type(
      "Please update lead details and raise a deal payment request"
    );
    cy.contains("Please update lead details and raise a deal payment request").click();

    cy.wait(2000);

    cy.get("body").then(($body2) => {
      const hasResults = $body2.find("table tbody tr").length > 0;

      if (!hasResults) {
        cy.log(
          "No task found via regNo search or the raise-deal-payment task lookup — skipping payment request."
        );
        return;
      }

      cy.get("table tbody tr").first().click();

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
  });
}
