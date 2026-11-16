//! Astrix Competitor Parity: SaaS-to-SaaS OAuth Grant & API-Key Sprawl Scanner.
//! Detects over-privileged third-party OAuth tokens, dormant app-to-app integrations,
//! and unverified SaaS API keys across Google Workspace, GitHub, Slack, and Salesforce.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SaasOauthGrant {
    pub grant_id: String,
    pub source_app: String,
    pub target_saas: String,
    pub granted_scopes: Vec<String>,
    pub days_since_last_use: u32,
    pub is_admin_consent: bool,
    pub credential_fingerprint_hmac: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SaasSprawlFinding {
    pub grant_id: String,
    pub risk_level: String,
    pub overprivileged_scopes: Vec<String>,
    pub dormant: bool,
    pub recommended_remediation: String,
}

pub fn analyze_saas_oauth_sprawl(grants: &[SaasOauthGrant]) -> Vec<SaasSprawlFinding> {
    let dangerous_scopes = [
        "admin:org",
        "repo:delete",
        "mail.readwrite.all",
        "files.readwrite.all",
        "chat:write:bot",
        "full_access",
    ];
    let mut findings = Vec::new();

    for g in grants {
        let overprivileged: Vec<String> = g
            .granted_scopes
            .iter()
            .filter(|s| dangerous_scopes.iter().any(|d| s.eq_ignore_ascii_case(d)))
            .cloned()
            .collect();
        let dormant = g.days_since_last_use > 30;
        if !overprivileged.is_empty() || dormant {
            let risk_level = if !overprivileged.is_empty() && g.is_admin_consent {
                "CRITICAL"
            } else if !overprivileged.is_empty() || dormant {
                "HIGH"
            } else {
                "MEDIUM"
            };
            findings.push(SaasSprawlFinding {
                grant_id: g.grant_id.clone(),
                risk_level: risk_level.into(),
                overprivileged_scopes: overprivileged,
                dormant,
                recommended_remediation: if dormant {
                    "revoke_dormant_saas_oauth_grant".into()
                } else {
                    "attenuate_oauth_scopes_to_readonly".into()
                },
            });
        }
    }
    findings
}
