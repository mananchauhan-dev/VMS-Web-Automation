// src/core/exampleSafety.js
//
// Decides whether an OpenAPI schema's `example` value is safe to send
// verbatim in a generic mutation test, or whether it's plausibly a
// real-world business/master-data value that should never be reused blindly
// (Stage 3B finding: `POST /api/v1/insurer`'s example is `"HDFC Ergo"` — a
// real insurer; `POST /api/v1/bank`'s is `"HDFC Bank"`; `PUT
// /api/v1/dashboard/master-data`'s `key` example is `"MAX_BOOKING_DAYS"` —
// a real, live config key).
//
// Deliberately signal-based, not a hardcoded list of company names (per the
// brief: "do not hardcode hundreds of company names"). Every signal here is
// a generic, reusable pattern that keeps working as the spec grows:
//   - field semantics       (is this an identity/label/key-shaped field?)
//   - identifier patterns   (UPPER_SNAKE_CASE config-key shape)
//   - email domains         (a real-looking domain vs. a reserved test one)
//   - phone formats         (a plain 10-15 digit string on a phone-shaped field)
//   - business terminology  (bank/insurance/finance/corp/ltd/... as whole words)
//   - a synthetic escape hatch (QA/TEST/AUTOMATION/EXAMPLE/SAMPLE/DUMMY
//     keywords in the value itself always mark it explicitly safe, regardless
//     of field name — the spec author already flagged it as non-real)

/** Field names that name an entity's identity/label — the highest-risk category, since these are exactly the fields real business names/keys live in. */
const IDENTITY_FIELD_RE = /(^|[a-z0-9])(name|title|label|key|code)$/i;

/** UPPER_SNAKE_CASE shape, e.g. "MAX_BOOKING_DAYS", "ADMIN_EMAIL" — the shape real backend config keys use. */
const CONFIG_KEY_SHAPE_RE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/;

/** Generic business-entity-type nouns — categories, not company names. Kept intentionally short. */
const BUSINESS_TERM_RE = /\b(bank|insurance|insurer|finance|financial|corp|corporation|ltd|limited|pvt|private|llc|inc|agency|exchange|enterprises|industries)\b/i;

/** Value itself declares it's a test/synthetic value — always safe, regardless of field name. */
const SYNTHETIC_ESCAPE_RE = /\b(qa|test|automation|example|sample|dummy|placeholder|fake|mock)\b/i;

/** Reserved/test-safe email domains — real-looking-but-actually-reserved-for-testing per RFC 2606 plus common test conventions. */
const SAFE_EMAIL_DOMAIN_RE = /@(example\.(com|org|net)|test\.(com|invalid)|invalid|qa-automation\..*|.*\.test)$/i;

/** Indian GSTIN shape (2-digit state code + 10-char PAN + entity code + "Z" + checksum) — a real government-issued business-identifier format, e.g. schema example "08AAACX1234C1Z1". */
const GSTIN_SHAPE_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z]\d$/;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_FIELD_RE = /(phone|mobile|contact.?number|spocnum|spoc.?no)/i;
const PLAIN_PHONE_RE = /^\+?\d{10,15}$/;
/** Common test/placeholder phone patterns already conventional in this spec and elsewhere — not a real subscriber. */
const KNOWN_TEST_PHONE_RE = /^(\+?91)?(0{10}|9{10}|1234567890|9876543210)$/;

/**
 * @param {unknown} value - the candidate example value
 * @param {string} fieldName - the property name this value belongs to (dot-path leaf, e.g. "bankName")
 * @param {any} [schema] - the schema fragment the example came from (for format/enum context)
 * @returns {{ unsafe: boolean, reasons: string[] }}
 */
export function isPotentiallyRealWorldExample(value, fieldName, schema) {
  const reasons = [];

  // Enum-constrained values are contract-defined, never "real-world business data" — always safe.
  if (Array.isArray(schema?.enum) && schema.enum.length) {
    return { unsafe: false, reasons: [] };
  }

  if (typeof value !== "string") {
    // Non-string examples (numbers/booleans/objects/arrays) aren't the risk this classifier targets —
    // the Stage 3B finding was specifically about string identity/key values.
    return { unsafe: false, reasons: [] };
  }

  // Escape hatch: the value announces itself as synthetic — trust that over any other signal.
  if (SYNTHETIC_ESCAPE_RE.test(value)) {
    return { unsafe: false, reasons: [] };
  }

  const isIdentityField = IDENTITY_FIELD_RE.test(fieldName || "");
  const looksLikeConfigKey = CONFIG_KEY_SHAPE_RE.test(value);
  const containsBusinessTerm = BUSINESS_TERM_RE.test(value);
  const looksLikeGstin = GSTIN_SHAPE_RE.test(value);
  const looksLikeEmail = schema?.format === "email" || EMAIL_RE.test(value);
  const looksLikePhone = PHONE_FIELD_RE.test(fieldName || "") && PLAIN_PHONE_RE.test(value);

  if (isIdentityField) reasons.push(`field "${fieldName}" is identity/label/key-shaped`);
  if (looksLikeConfigKey) reasons.push(`value "${value}" matches UPPER_SNAKE_CASE config-key shape`);
  if (containsBusinessTerm) reasons.push(`value "${value}" contains a business-entity term`);
  if (looksLikeGstin) reasons.push(`value "${value}" matches the real Indian GSTIN business-identifier format`);

  if (looksLikeEmail && !SAFE_EMAIL_DOMAIN_RE.test(value)) {
    reasons.push(`value "${value}" is a real-looking email domain (not a reserved test domain)`);
  }
  if (looksLikePhone && !KNOWN_TEST_PHONE_RE.test(value)) {
    reasons.push(`field "${fieldName}" is phone-shaped with a plausible real 10-digit number`);
  }

  // An identity-shaped field is the strongest single signal (this is exactly where "HDFC Ergo" /
  // "HDFC Bank" / "MAX_BOOKING_DAYS" live) — unsafe on its own, no second signal required.
  // Everything else needs no extra corroboration either; each of these signals independently means
  // "don't blindly trust this string as a safe generic mutation value".
  const unsafe = isIdentityField || looksLikeConfigKey || containsBusinessTerm || looksLikeGstin || reasons.length > 0;
  return { unsafe, reasons };
}
