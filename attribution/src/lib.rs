// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Team 3 — Multi-Signal Automated Ownership Attribution Engine.
//!
//! Resolves "Who owns this NHI or AI agent?" by combining:
//! 1. Verified OAuth 2.1 CIMD contacts + `.github/CODEOWNERS` match -> 0.95 confidence
//! 2. Cloud IAM / K8s explicit `owner` or `team` tag -> 0.80 confidence
//! 3. Slack App installer / OAuth creator active in directory -> 0.70 confidence
//! 4. Git blame / Terraform PR commit author (<180 days) -> 0.60 confidence (decays to 0.35 if >180 days)
//! 5. Departed employee or zero signals -> 0.00 (`Unowned / Shadow NHI`)

use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AttributionInput {
    pub entity_uid: String,
    pub cimd_contact: Option<String>,
    pub codeowners_team: Option<String>,
    pub cloud_owner_tag: Option<String>,
    pub slack_installer_email: Option<String>,
    pub git_commit_author: Option<String>,
    #[serde(default)]
    pub git_commit_age_days: Option<u32>,
    pub owner_active_in_idp: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OwnershipResult {
    pub entity_uid: String,
    pub primary_owner_email: Option<String>,
    pub owning_team: Option<String>,
    pub confidence_score: f32,
    pub is_shadow_nhi: bool,
    pub evidence_sources: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodeownersRule {
    pub pattern: String,
    pub owners: Vec<String>,
}

/// Ordered list of CODEOWNERS rules where last match takes precedence.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct CodeownersFile {
    pub rules: Vec<CodeownersRule>,
}

impl CodeownersFile {
    pub fn parse(content: &str) -> Self {
        let mut rules = Vec::new();
        for raw_line in content.lines() {
            let line = raw_line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let mut parts = line.split_whitespace();
            if let Some(pattern) = parts.next() {
                let owners: Vec<String> = parts.map(str::to_owned).collect();
                if !owners.is_empty() {
                    rules.push(CodeownersRule {
                        pattern: pattern.to_owned(),
                        owners,
                    });
                }
            }
        }
        Self { rules }
    }

    /// Matches a file path against CODEOWNERS rules using last-match-wins semantics.
    pub fn match_path(&self, path: &str) -> Option<&[String]> {
        for rule in self.rules.iter().rev() {
            if matches_pattern(&rule.pattern, path) {
                return Some(&rule.owners);
            }
        }
        None
    }
}

fn matches_pattern(pattern: &str, path: &str) -> bool {
    let clean_pattern = pattern.trim_start_matches('/');
    let clean_path = path.trim_start_matches('/');

    if clean_pattern == "*" {
        return true;
    }
    if let Some(prefix) = clean_pattern.strip_suffix('*') {
        return clean_path.starts_with(prefix);
    }
    if clean_pattern.ends_with('/') {
        return clean_path.starts_with(clean_pattern);
    }
    clean_path == clean_pattern || clean_path.starts_with(&format!("{clean_pattern}/"))
}

/// Backward compatible helper returning a HashMap of pattern -> owners.
pub fn parse_codeowners(content: &str) -> HashMap<String, Vec<String>> {
    let parsed = CodeownersFile::parse(content);
    let mut map = HashMap::new();
    for rule in parsed.rules {
        map.insert(rule.pattern, rule.owners);
    }
    map
}

pub fn resolve_ownership(input: &AttributionInput) -> OwnershipResult {
    if !input.owner_active_in_idp {
        return OwnershipResult {
            entity_uid: input.entity_uid.clone(),
            primary_owner_email: None,
            owning_team: None,
            confidence_score: 0.0,
            is_shadow_nhi: true,
            evidence_sources: vec!["idp:creator_departed_or_unverified".to_owned()],
        };
    }

    let mut evidence = Vec::new();
    let mut score: f32 = 0.0;
    let mut email: Option<String> = None;
    let mut team: Option<String> = None;

    if let (Some(cimd), Some(co_team)) = (&input.cimd_contact, &input.codeowners_team) {
        score = 0.95;
        email = Some(cimd.clone());
        team = Some(co_team.clone());
        evidence.push("oauth21:cimd_verified".to_owned());
        evidence.push("github:CODEOWNERS".to_owned());
    } else if let Some(tag) = &input.cloud_owner_tag {
        score = 0.80;
        if tag.contains('@') && !tag.starts_with('@') {
            email = Some(tag.clone());
            team = input.codeowners_team.clone();
        } else {
            team = Some(tag.clone());
        }
        evidence.push("cloud:iam_owner_tag".to_owned());
        if input.codeowners_team.is_some() {
            score = 0.88;
            evidence.push("github:CODEOWNERS".to_owned());
        }
    } else if let Some(slack_user) = &input.slack_installer_email {
        score = 0.70;
        email = Some(slack_user.clone());
        team = input.codeowners_team.clone();
        evidence.push("slack:app_installer".to_owned());
    } else if let Some(git_author) = &input.git_commit_author {
        let age = input.git_commit_age_days.unwrap_or(0);
        if age <= 180 {
            score = 0.60;
            email = Some(git_author.clone());
            team = input.codeowners_team.clone();
            evidence.push("git:blame_provenance_fresh".to_owned());
        } else {
            score = 0.35;
            email = Some(git_author.clone());
            team = input.codeowners_team.clone();
            evidence.push(format!("git:blame_stale_{age}_days"));
        }
    }

    let is_shadow = score < 0.50 || (email.is_none() && team.is_none());
    OwnershipResult {
        entity_uid: input.entity_uid.clone(),
        primary_owner_email: if is_shadow { None } else { email },
        owning_team: if is_shadow { None } else { team },
        confidence_score: score,
        is_shadow_nhi: is_shadow,
        evidence_sources: evidence,
    }
}

/// Attributes ownership for an entity discovered across cloud, kubernetes, or VCS providers.
pub fn attribute_discovered_entity(
    entity_uid: &str,
    tags: &HashMap<String, String>,
    codeowners: Option<&CodeownersFile>,
) -> OwnershipResult {
    let owner_tag = tags
        .get("owner")
        .or_else(|| tags.get("Owner"))
        .or_else(|| tags.get("team"));
    let cimd_contact = tags.get("cimd_contact").or_else(|| tags.get("contact"));
    let slack_installer = tags
        .get("slack_installer_email")
        .or_else(|| tags.get("installer"));
    let git_author = tags.get("git_author").or_else(|| tags.get("commit_author"));
    let git_age_days = tags
        .get("git_commit_age_days")
        .and_then(|s| s.parse::<u32>().ok());
    let path = tags.get("path").map(|s| s.as_str()).unwrap_or("");
    let matched_team = codeowners
        .and_then(|co| co.match_path(path))
        .and_then(|owners| owners.first().cloned());

    let input = AttributionInput {
        entity_uid: entity_uid.to_owned(),
        cimd_contact: cimd_contact.cloned(),
        codeowners_team: matched_team,
        cloud_owner_tag: owner_tag.cloned(),
        slack_installer_email: slack_installer.cloned(),
        git_commit_author: git_author.cloned(),
        git_commit_age_days: git_age_days,
        owner_active_in_idp: true,
    };
    resolve_ownership(&input)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_codeowners_last_match_wins() {
        let content = r#"
        *                   @global-security
        /services/*         @backend-team
        /services/auth/*    @iam-specialists
        "#;
        let cf = CodeownersFile::parse(content);
        assert_eq!(cf.rules.len(), 3);

        let general_match = cf.match_path("README.md").unwrap();
        assert_eq!(general_match, &["@global-security"]);

        let service_match = cf.match_path("services/api/main.rs").unwrap();
        assert_eq!(service_match, &["@backend-team"]);

        // Specific override: /services/auth/* wins over /services/*
        let auth_match = cf.match_path("services/auth/token.rs").unwrap();
        assert_eq!(auth_match, &["@iam-specialists"]);
    }

    #[test]
    fn test_attribution_stale_git_blame_becomes_shadow() {
        let fresh_input = AttributionInput {
            entity_uid: "agent:analyst-1".into(),
            cimd_contact: None,
            codeowners_team: None,
            cloud_owner_tag: None,
            slack_installer_email: None,
            git_commit_author: Some("alice@example.com".into()),
            git_commit_age_days: Some(30),
            owner_active_in_idp: true,
        };
        let res_fresh = resolve_ownership(&fresh_input);
        assert_eq!(res_fresh.confidence_score, 0.60);
        assert!(!res_fresh.is_shadow_nhi);
        assert_eq!(res_fresh.primary_owner_email.as_deref(), Some("alice@example.com"));

        let stale_input = AttributionInput {
            git_commit_age_days: Some(250), // > 180 days stale
            ..fresh_input
        };
        let res_stale = resolve_ownership(&stale_input);
        assert_eq!(res_stale.confidence_score, 0.35);
        assert!(res_stale.is_shadow_nhi); // < 0.50 threshold triggers shadow NHI
    }

    #[test]
    fn test_departed_idp_creator_immediately_shadow() {
        let input = AttributionInput {
            entity_uid: "sa:cloud-agent".into(),
            cimd_contact: Some("bob@example.com".into()),
            codeowners_team: Some("@core".into()),
            cloud_owner_tag: None,
            slack_installer_email: None,
            git_commit_author: None,
            git_commit_age_days: None,
            owner_active_in_idp: false, // Departed employee
        };
        let res = resolve_ownership(&input);
        assert_eq!(res.confidence_score, 0.0);
        assert!(res.is_shadow_nhi);
        assert_eq!(res.evidence_sources[0], "idp:creator_departed_or_unverified");
    }

    #[test]
    fn test_attribute_discovered_entity_with_tags_and_codeowners() {
        let mut tags = HashMap::new();
        tags.insert("owner".into(), "platform-lead@corp.com".into());
        tags.insert("path".into(), "services/api/handler.rs".into());

        let co = CodeownersFile::parse("* @global-sec\nservices/* @platform-team");
        let result = attribute_discovered_entity("role:arn:aws:iam::123:role/ApiRole", &tags, Some(&co));

        assert!(!result.is_shadow_nhi);
        assert_eq!(result.primary_owner_email.as_deref(), Some("platform-lead@corp.com"));
        assert_eq!(result.owning_team.as_deref(), Some("@platform-team"));
        assert_eq!(result.confidence_score, 0.88);
    }
}
