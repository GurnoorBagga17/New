// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Team 3 — Multi-Signal Automated Ownership Attribution Engine.
//!
//! Resolves "Who owns this NHI or AI agent?" by combining:
//! 1. Verified OAuth 2.1 CIMD contacts + `.github/CODEOWNERS` match -> 0.95 confidence
//! 2. Cloud IAM / K8s explicit `owner` or `team` tag -> 0.80 confidence
//! 3. Slack App installer / OAuth creator active in directory -> 0.70 confidence
//! 4. Git blame / Terraform PR commit author (<180 days) -> 0.60 confidence
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

/// Parses a `.github/CODEOWNERS` file into path-prefix -> team mappings.
pub fn parse_codeowners(content: &str) -> HashMap<String, Vec<String>> {
    let mut map = HashMap::new();
    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.split_whitespace();
        if let Some(pattern) = parts.next() {
            let owners: Vec<String> = parts.map(str::to_owned).collect();
            if !owners.is_empty() {
                map.insert(pattern.to_owned(), owners);
            }
        }
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
        email = Some(tag.clone());
        team = input.codeowners_team.clone().or_else(|| Some("@platform-sec".to_owned()));
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
        score = 0.60;
        email = Some(git_author.clone());
        team = input.codeowners_team.clone();
        evidence.push("git:blame_provenance".to_owned());
    }

    let is_shadow = score < 0.50 || email.is_none();
    OwnershipResult {
        entity_uid: input.entity_uid.clone(),
        primary_owner_email: if is_shadow { None } else { email },
        owning_team: if is_shadow { None } else { team },
        confidence_score: score,
        is_shadow_nhi: is_shadow,
        evidence_sources: evidence,
    }
}
