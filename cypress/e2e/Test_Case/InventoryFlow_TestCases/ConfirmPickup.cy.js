describe("Confirm pickup flow", () => {
  beforeEach(() => {
    cy.loginViaApi("mananchauhan@tractorjunction.com");
  });

  it("Positive: confirms pickup from the top Team Task matching Please Confirm Pickup", () => {
    openTopConfirmPickupTask(() => {
      cy.get(".MuiDialogActions-root").contains("button", "Confirm").click();
      cy.contains(/successfully/i).should("be.visible");
    });
  });
});

function openTopConfirmPickupTask(thenFn) {
  cy.visit("/vms-admin/task-management");

  cy.contains("button[role='tab']", "Team Task").click();

  cy.contains("Select Task Title").click();
  cy.get('input[placeholder="Search or type..."]').type("Please Confirm Pickup{enter}");

  cy.wait(2000);

  cy.get("table tbody tr").should("have.length.at.least", 1).first().click();

  cy.contains("button", "Confirm Pickup").click();
  thenFn();
}
