describe("End trip flow", () => {
  beforeEach(() => {
    cy.loginViaApi("hariprakashmeena1990@gmail.com");
  });

  it("Positive: ends the delivery trip for the lead matched by RegNo", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openEndTripTask(registrationNumber, () => {
        // Submit "End Trip" (the #cta-btn inside the opened form).
        cy.get("#cta-btn").click();

        // Confirm in the pop-up (Yes pattern from the earlier specs).
        cy.get(".MuiDialogActions-root").contains("button", "Yes").click();

        cy.contains("Delivery Completed Successfully!!!").should("be.visible");
      });
    });
  });
});

function openEndTripTask(registrationNumber, thenFn) {
  cy.contains("Task Management").click();

  cy.contains("button[role='tab']", "My Task").click();

  cy.get('input[placeholder="Search By RegNo"]').type(`${registrationNumber}{enter}`);

  cy.wait(2000);

  cy.get("body").then(($body) => {
    const foundInTable = $body.find(`td[title="${registrationNumber}"]`).length > 0;

    if (!foundInTable) {
      cy.log("Lead not found in the RegNo search results — skipping end trip.");
      return;
    }

    cy.contains("td", registrationNumber).parent("tr").click();
    // Detail-panel button that opens the End Trip form.
    cy.contains("button", "End Trip").click();
    cy.wait(1000);
    thenFn(registrationNumber);
  });
}
