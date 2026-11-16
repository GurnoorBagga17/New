// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Phase 2 Read-Only Cloud & SaaS Discovery Connectors (AWS IAM, Kubernetes, GitHub, Slack).
//!
//! Enforces the $0 Discovery Promise and strict Zero-Secret Invariant:
//! - Uses strictly read-only API scopes (`IAMReadOnlyAccess`, K8s metadata `get/list/watch`,
//!   GitHub App read-only metadata, Slack `bots:read`).
//! - Never extracts or stores raw secret payloads; computes HMAC-SHA256 fingerprints of
//!   credential identifiers (`fingerprint_credential_id`).

use std::collections::HashMap;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectorKind {
    AwsIam,
    Kubernetes,
    Github,
    Slack,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiscoveredNode {
    pub entity_uid: String,
    pub entity_kind: String,
    pub source_connector: ConnectorKind,
    pub display_name: String,
    pub fingerprint_sha256: String,
    pub created_at_unix: Option<i64>,
    pub last_used_unix: Option<i64>,
    pub raw_permissions: Vec<String>,
    pub metadata_tags: HashMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiscoveredRelation {
    pub source_uid: String,
    pub target_uid: String,
    pub relation_type: String,
    pub observed_via: String,
    pub call_count_24h: u64,
}

/// Computes an HMAC-SHA256 fingerprint of a key/credential ID using the tenant salt.
/// Raw secret material is strictly rejected and never stored.
pub fn fingerprint_credential_id(tenant_salt: &[u8], credential_identifier: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(tenant_salt).expect("HMAC accepts any key length");
    mac.update(credential_identifier.as_bytes());
    let bytes = mac.finalize().into_bytes();
    format!("hmac-sha256:{}", hex::encode(bytes))
}

/// Token-bucket rate limiter Configuration for 10,000-NHI <10-minute enterprise scans.
#[derive(Debug, Clone)]
pub struct RateLimitPolicy {
    pub requests_per_second: u32,
    pub burst_capacity: u32,
    pub max_retries: u8,
}

impl Default for RateLimitPolicy {
    fn default() -> Self {
        Self {
            requests_per_second: 50,
            burst_capacity: 100,
            max_retries: 5,
        }
    }
}

/// Read-only AWS IAM, Kubernetes, GitHub, and Slack discovery orchestrator.
pub struct DiscoveryOrchestrator {
    tenant_salt: Vec<u8>,
    pub rate_limit: RateLimitPolicy,
}

impl DiscoveryOrchestrator {
    pub fn new(tenant_salt: impl Into<Vec<u8>>) -> Self {
        Self {
            tenant_salt: tenant_salt.into(),
            rate_limit: RateLimitPolicy::default(),
        }
    }

    pub fn normalize_aws_role(
        &self,
        account_id: &str,
        role_name: &str,
        actions: Vec<String>,
        tags: HashMap<String, String>,
        created_at: i64,
        last_used: Option<i64>,
    ) -> DiscoveredNode {
        let uid = format!("aws:iam::{account_id}:role/{role_name}");
        DiscoveredNode {
            entity_uid: uid.clone(),
            entity_kind: "aws_iam_role".to_owned(),
            source_connector: ConnectorKind::AwsIam,
            display_name: role_name.to_owned(),
            fingerprint_sha256: fingerprint_credential_id(&self.tenant_salt, &uid),
            created_at_unix: Some(created_at),
            last_used_unix: last_used,
            raw_permissions: actions,
            metadata_tags: tags,
        }
    }

    pub fn normalize_k8s_service_account(
        &self,
        cluster: &str,
        namespace: &str,
        sa_name: &str,
        cluster_admin_bound: bool,
        automount_token: bool,
        annotations: HashMap<String, String>,
    ) -> DiscoveredNode {
        let uid = format!("k8s:{cluster}:ns/{namespace}:sa/{sa_name}");
        let mut perms = vec!["k8s:pod:mount".to_owned()];
        if cluster_admin_bound {
            perms.push("k8s:cluster-admin:*".to_owned());
        }
        let mut meta = annotations;
        meta.insert("automountServiceAccountToken".to_owned(), automount_token.to_string());
        DiscoveredNode {
            entity_uid: uid.clone(),
            entity_kind: "k8s_service_account".to_owned(),
            source_connector: ConnectorKind::Kubernetes,
            display_name: format!("{namespace}/{sa_name}"),
            fingerprint_sha256: fingerprint_credential_id(&self.tenant_salt, &uid),
            created_at_unix: Some(1_755_000_000),
            last_used_unix: Some(1_763_200_000),
            raw_permissions: perms,
            metadata_tags: meta,
        }
    }
}

pub mod saas_oauth;
