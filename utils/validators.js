/**
 * validators.js – shared validation helpers used across settings routes.
 */

const ISO_CURRENCY_CODES = new Set([
  "AED","AFN","ALL","AMD","ANG","AOA","ARS","AUD","AWG","AZN","BAM","BBD","BDT",
  "BGN","BHD","BIF","BMD","BND","BOB","BOV","BRL","BSD","BTN","BWP","BYN","BZD",
  "CAD","CDF","CHE","CHF","CHW","CLF","CLP","CNY","COP","COU","CRC","CUC","CUP",
  "CVE","CZK","DJF","DKK","DOP","DZD","EGP","ERN","ETB","EUR","FJD","FKP","GBP",
  "GEL","GHS","GIP","GMD","GNF","GTQ","GYD","HKD","HNL","HRK","HTG","HUF","IDR",
  "ILS","INR","IQD","IRR","ISK","JMD","JOD","JPY","KES","KGS","KHR","KMF","KPW",
  "KRW","KWD","KYD","KZT","LAK","LBP","LKR","LRD","LSL","LYD","MAD","MDL","MGA",
  "MKD","MMK","MNT","MOP","MRU","MUR","MVR","MWK","MXN","MXV","MYR","MZN","NAD",
  "NGN","NIO","NOK","NPR","NZD","OMR","PAB","PEN","PGK","PHP","PKR","PLN","PYG",
  "QAR","RON","RSD","RUB","RWF","SAR","SBD","SCR","SDG","SEK","SGD","SHP","SLE",
  "SLL","SOS","SRD","SSP","STN","SVC","SYP","SZL","THB","TJS","TMT","TND","TOP",
  "TRY","TTD","TWD","TZS","UAH","UGX","USD","USN","UYI","UYU","UYW","UZS","VED",
  "VES","VND","VUV","WST","XAF","XAG","XAU","XBA","XBB","XBC","XBD","XCD","XDR",
  "XOF","XPD","XPF","XPT","XSU","XTS","XUA","XXX","YER","ZAR","ZMW","ZWL",
]);

/**
 * Check whether a string is a valid IANA timezone identifier.
 * Uses the native Intl API (no extra package needed).
 */
function isValidTimezone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a string is a valid ISO 4217 currency code.
 */
function isValidCurrency(code) {
  return typeof code === "string" && ISO_CURRENCY_CODES.has(code.toUpperCase());
}

/**
 * Check whether a string is a valid email address.
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Check whether a string is a valid international phone number.
 * Allows optional leading + and digits, spaces, dashes, dots, parentheses.
 */
function isValidPhone(phone) {
  return /^\+?[\d\s\-().]{7,20}$/.test(phone);
}

/**
 * Build a standard { code, message, fieldErrors } error response payload.
 */
function buildErrorPayload(code, message, fieldErrors = {}) {
  return { code, message, fieldErrors };
}

module.exports = {
  isValidTimezone,
  isValidCurrency,
  isValidEmail,
  isValidPhone,
  ISO_CURRENCY_CODES,
  buildErrorPayload,
};
