// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Phase 2 Live Cloud & SaaS Discovery Workers (AWS IAM, Kubernetes, GitHub, Slack).
//!
//! Enforces the Zero-Secret Invariant:
//! - Strictly queries read-only discovery endpoints.
//! - Computes HMAC-SHA256 credential fingerprints; never persists or logs raw API keys.

use crate::{DiscoveredNode, DiscoveryOrchestrator};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use serde::Deserialize;
use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DiscoveryError {
    #[error("HTTP transport error: {0}")]
    Transport(#[from] reqwest::Error),
    #[error("Cloud API error: {0}")]
    Api(String),
    #[error("Deserialization error: {0}")]
    MalformedPayload(String),
}

/// Live Slack Web API discovery client for bot tokens and installed apps.
#[derive(Clone)]
pub struct SlackDiscoveryWorker {
    client: reqwest::Client,
}

impl Default for SlackDiscoveryWorker {
    fn default() -> Self {
        Self::new()
    }
}

impl SlackDiscoveryWorker {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self { client }
    }

    /// Discovers Slack bot identity and permissions via `auth.test`.
    pub async fn discover_bot_identity(
        &self,
        orchestrator: &DiscoveryOrchestrator,
        bot_token: &str,
    ) -> Result<DiscoveredNode, DiscoveryError> {
        let mut headers = HeaderMap::new();
        let auth_val = format!("Bearer {bot_token}");
        if let Ok(mut hv) = HeaderValue::from_str(&auth_val) {
            hv.set_sensitive(true);
            headers.insert(AUTHORIZATION, hv);
        }

        let resp = self
            .client
            .post("https://slack.com/api/auth.test")
            .headers(headers)
            .send()
            .await?;

        #[derive(Deserialize)]
        struct AuthTestResponse {
            ok: bool,
            team_id: Option<String>,
            user_id: Option<String>,
            user: Option<String>,
            bot_id: Option<String>,
            error: Option<String>,
        }

        let body: AuthTestResponse = resp.json().await.map_err(|e| {
            DiscoveryError::MalformedPayload(format!(
                "Failed to parse Slack auth.test response: {e}"
            ))
        })?;

        if !body.ok {
            return Err(DiscoveryError::Api(
                body.error.unwrap_or_else(|| "auth.test failed".into()),
            ));
        }

        let team_id = body.team_id.unwrap_or_else(|| "T_UNKNOWN".into());
        let bot_user_id = body
            .user_id
            .or(body.bot_id)
            .unwrap_or_else(|| "B_UNKNOWN".into());
        let app_name = body.user.unwrap_or_else(|| "SlackBot".into());

        // Standard read-only permissions for bot identity
        let scopes = vec!["auth.test".to_string(), "bots:read".to_string()];

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        Ok(orchestrator.normalize_slack_bot(
            &team_id,
            &bot_user_id,
            &app_name,
            scopes,
            "installer@slack",
            now,
            Some(now),
        ))
    }
}

// ---------------------------------------------------------------------------
// AWS IAM Discovery Worker (Active when `--features aws` is enabled)
// ---------------------------------------------------------------------------
#[cfg(feature = "aws")]
pub struct AwsIamDiscoveryWorker;

#[cfg(feature = "aws")]
impl AwsIamDiscoveryWorker {
    pub async fn discover_roles(
        orchestrator: &DiscoveryOrchestrator,
        client: &aws_sdk_iam::Client,
        account_id: &str,
    ) -> Result<Vec<DiscoveredNode>, DiscoveryError> {
        let resp = client
            .list_roles()
            .send()
            .await
            .map_err(|e| DiscoveryError::Api(format!("AWS IAM list_roles failed: {e}")))?;

        let mut discovered = Vec::new();
        for role in resp.roles() {
            let role_name = role.role_name();
            let mut tags = HashMap::new();
            if let Some(role_tags) = role.tags() {
                for t in role_tags {
                    tags.insert(t.key().to_string(), t.value().to_string());
                }
            }
            let created = role.create_date().secs();
            let actions = vec!["sts:AssumeRole".to_string()];

            discovered.push(
                orchestrator
                    .normalize_aws_role(account_id, role_name, actions, tags, created, None),
            );
        }

        Ok(discovered)
    }
}

// ---------------------------------------------------------------------------
// Kubernetes Service Account Discovery Worker (Active when `--features k8s` is enabled)
// ---------------------------------------------------------------------------
#[cfg(feature = "k8s")]
pub struct K8sDiscoveryWorker;

#[cfg(feature = "k8s")]
impl K8sDiscoveryWorker {
    pub async fn discover_service_accounts(
        orchestrator: &DiscoveryOrchestrator,
        client: &kube::Client,
        cluster_name: &str,
        namespace: Option<&str>,
    ) -> Result<Vec<DiscoveredNode>, DiscoveryError> {
        use k8s_openapi::api::core::v1::ServiceAccount;
        use kube::api::{Api, ListParams};

        let sa_api: Api<ServiceAccount> = match namespace {
            Some(ns) => Api::namespaced(client.clone(), ns),
            None => Api::all(client.clone()),
        };

        let sa_list = sa_api
            .list(&ListParams::default())
            .await
            .map_err(|e| DiscoveryError::Api(format!("K8s list service_accounts failed: {e}")))?;

        let mut discovered = Vec::new();
        for sa in sa_list {
            let name = sa.metadata.name.unwrap_or_else(|| "default".into());
            let ns = sa.metadata.namespace.unwrap_or_else(|| "default".into());
            let automount = sa.automount_service_account_token.unwrap_or(true);
            let mut annotations = HashMap::new();
            if let Some(ann) = sa.metadata.annotations {
                for (k, v) in ann {
                    annotations.insert(k, v);
                }
            }

            discovered.push(orchestrator.normalize_k8s_service_account(
                cluster_name,
                &ns,
                &name,
                false, // default to non-cluster-admin until rolebindings checked
                automount,
                annotations,
                None,
                None,
            ));
        }

        Ok(discovered)
    }
}

// ---------------------------------------------------------------------------
// GitHub App Installation Discovery Worker (Active when `--features github` is enabled)
// ---------------------------------------------------------------------------
#[cfg(feature = "github")]
pub struct GithubDiscoveryWorker;

#[cfg(feature = "github")]
impl GithubDiscoveryWorker {
    pub async fn discover_installations(
        orchestrator: &DiscoveryOrchestrator,
        octocrab: &octocrab::Octocrab,
        app_id: u64,
        app_slug: &str,
    ) -> Result<Vec<DiscoveredNode>, DiscoveryError> {
        let installations =
            octocrab.apps().installations().send().await.map_err(|e| {
                DiscoveryError::Api(format!("GitHub list installations failed: {e}"))
            })?;

        let mut discovered = Vec::new();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        for inst in installations {
            let account_login = inst.account.login;
            let permissions = vec!["repo:read".to_string(), "metadata:read".to_string()];

            discovered.push(orchestrator.normalize_github_app(
                app_id,
                app_slug,
                inst.id.0,
                &account_login,
                permissions,
                now,
                None,
            ));
        }

        Ok(discovered)
    }
}
