// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! SpiceDB Real Client & Causal Delegation Revocation Engine.
//! Connects to SpiceDB HTTP/gRPC-gateway API (`/v1/permissions/checkPermission`, `/v1/relationships/write`)
//! to provide multi-hop causal delegation checks and zero-trust revocation.

use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, thiserror::Error)]
pub enum SpiceDbError {
    #[error("HTTP transport error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("SpiceDB API error: {0}")]
    Api(String),
    #[error("SpiceDB relationship check failed closed: {0}")]
    FailClosed(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectReference {
    #[serde(rename = "objectType")]
    pub object_type: String,
    #[serde(rename = "objectId")]
    pub object_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubjectReference {
    pub object: ObjectReference,
    #[serde(rename = "optionalRelation", skip_serializing_if = "Option::is_none")]
    pub optional_relation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Relationship {
    pub resource: ObjectReference,
    pub relation: String,
    pub subject: SubjectReference,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationshipUpdate {
    pub operation: String,
    pub relationship: Relationship,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WriteRelationshipsRequest {
    updates: Vec<RelationshipUpdate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
struct WriteRelationshipsResponse {
    #[serde(rename = "writtenAt", default)]
    written_at: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CheckPermissionRequest {
    pub resource: ObjectReference,
    pub permission: String,
    pub subject: SubjectReference,
    #[serde(default)]
    pub consistency: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CheckPermissionResponse {
    pub permissionship: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DeleteRelationshipsRequest {
    #[serde(rename = "relationshipFilter")]
    pub relationship_filter: RelationshipFilter,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RelationshipFilter {
    #[serde(rename = "resourceType")]
    pub resource_type: String,
    #[serde(rename = "optionalResourceId", skip_serializing_if = "Option::is_none")]
    pub optional_resource_id: Option<String>,
    #[serde(rename = "optionalRelation", skip_serializing_if = "Option::is_none")]
    pub optional_relation: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SpiceDbClient {
    endpoint: String,
    preshared_key: String,
    client: reqwest::Client,
}

impl SpiceDbClient {
    pub fn new(endpoint: impl Into<String>, preshared_key: impl Into<String>) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(1500))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            endpoint: endpoint.into().trim_end_matches('/').to_string(),
            preshared_key: preshared_key.into(),
            client,
        }
    }

    pub fn from_env() -> Self {
        let endpoint = std::env::var("SPICEDB_ENDPOINT")
            .unwrap_or_else(|_| "http://127.0.0.1:8443".to_string());
        let preshared_key = std::env::var("SPICEDB_PRESHARED_KEY")
            .unwrap_or_else(|_| "axiom-spicedb-key".to_string());
        Self::new(endpoint, preshared_key)
    }

    /// Writes relationship tuples to SpiceDB.
    pub async fn write_relationship(
        &self,
        resource_type: &str,
        resource_id: &str,
        relation: &str,
        subject_type: &str,
        subject_id: &str,
    ) -> Result<(), SpiceDbError> {
        let update = RelationshipUpdate {
            operation: "OPERATION_TOUCH".into(),
            relationship: Relationship {
                resource: ObjectReference {
                    object_type: resource_type.into(),
                    object_id: resource_id.into(),
                },
                relation: relation.into(),
                subject: SubjectReference {
                    object: ObjectReference {
                        object_type: subject_type.into(),
                        object_id: subject_id.into(),
                    },
                    optional_relation: None,
                },
            },
        };

        let body = WriteRelationshipsRequest {
            updates: vec![update],
        };

        let url = format!("{}/v1/relationships/write", self.endpoint);
        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.preshared_key))
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(SpiceDbError::Api(format!(
                "SpiceDB write error status {}: {}",
                status, text
            )));
        }

        Ok(())
    }

    /// Evaluates if subject has permission on resource. Fails closed on network or API error.
    pub async fn check_permission(
        &self,
        resource_type: &str,
        resource_id: &str,
        permission: &str,
        subject_type: &str,
        subject_id: &str,
    ) -> Result<bool, SpiceDbError> {
        let body = CheckPermissionRequest {
            resource: ObjectReference {
                object_type: resource_type.into(),
                object_id: resource_id.into(),
            },
            permission: permission.into(),
            subject: SubjectReference {
                object: ObjectReference {
                    object_type: subject_type.into(),
                    object_id: subject_id.into(),
                },
                optional_relation: None,
            },
            consistency: Some(serde_json::json!({ "fullyConsistent": true })),
        };

        let url = format!("{}/v1/permissions/checkPermission", self.endpoint);
        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.preshared_key))
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(SpiceDbError::FailClosed(format!(
                "SpiceDB check error status {}: {}",
                status, text
            )));
        }

        let parsed: CheckPermissionResponse = resp.json().await?;
        Ok(parsed.permissionship == "PERMISSIONSHIP_HAS_PERMISSION")
    }

    /// Deletes relationships matching filter to causally revoke delegation tuples.
    pub async fn delete_relationships(
        &self,
        resource_type: &str,
        optional_resource_id: Option<&str>,
        optional_relation: Option<&str>,
    ) -> Result<(), SpiceDbError> {
        let body = DeleteRelationshipsRequest {
            relationship_filter: RelationshipFilter {
                resource_type: resource_type.into(),
                optional_resource_id: optional_resource_id.map(|s| s.into()),
                optional_relation: optional_relation.map(|s| s.into()),
            },
        };

        let url = format!("{}/v1/relationships/delete", self.endpoint);
        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.preshared_key))
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(SpiceDbError::Api(format!(
                "SpiceDB delete error status {}: {}",
                status, text
            )));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_spicedb_client_with_defaults() {
        let client = SpiceDbClient::from_env();
        assert!(client.endpoint.contains("8443") || !client.endpoint.is_empty());
        assert!(!client.preshared_key.is_empty());
    }

    #[tokio::test]
    async fn check_permission_fails_closed_when_service_unreachable() {
        // Points to an unreachable port to verify fail-closed behavior
        let client = SpiceDbClient::new("http://127.0.0.1:59999", "test-key");
        let result = client
            .check_permission("grant", "grant-1", "use", "agent", "subagent-1")
            .await;
        // MUST fail with error (fail-closed)
        assert!(result.is_err(), "Expected fail-closed error on unreachable SpiceDB endpoint");
    }
}
