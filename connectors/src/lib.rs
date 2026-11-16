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

/// Computes an HMAC-SHA256 fingerprint directly over raw credential material (e.g. API token or private key).
/// This enables detecting identical shared secrets across disparate systems (NHI9)
/// without ever persisting or logging the secret itself.
pub fn fingerprint_secret_material(tenant_salt: &[u8], secret_bytes: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(tenant_salt).expect("HMAC accepts any key length");
    mac.update(secret_bytes);
    let bytes = mac.finalize().into_bytes();
    format!("hmac-sha256:secret:{}", hex::encode(bytes))
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

/// In-memory thread-safe token bucket rate limiter for connector scans.
#[derive(Debug)]
pub struct TokenBucketLimiter {
    capacity: f64,
    refill_rate_per_sec: f64,
    tokens: std::sync::Mutex<f64>,
    last_refill: std::sync::Mutex<std::time::Instant>,
}

impl TokenBucketLimiter {
    pub fn new(policy: &RateLimitPolicy) -> Self {
        Self {
            capacity: policy.burst_capacity as f64,
            refill_rate_per_sec: policy.requests_per_second as f64,
            tokens: std::sync::Mutex::new(policy.burst_capacity as f64),
            last_refill: std::sync::Mutex::new(std::time::Instant::now()),
        }
    }

    /// Attempts to consume 1 token. Returns true if acquired, false if rate limited.
    pub fn try_acquire(&self) -> bool {
        let mut tokens_guard = self.tokens.lock().unwrap();
        let mut last_guard = self.last_refill.lock().unwrap();

        let now = std::time::Instant::now();
        let elapsed = now.duration_since(*last_guard).as_secs_f64();
        *last_guard = now;

        *tokens_guard = (*tokens_guard + elapsed * self.refill_rate_per_sec).min(self.capacity);

        if *tokens_guard >= 1.0 {
            *tokens_guard -= 1.0;
            true
        } else {
            false
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
        created_at: Option<i64>,
        last_used: Option<i64>,
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
            created_at_unix: created_at,
            last_used_unix: last_used,
            raw_permissions: perms,
            metadata_tags: meta,
        }
    }

    pub fn normalize_github_app(
        &self,
        app_id: u64,
        app_slug: &str,
        installation_id: u64,
        target_org: &str,
        permissions: Vec<String>,
        created_at: i64,
        last_used: Option<i64>,
    ) -> DiscoveredNode {
        let uid = format!("github:app:{app_id}:inst/{installation_id}:{target_org}");
        let mut meta = HashMap::new();
        meta.insert("app_slug".to_owned(), app_slug.to_owned());
        meta.insert("target_org".to_owned(), target_org.to_owned());
        DiscoveredNode {
            entity_uid: uid.clone(),
            entity_kind: "github_app_installation".to_owned(),
            source_connector: ConnectorKind::Github,
            display_name: format!("{app_slug}@{target_org}"),
            fingerprint_sha256: fingerprint_credential_id(&self.tenant_salt, &uid),
            created_at_unix: Some(created_at),
            last_used_unix: last_used,
            raw_permissions: permissions,
            metadata_tags: meta,
        }
    }

    pub fn normalize_slack_bot(
        &self,
        team_id: &str,
        bot_user_id: &str,
        app_name: &str,
        scopes: Vec<String>,
        installed_by_user_id: &str,
        created_at: i64,
        last_used: Option<i64>,
    ) -> DiscoveredNode {
        let uid = format!("slack:{team_id}:bot/{bot_user_id}");
        let mut meta = HashMap::new();
        meta.insert("app_name".to_owned(), app_name.to_owned());
        meta.insert("installed_by".to_owned(), installed_by_user_id.to_owned());
        DiscoveredNode {
            entity_uid: uid.clone(),
            entity_kind: "slack_bot_token".to_owned(),
            source_connector: ConnectorKind::Slack,
            display_name: format!("{app_name} ({bot_user_id})"),
            fingerprint_sha256: fingerprint_credential_id(&self.tenant_salt, &uid),
            created_at_unix: Some(created_at),
            last_used_unix: last_used,
            raw_permissions: scopes,
            metadata_tags: meta,
        }
    }
}

pub mod saas_oauth;
pub mod discovery;
pub use discovery::{DiscoveryError, SlackDiscoveryWorker};
#[cfg(feature = "aws")]
pub use discovery::AwsIamDiscoveryWorker;
#[cfg(feature = "k8s")]
pub use discovery::K8sDiscoveryWorker;
#[cfg(feature = "github")]
pub use discovery::GithubDiscoveryWorker;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fingerprint_credential_id_is_deterministic() {
        let salt = b"tenant-secure-salt-1234";
        let fp1 = fingerprint_credential_id(salt, "aws:iam::123456789012:role/admin");
        let fp2 = fingerprint_credential_id(salt, "aws:iam::123456789012:role/admin");
        let fp3 = fingerprint_credential_id(salt, "aws:iam::123456789012:role/readonly");

        assert_eq!(fp1, fp2);
        assert_ne!(fp1, fp3);
        assert!(fp1.starts_with("hmac-sha256:"));
    }

    #[test]
    fn test_shared_secret_material_fingerprinting() {
        let salt = b"tenant-secure-salt-1234";
        let raw_token_aws = b"ghp_sharedSecretTokenAcrossAwsAndK8s";
        let raw_token_k8s = b"ghp_sharedSecretTokenAcrossAwsAndK8s";
        let different_token = b"ghp_completelyDifferentSecretKey";

        let fp_aws = fingerprint_secret_material(salt, raw_token_aws);
        let fp_k8s = fingerprint_secret_material(salt, raw_token_k8s);
        let fp_diff = fingerprint_secret_material(salt, different_token);

        // NHI-9 shared secret detection matches without ever storing raw tokens
        assert_eq!(fp_aws, fp_k8s);
        assert_ne!(fp_aws, fp_diff);
        assert!(fp_aws.starts_with("hmac-sha256:secret:"));
    }

    #[test]
    fn test_normalizes_all_connectors() {
        let orch = DiscoveryOrchestrator::new(b"test-salt");

        // AWS
        let aws_node = orch.normalize_aws_role(
            "123456789012",
            "AgentExecutorRole",
            vec!["s3:GetObject".into()],
            HashMap::new(),
            1700000000,
            Some(1700000500),
        );
        assert_eq!(aws_node.source_connector, ConnectorKind::AwsIam);
        assert_eq!(aws_node.created_at_unix, Some(1700000000));

        // K8s with real non-hardcoded timestamps
        let k8s_node = orch.normalize_k8s_service_account(
            "prod-cluster-1",
            "agents",
            "langchain-sa",
            true,
            true,
            HashMap::new(),
            Some(1701000000),
            Some(1702000000),
        );
        assert_eq!(k8s_node.source_connector, ConnectorKind::Kubernetes);
        assert_eq!(k8s_node.created_at_unix, Some(1701000000));
        assert!(k8s_node.raw_permissions.contains(&"k8s:cluster-admin:*".to_string()));

        // GitHub
        let gh_node = orch.normalize_github_app(
            12345,
            "axiom-sync",
            67890,
            "acme-corp",
            vec!["repo:read".into()],
            1703000000,
            None,
        );
        assert_eq!(gh_node.source_connector, ConnectorKind::Github);
        assert_eq!(gh_node.display_name, "axiom-sync@acme-corp");

        // Slack
        let slack_node = orch.normalize_slack_bot(
            "T12345",
            "B67890",
            "AlertBot",
            vec!["chat:write".into()],
            "U99999",
            1704000000,
            Some(1704000100),
        );
        assert_eq!(slack_node.source_connector, ConnectorKind::Slack);
        assert_eq!(slack_node.metadata_tags.get("installed_by").unwrap(), "U99999");
    }

    #[test]
    fn test_token_bucket_limiter() {
        let policy = RateLimitPolicy {
            requests_per_second: 10,
            burst_capacity: 2,
            max_retries: 3,
        };
        let limiter = TokenBucketLimiter::new(&policy);

        assert!(limiter.try_acquire());
        assert!(limiter.try_acquire());
        // Burst capacity exhausted
        assert!(!limiter.try_acquire());
    }
}
