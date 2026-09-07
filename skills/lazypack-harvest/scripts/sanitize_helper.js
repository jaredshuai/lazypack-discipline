/**
 * sanitize_helper.js
 * 
 * Sanitization engine and verifier for /lazypack-harvest.
 * 
 * Complies with SPEC.md §1.2 (Principle 5) and §2 (Stage 4 & Sanitization).
 * Redacts absolute paths, credentials, tokens, private package names, internal emails, and IPs.
 * Zero external dependencies (Node.js standard library only).
 * 
 * NOTE: This helper provides regex pattern replacement and supplementary audit signals.
 * Passing verifySanitization (noKnownViolations = true) does NOT equal authorization
 * to dispatch without host agent review. The host agent must independently verify
 * that un-patterned project identifiers, private paths, and semantic context are sanitized.
 */

const SENSITIVE_PATTERNS = [
  { name: "windows_path", regex: /[A-Za-z]:\\[^\s\<\>\"\`\x27\[\]\|\?\*]+/g, replacement: "<DIR/PATH>" },
  { name: "unix_path", regex: /(?:\/home|\/Users|\/etc|\/var|\/root|\/opt|\/tmp)\/[^\s\<\>\"\`\x27\[\]\|\?\*]+/g, replacement: "<DIR/PATH>" },
  { name: "aws_key_or_secret_token", regex: /AKIA[0-9A-Za-z_]{8,}/g, replacement: "<REDACTED_API_KEY>" },
  { name: "github_pat", regex: /gh[pousr]_[A-Za-z0-9_]{36,}/g, replacement: "<REDACTED_TOKEN>" },
  { name: "bearer_token", regex: /(?:Bearer\s+|secret[_-]?key[:=]\s*)[A-Za-z0-9_\-\.~+/]{20,}/gi, replacement: "<REDACTED_TOKEN>" },
  { name: "internal_scope", regex: /@[a-zA-Z0-9_-]*(?:internal|private|corp|enterprise)[a-zA-Z0-9_-]*\/[a-zA-Z0-9_-]+/gi, replacement: "<REDACTED_INTERNAL_PACKAGE>" },
  { name: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: "<REDACTED_EMAIL>" },
  { name: "ipv4", regex: /\b(?:10|172\.(?:1[6-9]|2[0-9]|3[01])|192\.168)\.[0-9]{1,3}\.[0-9]{1,3}\b/g, replacement: "<REDACTED_IP>" }
];

/**
 * Sanitizes input text by replacing recognized sensitive tokens with safe placeholders.
 * @param {string} text - Raw input string
 * @returns {string} Sanitized string
 */
function sanitizeText(text) {
  if (!text || typeof text !== "string") return "";
  let sanitized = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern.regex, pattern.replacement);
  }
  return sanitized;
}

/**
 * Sanitizes search query string prior to external issue search.
 * Ensures query is sanitized and trimmed.
 * @param {string} query - Raw search query
 * @returns {string} Sanitized query string
 */
function sanitizeSearchQuery(query) {
  if (!query || typeof query !== "string") return "";
  return sanitizeText(query).trim();
}

/**
 * Audits text against known sensitive patterns.
 * 
 * IMPORTANT: noKnownViolations = true indicates only that known regex patterns
 * were not matched. It does NOT guarantee that the payload is free of un-patterned
 * proprietary identifiers, and must NOT be used as the sole condition to authorize dispatch.
 * 
 * @param {string} text - Text to audit
 * @returns {Object} { noKnownViolations: boolean, safe: boolean, violations: Array<string>, warning: string }
 */
function verifySanitization(text) {
  if (!text || typeof text !== "string") {
    return {
      noKnownViolations: true,
      safe: true,
      violations: [],
      warning: "Empty text; host agent review still required."
    };
  }
  const violations = [];

  for (const pattern of SENSITIVE_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(text)) {
      violations.push(pattern.name);
    }
  }

  const clean = (violations.length === 0);
  return {
    noKnownViolations: clean,
    safe: clean, // backward-compatibility alias; callers must recognize safe != dispatch authorization
    violations,
    warning: clean
      ? "Known regex patterns cleared; host agent must still review un-patterned private paths, internal project names, and composite identifiers."
      : `Known sensitive patterns detected: ${violations.join(", ")}`
  };
}

module.exports = {
  sanitizeText,
  sanitizeSearchQuery,
  verifySanitization
};