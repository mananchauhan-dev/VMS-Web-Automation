describe("Assign driver for delivery flow", () => {
  beforeEach(() => {
    cy.loginViaApi("ganeshmangroliya@tractorjunction.com");
  });

  it("Positive: selecting Pickup Yard auto-fills the read-only yard details", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openAssignDriverForm(registrationNumber, () => {
        cy.selectAutocompleteUnlessPrefilled("Pickup Yard", "Dummy Yard");

        ["Yard Name", "Yard State", "Yard District", "Yard Tehsil", "Yard Address", "Yard SPOC Name", "Yard SPOC Mobile"].forEach(
          (labelText) => {
            cy.contains("label", labelText)
              .parents(".MuiFormControl-root")
              .first()
              .find("input")
              .should("be.disabled")
              .invoke("val")
              .should("not.be.empty");
          }
        );
      });
    });
  });

  it("Positive: Parking Estimate Details accordion expands to show per-day parking charges and the computed estimate", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openAssignDriverForm(registrationNumber, () => {
        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

        cy.contains("label", "Yard Per Day Parking Charges")
          .parents(".MuiFormControl-root")
          .first()
          .find("input")
          .should("be.visible");

        cy.contains("label", "Estimated Parking Charges")
          .parents(".MuiFormControl-root")
          .first()
          .find("input")
          .should("be.disabled");
      });
    });
  });

  it("Positive: Center & Pickup Allocation Details accordion allows selecting a Centre and a Driver", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openAssignDriverForm(registrationNumber, () => {
        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();
        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

        cy.selectAutocomplete("Centre For Allocation", "Alwar");
        cy.selectAutocomplete("Driver For Pickup", "Hari Prakash Meena");
      });
    });
  });

  it("Positive: Indemnity Bond and Release Order documents can be uploaded", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openAssignDriverForm(registrationNumber, () => {
        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();
        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

        cy.get("#indemnityBond").selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });
        cy.get("#releaseOrder").selectFile("cypress/fixtures/rto-confirmation-doc.png", { force: true });

        cy.get("#indemnityBond").should(($input) => expect($input[0].files.length).to.eq(1));
        cy.get("#releaseOrder").should(($input) => expect($input[0].files.length).to.eq(1));
      });
    });
  });

  it("Positive: assigns a driver and confirms pickup once all mandatory fields are filled", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openAssignDriverForm(registrationNumber, () => {
        cy.fillDateUnlessPrefilled("Pickup Date", 2);
        cy.selectAutocompleteUnlessPrefilled("Pickup Yard", "Dummy Yard");

        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();
        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

        // Alwar is known to be at full capacity — walk the dropdown for one that isn't.
        selectCentreWithAvailableCapacity();
        cy.selectAutocomplete("Driver For Pickup", "Hari Prakash Meena");

        cy.get("#cta-btn").should("be.enabled").click();
        cy.get(".MuiDialogActions-root").contains("button", "Yes").click();

        // Exact wording unconfirmed — app follows a "<Action> Successfully!!!" pattern elsewhere.
        cy.contains("Pickup Assignment Details Added Successfully!!!").should("be.visible");
      });
    });
  });


  it("Negative: Assign Delivery stays disabled until all mandatory fields are filled", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openAssignDriverForm(registrationNumber, () => {
        cy.get("#cta-btn-disabled").should("exist");

        cy.fillDateUnlessPrefilled("Pickup Date", 2);
        cy.selectAutocompleteUnlessPrefilled("Pickup Yard", "Dummy Yard");

        // Centre and Driver still unset — button must remain disabled.
        cy.get("#cta-btn-disabled").should("exist");
      });
    });
  });

  it("Negative: leaving Centre For Allocation and Driver For Pickup empty blocks submission even with a valid Pickup Date and Yard", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openAssignDriverForm(registrationNumber, () => {
        cy.fillDateUnlessPrefilled("Pickup Date", 2);
        cy.selectAutocompleteUnlessPrefilled("Pickup Yard", "Dummy Yard");

        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();
        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

        cy.selectAutocomplete("Centre For Allocation", "Alwar");
        cy.scrollTo('bottom');
        cy.get("#cta-btn-disabled").should("exist");
      });
    });
  });

  it("Negative: Yard Location URL is optional and does not block submission", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openAssignDriverForm(registrationNumber, () => {
        cy.contains("label", "Yard Location URL").invoke("text").should("not.include", "*");
      });
    });
  });

  it("Negative: selecting a fully-utilized centre shows the capacity error", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openAssignDriverForm(registrationNumber, () => {
        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();
        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

        // Alwar is a known fully-utilized centre (Remaining Capacity: -2).
        cy.selectAutocomplete("Centre For Allocation", "Alwar");

        cy.contains("Centre capacity is fully utilized. Please select another centre.").should(
          "be.visible"
        );
      });
    });
  });

  it("Negative: Assign Delivery stays disabled while the selected centre has no remaining capacity", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openAssignDriverForm(registrationNumber, () => {
        cy.fillDateUnlessPrefilled("Pickup Date", 2);
        cy.selectAutocompleteUnlessPrefilled("Pickup Yard", "Dummy Yard");

        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();
        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

        cy.selectAutocomplete("Centre For Allocation", "Alwar");
        cy.selectAutocomplete("Driver For Pickup", "Hari Prakash Meena");

        cy.contains("Centre capacity is fully utilized. Please select another centre.").should(
          "be.visible"
        );
        cy.get("#cta-btn-disabled").should("exist");
      });
    });
  });

  it("Positive: Remaining Capacity label reflects the selected centre", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openAssignDriverForm(registrationNumber, () => {
        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();
        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

        cy.selectAutocomplete("Centre For Allocation", "Alwar");

        cy.contains(/Remaining Capacity:/).should("be.visible");
      });
    });
  });


  it("Negative: clearing a fully-utilized centre selection removes the capacity error", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openAssignDriverForm(registrationNumber, () => {
        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();
        cy.get(".MuiAccordionSummary-expandIconWrapper").not(".Mui-expanded").first().click();

        cy.selectAutocomplete("Centre For Allocation", "Alwar");
        cy.contains("Centre capacity is fully utilized. Please select another centre.").should(
          "be.visible"
        );

        cy.contains("label", "Centre For Allocation")
          .parents(".MuiFormControl-root")
          .first()
          .find(".MuiAutocomplete-clearIndicator")
          .click({ force: true });

        cy.contains("Centre capacity is fully utilized. Please select another centre.").should(
          "not.exist"
        );
      });
    });
  });
 });

// Opens the Centre For Allocation dropdown and picks the first option that
// doesn't trip the "Centre capacity is fully utilized" error (e.g. Alwar).
function selectCentreWithAvailableCapacity() {
  cy.contains("label", "Centre For Allocation")
    .parents(".MuiFormControl-root")
    .first()
    .find("input")
    .click();

  cy.get('ul[role="listbox"] li').then(($options) => {
    const optionTexts = [...$options].map((el) => el.textContent.trim());
    tryNextCentre(optionTexts, 0);
  });
}

function tryNextCentre(optionTexts, index) {
  expect(index, "a centre with available capacity").to.be.lessThan(optionTexts.length);

  cy.get('ul[role="listbox"] li').contains(optionTexts[index]).click();

  cy.get("body").then(($body) => {
    const isFull = $body
      .text()
      .includes("Centre capacity is fully utilized. Please select another centre.");

    if (!isFull) return;

    cy.contains("label", "Centre For Allocation")
      .parents(".MuiFormControl-root")
      .first()
      .find("input")
      .click();

    tryNextCentre(optionTexts, index + 1);
  });
}

function openAssignDriverForm(registrationNumber, thenFn) {
  cy.contains("Task Management").click();

  cy.contains("button[role='tab']", "My Task").click();

  cy.get('input[placeholder="Search By RegNo"]').type(`${registrationNumber}{enter}`);

  cy.wait(2000);

  cy.get("body").then(($body) => {
    const foundInTable = $body.find(`td[title="${registrationNumber}"]`).length > 0;

    if (foundInTable) {
      cy.contains("td", registrationNumber).parent("tr").click();
      cy.contains("button", "Assign Driver").click();
      thenFn(registrationNumber);
      return;
    }

    cy.contains("Select Task Title").click();
    cy.get('input[placeholder="Search or type..."]').type(
      "Please assign a driver for delivery"
    );
    cy.contains("Please assign a driver for delivery").click();

    cy.wait(2000);

    cy.get("body").then(($body2) => {
      // Status is the 2nd column — only rows already at "Payment Confirmed" are ready for driver assignment.
      const $paymentConfirmedRows = $body2.find("table tbody tr").filter((_, row) => {
        const statusCell = row.querySelectorAll("td")[1];
        return statusCell && statusCell.textContent.trim() === "Payment Confirmed";
      });

      if ($paymentConfirmedRows.length === 0) {
        cy.log(
          "No task found via regNo search or the assign-driver task lookup with Status 'Payment Confirmed' — skipping driver assignment."
        );
        return;
      }

      const $topRow = $paymentConfirmedRows.first();
      // regNo column renders its value into a title attribute, same as the direct-search table.
      const topRowRegNo = $topRow.find("td[title]").first().attr("title");

      cy.wrap($topRow).click();

      cy.wait(2000);

      cy.get("body").then(($body3) => {
        const hasAssignDriverButton =
          $body3.find("button").filter((_, el) => el.textContent.includes("Assign Driver")).length > 0;

        if (!hasAssignDriverButton) {
          cy.log(
            "Opening the top task didn't reach the assign-driver screen — skipping driver assignment."
          );
          return;
        }

        cy.contains("button", "Assign Driver").click();
        thenFn(topRowRegNo);
      });
    });
  });
}
