describe("Inventory flow", () => {
  let registrationNumber;

  beforeEach(() => {
    cy.loginViaApi();
  });

  it("Positive: generates a lead when inventory is created with valid data", () => {
        registrationNumber = `MH12AB${Date.now().toString().slice(-4)}`;

    // registrationNumber = `RJ53RA3355`;

    cy.writeFile("cypress/tmp/lastCreatedLead.json", { registrationNumber });

    cy.contains("button", "Create Inventory").click();

    cy.selectAutocomplete("Purchase Type", "Bank Auction");

    cy.get('input[name="regNo"]').clear().type(registrationNumber);
    cy.contains("button", "Verify").should("be.enabled").click();

    cy.wait(3000);

    cy.selectAutocompleteUnlessPrefilled("Registration State", "Maharashtra");
    cy.selectAutocompleteUnlessPrefilled("Vehicle Type", "Tractor");
    cy.selectAutocompleteUnlessPrefilled("Bank Name", "Hdfc bank");

    cy.contains("button", "Next").should("be.enabled").click();

    cy.wait(3000);

    cy.selectAutocompleteUnlessPrefilled("Make", "Swaraj");

    cy.contains("label", "Make")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("have.value", "Swaraj");

    cy.contains("label", "Model")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("not.be.disabled");

    cy.selectAutocomplete("Model", "855 FE");

    cy.fillTextUnlessPrefilled("Select Manufacturing Year", "2020");
    cy.fillTextUnlessPrefilled("Engine Number", "EN123456789");
    cy.fillTextUnlessPrefilled("Chassis Number", "CH123456789");

    cy.get("form input").each(($input) => {
      cy.log(
        `${$input.attr("name") || $input.attr("id")}: value="${$input.val()}" disabled=${$input.prop("disabled")}`
      );
    });

    cy.get("#cta-btn").should("be.enabled").click();

    cy.get(".MuiDialogActions-root")
      .contains("button", "Yes")
      .click();

    cy.contains("Lead Generated Successfully!!!").should("be.visible");
  });

  it("Negative: invalid registration number blocks lead creation", () => {
    cy.contains("button", "Create Inventory").click();

    cy.selectAutocomplete("Purchase Type", "Bank Auction");

    cy.get('input[name="regNo"]').clear().type("INVALID123");
    cy.contains("button", "Verify").click();

    cy.wait(3000);
    cy.contains("button", "Next").should("be.disabled");
  });

  it("Negative: leaving a required field (Model) empty blocks lead creation", () => {
    const registrationNumber = `UP14AB${Date.now().toString().slice(-4)}`;

    cy.contains("button", "Create Inventory").click();

    cy.selectAutocomplete("Purchase Type", "Bank Auction");

    cy.get('input[name="regNo"]').clear().type(registrationNumber);
    cy.contains("button", "Verify").should("be.enabled").click();

    cy.wait(3000);

    cy.selectAutocompleteUnlessPrefilled("Registration State", "Maharashtra");
    cy.selectAutocompleteUnlessPrefilled("Vehicle Type", "Tractor");
    cy.selectAutocompleteUnlessPrefilled("Bank Name", "Hdfc bank");

    cy.contains("button", "Next").should("be.enabled").click();

    cy.wait(3000);

    cy.selectAutocompleteUnlessPrefilled("Make", "Swaraj");

    cy.get("#cta-btn-disabled").should("exist");
    cy.contains("Lead Generated Successfully!!!").should("not.exist");
  });

  it("Negative: an already-registered vehicle blocks lead creation", () => {
    cy.contains("button", "Create Inventory").click();

    cy.selectAutocomplete("Purchase Type", "Bank Auction");

    cy.get('input[name="regNo"]').clear().type(registrationNumber);
    cy.contains("button", "Verify").should("be.enabled").click();

    cy.wait(3000);

    cy.selectAutocompleteUnlessPrefilled("Registration State", "Maharashtra");
    cy.selectAutocompleteUnlessPrefilled("Vehicle Type", "Tractor");
    cy.selectAutocompleteUnlessPrefilled("Bank Name", "Hdfc bank");

    cy.contains("button", "Next").should("be.enabled").click();

    cy.wait(3000);

    cy.selectAutocompleteUnlessPrefilled("Make", "Swaraj");

    cy.contains("label", "Make")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("have.value", "Swaraj");

    cy.contains("label", "Model")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("not.be.disabled");

    cy.selectAutocomplete("Model", "855 FE");

    cy.fillTextUnlessPrefilled("Select Manufacturing Year", "2020");
    cy.fillTextUnlessPrefilled("Engine Number", "EN123456789");
    cy.fillTextUnlessPrefilled("Chassis Number", "CH123456789");

    cy.get("#cta-btn").should("be.enabled").click();

    cy.get(".MuiDialogActions-root")
      .contains("button", "Yes")
      .click();

    cy.contains("Reg No already exist").should("be.visible");
    cy.contains("Lead Generated Successfully!!!").should("not.exist");
  });
});
