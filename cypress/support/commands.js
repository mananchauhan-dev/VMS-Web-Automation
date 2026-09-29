// ============================================================
// Custom Commands for Cypress
// ============================================================

/**
 * loginViaApi — Logs in by calling the backend API directly.
 *
 * HOW IT WORKS:
 * The app's Google Sign-In flow does this internally:
 *   1. Google returns a JWT credential containing the user's email
 *   2. App extracts the email from the JWT
 *   3. App sends { email } to POST /api/v1/login
 *   4. Backend returns a session token + user data
 *   5. App stores token in localStorage
 *
 * We skip step 1 (Google popup) and do steps 2-5 directly.
 * The backend doesn't verify the Google JWT — it only needs the email.
 *
 * WHAT GETS STORED IN LOCALSTORAGE:
 *   - "token"    → session token used for all API requests
 *   - "userData" → user profile (name, email, role, centre, etc.)
 *
 * WHEN TO USE:
 *   - As a beforeEach() hook in any test that needs an authenticated user
 *   - NOT for testing the Google login UI itself
 */
Cypress.Commands.add("loginViaApi", (email = "mananchauhan@tractorjunction.com") => {
  // Step 1: Send email to the backend login endpoint
  // The backend looks up the user by email and returns their session data
  cy.request({
    method: "POST",
    url: `${Cypress.env("API_BASE_URL")}/api/v1/login`,
    body: {
      email,
    },
    failOnStatusCode: false,
  }).then((response) => {
    // Step 2: Verify the request succeeded
    expect(response.status).to.eq(200);
    expect(response.body?.data?.token).to.exist;

    // Step 3: Extract token and user data from the response
    const token = response.body.data.token;
    const userData = {
      accessToken: token,
      email: response.body.data.email,
      name: response.body.data.name,
      userId: response.body.data.id,
      role: response.body.data.role,
      state: response.body.data.state,
      centre: response.body.data.centre,
    };

  
    cy.visit(Cypress.env("LANDING_PATH") || "/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("token", token);
        win.localStorage.setItem("userData", JSON.stringify(userData));
      },
    });
  });
});


Cypress.Commands.add("selectRadio", (radioName, value) => {
  cy.get(`input[name="${radioName}"][value="${value}"]`).click({ force: true });
});

Cypress.Commands.add("hasMandatoryAsterisk", (labelText) => {
  cy.contains("label", labelText).invoke("text").should("include", "*");
});

Cypress.Commands.add("clickAutocomplete", (labelText) => {
  cy.contains("label", labelText)
    .parents(".MuiFormControl-root")
    .first()
    .find("input")
    .click();
});

Cypress.Commands.add("selectAutocomplete", (labelText, optionText) => {
  const getInput = () =>
    cy
      .contains("label", labelText)
      .parents(".MuiFormControl-root")
      .first()
      .find("input");

  const typeIntoField = () => {
    getInput()
      .click()
      // MUI's Autocomplete popper is still mounting/positioning right after
      // click; firing .clear() immediately can race its onChange handler and
      // throw an uncaught "Cannot read properties of null (reading 'value')"
      // in the app's own JS — reproduced in headless (cypress run) but not
      // interactive (cypress open), where human click pacing hides the race.
      .wait(200)
      .clear()
      .type(optionText);
  };

  typeIntoField();

  // Scope the listbox lookup to THIS field's own popper via aria-controls
  // (MUI sets it on the input, matching the listbox's id). Confirmed live:
  // the app hardcodes the SAME static id (e.g.
  // "size-small-standard-multi-listbox") on every Autocomplete instance
  // instead of generating a unique one per field — so `cy.get('#id')` (which
  // takes jQuery/Sizzle's getElementById fast path for a bare id selector)
  // always resolves to the FIRST such id anywhere in the DOM, i.e. whichever
  // field opened earliest (e.g. an Accessories accordion field), not the one
  // actually open now. `[id="..."]` forces the attribute-selector engine
  // instead, returning every element sharing that id so we can filter down
  // to the one that's actually visible/open.
  //
  // MUI only sets aria-controls while the listbox is rendered — popup open
  // AND at least one matching option. Reading it immediately after typing
  // (options still loading, or popup closed by a re-render) returned
  // undefined → `[id="undefined"]`. If it's missing, retype once, then let
  // .should() retry until the listbox appears.
  getInput().then(($input) => {
    if (!$input.attr("aria-controls")) {
      cy.wait(1500);
      typeIntoField();
    }
  });

  getInput()
    .should("have.attr", "aria-controls")
    .then((listboxId) => {
      cy.get(`[id="${listboxId}"]`).filter(":visible").find("li").contains(optionText).click();
    });
});


Cypress.Commands.add("selectAutocompleteUnlessPrefilled", (labelText, optionText) => {
  cy.contains("label", labelText)
    .parents(".MuiFormControl-root")
    .first()
    .find("input")
    .then(($input) => {
      // Bug: this was only skipping when disabled, not when already
      // prefilled with a value (unlike fillTextUnlessPrefilled, which checks
      // both) — so a field the app defaults to a real value (e.g. "Select
      // payment mode" -> "Bank Transfer") still got click().clear().type()'d
      // unconditionally. Clearing an already-filled MUI Autocomplete can
      // race the app's own onChange handler and throw an uncaught
      // "Cannot read properties of null (reading 'value')" — reproduced
      // live on exactly this field. Skipping when a value is already
      // present avoids touching it at all.
      if ($input.prop("disabled") || $input.val()) return;
      cy.selectAutocomplete(labelText, optionText);
    });
});

Cypress.Commands.add("fillTextUnlessPrefilled", (labelText, value) => {
  cy.contains("label", labelText)
    .parents(".MuiFormControl-root")
    .first()
    .find("input")
    .then(($input) => {
      if ($input.prop("disabled") || $input.val()) return;
      cy.wrap($input).clear().type(value);
    });
});

Cypress.Commands.add("fillTextIfPresentUnlessPrefilled", (labelText, value) => {
  cy.get("body").then(($body) => {
    if ($body.find("label").filter((_, el) => el.textContent.includes(labelText)).length === 0) {
      return;
    }
    cy.fillTextUnlessPrefilled(labelText, value);
  });
});


Cypress.Commands.add("fillDateUnlessPrefilled", (labelText, daysFromToday = 0) => {
  cy.contains("label", labelText)
    .parents(".MuiFormControl-root")
    .first()
    .find("input")
    .then(($input) => {
      if ($input.prop("disabled") || $input.val()) return;

      cy.wrap($input)
        .parents(".MuiFormControl-root")
        .first()
        .find('button[aria-label*="Choose date"]')
        .click();

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysFromToday);
      const targetLabel = targetDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

   
      cy.get(`.MuiPickersDay-root[aria-label="${targetLabel}"]`).filter(":visible").click();
    });
});

Cypress.Commands.add("getAuthToken", () => {
  return cy.window().then((win) => win.localStorage.getItem("token"));
});

/**
 * confirmDealPaymentViaApi — finds the lead by regNo, pulls its latest payment
 * record, and posts a FinJ APPROVED/SUCCESS callback for it, bypassing the
 * Finance UI approval step. Yields the update-payment-status-finj response.
 */
Cypress.Commands.add("confirmDealPaymentViaApi", (registrationNumber, overrides = {}) => {
  return cy.getAuthToken().then((token) => {
    // Header name/scheme unconfirmed against the real API — sending both
    // common shapes since unused headers are harmless.
    const headers = {
      Authorization: token,
      token,
    };

    return cy
      .request({
        method: "POST",
        url: `${Cypress.env("API_BASE_URL")}/api/v1/leads?search=${registrationNumber}`,
        headers,
        body: {
          data: {
            vehicleType: "",
            minSellingPrice: "",
            maxSellingPrice: "",
            minListingPrice: "",
            maxListingPrice: "",
            auctionByBankId: "",
            auctionAgency: "",
            source: "",
            vehicleLogisticStatus: "",
            registrationStates: "",
            isROCompleted: "",
            make: "",
            model: "",
            manufacturingYears: "",
            centres: "",
            listingStatus: "",
            inventoryStatus: "",
            typeOfDate: "",
            dateRangeStart: "",
            dateRangeEnd: "",
            minAgeingDays: "",
          },
          page: 1,
          limit: 20,
        },
      })
      .then((searchRes) => {
        const lead = searchRes.body?.data?.[0];
        expect(lead, `lead found for regNo ${registrationNumber}`).to.exist;

        return cy
          .request({
            method: "GET",
            url: `${Cypress.env("API_BASE_URL")}/api/v1/leads/${lead._id}`,
            headers,
          })
          .then((detailRes) => {
            const payments = detailRes.body?.data?.payments || [];
            const payment = payments[payments.length - 1];
            expect(payment, `no payment found on lead ${lead._id}`).to.exist;

            const uniqueSuffix = Date.now();

            const body = {
              payment_id: payment._id,
              inventory_id: lead._id,
              finj_transaction_id: uniqueSuffix,
              payment_for: payment.paymentFor,
              payee_name: payment.accountHolderName,
              to_account: payment.accountNo,
              bank_name: payment.bank?.bankName || null,
              ifsc_code: payment.ifsc,
              payment_status: "APPROVED",
              online_status: "SUCCESS",
              amount: String(payment.amount),
              platform: "VMS",
              online_reference_id: `FINJ-${uniqueSuffix}`,
              utr: null,
              mode: "AXIS",
              from_account: "2323230063914269",
              transaction_type: "RT",
              payment_proof: "",
              payment_date: null,
              remark: "",
              ...overrides,
            };

            return cy.request({
              method: "POST",
              url: `${Cypress.env("API_BASE_URL")}/api/v1/payment/update-payment-status-finj`,
              headers,
              body,
            });
          });
      });
  });
});
