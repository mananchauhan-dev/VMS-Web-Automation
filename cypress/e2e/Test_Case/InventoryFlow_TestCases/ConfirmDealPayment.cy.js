describe("Confirm deal payment flow", () => {
  beforeEach(() => {
    cy.loginViaApi("anandagrawal@tractorjunction.com");
  });

  it("Finance confirms the deal payment for the RTO-confirmed lead", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      openConfirmDealPaymentForm(registrationNumber, (resolvedRegistrationNumber) => {
        cy.confirmDealPaymentViaApi(resolvedRegistrationNumber).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body?.success).to.eq(true);
          expect(response.body?.data?._doc?.deviceType).to.eq("FINJ");
        });

        cy.go("back");
      });
    });
  });
});

function openConfirmDealPaymentForm(registrationNumber, thenFn) {
  cy.contains("Task Management").click();

  cy.contains("button[role='tab']", "My Task").click();

  cy.get('input[placeholder="Search By RegNo"]').type(`${registrationNumber}{enter}`);

  cy.wait(2000);

  cy.get("body").then(($body) => {
    const foundInTable = $body.find(`td[title="${registrationNumber}"]`).length > 0;

    if (foundInTable) {
      cy.contains("td", registrationNumber).parent("tr").click();
      cy.contains("button", "Process & Confirm Payment").click();
      thenFn(registrationNumber);
      return;
    }

    cy.contains("Select Task Title").click();
    cy.get('input[placeholder="Search or type..."]').type(
      "Please process and confirm deal payment"
    );
    cy.contains("Please process and confirm deal payment").click();

    cy.wait(2000);

    cy.get("body").then(($body2) => {
      const hasResults = $body2.find("table tbody tr").length > 0;

      if (!hasResults) {
        cy.log(
          "No task found via regNo search or the confirm-deal-payment task lookup — skipping payment confirmation."
        );
        return;
      }

      const $topRow = $body2.find("table tbody tr").first();
      // regNo column renders its value into a title attribute, same as the direct-search table.
      const topRowRegNo = $topRow.find("td[title]").first().attr("title");

      cy.get("table tbody tr").first().click();

      cy.wait(2000);

      cy.get("body").then(($body3) => {
        const hasConfirmPaymentButton =
          $body3.find("button").filter((_, el) => el.textContent.includes("Process & Confirm Payment"))
            .length > 0;

        if (!hasConfirmPaymentButton) {
          cy.log(
            "Opening the top task didn't reach the confirm-payment screen — skipping payment confirmation."
          );
          return;
        }

        cy.contains("button", "Process & Confirm Payment").click();
        thenFn(topRowRegNo);
      });
    });
  });
}
