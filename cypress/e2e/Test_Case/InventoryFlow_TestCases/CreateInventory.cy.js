describe("Inventory flow", () => {
  let registrationNumber;

  beforeEach(() => {
    cy.loginViaApi();
  });

  it("Positive: generates a lead when inventory is created with valid data", () => {
    registrationNumber = `MH12AB${Date.now().toString().slice(-4)}`;

    cy.writeFile("cypress/tmp/lastCreatedLead.json", { registrationNumber });

    completeStepOne(registrationNumber);
    completeStepTwo();
    submitLead();

    cy.contains("Lead Generated Successfully!!!", { timeout: 10000 }).should("be.visible");
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
    completeStepOne(generateRegNo("UP14AB"));

    cy.selectAutocompleteUnlessPrefilled("Make", "Swaraj");

    cy.get("#cta-btn-disabled").should("exist");
    cy.contains("Lead Generated Successfully!!!").should("not.exist");
  });

  it("Negative: an already-registered vehicle blocks lead creation", () => {
    // Reuses the regNo the first (positive) test above already created.
    completeStepOne(registrationNumber);
    completeStepTwo();
    submitLead();

    cy.contains("Reg No already exist", { timeout: 10000 }).should("be.visible");
    cy.contains("Lead Generated Successfully!!!").should("not.exist");
  });

  it("Positive: Purchase Type defaults to Bank Auction, is mandatory, and can switch to Dealership Sale", () => {
    cy.contains("button", "Create Inventory").click();

    cy.hasMandatoryAsterisk("Purchase Type");

    cy.contains("label", "Purchase Type")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("have.value", "Bank Auction");

    cy.selectAutocomplete("Purchase Type", "Dealership Sale");

    cy.contains("label", "Purchase Type")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("have.value", "Dealership Sale");
  });

  it("Positive: Registration Number input is auto-uppercased", () => {
    cy.contains("button", "Create Inventory").click();
    cy.selectAutocomplete("Purchase Type", "Bank Auction");

    cy.hasMandatoryAsterisk("Registration Number");

    cy.get('input[name="regNo"]').clear().type("rj53ra1234");
    cy.get('input[name="regNo"]').should("have.value", "RJ53RA1234");
  });

  it("Negative: leaving Registration Number blank keeps Verify disabled and shows a validation message", () => {
    cy.contains("button", "Create Inventory").click();
    cy.selectAutocomplete("Purchase Type", "Bank Auction");

    cy.get('input[name="regNo"]').clear().blur();

    cy.contains("button", "Verify").should("be.disabled");
    cy.contains("Registration number is mandatory").should("be.visible");
  });

  it("Positive: Vehicle Type defaults to Tractor, is mandatory, and can switch to Commercial Vehicle", () => {
    const regNo = generateRegNo();

    cy.contains("button", "Create Inventory").click();
    cy.selectAutocomplete("Purchase Type", "Bank Auction");

    cy.hasMandatoryAsterisk("Vehicle Type");

    cy.contains("label", "Vehicle Type")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("have.value", "Tractor");

    cy.get('input[name="regNo"]').clear().type(regNo);
    cy.contains("button", "Verify").should("be.enabled").click();

    cy.wait(6000);

    cy.clickAutocomplete("Vehicle Type");
    cy.get('ul[role="listbox"] li').contains("Commercial Vehicle").should("exist");

    cy.selectAutocompleteUnlessPrefilled("Vehicle Type", "Commercial Vehicle");

    cy.contains("label", "Vehicle Type")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("have.value", "Commercial Vehicle");
  });

  it("Positive: Bank Name is mandatory, searchable, removable via the clear icon, and reselectable", () => {
    const regNo = generateRegNo();
    completeStepOneOnly(regNo);

    cy.hasMandatoryAsterisk("Bank Name");

    cy.selectAutocomplete("Bank Name", "Hdfc bank");
    cy.contains("label", "Bank Name")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("have.value", "Hdfc bank");

    cy.contains("label", "Bank Name")
      .parents(".MuiFormControl-root")
      .first()
      .find(".MuiAutocomplete-clearIndicator")
      .click({ force: true });

    cy.contains("label", "Bank Name")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("have.value", "");

    cy.selectAutocomplete("Bank Name", "Hdfc bank");
    cy.contains("label", "Bank Name")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("have.value", "Hdfc bank");
  });

  it("Positive: Back button returns to Step 1 and stays enabled", () => {
    const regNo = generateRegNo();
    completeStepOne(regNo);

    cy.contains("button", "Back").should("be.enabled").click();

    cy.contains("label", "Purchase Type").should("be.visible");
    cy.get('input[name="regNo"]').should("have.value", regNo);
  });

  it("Positive: Make is mandatory and its Search Make field filters and selects a value", () => {
    const regNo = generateRegNo();
    completeStepOne(regNo);

    cy.hasMandatoryAsterisk("Make");

    cy.contains("label", "Make")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("have.attr", "placeholder", "Search make")
      .click()
      .type("Swaraj");

    cy.get('ul[role="listbox"] li').contains("Swaraj").click();

    cy.contains("label", "Make")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("have.value", "Swaraj");
  });

  it("Positive: Model is mandatory, disabled until Make is selected, and its Search Model field works", () => {
    const regNo = generateRegNo();
    completeStepOne(regNo);

    cy.hasMandatoryAsterisk("Model");

    cy.contains("label", "Model")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("be.disabled");

    cy.selectAutocompleteUnlessPrefilled("Make", "Swaraj");

    cy.contains("label", "Model")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("not.be.disabled")
      .should("have.attr", "placeholder", "Search model")
      .click()
      .type("855");

    cy.get('ul[role="listbox"] li').contains("855 FE").click();

    cy.contains("label", "Model")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("have.value", "855 FE");
  });

  it("Negative: leaving Engine Number empty blocks inventory creation", () => {
    const regNo = generateRegNo();
    completeStepOne(regNo);

    cy.selectAutocompleteUnlessPrefilled("Make", "Swaraj");
    cy.selectAutocomplete("Model", "855 FE");

    cy.fillTextUnlessPrefilled("Select Manufacturing Year", "2020");
    cy.fillTextUnlessPrefilled("Chassis Number", "CH123456789");

    cy.contains("label", "Engine Number")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .then(($input) => {
        if ($input.val()) {
          cy.log("Engine Number was auto-filled by Vahan verify — skipping empty-field validation check.");
          return;
        }

        cy.hasMandatoryAsterisk("Engine Number");
        cy.get("#cta-btn-disabled").should("exist");
        cy.contains("Lead Generated Successfully!!!").should("not.exist");
      });
  });

  it("Negative: leaving Chassis Number empty blocks inventory creation", () => {
    const regNo = generateRegNo();
    completeStepOne(regNo);

    cy.selectAutocompleteUnlessPrefilled("Make", "Swaraj");
    cy.selectAutocomplete("Model", "855 FE");

    cy.fillTextUnlessPrefilled("Select Manufacturing Year", "2020");
    cy.fillTextUnlessPrefilled("Engine Number", "EN123456789");

    cy.contains("label", "Chassis Number")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .then(($input) => {
        if ($input.val()) {
          cy.log("Chassis Number was auto-filled by Vahan verify — skipping empty-field validation check.");
          return;
        }

        cy.hasMandatoryAsterisk("Chassis Number");
        cy.get("#cta-btn-disabled").should("exist");
        cy.contains("Lead Generated Successfully!!!").should("not.exist");
      });
  });

  it("Positive: Engine Number and Chassis Number accept alphanumeric values, and Remark is optional free text", () => {
    const regNo = generateRegNo();
    completeStepOne(regNo);

    cy.selectAutocompleteUnlessPrefilled("Make", "Swaraj");
    cy.selectAutocomplete("Model", "855 FE");

    cy.fillTextUnlessPrefilled("Select Manufacturing Year", "2020");
    cy.fillTextUnlessPrefilled("Engine Number", "EN12AB3456");
    cy.fillTextUnlessPrefilled("Chassis Number", "CH98ZX7654");

    cy.contains("label", "Engine Number")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("have.value", "EN12AB3456");

    cy.contains("label", "Chassis Number")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("have.value", "CH98ZX7654");

    // Remark is left untouched here to prove the CTA enables without it.
    cy.get("#cta-btn").should("be.enabled");

    cy.fillTextUnlessPrefilled("Remarks", "Vehicle inspected, minor scratches on left panel.");

    cy.contains("label", "Remarks")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .should("have.value", "Vehicle inspected, minor scratches on left panel.");

    cy.get("#cta-btn").should("be.enabled");
  });
});

function generateRegNo(prefix = "RJ53RA") {
  return `${prefix}${Date.now().toString().slice(-4)}`;
}

// Step 1: Purchase Type, Registration Number + Verify, State, Vehicle
// Type, Bank Name — advances to Step 2 via Next.
function completeStepOne(regNo) {
  cy.contains("button", "Create Inventory").click();
  cy.selectAutocomplete("Purchase Type", "Bank Auction");

  cy.get('input[name="regNo"]').clear().type(regNo);
  cy.contains("button", "Verify").should("be.enabled").click();

  cy.wait(6000);

  cy.selectAutocompleteUnlessPrefilled("Registration State", "Maharashtra");
  cy.selectAutocompleteUnlessPrefilled("Vehicle Type", "Tractor");
  cy.selectAutocompleteUnlessPrefilled("Bank Name", "Hdfc bank");

  cy.contains("button", "Next").should("be.enabled").click();

  cy.wait(3000);
}


function completeStepOneOnly(regNo) {
  cy.contains("button", "Create Inventory").click();
  cy.selectAutocomplete("Purchase Type", "Bank Auction");

  cy.get('input[name="regNo"]').clear().type(regNo);
  cy.contains("button", "Verify").should("be.enabled").click();

  cy.wait(6000);

  cy.selectAutocompleteUnlessPrefilled("Registration State", "Maharashtra");
  cy.selectAutocompleteUnlessPrefilled("Vehicle Type", "Tractor");
}


function completeStepTwo() {
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
  cy.fillTextIfPresentUnlessPrefilled("Owner Name (from Vahan)", "Test Owner");
  cy.fillTextIfPresentUnlessPrefilled("Vehicle Status (from Vahan)", "Active");
}

function submitLead() {
  cy.get("#cta-btn").should("be.enabled").click();
  cy.get(".MuiDialogActions-root").contains("button", "Yes").click();
}
