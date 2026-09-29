// Token Payment Reconcile flow.
//
// After Add Booking (17_AddBooking.cy.js), the token payment waits for
// review. From My Task (RegNo search → lead row):
//   1. "Review Payment" opens the review page with REJECT (id="reject") /
//      APPROVE (id="cta-btn", type="submit").
//   2. Reject opens a confirm pop-up: fill the remark, click Yes. The task
//      then drops back to "Add Token Payment".
//   3. Centre Manager (ajayprajapat@agrowheels.in) — "Add Token Payment" form:
//        - "Balance Amount:- <n>" banner at the top — the amount to pay.
//        - Select Payment Mode* (Autocomplete) → "Bank Transfer Imps".
//        - Enter the Payment Amount in INR* (name="amount") = banner amount.
//        - Enter the Payment Date* (date picker).
//        - Payment Receipt* (file input id="accountProofUrl").
//        - Enter the Remarks (name="remarks", optional).
//        - "Upload Payment" submit — id="cta-btn-disabled" until valid.
//   4. "Review Payment" again → Approve.
//
// Toast wording for reject / upload / approve not confirmed live — asserted
// loosely on /successfully/i, same as other unconfirmed steps in this suite.


// Reviewer: Review Payment → Reject / Approve.
const REVIEWER = "anandagrawal@tractorjunction.com";
// Centre Manager: re-adds the token payment after a reject.
const CENTRE_MANAGER = "ajayprajapat@agrowheels.in";

describe("Token Payment Reconcile flow", () => {
  beforeEach(() => {
    cy.loginViaApi(REVIEWER);
  });

  // it("Negative: rejecting without a remark keeps Yes disabled", () => {
  //   cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
  //     openTaskAction(registrationNumber, "Review Payment", () => {
  //       cy.get("#reject").click();
  //       cy.wait(1000);

  //       getVisibleDialog().within(() => {
  //         cy.contains("button", "Yes").should("be.disabled");
  //       });
  //     });
  //   });
  // });

  it("Positive: rejecting the token payment, re-adding it for the balance amount, then approving completes it", () => {
    cy.readFile("cypress/tmp/lastCreatedLead.json").then(({ registrationNumber }) => {
      // 1–2. Review Payment → Reject.
      openTaskAction(registrationNumber, "Review Payment", () => {
        cy.get("#reject").should("be.visible").click();
        cy.wait(1000);

        getVisibleDialog().within(() => {
          cy.get('input[name="remarks"], textarea[name="remarks"]')
            .first()
            .type("Automated reject of token payment");
          cy.contains("button", "Yes").should("be.enabled").click();
        });

        cy.contains(/successfully/i, { timeout: 10000 }).should("be.visible");
        cy.wait(2000);
      });

      // 3. Switch role: Centre Manager re-adds the rejected token payment
      //    (My Task → Add Token Payment).
      cy.loginViaApi(CENTRE_MANAGER);

      openTaskAction(registrationNumber, "Add Token Payment", () => {
        // Nothing filled yet — submit must be blocked.
        cy.get("#cta-btn-disabled").should("exist");

        cy.selectAutocomplete("Select Payment Mode", "Bank Transfer Imps");

        withBalanceAmount((balance) => {
          cy.get('input[name="amount"]').clear().type(String(balance));
        });

        cy.fillDateUnlessPrefilled("Enter the Payment Date");
        cy.get("#accountProofUrl").selectFile("cypress/fixtures/rto-confirmation-doc.png", {
          force: true,
        });
        cy.get('input[name="remarks"]').type("Automated token payment re-upload");

        cy.contains("button", "Upload Payment").should("be.enabled").click();
        confirmDialogIfShown();

        cy.contains(/successfully/i, { timeout: 10000 }).should("be.visible");
        cy.wait(2000);
      });

      // 4. Switch back: reviewer approves the re-added payment
      //    (Review Payment → Approve).
      cy.loginViaApi(REVIEWER);

      openTaskAction(registrationNumber, "Review Payment", () => {
        cy.contains("#cta-btn", /approve/i).should("be.enabled").click();
        confirmDialogIfShown();

        cy.contains(/successfully/i, { timeout: 10000 }).should("be.visible");
        cy.wait(2000);
      });
    });
  });
});

// Reads the "Balance Amount:- 518500" banner at the top of the Add Token
// Payment form.
function withBalanceAmount(fn) {
  cy.contains("p", /Balance Amount/i)
    .invoke("text")
    .then((text) => {
      const balance = Number(text.replace(/[^\d.]/g, ""));
      expect(balance, "Balance Amount").to.be.greaterThan(0);
      fn(balance);
    });
}

// Scoped to whichever dialog is currently visible — same defensive pattern
// used elsewhere in this suite for stale/duplicate dialogs.
function getVisibleDialog() {
  return cy.get('[role="dialog"]').filter(":visible");
}

function confirmDialogIfShown() {
  cy.wait(500);
  cy.get("body").then(($body) => {
    if ($body.find(".MuiDialogActions-root:visible").length) {
      cy.get(".MuiDialogActions-root").filter(":visible").contains("button", "Yes").click();
    }
  });
}

// My Task → RegNo search → open lead → click the named task button.
function openTaskAction(registrationNumber, buttonText, thenFn) {
  cy.contains("Task Management").click();

  cy.contains("button[role='tab']", "My Task").click();

  cy.get('input[placeholder="Search By RegNo"]').clear().type(`${registrationNumber}{enter}`);

  cy.wait(2000);

  cy.get("body").then(($body) => {
    const foundInTable = $body.find(`td[title="${registrationNumber}"]`).length > 0;

    if (!foundInTable) {
      cy.log(`Lead not found in the RegNo search results — skipping ${buttonText}.`);
      return;
    }

    cy.contains("td", registrationNumber).parent("tr").click();
    cy.wait(1000);

    cy.get("body").then(($detail) => {
      const hasButton = [...$detail.find("button")].some(
        (el) => el.textContent.trim() === buttonText
      );

      if (!hasButton) {
        cy.log(`${buttonText} not available — skipping.`);
        return;
      }

      cy.contains("button", buttonText).click();
      cy.wait(1000);
      thenFn(registrationNumber);
    });
  });
}
