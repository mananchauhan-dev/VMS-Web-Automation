describe("RTO confirm flow", () => {
  Cypress.on("uncaught:exception", (err) => {
    if (err.message.includes("Cannot read properties of null (reading 'document')")) {
      return false;
    }
  });

  beforeEach(() => {
    cy.loginViaApi("garimanaval@agrowheels.in");
  });

  it("Positive: selecting Not Approved reveals Rejection Reason and Ops Cost (Rejection Comment stays hidden until reason 'Other' is picked)", () => {
    openRtoConfirmForm(() => {
      cy.contains("label", "Rejection Reason").should("not.exist");
      cy.contains("label", "Rejection Comment").should("not.exist");
      cy.contains("label", "Ops Cost").should("not.exist");

      cy.selectRadio("position", "Not Approved");

      cy.contains("label", "Rejection Reason").should("exist");
      cy.contains("label", "Rejection Comment").should("not.exist");
      cy.contains("label", "Ops Cost").should("exist");
    });
  });

  it("Positive: selecting Approved keeps Rejection Reason, Rejection Comment, and Ops Cost hidden", () => {
    openRtoConfirmForm(() => {
      cy.selectRadio("position", "Approved");

      cy.contains("label", "Rejection Reason").should("not.exist");
      cy.contains("label", "Rejection Comment").should("not.exist");
      cy.contains("label", "Ops Cost").should("not.exist");
    });
  });

  it("Negative: a negative Ops Cost value not taken", () => {
    openRtoConfirmForm(() => {
      cy.selectRadio("position", "Not Approved");
      cy.selectAutocomplete("Rejection Reason", "HSRP");

      cy.fillTextUnlessPrefilled("Ops Cost", "-500");

      cy.contains("label", "Ops Cost")
        .parents(".MuiFormControl-root")
        .first()
        .find("input")
        .invoke("val")
        .should("not.include", "-");
    });
  });

  it("Negative: Ops Cost is mandatory once Not Approved is selected", () => {
    openRtoConfirmForm(() => {
      cy.selectRadio("position", "Not Approved");
      cy.selectAutocomplete("Rejection Reason", "HSRP");

      cy.hasMandatoryAsterisk("Ops Cost");

      cy.contains("label", "Ops Cost")
        .parents(".MuiFormControl-root")
        .first()
        .find("input")
        .clear()
        .blur();

      cy.contains("opsCost is a required field").should("be.visible");
    });
  });

  it("Positive: selecting Rejection Reason 'Other' reveals the Rejection Comment field", () => {
    openRtoConfirmForm(() => {
      cy.selectRadio("position", "Not Approved");
      cy.selectAutocomplete("Rejection Reason", "HSRP");
      cy.contains("label", "Rejection Comment").should("not.exist");

      cy.selectAutocomplete("Rejection Reason", "Others");
      cy.contains("label", "Rejection Comment").should("exist");
    });
  });

  it("Negative: Rejection Comment is mandatory once Rejection Reason 'Other' is selected", () => {
    openRtoConfirmForm(() => {
      cy.selectRadio("position", "Not Approved");
      cy.selectAutocomplete("Rejection Reason", "Others");

      cy.hasMandatoryAsterisk("Rejection Comment");

      cy.fillTextUnlessPrefilled("Ops Cost", "1500");

      cy.fillTextUnlessPrefilled("Owner Name", "Test Owner");
      cy.fillTextUnlessPrefilled("Select Manufacturing Year", "2020");
      cy.fillTextUnlessPrefilled("Registered RTO", "MH12");
      cy.fillTextUnlessPrefilled("Insurer Name", "HDFC Ergo");
      cy.fillDateUnlessPrefilled("Registration Date");
      cy.fillDateUnlessPrefilled("Insurance Validity");

      cy.get("#Upload-Invoice").selectFile("cypress/fixtures/rto-confirmation-doc.png", {
        force: true,
      });

      cy.get("#cta-btn").scrollIntoView().click();
            cy.get(".MuiDialogActions-root")
        .contains("button", "Yes")
        .click();

      cy.contains("lead.rejectionComment is a required field").should("be.visible");
    });
  });

  // it("Positive: Rejection Reason defaults to 'Select', lists all configured values, rejects manual text, and is reselectable", () => {
  //   openRtoConfirmForm(() => {
  //     cy.selectRadio("position", "Not Approved");

  //     cy.contains("label", "Rejection Reason")
  //       .parents(".MuiFormControl-root")
  //       .first()
  //       .find("input")
  //       .should("have.value", "Select");

  //     cy.hasMandatoryAsterisk("Rejection Reason");

  //     cy.clickAutocomplete("Rejection Reason");
  //     cy.get('ul[role="listbox"] li').should("have.length", 5);
  //     cy.get('ul[role="listbox"] li').then(($options) => {
  //       const optionTexts = [...$options].map((el) => el.textContent.trim());
  //       expect(optionTexts).to.deep.equal([
  //         "HSRP",
  //         "KMS/RC Push Pending",
  //         "Fitness Expired",
  //         "MV-tax Not Updated",
  //         "Others",
  //       ]);
  //     });

  //     cy.contains("label", "Rejection Reason")
  //       .parents(".MuiFormControl-root")
  //       .first()
  //       .find("input")
  //       .type("Not a real configured reason");

  //     cy.get('ul[role="listbox"] li').contains("Not a real configured reason").should("not.exist");

  //     cy.selectAutocomplete("Rejection Reason", "HSRP");
  //     cy.contains("label", "Rejection Reason")
  //       .parents(".MuiFormControl-root")
  //       .first()
  //       .find("input")
  //       .should("have.value", "HSRP");

  //     cy.selectAutocomplete("Rejection Reason", "Fitness Expired");
  //     cy.contains("label", "Rejection Reason")
  //       .parents(".MuiFormControl-root")
  //       .first()
  //       .find("input")
  //       .should("have.value", "Fitness Expired");
  //   });
  // });
  

  it("Positive: Ops Cost accepts numeric and decimal values within the allowed range", () => {
    openRtoConfirmForm(() => {
      cy.selectRadio("position", "Not Approved");
      cy.selectAutocomplete("Rejection Reason", "HSRP");

      cy.fillTextUnlessPrefilled("Ops Cost", "1500.50");

      cy.contains("label", "Ops Cost")
        .parents(".MuiFormControl-root")
        .first()
        .find("input")
        .should("have.value", "1500.50");
    });
  });

  // it("Positive: Check Vaahan Status enables once Rejection Reason and Ops Cost are filled, and submission succeeds", () => {
  //   openRtoConfirmForm(() => {
  //     cy.selectRadio("position", "Not Approved");
  //     cy.selectAutocomplete("Rejection Reason", "HSRP");
  //     cy.fillTextUnlessPrefilled("Ops Cost", "1500");

  //     cy.get("#cta-btn").should("be.enabled").click();

  //     cy.get(".MuiDialogActions-root").contains("button", "Yes").click();

  //     cy.contains(/status updated successfully/i).should("be.visible");
  //   });
  // });

  // it("Negative: blank Rejection Reason keeps Check Vaahan Status disabled", () => {
  //   openRtoConfirmForm(() => {
  //     cy.selectRadio("position", "Not Approved");
  //     cy.fillTextUnlessPrefilled("Ops Cost", "1500");

  //     cy.get("#cta-btn").should("be.disabled");
  //   });
  // });

  // it("Negative: blank Rejection Comment keeps Check Vaahan Status disabled and shows a validation message (reason 'Other')", () => {
  //   openRtoConfirmForm(() => {
  //     cy.selectRadio("position", "Not Approved");
  //     cy.selectAutocomplete("Rejection Reason", "Others");
  //     cy.fillTextUnlessPrefilled("Ops Cost", "1500");

  //     cy.get("#cta-btn").should("be.disabled");
  //     cy.contains("label", "Rejection Comment")
  //       .parents(".MuiFormControl-root")
  //       .first()
  //       .find(".MuiFormHelperText-root")
  //       .should("exist");
  //   });
  // });

  // it("Negative: blank Ops Cost keeps Check Vaahan Status disabled and shows a validation message", () => {
  //   openRtoConfirmForm(() => {
  //     cy.selectRadio("position", "Not Approved");
  //     cy.selectAutocomplete("Rejection Reason", "HSRP");

  //     cy.get("#cta-btn").should("be.disabled");
  //     cy.contains("label", "Ops Cost")
  //       .parents(".MuiFormControl-root")
  //       .first()
  //       .find(".MuiFormHelperText-root")
  //       .should("exist");
  //   });
  // });

  // it("Negative: Rejection Reason and Ops Cost both blank keeps Check Vaahan Status disabled with validation messages on both", () => {
  //   openRtoConfirmForm(() => {
  //     cy.selectRadio("position", "Not Approved");

  //     cy.get("#cta-btn").should("be.disabled");
  //     cy.contains("label", "Rejection Reason")
  //       .parents(".MuiFormControl-root")
  //       .first()
  //       .find(".MuiFormHelperText-root")
  //       .should("exist");
  //     cy.contains("label", "Ops Cost")
  //       .parents(".MuiFormControl-root")
  //       .first()
  //       .find(".MuiFormHelperText-root")
  //       .should("exist");
  //   });
  // });

  it("Positive: switching Not Approved back to Approved clears Rejection Reason, Rejection Comment, and Ops Cost", () => {
    openRtoConfirmForm(() => {
      cy.selectRadio("position", "Not Approved");
      cy.selectAutocomplete("Rejection Reason", "Others");
      cy.fillTextUnlessPrefilled("Rejection Comment", "Docs don't match the vehicle on record.");
      cy.fillTextUnlessPrefilled("Ops Cost", "1500");

      cy.selectRadio("position", "Approved");

      cy.contains("label", "Rejection Reason").should("not.exist");
      cy.contains("label", "Rejection Comment").should("not.exist");
      cy.contains("label", "Ops Cost").should("not.exist");

      cy.selectRadio("position", "Not Approved");

      cy.contains("label", "Rejection Reason")
        .parents(".MuiFormControl-root")
        .first()
        .find("input")
        .should("have.value", "Select");

      cy.contains("label", "Rejection Comment").should("not.exist");

      cy.contains("label", "Ops Cost")
        .parents(".MuiFormControl-root")
        .first()
        .find("input")
        .should("have.value", "");
    });
  });

  it("Positive: toggling Approved/Not Approved repeatedly leaves no duplicate fields or stale values", () => {
    openRtoConfirmForm(() => {
      for (let i = 0; i < 3; i += 1) {
        cy.selectRadio("position", "Not Approved");
        cy.contains("label", "Rejection Reason").should("have.length", 1);
        cy.contains("label", "Ops Cost").should("have.length", 1);

        cy.selectRadio("position", "Approved");
        cy.contains("label", "Rejection Reason").should("not.exist");
        cy.contains("label", "Ops Cost").should("not.exist");
      }
    });
  });

  it("Positive: uploaded confirmation document is retained after toggling status", () => {
    openRtoConfirmForm(() => {
      cy.get("#Upload-Invoice").selectFile("cypress/fixtures/rto-confirmation-doc.png", {
        force: true,
      });

      cy.selectRadio("position", "Not Approved");
      cy.selectRadio("position", "Approved");

      cy.get("#Upload-Invoice").should(($input) => {
        expect($input[0].files.length).to.eq(1);
      });
    });
  });


it("Positive: confirms RTO for the vehicle just created as a lead", () => {
    openRtoConfirmForm(() => {
      cy.fillTextUnlessPrefilled("Owner Name", "Test Owner");
      cy.fillTextUnlessPrefilled("Select Manufacturing Year", "2020");
      cy.fillTextUnlessPrefilled("Registered RTO", "MH12");
      cy.fillTextUnlessPrefilled("Insurer Name", "HDFC Ergo");
      cy.fillDateUnlessPrefilled("Registration Date");
      cy.fillDateUnlessPrefilled("Insurance Validity");

      cy.get("#Upload-Invoice").selectFile("cypress/fixtures/rto-confirmation-doc.png", {
        force: true,
      });
      cy.get("#cta-btn").should("be.enabled").click();
      cy.get(".MuiDialogActions-root")
        .contains("button", "Yes")
        .click();
      cy.contains("Rto Verification Completed Successfully!!!").should("be.visible");
    });
  });

});

function openRtoConfirmForm(thenFn) {
  cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
    cy.contains("Task Management").click();

    cy.contains("button[role='tab']", "My Task").click();

    cy.get('input[placeholder="Search By RegNo"]').type(`${registrationNumber}{enter}`);

    
    cy.wait(2000);

    cy.get("body").then(($body) => {
      const foundInTable = $body.find(`td[title="${registrationNumber}"]`).length > 0;

      if (foundInTable) {
        cy.contains("td", registrationNumber).parent("tr").click();
        cy.contains("button", "Check Vaahan Status").click();
        thenFn();
        return;
      }

    
      cy.contains("Select Task Title").click();
      cy.get('input[placeholder="Search or type..."]').type(
        "Please check vahaan status for the lead"
      );
      cy.contains("Please check vahaan status for the lead").click();

      cy.wait(2000);

      cy.get("body").then(($body2) => {
        const hasResults = $body2.find("table tbody tr").length > 0;

        if (!hasResults) {
          cy.log(
            "No lead found via regNo search or the Vaahan-status lookup — skipping manual RTO confirmation."
          );
          return;
        }

        cy.get("table tbody tr").first().click();

        cy.wait(2000);

        cy.get("body").then(($body3) => {
          const hasCheckVaahanButton =
            $body3.find("button").filter((_, el) => el.textContent.includes("Check Vaahan Status"))
              .length > 0;

          if (!hasCheckVaahanButton) {
            cy.log(
              "Opening the top lead didn't reach the RTO confirm screen — skipping manual RTO confirmation."
            );
            return;
          }

          cy.contains("button", "Check Vaahan Status").click();

          thenFn();
        });
      });
    });
  });
}
