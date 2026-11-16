//! Intent-Based AI Agent Security Validator (Countering Token Security & Prompt Hijacking).
//! Verifies that an AI agent's runtime tool call and AST arguments align with the cryptographically
//! signed task IntentEnvelope before execution.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct IntentEnvelope {
    pub intent_id: String,
    pub stated_goal: String,
    pub allow_mutations: bool,
    pub allowed_tool_prefixes: Vec<String>,
    pub max_rows_affected: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct IntentValidationOutcome {
    pub aligned: bool,
    pub drift_score: u8,
    pub violation_reason: Option<String>,
}

pub fn verify_intent_alignment(
    envelope: &IntentEnvelope,
    tool_name: &str,
    sql_is_readonly: bool,
    path_traversal_detected: bool,
    egress_is_private_ip: bool,
) -> IntentValidationOutcome {
    if path_traversal_detected || egress_is_private_ip {
        return IntentValidationOutcome {
            aligned: false,
            drift_score: 100,
            violation_reason: Some("INTENT_VIOLATION: Exploit payload (traversal/SSRF) contradicts task intent".into()),
        };
    }

    if !envelope.allow_mutations && !sql_is_readonly {
        return IntentValidationOutcome {
            aligned: false,
            drift_score: 95,
            violation_reason: Some(format!(
                "INTENT_DRIFT: Task goal '{}' is read-only, but tool '{}' attempted destructive mutation",
                envelope.stated_goal, tool_name
            )),
        };
    }

    if !envelope.allowed_tool_prefixes.is_empty()
        && !envelope
            .allowed_tool_prefixes
            .iter()
            .any(|prefix| tool_name.starts_with(prefix))
    {
        return IntentValidationOutcome {
            aligned: false,
            drift_score: 85,
            violation_reason: Some(format!(
                "INTENT_SCOPE_ESCAPE: Tool '{}' is outside permitted task prefixes {:?}",
                tool_name, envelope.allowed_tool_prefixes
            )),
        };
    }

    IntentValidationOutcome {
        aligned: true,
        drift_score: 0,
        violation_reason: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_destructive_sql_when_intent_is_readonly() {
        let env = IntentEnvelope {
            intent_id: "intent-001".into(),
            stated_goal: "Summarize Q3 customer invoices".into(),
            allow_mutations: false,
            allowed_tool_prefixes: vec!["prod-db/".into(), "execute_sql".into()],
            max_rows_affected: 0,
        };
        let res = verify_intent_alignment(&env, "execute_sql", false, false, false);
        assert!(!res.aligned);
        assert!(res.drift_score >= 90);
    }

    #[test]
    fn permits_aligned_readonly_tool_call() {
        let env = IntentEnvelope {
            intent_id: "intent-002".into(),
            stated_goal: "Read Q3 order totals".into(),
            allow_mutations: false,
            allowed_tool_prefixes: vec!["execute_sql".into()],
            max_rows_affected: 0,
        };
        let res = verify_intent_alignment(&env, "execute_sql", true, false, false);
        assert!(res.aligned);
        assert_eq!(res.drift_score, 0);
    }
}
