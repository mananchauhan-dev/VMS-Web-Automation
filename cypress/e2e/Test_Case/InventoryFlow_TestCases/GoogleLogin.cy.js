describe("Login", () => {
  it("should login via API and land on dashboard", () => {
    
    cy.loginViaApi();

    cy.url().should("include", Cypress.config("baseUrl"));

    cy.window()
      .its("localStorage")
      .invoke("getItem", "token")
      .should("not.be.null");
  });
});
