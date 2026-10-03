/**
 * crypto.js – helpers for symmetric encryption at rest and token hashing.
 *
 * Algorithm: AES-256-GCM (authenticated encryption – tamper-proof).
 * Key:        SETTINGS_ENCRYPTION_KEY env var, 64 hex chars → 32-byte key.
 *
 * Usage:
 *   const { encrypt, decrypt, maskSecret } = require('../utils/crypto');
 *
 *   const cipher = encrypt('sk_live_abc123');  // store this
 *   const plain  = decrypt(cipher);            // retrieve original value
 *   const masked = maskSecret('sk_live_abc123'); // "sk_live_**...***abc123"
 */

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;  // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;

function getKey() {
  const hex = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!hex || hex.length < 64) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(hex.slice(0, 64), "hex");
}

/**
 * Encrypt a plaintext string.
 * Returns a base64 string: "<iv>:<authTag>:<ciphertext>", all in hex.
 */
function encrypt(plaintext) {
  if (plaintext == null) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: hex(iv):hex(authTag):hex(ciphertext)
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

/**
 * Decrypt a string produced by encrypt().
 * Returns null if the input is null/empty.
 */
function decrypt(encryptedStr) {
  if (!encryptedStr) return null;
  const key = getKey();
  const [ivHex, authTagHex, ciphertextHex] = encryptedStr.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) throw new Error("Invalid encrypted format");

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Return a masked version of a secret suitable for API responses.
 * Shows the first 6 and last 4 characters; everything in between is replaced
 * with asterisks.  Falls back to all-asterisks for very short strings.
 *
 * Examples:
 *   maskSecret("sk_live_abcdef1234") → "sk_live*****1234"
 *   maskSecret("short")             → "****"
 */
function maskSecret(value) {
  if (!value) return null;
  const s = String(value);
  if (s.length <= 8) return "*".repeat(s.length);
  return s.slice(0, 6) + "*".repeat(Math.max(4, s.length - 10)) + s.slice(-4);
}

/**
 * Create a SHA-256 hash of a JWT (used for session tracking).
 * Returns a hex string.
 */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = { encrypt, decrypt, maskSecret, hashToken };
