/**
 * crypto.unit.test.js – Unit tests for the AES-256-GCM encryption utility.
 *
 * Run: npx jest tests/crypto.unit.test.js
 * (No database needed)
 */

// Provide a 64-char hex key for tests
process.env.SETTINGS_ENCRYPTION_KEY = "a".repeat(64);

const { encrypt, decrypt, maskSecret, hashToken } = require("../utils/crypto");

// ─── encrypt / decrypt ────────────────────────────────────────────────────────
describe("encrypt / decrypt round-trip", () => {
  test("encrypts and decrypts a plain string", () => {
    const plain = "sk_live_abc123_secret";
    const cipher = encrypt(plain);
    expect(cipher).not.toEqual(plain);
    expect(decrypt(cipher)).toBe(plain);
  });

  test("each encryption of the same value produces a different ciphertext (IV randomness)", () => {
    const plain = "same_secret";
    const c1 = encrypt(plain);
    const c2 = encrypt(plain);
    expect(c1).not.toEqual(c2);
    // But both decrypt to the same value
    expect(decrypt(c1)).toBe(plain);
    expect(decrypt(c2)).toBe(plain);
  });

  test("returns null for null input", () => {
    expect(encrypt(null)).toBeNull();
    expect(decrypt(null)).toBeNull();
  });

  test("returns null for empty string decrypt", () => {
    expect(decrypt("")).toBeNull();
  });

  test("handles special characters and unicode", () => {
    const plain = "pá$$w0rd!@#€£¥";
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  test("throws on tampered ciphertext (auth tag mismatch)", () => {
    const cipher = encrypt("sensitive");
    const parts = cipher.split(":");
    // Corrupt the ciphertext
    parts[2] = "0".repeat(parts[2].length);
    expect(() => decrypt(parts.join(":"))).toThrow();
  });
});

// ─── maskSecret ───────────────────────────────────────────────────────────────
describe("maskSecret", () => {
  test("masks a long API key", () => {
    const masked = maskSecret("sk_live_abcdef1234");
    expect(masked).toMatch(/^sk_liv/);          // first 6 chars visible
    expect(masked).toMatch(/1234$/);            // last 4 chars visible
    expect(masked).toContain("*");              // has asterisks in the middle
  });

  test("masks a short secret entirely", () => {
    const masked = maskSecret("short");
    expect(masked).toBe("*".repeat(5));
  });

  test("returns null for null input", () => {
    expect(maskSecret(null)).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(maskSecret("")).toBeNull();
  });
});

// ─── hashToken ────────────────────────────────────────────────────────────────
describe("hashToken", () => {
  test("returns a 64-char hex string (SHA-256)", () => {
    const hash = hashToken("some.jwt.token");
    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });

  test("same input always produces same hash (deterministic)", () => {
    expect(hashToken("token")).toBe(hashToken("token"));
  });

  test("different inputs produce different hashes", () => {
    expect(hashToken("token1")).not.toBe(hashToken("token2"));
  });
});
