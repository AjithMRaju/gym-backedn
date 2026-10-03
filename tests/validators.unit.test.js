/**
 * validators.unit.test.js – Unit tests for shared validation helpers.
 *
 * Run: npx jest tests/validators.unit.test.js
 * (No database needed)
 */

const {
  isValidTimezone,
  isValidCurrency,
  isValidEmail,
  isValidPhone,
  buildErrorPayload,
} = require("../utils/validators");

// ─── isValidTimezone ──────────────────────────────────────────────────────────
describe("isValidTimezone", () => {
  test("accepts valid IANA timezone – Asia/Kolkata", () => {
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
  });
  test("accepts valid IANA timezone – America/New_York", () => {
    expect(isValidTimezone("America/New_York")).toBe(true);
  });
  test("accepts UTC", () => {
    expect(isValidTimezone("UTC")).toBe(true);
  });
  test("rejects invalid timezone string", () => {
    expect(isValidTimezone("Not/ATimezone")).toBe(false);
  });
  test("rejects empty string", () => {
    expect(isValidTimezone("")).toBe(false);
  });
  test("rejects random word", () => {
    expect(isValidTimezone("India")).toBe(false);
  });
});

// ─── isValidCurrency ──────────────────────────────────────────────────────────
describe("isValidCurrency", () => {
  test("accepts INR", () => expect(isValidCurrency("INR")).toBe(true));
  test("accepts USD", () => expect(isValidCurrency("USD")).toBe(true));
  test("accepts EUR", () => expect(isValidCurrency("EUR")).toBe(true));
  test("accepts lowercase inr (case-insensitive)", () => expect(isValidCurrency("inr")).toBe(true));
  test("rejects invalid code XYZ", () => expect(isValidCurrency("XYZ")).toBe(false));
  test("rejects 2-char string", () => expect(isValidCurrency("US")).toBe(false));
  test("rejects empty string", () => expect(isValidCurrency("")).toBe(false));
  test("rejects non-string", () => expect(isValidCurrency(123)).toBe(false));
});

// ─── isValidEmail ─────────────────────────────────────────────────────────────
describe("isValidEmail", () => {
  test("accepts simple email", () => expect(isValidEmail("user@example.com")).toBe(true));
  test("accepts email with subdomain", () => expect(isValidEmail("admin@gym.co.in")).toBe(true));
  test("accepts email with plus tag", () => expect(isValidEmail("user+tag@domain.org")).toBe(true));
  test("rejects missing @", () => expect(isValidEmail("userexample.com")).toBe(false));
  test("rejects missing domain", () => expect(isValidEmail("user@")).toBe(false));
  test("rejects empty string", () => expect(isValidEmail("")).toBe(false));
  test("rejects email with spaces", () => expect(isValidEmail("user @example.com")).toBe(false));
});

// ─── isValidPhone ─────────────────────────────────────────────────────────────
describe("isValidPhone", () => {
  test("accepts +91 format", () => expect(isValidPhone("+91-9876543210")).toBe(true));
  test("accepts US format", () => expect(isValidPhone("+1 (555) 555-5555")).toBe(true));
  test("accepts digits only", () => expect(isValidPhone("9876543210")).toBe(true));
  test("rejects too short (< 7 digits)", () => expect(isValidPhone("123")).toBe(false));
  test("rejects letters", () => expect(isValidPhone("abc-def-ghij")).toBe(false));
  test("rejects empty string", () => expect(isValidPhone("")).toBe(false));
});

// ─── buildErrorPayload ────────────────────────────────────────────────────────
describe("buildErrorPayload", () => {
  test("returns correct shape with all arguments", () => {
    const payload = buildErrorPayload("VALIDATION_ERROR", "Failed", { field: ["error"] });
    expect(payload).toEqual({
      code: "VALIDATION_ERROR",
      message: "Failed",
      fieldErrors: { field: ["error"] },
    });
  });
  test("returns empty fieldErrors when omitted", () => {
    const payload = buildErrorPayload("INTERNAL_ERROR", "Oops");
    expect(payload.fieldErrors).toEqual({});
  });
});
