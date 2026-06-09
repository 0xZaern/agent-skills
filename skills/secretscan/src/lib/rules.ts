/**
 * Detection rules for secretscan.
 *
 * Each rule defines a regex, a secret kind, severity, and a human label.
 * The regex must have exactly one capture group: the matched secret value.
 */

import { SecretKind, Severity } from "./types.js";

export interface Rule {
  kind: SecretKind;
  severity: Severity;
  label: string;
  /** Regex with one capture group that captures the secret value. */
  pattern: RegExp;
}

export const RULES: Rule[] = [
  // -------------------------------------------------------------------------
  // AWS
  // -------------------------------------------------------------------------
  {
    kind: "aws_access_key",
    severity: "critical",
    label: "AWS Access Key ID",
    // AKIA, ABIA, ACCA, ASIA — 20 uppercase alphanumeric chars
    pattern: /(?<![A-Z0-9])(AKIA[0-9A-Z]{16})/,
  },
  {
    kind: "aws_secret_key",
    severity: "critical",
    label: "AWS Secret Access Key",
    // 40 base64 chars following a common assignment pattern
    pattern: /(?:aws_secret(?:_access)?_key|AWS_SECRET(?:_ACCESS)?_KEY)[^\S\r\n]*[=:][^\S\r\n]*['"]?([A-Za-z0-9+/]{40})['"]?/i,
  },

  // -------------------------------------------------------------------------
  // OpenAI
  // -------------------------------------------------------------------------
  {
    kind: "openai_key",
    severity: "critical",
    label: "OpenAI API Key",
    // sk-<project>-... or sk-<legacy>-...
    pattern: /(sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,})/,
  },

  // -------------------------------------------------------------------------
  // Stripe
  // -------------------------------------------------------------------------
  {
    kind: "stripe_key",
    severity: "critical",
    label: "Stripe Secret Key",
    pattern: /(sk_(?:live|test)_[A-Za-z0-9]{24,})/,
  },

  // -------------------------------------------------------------------------
  // GitHub
  // -------------------------------------------------------------------------
  {
    kind: "github_token",
    severity: "critical",
    label: "GitHub Personal Access Token",
    // ghp_ (classic), github_pat_, gho_, ghr_, ghs_, ghu_
    pattern: /(gh[pousr]_[A-Za-z0-9_]{36,}|github_pat_[A-Za-z0-9_]{82,})/,
  },

  // -------------------------------------------------------------------------
  // JWTs
  // -------------------------------------------------------------------------
  {
    kind: "jwt",
    severity: "high",
    label: "JSON Web Token",
    // three base64url segments separated by dots
    pattern: /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/,
  },

  // -------------------------------------------------------------------------
  // PEM private key blocks
  // -------------------------------------------------------------------------
  {
    kind: "private_key_block",
    severity: "critical",
    label: "Private Key Block",
    pattern: /(-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----)/,
  },

  // -------------------------------------------------------------------------
  // Bearer tokens
  // -------------------------------------------------------------------------
  {
    kind: "bearer_token",
    severity: "high",
    label: "Bearer Token",
    // Authorization: Bearer <token> — at least 20 chars
    pattern: /[Aa]uthorization[^\S\r\n]*:[^\S\r\n]*[Bb]earer[^\S\r\n]+([A-Za-z0-9\-._~+/]{20,}={0,2})/,
  },

  // -------------------------------------------------------------------------
  // Generic hardcoded passwords
  // -------------------------------------------------------------------------
  {
    kind: "generic_password",
    severity: "high",
    label: "Hardcoded Password",
    // password = "value" / password: 'value' / PASSWORD="value"
    pattern: /(?:password|passwd|secret|api_key|apikey|access_token|auth_token)[^\S\r\n]*[=:][^\S\r\n]*['"]([^'"]{8,})['"](?!\s*\+)/i,
  },

  // -------------------------------------------------------------------------
  // Connection strings / DSNs
  // -------------------------------------------------------------------------
  {
    kind: "connection_string",
    severity: "high",
    label: "Connection String / DSN",
    // postgres://, mysql://, mongodb://, redis://, amqp://, etc. with credentials
    pattern: /([a-z][a-z0-9+.-]+:\/\/[^:@\s]+:[^@\s]{4,}@[^\s'"]+)/i,
  },
];

// .env file rule — handled separately in scanner (file-level, not line-level)
export const ENV_FILE_PATTERN = /^\.env(\.[a-z0-9._-]+)?$/i;
