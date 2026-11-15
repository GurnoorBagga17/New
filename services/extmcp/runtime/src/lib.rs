//! Tonic adapter for the upstream ExtMCP protocol.
//!
//! This crate translates the generated wire messages into the typed Team 2
//! authorization pipeline. The backend service name is resolved only through
//! an administrator supplied map; gateway metadata cannot choose a resource
//! URI. This library supplies a listener entrypoint but does not define a
//! production configuration loader or deploy the other components.

pub mod wire {
    tonic::include_proto!("agentgateway.dev.ext_mcp");
}

use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use extmcp_authorization::{
    ArgumentValidator, CheckPipeline, Decision, IdentityVerifier, RevocationChecker, RuntimeMode,
    RuntimeRequest,
};
use prost_types::{value::Kind, Struct, Value};
use tonic::{transport::Server, Request, Response, Status};
use wire::{
    ext_mcp_server::{ExtMcp, ExtMcpServer},
    mcp_request_result::Result as RequestResult,
    mcp_response_result::Result as ResponseResult,
    AuthorizationError, HeaderMutation, McpRequest, McpRequestResult, McpResponse,
    McpResponseResult,
};

static REQUEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);

pub struct ExtMcpAdapter<I, V, R> {
    pipeline: Arc<CheckPipeline<I, V, R>>,
    resources: HashMap<String, String>,
    mode: RuntimeMode,
    enforce_revocation_in_observe: bool,
}

impl<I, V, R> ExtMcpAdapter<I, V, R>
where
    I: IdentityVerifier + 'static,
    V: ArgumentValidator + 'static,
    R: RevocationChecker + 'static,
{
    /// Construct with the trusted mapping from upstream backend names to
    /// canonical OAuth resource URIs (for example `prod-db` -> `mcp://prod-db`).
    pub fn new(
        pipeline: Arc<CheckPipeline<I, V, R>>,
        resources: HashMap<String, String>,
        mode: RuntimeMode,
        enforce_revocation_in_observe: bool,
    ) -> Result<Self, &'static str> {
        if resources.is_empty()
            || resources.iter().any(|(name, uri)| {
                name.trim().is_empty()
                    || !(uri.starts_with("https://") || uri.starts_with("mcp://"))
            })
        {
            return Err(
                "trusted resource map must contain backend names and absolute HTTPS/MCP URIs",
            );
        }
        Ok(Self {
            pipeline,
            resources,
            mode,
            enforce_revocation_in_observe,
        })
    }

    /// Bind the adapter to a TCP address and serve the generated ExtMCP API.
    pub async fn serve(self, address: SocketAddr) -> Result<(), tonic::transport::Error> {
        Server::builder()
            .add_service(ExtMcpServer::new(self))
            .serve(address)
            .await
    }

    #[allow(clippy::result_large_err)] // Required by the generated Tonic service trait.
    async fn check(&self, request: McpRequest) -> Result<McpRequestResult, Status> {
        if let Some(metadata) = request.metadata_context.as_ref() {
            if let Some(runtime_mode) = metadata.fields.get("runtime_mode") {
                let supplied = match &runtime_mode.kind {
                    Some(Kind::StringValue(value)) => value.as_str(),
                    _ => return Ok(denied("runtime mode metadata is invalid")),
                };
                let supplied = normalize_runtime_mode(supplied);
                let configured = match &self.mode {
                    RuntimeMode::Enforce => "enforce",
                    RuntimeMode::Observe => "observe",
                };
                let matches = supplied.eq_ignore_ascii_case(configured)
                    || (self.mode == RuntimeMode::Observe
                        && supplied.eq_ignore_ascii_case("observe_only"));
                if !matches {
                    return Ok(denied("gateway and ExtMCP runtime modes do not match"));
                }
            }
        }

        let service_name = match request.service_names.as_slice() {
            [name] => name,
            _ => {
                return Ok(denied(
                    "single-target authorization requires exactly one service name",
                ))
            }
        };
        let Some(resource_uri) = self.resources.get(service_name) else {
            return Ok(denied("target service is not configured"));
        };
        if request.method.trim().is_empty() {
            return Ok(denied("MCP method is missing"));
        }

        let params = match request.mcp_request.as_deref() {
            Some(bytes) => match serde_json::from_slice::<serde_json::Value>(bytes) {
                Ok(value) if value.is_object() => value,
                _ => return Ok(denied("MCP request parameters are invalid")),
            },
            None => serde_json::json!({}),
        };
        let tool_name = if request.method == "tools/call" {
            match params.get("name").and_then(serde_json::Value::as_str) {
                Some(name) if !name.is_empty() => name.to_owned(),
                _ => return Ok(denied("tool name is missing")),
            }
        } else {
            String::new()
        };

        let auth_values: Vec<_> = request
            .headers
            .iter()
            .filter(|header| header.key.eq_ignore_ascii_case("authorization"))
            .collect();
        if auth_values.len() > 1 {
            return Ok(denied("multiple Authorization headers are not allowed"));
        }
        let auth = auth_values
            .first()
            .map(|header| String::from_utf8_lossy(&header.value).into_owned());
        let request_id = request
            .headers
            .iter()
            .find(|header| header.key.eq_ignore_ascii_case("x-request-id"))
            .and_then(|header| std::str::from_utf8(&header.value).ok())
            .filter(|id| !id.is_empty() && id.len() <= 128)
            .map(str::to_owned)
            .unwrap_or_else(|| {
                format!(
                    "extmcp-{}",
                    REQUEST_SEQUENCE.fetch_add(1, Ordering::Relaxed)
                )
            });
        let session_id = request
            .headers
            .iter()
            .find(|header| header.key.eq_ignore_ascii_case("mcp-session-id"))
            .map(|header| String::from_utf8_lossy(&header.value).into_owned())
            .unwrap_or_default();
        let trace_id = request
            .metadata_context
            .as_ref()
            .and_then(|metadata| metadata.fields.get("trace_id"))
            .and_then(|value| match &value.kind {
                Some(Kind::StringValue(value)) => Some(value.clone()),
                _ => None,
            })
            .unwrap_or_default();

        let runtime_request = RuntimeRequest {
            request_id,
            trace_id,
            mcp_session_id: session_id,
            mcp_method: request.method,
            target_server: resource_uri.clone(),
            tool_name,
            raw_arguments: params,
            runtime_mode: self.mode.clone(),
            raw_auth_header: auth,
        };
        let result = self.pipeline.execute(&runtime_request).await;
        if result.policy_response.decision == Decision::Permit {
            return Ok(pass());
        }

        // D3 is explicitly configured at construction: revocation remains a
        // hard block in observe mode only when the operator selects it.
        let revocation = result.policy_response.error_category.as_ref()
            == Some(&extmcp_authorization::ErrorCategory::Revoked);
        if self.mode == RuntimeMode::Observe && !(revocation && self.enforce_revocation_in_observe)
        {
            let mut metadata = Struct::default();
            metadata.fields.insert(
                "axiom_decision".into(),
                Value {
                    kind: Some(Kind::StringValue("would_deny".into())),
                },
            );
            metadata.fields.insert(
                "axiom_reason".into(),
                Value {
                    kind: Some(Kind::StringValue(
                        result.policy_response.reason.chars().take(256).collect(),
                    )),
                },
            );
            return Ok(McpRequestResult {
                result: Some(RequestResult::Pass(wire::Pass {})),
                header_mutation: Some(HeaderMutation::default()),
                metadata: Some(metadata),
            });
        }
        Ok(denied("authorization denied"))
    }
}

fn normalize_runtime_mode(value: &str) -> &str {
    let value = value.trim();
    if value.starts_with("\\\"") && value.ends_with("\\\"") && value.len() >= 4 {
        &value[2..value.len() - 2]
    } else {
        value.trim_matches('"')
    }
}

#[tonic::async_trait]
impl<I, V, R> ExtMcp for ExtMcpAdapter<I, V, R>
where
    I: IdentityVerifier + 'static,
    V: ArgumentValidator + 'static,
    R: RevocationChecker + 'static,
{
    async fn check_request(
        &self,
        request: Request<McpRequest>,
    ) -> Result<Response<McpRequestResult>, Status> {
        Ok(Response::new(self.check(request.into_inner()).await?))
    }

    async fn check_response(
        &self,
        _request: Request<McpResponse>,
    ) -> Result<Response<McpResponseResult>, Status> {
        Ok(Response::new(McpResponseResult {
            result: Some(ResponseResult::Pass(wire::Pass {})),
        }))
    }
}

fn pass() -> McpRequestResult {
    McpRequestResult {
        result: Some(RequestResult::Pass(wire::Pass {})),
        header_mutation: None,
        metadata: None,
    }
}

fn denied(reason: &str) -> McpRequestResult {
    McpRequestResult {
        result: Some(RequestResult::Error(AuthorizationError {
            code: wire::authorization_error::Code::PermissionDenied as i32,
            reason: reason.into(),
            mcp_error: None,
        })),
        header_mutation: None,
        metadata: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decisions_map_to_the_expected_wire_variants() {
        assert!(matches!(pass().result, Some(RequestResult::Pass(_))));
        match denied("denied").result {
            Some(RequestResult::Error(error)) => {
                assert_eq!(
                    error.code,
                    wire::authorization_error::Code::PermissionDenied as i32
                );
                assert_eq!(error.reason, "denied");
            }
            _ => panic!("denial must map to AuthorizationError"),
        }
    }
}
