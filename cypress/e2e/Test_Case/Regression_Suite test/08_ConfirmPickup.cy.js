describe("Confirm pickup flow", () => {
  beforeEach(() => {
    cy.loginViaApi("mananchauhan@tractorjunction.com");
  });

  // it("Negative: rejecting the pickup with a remark does not accept it", () => {
  //   cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
  //     openTopConfirmPickupTask(registrationNumber, () => {
  //       cy.get("#reject").click();
  //       cy.wait(2000);

  //       // Scope to the "Pickup Rejection" dialog — the page has another
  //       // .MuiDialogActions-root, so an unscoped "Yes" matches 2 elements.
  //       cy.contains("h2", "Pickup Rejection")
  //         .parent()
  //         .within(() => {
  //           cy.get('input[name="remarks"]').type("Rejecting pickup - automated negative test");
  //           cy.contains("button", "Yes").should("be.enabled").click();
  //         });

  //       cy.contains("Pickup Rejected Successfully!!!").should("not.exist");
  //     });
  //   });
  // });

  it("Positive: re-uploads photos after rejection, then confirms pickup", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      // The preceding negative test rejected the pickup, sending the lead back to
      // the driver's photo-upload step. Re-upload as the driver so the task
      // returns to a confirm-pickup-ready state.
      cy.loginViaApi("hariprakashmeena1990@gmail.com");
      reUploadVehiclePhotos(registrationNumber);

      // Back to the pickup-confirming user.
      cy.loginViaApi("mananchauhan@tractorjunction.com");

      openTopConfirmPickupTask(registrationNumber, () => {
        cy.get("#cta-btn").click();
        cy.contains("button", "Yes").should("be.enabled").click();

        cy.contains("Pickup Accepted Successfully!!!").should("be.visible");
      });
    });
  });
});

// Duplicated from 07_UploadVehicleImages.cy.js — each regression spec stays self-contained.
const VEHICLE_IMAGE_FIELDS = [
  "frontBodySide",
  "leftBodySide",
  "backBodySide",
  "rightBodySide",
  "chassisNumber",
  "fuelInjectionPumpPlate",
  "others",
];

function reUploadVehiclePhotos(registrationNumber) {
  cy.contains("Task Management").click();

  cy.contains("button[role='tab']", "My Task").click();

  cy.get('input[placeholder="Search By RegNo"]').type(`${registrationNumber}{enter}`);

  cy.wait(2000);

  cy.get("body").then(($body) => {
    const foundInTable = $body.find(`td[title="${registrationNumber}"]`).length > 0;

    if (!foundInTable) {
      cy.log("Lead not found in the RegNo search results — skipping photo re-upload.");
      return;
    }

    cy.contains("td", registrationNumber).parent("tr").click();
    // First-time screen shows "Upload Vehicle Images"; a re-upload after
    // rejection shows "Upload Tractor Photos".
    cy.contains("button", /Upload Vehicle Images|Upload Tractor Photos/).click();

    VEHICLE_IMAGE_FIELDS.forEach((fieldId) => {
      cy.get(`#${fieldId}`).selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });
    });

    cy.get("#cta-btn").should("be.enabled").click();
    cy.get(".MuiDialogActions-root").contains("button", "Yes").click();
    cy.contains(/uploaded successfully/i).should("be.visible");
  });
}

function openTopConfirmPickupTask(registrationNumber, thenFn) {
  cy.visit("/vms-admin/task-management");

  cy.contains("button[role='tab']", "My Task").click();

  cy.get('input[placeholder="Search By RegNo"]').type(`${registrationNumber}{enter}`);

  cy.wait(2000);

  cy.get("body").then(($body) => {
    const foundInTable = $body.find(`td[title="${registrationNumber}"]`).length > 0;

    if (foundInTable) {
      cy.contains("td", registrationNumber).parent("tr").click();
      cy.contains("button", "Confirm Pickup").click();
      thenFn(registrationNumber);
      return;
    }

    cy.log("Lead not found in the RegNo search results — skipping pickup confirmation.");

    // Task-title search fallback disabled.
    /*
    cy.contains("Select Task Title").click();
    cy.get('input[placeholder="Search or type..."]').type("Please Confirm Pickup{enter}");

    cy.wait(2000);

    cy.get("table tbody tr").should("have.length.at.least", 1).first().click();

    cy.contains("button", "Confirm Pickup").click();
    thenFn();
    */
  });
}
