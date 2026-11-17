// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
#![allow(clippy::too_many_arguments)]
//! Phase 4 Enterprise Cloud & SaaS Discovery Workers.
//!
//! Provides read-only passive discovery connectors for:
//! 1. Azure Entra ID (Service Principals, App Registrations, Managed Identities)
//! 2. GCP IAM (Service Accounts, User-Managed Keys, Workload Identity Pools)
//! 3. Okta (API Services, OAuth2 Clients, Static Admin Tokens)
//! 4. Snowflake (Service Users, Key-Pair Auth, Warehouse Roles)
//! 5. Databricks (Service Principals, Personal Access Tokens)
//! 6. GitLab (Project/Group Access Tokens, Deploy Keys, CI/CD Runners)
//! 7. AI Gateways (OpenAI, Anthropic, AWS Bedrock API Keys & Agent IDs)
//! 8. Terraform State (.tfstate Metadata, Git Blame & Author Attribution)
//!
//! Strict Security Invariants:
//! - Strictly queries read-only audit/inspection APIs.
//! - Computes deterministic HMAC-SHA256 fingerprints of identifiers with `fingerprint_credential_id`.
//! - Never stores or logs raw secrets, private keys, or passwords.

use std::collections::HashMap;
use std::time::Duration;
use crate::{
    fingerprint_credential_id, ConnectorKind, DiscoveredNode, DiscoveredRelation,
    RateLimitPolicy, TokenBucketLimiter,
};

// ---------------------------------------------------------------------------
// 1. Azure Entra ID Discovery Worker
// ---------------------------------------------------------------------------

#[derive(Clone)]
#[allow(dead_code)]
pub struct AzureEntraDiscoveryWorker {
    client: reqwest::Client,
    limiter: std::sync::Arc<TokenBucketLimiter>,
}

impl Default for AzureEntraDiscoveryWorker {
    fn default() -> Self {
        Self::new()
    }
}

impl AzureEntraDiscoveryWorker {
    pub fn new() -> Self {
        let policy = RateLimitPolicy {
            requests_per_second: 30,
            burst_capacity: 60,
            max_retries: 5,
        };
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            client,
            limiter: std::sync::Arc::new(TokenBucketLimiter::new(&policy)),
        }
    }

    pub fn normalize_service_principal(
        &self,
        tenant_salt: &[u8],
        tenant_id: &str,
        app_id: &str,
        display_name: &str,
        sp_type: &str,
        roles: Vec<String>,
        created_at: i64,
        last_sign_in: Option<i64>,
    ) -> DiscoveredNode {
        let uid = format!("azure:entra:{tenant_id}:sp/{app_id}");
        let mut meta = HashMap::new();
        meta.insert("tenant_id".to_owned(), tenant_id.to_owned());
        meta.insert("service_principal_type".to_owned(), sp_type.to_owned());

        // OWASP NHI Check: Directory.ReadWrite.All or Application.ReadWrite.All
        let is_high_priv = roles.iter().any(|r| r.contains("Directory.ReadWrite.All") || r.contains("RoleManagement.ReadWrite"));
        if is_high_priv {
            meta.insert("risk_tag".to_owned(), "NHI4:PrivilegeOverprovisioning".to_owned());
        }

        DiscoveredNode {
            entity_uid: uid.clone(),
            entity_kind: "azure_service_principal".to_owned(),
            source_connector: ConnectorKind::AzureEntra,
            display_name: display_name.to_owned(),
            fingerprint_sha256: fingerprint_credential_id(tenant_salt, &uid),
            created_at_unix: Some(created_at),
            last_used_unix: last_sign_in,
            raw_permissions: roles,
            metadata_tags: meta,
        }
    }
}

// ---------------------------------------------------------------------------
// 2. GCP IAM Discovery Worker
// ---------------------------------------------------------------------------

#[derive(Clone)]
#[allow(dead_code)]
pub struct GcpIamDiscoveryWorker {
    client: reqwest::Client,
    limiter: std::sync::Arc<TokenBucketLimiter>,
}

impl Default for GcpIamDiscoveryWorker {
    fn default() -> Self {
        Self::new()
    }
}

impl GcpIamDiscoveryWorker {
    pub fn new() -> Self {
        let policy = RateLimitPolicy {
            requests_per_second: 50,
            burst_capacity: 100,
            max_retries: 5,
        };
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            client,
            limiter: std::sync::Arc::new(TokenBucketLimiter::new(&policy)),
        }
    }

    pub fn normalize_service_account(
        &self,
        tenant_salt: &[u8],
        project_id: &str,
        sa_email: &str,
        unique_id: &str,
        iam_roles: Vec<String>,
        has_user_managed_key: bool,
        created_at: i64,
        last_used: Option<i64>,
    ) -> DiscoveredNode {
        let uid = format!("gcp:iam:{project_id}:sa/{sa_email}");
        let mut meta = HashMap::new();
        meta.insert("project_id".to_owned(), project_id.to_owned());
        meta.insert("unique_id".to_owned(), unique_id.to_owned());
        meta.insert("has_user_managed_key".to_owned(), has_user_managed_key.to_string());

        if has_user_managed_key {
            meta.insert("risk_tag".to_owned(), "NHI2:LongLivedUserManagedKey".to_owned());
        }
        if iam_roles.iter().any(|r| r == "roles/owner" || r == "roles/editor") {
            meta.insert("risk_tag_priv".to_owned(), "NHI4:GcpExcessiveRole".to_owned());
        }

        DiscoveredNode {
            entity_uid: uid.clone(),
            entity_kind: "gcp_service_account".to_owned(),
            source_connector: ConnectorKind::GcpIam,
            display_name: sa_email.to_owned(),
            fingerprint_sha256: fingerprint_credential_id(tenant_salt, &uid),
            created_at_unix: Some(created_at),
            last_used_unix: last_used,
            raw_permissions: iam_roles,
            metadata_tags: meta,
        }
    }
}

// ---------------------------------------------------------------------------
// 3. Okta Discovery Worker
// ---------------------------------------------------------------------------

#[derive(Clone)]
#[allow(dead_code)]
pub struct OktaDiscoveryWorker {
    client: reqwest::Client,
}

impl Default for OktaDiscoveryWorker {
    fn default() -> Self {
        Self::new()
    }
}

impl OktaDiscoveryWorker {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        }
    }

    pub fn normalize_api_token(
        &self,
        tenant_salt: &[u8],
        org_url: &str,
        token_id: &str,
        token_name: &str,
        user_id: &str,
        created_at: i64,
        expires_at: Option<i64>,
    ) -> DiscoveredNode {
        let uid = format!("okta:{org_url}:api_token/{token_id}");
        let mut meta = HashMap::new();
        meta.insert("org_url".to_owned(), org_url.to_owned());
        meta.insert("created_by_user_id".to_owned(), user_id.to_owned());

        DiscoveredNode {
            entity_uid: uid.clone(),
            entity_kind: "okta_api_token".to_owned(),
            source_connector: ConnectorKind::Okta,
            display_name: format!("{token_name} ({token_id})"),
            fingerprint_sha256: fingerprint_credential_id(tenant_salt, &uid),
            created_at_unix: Some(created_at),
            last_used_unix: expires_at,
            raw_permissions: vec!["okta:api:read_write".into()],
            metadata_tags: meta,
        }
    }
}

// ---------------------------------------------------------------------------
// 4. Snowflake Discovery Worker
// ---------------------------------------------------------------------------

#[derive(Clone)]
#[allow(dead_code)]
pub struct SnowflakeDiscoveryWorker {
    client: reqwest::Client,
}

impl Default for SnowflakeDiscoveryWorker {
    fn default() -> Self {
        Self::new()
    }
}

impl SnowflakeDiscoveryWorker {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        }
    }

    pub fn normalize_service_user(
        &self,
        tenant_salt: &[u8],
        account: &str,
        username: &str,
        has_rsa_public_key: bool,
        roles: Vec<String>,
        created_at: i64,
        last_success_login: Option<i64>,
    ) -> DiscoveredNode {
        let uid = format!("snowflake:{account}:user/{username}");
        let mut meta = HashMap::new();
        meta.insert("account".to_owned(), account.to_owned());
        meta.insert("has_rsa_public_key".to_owned(), has_rsa_public_key.to_string());

        if !has_rsa_public_key {
            meta.insert("risk_tag".to_owned(), "NHI3:PasswordWithoutKeyPairAuth".to_owned());
        }
        if roles.iter().any(|r| r == "ACCOUNTADMIN" || r == "SECURITYADMIN") {
            meta.insert("risk_tag_priv".to_owned(), "NHI4:SnowflakeAccountAdmin".to_owned());
        }

        DiscoveredNode {
            entity_uid: uid.clone(),
            entity_kind: "snowflake_service_user".to_owned(),
            source_connector: ConnectorKind::Snowflake,
            display_name: format!("{username}@{account}"),
            fingerprint_sha256: fingerprint_credential_id(tenant_salt, &uid),
            created_at_unix: Some(created_at),
            last_used_unix: last_success_login,
            raw_permissions: roles,
            metadata_tags: meta,
        }
    }
}

// ---------------------------------------------------------------------------
// 5. Databricks Discovery Worker
// ---------------------------------------------------------------------------

#[derive(Clone)]
#[allow(dead_code)]
pub struct DatabricksDiscoveryWorker {
    client: reqwest::Client,
}

impl Default for DatabricksDiscoveryWorker {
    fn default() -> Self {
        Self::new()
    }
}

impl DatabricksDiscoveryWorker {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        }
    }

    pub fn normalize_personal_access_token(
        &self,
        tenant_salt: &[u8],
        workspace_url: &str,
        token_id: &str,
        comment: &str,
        created_by_username: &str,
        lifetime_seconds: i64,
        created_at: i64,
    ) -> DiscoveredNode {
        let uid = format!("databricks:{workspace_url}:pat/{token_id}");
        let mut meta = HashMap::new();
        meta.insert("workspace_url".to_owned(), workspace_url.to_owned());
        meta.insert("created_by".to_owned(), created_by_username.to_owned());
        meta.insert("lifetime_seconds".to_owned(), lifetime_seconds.to_string());

        if lifetime_seconds <= 0 {
            meta.insert("risk_tag".to_owned(), "NHI3:IndefiniteTokenLifetime".to_owned());
        }

        DiscoveredNode {
            entity_uid: uid.clone(),
            entity_kind: "databricks_pat".to_owned(),
            source_connector: ConnectorKind::Databricks,
            display_name: format!("PAT: {comment} ({created_by_username})"),
            fingerprint_sha256: fingerprint_credential_id(tenant_salt, &uid),
            created_at_unix: Some(created_at),
            last_used_unix: None,
            raw_permissions: vec!["databricks:workspace:all".into()],
            metadata_tags: meta,
        }
    }
}

// ---------------------------------------------------------------------------
// 6. GitLab Discovery Worker
// ---------------------------------------------------------------------------

#[derive(Clone)]
#[allow(dead_code)]
pub struct GitlabDiscoveryWorker {
    client: reqwest::Client,
}

impl Default for GitlabDiscoveryWorker {
    fn default() -> Self {
        Self::new()
    }
}

impl GitlabDiscoveryWorker {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        }
    }

    pub fn normalize_project_access_token(
        &self,
        tenant_salt: &[u8],
        project_path: &str,
        token_id: u64,
        token_name: &str,
        scopes: Vec<String>,
        access_level: u32, // 40 = Maintainer, 50 = Owner
        created_at: i64,
        last_used_at: Option<i64>,
    ) -> DiscoveredNode {
        let uid = format!("gitlab:{project_path}:token/{token_id}");
        let mut meta = HashMap::new();
        meta.insert("project_path".to_owned(), project_path.to_owned());
        meta.insert("access_level".to_owned(), access_level.to_string());

        if access_level >= 40 {
            meta.insert("risk_tag".to_owned(), "NHI4:GitLabMaintainerTokenScope".to_owned());
        }

        DiscoveredNode {
            entity_uid: uid.clone(),
            entity_kind: "gitlab_project_token".to_owned(),
            source_connector: ConnectorKind::Gitlab,
            display_name: format!("{token_name}@{project_path}"),
            fingerprint_sha256: fingerprint_credential_id(tenant_salt, &uid),
            created_at_unix: Some(created_at),
            last_used_unix: last_used_at,
            raw_permissions: scopes,
            metadata_tags: meta,
        }
    }
}

// ---------------------------------------------------------------------------
// 7. AI Gateways (LLM API Keys & Agent IDs) Discovery Worker
// ---------------------------------------------------------------------------

#[derive(Clone)]
#[allow(dead_code)]
pub struct AiGatewaysDiscoveryWorker {
    client: reqwest::Client,
}

impl Default for AiGatewaysDiscoveryWorker {
    fn default() -> Self {
        Self::new()
    }
}

impl AiGatewaysDiscoveryWorker {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        }
    }

    pub fn normalize_llm_api_key(
        &self,
        tenant_salt: &[u8],
        provider: &str, // "openai", "anthropic", "bedrock"
        key_id: &str,
        key_name: &str,
        created_by: &str,
        created_at: i64,
        last_used_at: Option<i64>,
    ) -> DiscoveredNode {
        let uid = format!("ai_gateway:{provider}:key/{key_id}");
        let mut meta = HashMap::new();
        meta.insert("provider".to_owned(), provider.to_owned());
        meta.insert("created_by".to_owned(), created_by.to_owned());
        meta.insert("risk_tag".to_owned(), "MCP09:ShadowAiKeyExposure".to_owned());

        DiscoveredNode {
            entity_uid: uid.clone(),
            entity_kind: "ai_model_api_key".to_owned(),
            source_connector: ConnectorKind::AiGateways,
            display_name: format!("{provider}:{key_name}"),
            fingerprint_sha256: fingerprint_credential_id(tenant_salt, &uid),
            created_at_unix: Some(created_at),
            last_used_unix: last_used_at,
            raw_permissions: vec![format!("{provider}:models:invoke")],
            metadata_tags: meta,
        }
    }
}

// ---------------------------------------------------------------------------
// 8. Terraform State Parser & Attribution Engine
// ---------------------------------------------------------------------------

#[derive(Clone, Default)]
pub struct TerraformStateDiscoveryWorker;

impl TerraformStateDiscoveryWorker {
    pub fn new() -> Self {
        Self
    }

    /// Parses a Terraform state JSON representation and correlates provisioned NHI
    /// resources back to Git repository, file path, and author commit.
    pub fn parse_tfstate_and_attribute(
        &self,
        tenant_salt: &[u8],
        tfstate_json: &serde_json::Value,
        git_repo: &str,
        git_file: &str,
        author_email: &str,
    ) -> Vec<(DiscoveredNode, DiscoveredRelation)> {
        let mut results = Vec::new();

        if let Some(resources) = tfstate_json.get("resources").and_then(|r| r.as_array()) {
            for res in resources {
                let res_type = res.get("type").and_then(|t| t.as_str()).unwrap_or("");
                let res_name = res.get("name").and_then(|n| n.as_str()).unwrap_or("");

                // Match IAM roles, service accounts, and API keys
                if res_type.contains("iam_role") || res_type.contains("service_account") || res_type.contains("api_key") {
                    let uid = format!("terraform:{git_repo}:{res_type}/{res_name}");
                    let mut meta = HashMap::new();
                    meta.insert("git_repo".to_owned(), git_repo.to_owned());
                    meta.insert("git_file".to_owned(), git_file.to_owned());
                    meta.insert("author_email".to_owned(), author_email.to_owned());
                    meta.insert("iac_managed".to_owned(), "true".to_owned());

                    let node = DiscoveredNode {
                        entity_uid: uid.clone(),
                        entity_kind: format!("iac_{res_type}"),
                        source_connector: ConnectorKind::TerraformState,
                        display_name: format!("{res_name} ({res_type})"),
                        fingerprint_sha256: fingerprint_credential_id(tenant_salt, &uid),
                        created_at_unix: Some(chrono::Utc::now().timestamp()),
                        last_used_unix: None,
                        raw_permissions: vec!["iac:managed".into()],
                        metadata_tags: meta,
                    };

                    let relation = DiscoveredRelation {
                        source_uid: format!("user:{author_email}"),
                        target_uid: uid,
                        relation_type: "OWNS".to_owned(),
                        observed_via: format!("git_blame:{git_file}"),
                        call_count_24h: 1,
                    };

                    results.push((node, relation));
                }
            }
        }

        results
    }
}
