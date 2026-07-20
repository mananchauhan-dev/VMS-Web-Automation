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

    // Step 4: Visit the app and inject auth data BEFORE it loads
    // onBeforeLoad runs before the app's JavaScript executes,
    // so when the app checks localStorage for a token, it finds one
    // and treats the user as already logged in
    cy.visit(Cypress.env("LANDING_PATH") || "/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("token", token);
        win.localStorage.setItem("userData", JSON.stringify(userData));
      },
    });
  });
});

// ============================================================
// Shared MUI form helpers — used by CreateInventory.cy.js and
// RTOConfirm.cy.js so field-filling logic isn't duplicated per spec.
// ============================================================

/**
 * selectAutocomplete — types into an MUI Autocomplete by its label text and
 * clicks the matching option. Autocomplete fields in this app share
 * duplicate ids, so they can only be targeted by label text, not #id.
 */
Cypress.Commands.add("selectAutocomplete", (labelText, optionText) => {
  cy.contains("label", labelText)
    .parents(".MuiFormControl-root")
    .first()
    .find("input")
    .click()
    .clear()
    .type(optionText);

  cy.get('ul[role="listbox"] li').contains(optionText).click();
});

/**
 * selectAutocompleteUnlessPrefilled — some autocompletes get auto-filled
 * and disabled by a Vahan/RTO lookup. If that happened, the value's already
 * correct and the disabled input can't be typed into, so skip it. Otherwise
 * fill it manually like any other autocomplete.
 */
Cypress.Commands.add("selectAutocompleteUnlessPrefilled", (labelText, optionText) => {
  cy.contains("label", labelText)
    .parents(".MuiFormControl-root")
    .first()
    .find("input")
    .then(($input) => {
      if ($input.prop("disabled")) return;
      cy.selectAutocomplete(labelText, optionText);
    });
});

/**
 * fillTextUnlessPrefilled — same idea as selectAutocompleteUnlessPrefilled,
 * but for plain text inputs. Skips fields that are either disabled or
 * already carry a value, so it works whether prefill shows up as a
 * disabled input (CreateInventory) or just a pre-populated value (RTOConfirm).
 */
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

/**
 * fillDateUnlessPrefilled — for read-only MUI date pickers (typing does
 * nothing). Opens the picker via its calendar button and picks the date
 * `daysFromToday` days out (0 = today, 1 = tomorrow, ...), unless the field
 * is already disabled/prefilled.
 */
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
        // Matches both the closed ("Choose date") and pre-selected
        // ("Choose date, selected date is ...") states of the button.
        .find('button[aria-label*="Choose date"]')
        .click();

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysFromToday);
      const targetLabel = targetDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      // The previous picker's popup can stay mounted (hidden) after closing,
      // so more than one day cell with this aria-label can exist in the
      // DOM — only click the one that's actually visible.
      cy.get(`.MuiPickersDay-root[aria-label="${targetLabel}"]`).filter(":visible").click();
    });
});
