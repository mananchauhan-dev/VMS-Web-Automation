describe("Raise deal payment flow", () => {
  beforeEach(() => {
    cy.loginViaApi();
  });

  it("Procurement Executive raises a payment request for the RTO-confirmed lead", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      cy.contains("Task Management").click();

      cy.contains("button[role='tab']", "My Task").click();

      cy.get('input[placeholder="Search By RegNo"]').type(`${registrationNumber}{enter}`);

      cy.wait(2000);

      cy.contains("td", registrationNumber).parent("tr").click();

      cy.contains("button", "Raise Payment Request").click();

      cy.selectAutocompleteUnlessPrefilled("Auction Agency Name", "Auto Junction");

      cy.fillTextUnlessPrefilled("Bank Spoc Mobile", "9876543210");
      cy.fillTextUnlessPrefilled("Bank Spoc name", "Test Spoc");

      cy.fillDateUnlessPrefilled("Registration Date");
      cy.fillDateUnlessPrefilled("Reposession Date", 1); // tomorrow

      cy.fillTextUnlessPrefilled("Enter Loan Account Number", "LOAN123456789");

      cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

      cy.selectAutocompleteUnlessPrefilled("Select Linkage Status", "Absent");
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
      cy.selectAutocompleteUnlessPrefilled("Select Make", "TODO_BATTERY_MAKE");

      cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();
      cy.contains("button", "Submit").click();
      cy.contains("Payment Request Raised Successfully").should("be.visible");
    });
  });
});
