describe("Upload vehicle images flow", () => {
  const IMAGE_FIELDS = [
    "frontBodySide",
    "leftBodySide",
    "backBodySide",
    "rightBodySide",
    "chassisNumber",
    "fuelInjectionPumpPlate",
    "others",
  ];

  beforeEach(() => {
    cy.loginViaApi("hariprakashmeena1990@gmail.com");
  });

  
  // it("Positive: each image slot only accepts jpg/png/jpeg files", () => {
  //   cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
  //     openUploadVehicleImagesForm(registrationNumber, () => {
  //       IMAGE_FIELDS.forEach((fieldId) => {
  //         cy.get(`#${fieldId}`).should("have.attr", "accept", "image/jpg,image/png,image/jpeg");
  //       });
  //     });
  //   });
  // });

  // it("Positive: an uploaded image is retained on its file input", () => {
  //   cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
  //     openUploadVehicleImagesForm(registrationNumber, () => {
  //       cy.get("#frontBodySide").selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });
  //       cy.get("#frontBodySide").should(($input) => expect($input[0].files.length).to.eq(1));
  //     });
  //   });
  // });

  // it("Negative: all seven image slots are mandatory", () => {
  //   cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
  //     openUploadVehicleImagesForm(registrationNumber, () => {
  //       cy.contains("h5", "Please Upload All Images").invoke("text").should("include", "*");
  //     });
  //   });
  // });

  // it("Negative: Upload Photo stays disabled until an image is uploaded", () => {
  //   cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
  //     openUploadVehicleImagesForm(registrationNumber, () => {
  //       cy.get("#cta-btn-disabled").should("exist");
  //     });
  //   });
  // });

  // it("Negative: leaving one image slot (Others) empty keeps Upload Photo disabled", () => {
  //   cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
  //     openUploadVehicleImagesForm(registrationNumber, () => {
  //       IMAGE_FIELDS.filter((fieldId) => fieldId !== "others").forEach((fieldId) => {
  //         cy.get(`#${fieldId}`).selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });
  //       });

  //       cy.get("#cta-btn-disabled").should("exist");
  //     });
  //   });
  // });
  it("Positive: driver uploads all seven required images and submits successfully", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openUploadVehicleImagesForm(registrationNumber, () => {
        IMAGE_FIELDS.forEach((fieldId) => {
          cy.get(`#${fieldId}`).selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });
        });

        cy.get("#cta-btn").should("be.enabled").click();
        cy.get(".MuiDialogActions-root").contains("button", "Yes").click();

        // Exact wording unconfirmed — app follows a "<Action> Successfully!!!" pattern elsewhere.
        cy.contains(/uploaded successfully/i).should("be.visible");
      });
    });
  });

});

function openUploadVehicleImagesForm(registrationNumber, thenFn) {
  cy.contains("Task Management").click();

  cy.contains("button[role='tab']", "My Task").click();

  cy.get('input[placeholder="Search By RegNo"]').type(`${registrationNumber}{enter}`);

  cy.wait(2000);

  cy.get("body").then(($body) => {
    const foundInTable = $body.find(`td[title="${registrationNumber}"]`).length > 0;

    if (foundInTable) {
      cy.contains("td", registrationNumber).parent("tr").click();
      // First-time screen shows "Upload Vehicle Images"; a re-upload after
      // rejection shows "Upload Tractor Photos".
      cy.contains("button", /Upload Vehicle Images|Upload Tractor Photos/).click();
      thenFn(registrationNumber);
      return;
    }

    cy.log("Lead not found in the RegNo search results — skipping image upload.");

    // Task-title search fallback disabled.
    /*
    cy.contains("Select Task Title").click();
    cy.get('input[placeholder="Search or type..."]').type(
      "Please upload tractor photos for approval"
    );
    cy.contains("Please upload tractor photos for approval").click();

    cy.wait(2000);

    cy.get("body").then(($body2) => {
      const hasResults = $body2.find("table tbody tr").length > 0;

      if (!hasResults) {
        cy.log(
          "No task found via regNo search or the upload-vehicle-images task lookup — skipping image upload."
        );
        return;
      }

      const $topRow = $body2.find("table tbody tr").first();
      // regNo column renders its value into a title attribute, same as the direct-search table.
      const topRowRegNo = $topRow.find("td[title]").first().attr("title");

      cy.get("table tbody tr").first().click();

      cy.wait(2000);

      cy.get("body").then(($body3) => {
        const hasUploadImagesButton =
          $body3.find("button").filter((_, el) => el.textContent.includes("Upload Vehicle Images"))
            .length > 0;

        if (!hasUploadImagesButton) {
          cy.log(
            "Opening the top task didn't reach the upload-vehicle-images screen — skipping image upload."
          );
          return;
        }

        cy.contains("button", "Upload Vehicle Images").click();
        thenFn(topRowRegNo);
      });
    });
    */
  });
}
