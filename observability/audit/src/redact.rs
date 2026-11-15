// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Redaction rules for audit free text and structured values.
//!
//! The first slice uses a deliberately small, reviewable rule set:
//!
//! | Category | Examples | Treatment |
//! | --- | --- | --- |
//! | Authorization | `Authorization: Bearer ...` | whole value replaced |
//! | Bearer token | `Bearer abc` | token replaced |
//! | JWT | `eyJ...eyJ...sig` | token replaced |
//! | Secret assignment | `password=`, `api_key:`, `client_secret=` | value replaced |
//! | Cookies | `Cookie:`, `Set-Cookie:` | whole value replaced |
//! | Private key | PEM private-key block | block replaced |
//! | Cloud tokens | `AKIA...`, `ghp_...`, `xoxb-...` | token replaced |
//! | PII | email, international phone, SSN | value replaced |
//! | Payment card | 13–19 digits passing Luhn | value replaced |
//!
//! Raw tool arguments are not accepted by the audit event builder at all. If a
//! caller must describe an argument, it should pass a canonical validator
//! summary rather than a raw SQL statement, path, URL, or command.

use std::sync::OnceLock;

use regex::Regex;
use serde_json::{Map, Value};

/// Maximum characters inspected for a single free-text field.
pub const MAX_TEXT_INPUT: usize = 32 * 1024;
/// Maximum JSON nesting depth processed by [`Redactor::redact_json`].
pub const MAX_JSON_DEPTH: usize = 8;
/// Maximum JSON nodes processed by [`Redactor::redact_json`].
pub const MAX_JSON_NODES: usize = 1_000;

/// Result of a redaction pass.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RedactionOutcome {
    /// The redacted text.
    pub text: String,
    /// Number of replacements made across all rules.
    pub redactions: usize,
}

struct Rule {
    regex: Regex,
    replacement: &'static str,
    /// PII rules are skipped by [`Redactor::redact_credentials_only`].
    pii: bool,
}

static RULES: OnceLock<Vec<Rule>> = OnceLock::new();
static CARD_REGEX: OnceLock<Regex> = OnceLock::new();

fn rules() -> &'static Vec<Rule> {
    RULES.get_or_init(|| {
        vec![
            Rule {
                regex: Regex::new(
                    r"(?i)\bauthorization\b\s*[:=]\s*(?:(?:bearer|basic|digest)\s+)?[^\s,;]+",
                )
                .expect("authorization redaction regex"),
                replacement: "authorization=[REDACTED]",
                pii: false,
            },
            Rule {
                regex: Regex::new(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+")
                    .expect("bearer redaction regex"),
                replacement: "Bearer [REDACTED]",
                pii: false,
            },
            Rule {
                regex: Regex::new(r"\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b")
                    .expect("jwt redaction regex"),
                replacement: "[REDACTED_JWT]",
                pii: false,
            },
            Rule {
                regex: Regex::new(
                    r#"(?i)\b(password|passwd|pwd|secret|client_secret|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|auth[_-]?token|id[_-]?token|token|credential|credentials|private[_-]?key|privatekey|session[_-]?id|aws[_-]?secret[_-]?access[_-]?key)\b\s*[:=]\s*(?:\"[^\"]*\"|'[^']*'|[^\s,;]{1,4096})"#,
                )
                .expect("secret assignment redaction regex"),
                replacement: "${1}=[REDACTED]",
                pii: false,
            },
            Rule {
                regex: Regex::new(r"(?i)\b(set-cookie|cookie)\b\s*[:=]\s*[^\r\n]+")
                    .expect("cookie redaction regex"),
                replacement: "${1}=[REDACTED]",
                pii: false,
            },
            Rule {
                regex: Regex::new(
                    r"(?s)-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----.*?-----END [A-Z0-9 ]*PRIVATE KEY-----",
                )
                .expect("pem redaction regex"),
                replacement: "[REDACTED_PRIVATE_KEY]",
                pii: false,
            },
            Rule {
                regex: Regex::new(r"\bAKIA[0-9A-Z]{16}\b").expect("aws key regex"),
                replacement: "[REDACTED_AWS_ACCESS_KEY]",
                pii: false,
            },
            Rule {
                regex: Regex::new(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b").expect("github token regex"),
                replacement: "[REDACTED_GITHUB_TOKEN]",
                pii: false,
            },
            Rule {
                regex: Regex::new(r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b").expect("slack token regex"),
                replacement: "[REDACTED_SLACK_TOKEN]",
                pii: false,
            },
            Rule {
                regex: Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
                    .expect("email redaction regex"),
                replacement: "[REDACTED_EMAIL]",
                pii: true,
            },
            Rule {
                regex: Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").expect("ssn redaction regex"),
                replacement: "[REDACTED_SSN]",
                pii: true,
            },
            Rule {
                regex: Regex::new(r"\+\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b")
                    .expect("phone redaction regex"),
                replacement: "[REDACTED_PHONE]",
                pii: true,
            },
        ]
    })
}

fn card_regex() -> &'static Regex {
    CARD_REGEX.get_or_init(|| {
        Regex::new(r"\b(?:\d[ -]?){12,18}\d\b").expect("payment card candidate regex")
    })
}

/// Stateless redactor. All regexes are compiled once per process.
#[derive(Debug, Clone, Copy, Default)]
pub struct Redactor;

impl Redactor {
    /// Create a redactor.
    pub fn new() -> Self {
        Self
    }

    /// Redact credentials, secrets, PII, and payment-card-like values.
    pub fn redact(&self, input: &str) -> String {
        self.redact_with_report(input).text
    }

    /// Redact and report how many replacements were made.
    pub fn redact_with_report(&self, input: &str) -> RedactionOutcome {
        self.apply(input, true)
    }

    /// Redact credential patterns only.
    ///
    /// Use this for stable identity metadata such as `agent_id`, where PII
    /// redaction would destroy the correlation value but a misconfigured token
    /// must still never be written.
    pub fn redact_credentials_only(&self, input: &str) -> String {
        self.apply(input, false).text
    }

    fn apply(&self, input: &str, include_pii: bool) -> RedactionOutcome {
        let (mut text, truncated) = truncate_text(input, MAX_TEXT_INPUT);
        let mut redactions = 0usize;

        for rule in rules() {
            if rule.pii && !include_pii {
                continue;
            }
            let found = rule.regex.find_iter(&text).count();
            if found > 0 {
                text = rule.regex.replace_all(&text, rule.replacement).into_owned();
                redactions += found;
            }
        }

        if include_pii {
            text = redact_payment_cards(&text, &mut redactions);
        }

        if truncated {
            text.push_str("...[TRUNCATED]");
        }

        RedactionOutcome { text, redactions }
    }

    /// Recursively redact a JSON value.
    ///
    /// Sensitive keys are replaced wholesale, including tool-argument fields
    /// such as `query`, `sql`, `path`, `url`, and `command`. Recursion is bounded
    /// by depth and node count.
    pub fn redact_json(&self, value: &Value) -> Value {
        self.redact_json_with_report(value).0
    }

    /// Recursively redact a JSON value and report the number of replaced nodes.
    pub fn redact_json_with_report(&self, value: &Value) -> (Value, usize) {
        let mut count = 0usize;
        let mut nodes = 0usize;
        let redacted = self.redact_json_inner(value, 0, &mut nodes, &mut count);
        (redacted, count)
    }

    fn redact_json_inner(
        &self,
        value: &Value,
        depth: usize,
        nodes: &mut usize,
        count: &mut usize,
    ) -> Value {
        *nodes += 1;
        if *nodes > MAX_JSON_NODES {
            *count += 1;
            return Value::String("[REDACTED_NODE_LIMIT]".to_string());
        }
        if depth > MAX_JSON_DEPTH {
            *count += 1;
            return Value::String("[REDACTED_DEPTH_LIMIT]".to_string());
        }

        match value {
            Value::Object(map) => {
                let mut out = Map::with_capacity(map.len());
                for (key, child) in map {
                    if is_sensitive_key(key) {
                        out.insert(key.clone(), Value::String("[REDACTED]".to_string()));
                        *count += 1;
                    } else {
                        out.insert(
                            key.clone(),
                            self.redact_json_inner(child, depth + 1, nodes, count),
                        );
                    }
                }
                Value::Object(out)
            }
            Value::Array(items) => Value::Array(
                items
                    .iter()
                    .map(|child| self.redact_json_inner(child, depth + 1, nodes, count))
                    .collect(),
            ),
            Value::String(text) => {
                let outcome = self.apply(text, true);
                if outcome.redactions > 0 {
                    *count += outcome.redactions;
                }
                Value::String(outcome.text)
            }
            other => other.clone(),
        }
    }
}

/// Whether a JSON key names a value that must not be written to audit.
pub fn is_sensitive_key(key: &str) -> bool {
    let normalized = key.to_ascii_lowercase().replace('-', "_");
    const EXACT: &[&str] = &[
        "authorization",
        "auth",
        "authentication",
        "cookie",
        "set_cookie",
        "password",
        "passwd",
        "pwd",
        "secret",
        "client_secret",
        "api_key",
        "apikey",
        "access_token",
        "refresh_token",
        "id_token",
        "token",
        "credential",
        "credentials",
        "private_key",
        "privatekey",
        "session",
        "session_id",
        "mcp_session_id",
        "raw_auth_header",
        "raw_arguments",
        "arguments",
        "params",
        "query",
        "sql",
        "statement",
        "script",
        "command",
        "path",
        "file",
        "filepath",
        "url",
        "uri",
        "endpoint",
        "email",
        "phone",
        "ssn",
        "credit_card",
        "card_number",
        "cvv",
        "pin",
    ];
    if EXACT.contains(&normalized.as_str()) {
        return true;
    }
    const FRAGMENTS: &[&str] = &[
        "secret",
        "password",
        "passwd",
        "credential",
        "api_key",
        "apikey",
        "private_key",
        "privatekey",
        "authorization",
        "cookie",
        "access_token",
        "refresh_token",
        "id_token",
    ];
    FRAGMENTS
        .iter()
        .any(|fragment| normalized.contains(fragment))
}

fn truncate_text(input: &str, max_chars: usize) -> (String, bool) {
    let mut out = String::with_capacity(input.len().min(max_chars));
    for (index, ch) in input.chars().enumerate() {
        if index >= max_chars {
            return (out, true);
        }
        out.push(ch);
    }
    (out, false)
}

fn redact_payment_cards(text: &str, redactions: &mut usize) -> String {
    let regex = card_regex();
    regex
        .replace_all(text, |captures: &regex::Captures<'_>| {
            let raw = &captures[0];
            let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
            if (13..=19).contains(&digits.len()) && luhn_valid(&digits) {
                *redactions += 1;
                "[REDACTED_PAYMENT_CARD]".to_string()
            } else {
                raw.to_string()
            }
        })
        .into_owned()
}

fn luhn_valid(digits: &str) -> bool {
    let mut sum = 0u32;
    let mut double = false;
    for ch in digits.chars().rev() {
        let Some(mut digit) = ch.to_digit(10) else {
            return false;
        };
        if double {
            digit *= 2;
            if digit > 9 {
                digit -= 9;
            }
        }
        sum += digit;
        double = !double;
    }
    sum.is_multiple_of(10)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // All values below are synthetic sentinels, not valid credentials.
    const SENTINEL: &str = "SYNTHETIC_REDACTION_SENTINEL";

    #[test]
    fn redacts_authorization_and_bearer() {
        let redactor = Redactor::new();
        let input = format!("Authorization: Bearer {SENTINEL}");
        let output = redactor.redact(&input);
        assert!(!output.contains(SENTINEL), "output: {output}");
        assert!(output.contains("[REDACTED]"));
    }

    #[test]
    fn redacts_bearer_without_authorization_prefix() {
        let redactor = Redactor::new();
        let output = redactor.redact(&format!("upstream said Bearer {SENTINEL}"));
        assert!(!output.contains(SENTINEL));
        assert!(output.contains("Bearer [REDACTED]"));
    }

    #[test]
    fn redacts_secret_assignments() {
        let redactor = Redactor::new();
        let input = format!(
            "password={SENTINEL} client_secret: '{SENTINEL}' api_key={SENTINEL} token={SENTINEL}"
        );
        let output = redactor.redact(&input);
        assert!(!output.contains(SENTINEL), "output: {output}");
        assert!(output.contains("password=[REDACTED]"));
        assert!(output.contains("client_secret=[REDACTED]"));
    }

    #[test]
    fn redacts_jwt_like_values() {
        let redactor = Redactor::new();
        let synthetic = "eyJhbGciOiJub25lIn0.eyJzdWIiOiJzeW50aGV0aWMifQ.synthetic-signature";
        let output = redactor.redact(&format!("credential {synthetic} observed"));
        assert!(!output.contains(synthetic));
        assert!(output.contains("[REDACTED_JWT]"));
    }

    #[test]
    fn redacts_private_key_blocks() {
        let redactor = Redactor::new();
        let input =
            "-----BEGIN RSA PRIVATE KEY-----\nMIIE_synthetic\n-----END RSA PRIVATE KEY-----";
        let output = redactor.redact(input);
        assert_eq!(output, "[REDACTED_PRIVATE_KEY]");
    }

    #[test]
    fn redacts_pii_and_cards() {
        let redactor = Redactor::new();
        // 4111 1111 1111 1111 passes Luhn and is a well-known test number.
        let input = "contact a@b.example +1 415 555 0100 ssn 123-45-6789 card 4111 1111 1111 1111";
        let output = redactor.redact(input);
        assert!(output.contains("[REDACTED_EMAIL]"), "output: {output}");
        assert!(output.contains("[REDACTED_PHONE]"), "output: {output}");
        assert!(output.contains("[REDACTED_SSN]"), "output: {output}");
        assert!(
            output.contains("[REDACTED_PAYMENT_CARD]"),
            "output: {output}"
        );
        assert!(!output.contains("4111"));
    }

    #[test]
    fn does_not_redact_arbitrary_digit_runs_that_fail_luhn() {
        let redactor = Redactor::new();
        let output = redactor.redact("request 1234 5678 9012 3456 completed");
        assert!(output.contains("1234 5678 9012 3456"), "output: {output}");
    }

    #[test]
    fn credentials_only_keeps_email_identity() {
        let redactor = Redactor::new();
        let output = redactor.redact_credentials_only("agent@example.com");
        assert_eq!(output, "agent@example.com");
    }

    #[test]
    fn redacts_sensitive_json_keys_recursively() {
        let redactor = Redactor::new();
        let value = json!({
            "tool": "execute_sql",
            "arguments": {
                "query": "SELECT * FROM users",
                "options": { "password": SENTINEL, "limit": 10 }
            },
            "note": format!("contact a@b.example with Bearer {SENTINEL}")
        });
        let (redacted, count) = redactor.redact_json_with_report(&value);
        let text = redacted.to_string();
        assert!(!text.contains("SELECT"), "text: {text}");
        assert!(!text.contains(SENTINEL), "text: {text}");
        assert!(!text.contains("a@b.example"), "text: {text}");
        assert!(text.contains("[REDACTED]"));
        assert!(count >= 3, "count: {count}");
    }

    #[test]
    fn json_depth_is_bounded() {
        let redactor = Redactor::new();
        let mut value = json!("leaf");
        for _ in 0..(MAX_JSON_DEPTH + 4) {
            value = json!({ "nested": value });
        }
        let text = redactor.redact_json(&value).to_string();
        assert!(text.contains("[REDACTED_DEPTH_LIMIT]"), "text: {text}");
    }

    #[test]
    fn long_text_is_truncated_and_bounded() {
        let redactor = Redactor::new();
        let input = "a".repeat(MAX_TEXT_INPUT + 100);
        let output = redactor.redact(&input);
        assert!(output.ends_with("...[TRUNCATED]"));
        assert!(output.len() <= MAX_TEXT_INPUT + 32);
    }

    #[test]
    fn luhn_check_works() {
        assert!(luhn_valid("4111111111111111"));
        assert!(!luhn_valid("4111111111111112"));
        assert!(!luhn_valid("not-digits"));
    }
}
