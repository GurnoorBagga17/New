//! Configured ExtMCP service entrypoint.
//!
//! Startup requires administrator-supplied issuer, resource, tool-validation,
//! and revocation configuration. The service deliberately has no synthetic
//! identity, permissive validator, or default-empty revocation fallback.

use std::{
    collections::{HashMap, HashSet},
    fs,
    net::SocketAddr,
    path::Path,
    sync::Arc,
    time::Duration,
};

use axiom_identity::{IdentityVerifier as _, OidcIdentityVerifier, TrustedIssuer};
use axiom_validators::{
    adapter::{EgressArgumentSpec, PathArgumentSpec, ToolValidationProfile},
    sql::DialectKind,
    AxiomArgumentValidator,
};
use extmcp_authorization::{
    identity_adapter::Team3IdentityAdapter, CheckPipeline, RevocationChecker, RevocationOutcome,
    RuntimeMode,
};
use extmcp_cedar::{
    load_snapshot,
    schema::{AXIOM_SCHEMA_SRC, DEFAULT_POLICY_BUNDLE},
    PolicySnapshotStore,
};
use extmcp_runtime::ExtMcpAdapter;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct IdentityConfig {
    issuers: Vec<IssuerConfig>,
    canonical_resources: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct IssuerConfig {
    issuer: String,
    jwks_url: String,
}

#[derive(Debug, Deserialize)]
struct ValidationConfig {
    profiles: Vec<ProfileConfig>,
}

#[derive(Debug, Deserialize)]
struct ProfileConfig {
    target_server: String,
    tool_name: String,
    tool_definition: serde_json::Value,
    expected_tool_sha256: String,
    #[serde(default)]
    sql_argument: Option<String>,
    #[serde(default)]
    sql_dialect: String,
    #[serde(default)]
    allowed_sql_functions: Vec<String>,
    #[serde(default)]
    path_arguments: Vec<PathArgumentConfig>,
    #[serde(default)]
    egress_arguments: Vec<EgressArgumentConfig>,
}

#[derive(Debug, Deserialize)]
struct PathArgumentConfig {
    argument_name: String,
    root: String,
}

#[derive(Debug, Deserialize)]
struct EgressArgumentConfig {
    argument_name: String,
    allowed_hosts: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RevocationConfig {
    /// Explicit marker prevents an omitted or accidentally empty file from
    /// being interpreted as a known-good, empty revocation snapshot.
    state: String,
    version: u64,
    freshness_ttl_seconds: u64,
    #[serde(default)]
    global: bool,
    #[serde(default)]
    servers: Vec<String>,
    #[serde(default)]
    tools: Vec<String>,
    #[serde(default)]
    agents: Vec<String>,
}

struct ConfiguredRevocationChecker {
    global: bool,
    servers: HashSet<String>,
    tools: HashSet<String>,
    agents: HashSet<String>,
    expires_at_unix_ms: u128,
}

impl ConfiguredRevocationChecker {
    fn new(config: RevocationConfig) -> Result<Self, String> {
        if config.state != "available"
            || config.version == 0
            || !(1..=300).contains(&config.freshness_ttl_seconds)
        {
            return Err(
                "revocation snapshot must be available, versioned, and have a freshness TTL from 1 to 300 seconds".into(),
            );
        }
        let now_unix_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "system clock is before the Unix epoch".to_owned())?
            .as_millis();
        Ok(Self {
            global: config.global,
            servers: config.servers.into_iter().collect(),
            tools: config.tools.into_iter().collect(),
            agents: config.agents.into_iter().collect(),
            expires_at_unix_ms: now_unix_ms
                .saturating_add(u128::from(config.freshness_ttl_seconds) * 1000),
        })
    }

    fn check_target(&self, server: &str, tool_name: &str) -> RevocationOutcome {
        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis());
        if !matches!(current_time, Ok(now_unix_ms) if now_unix_ms < self.expires_at_unix_ms) {
            return RevocationOutcome::Revoked {
                reason: "revocation snapshot is stale".into(),
            };
        }
        if self.global {
            return RevocationOutcome::Revoked {
                reason: "global revocation active".into(),
            };
        }
        if self.servers.contains(server) {
            return RevocationOutcome::Revoked {
                reason: "MCP server revocation active".into(),
            };
        }
        if !tool_name.is_empty() && self.tools.contains(&format!("{server}/{tool_name}")) {
            return RevocationOutcome::Revoked {
                reason: "tool revocation active".into(),
            };
        }
        RevocationOutcome::Active
    }
}

impl RevocationChecker for ConfiguredRevocationChecker {
    fn check_pre_identity(&self, server: &str, tool_name: &str) -> RevocationOutcome {
        self.check_target(server, tool_name)
    }

    fn check_post_identity(
        &self,
        agent_id: &str,
        server: &str,
        tool_name: &str,
    ) -> RevocationOutcome {
        match self.check_target(server, tool_name) {
            RevocationOutcome::Active if self.agents.contains(agent_id) => {
                RevocationOutcome::Revoked {
                    reason: "agent revocation active".into(),
                }
            }
            outcome => outcome,
        }
    }
}

fn read_json<T: for<'de> Deserialize<'de>>(
    path: &str,
    label: &str,
) -> Result<T, Box<dyn std::error::Error>> {
    let contents = fs::read_to_string(Path::new(path))
        .map_err(|error| format!("cannot read {label} configuration at {path}: {error}"))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("invalid {label} configuration at {path}: {error}").into())
}

fn required_path(name: &str) -> Result<String, Box<dyn std::error::Error>> {
    std::env::var(name).map_err(|_| {
        format!("{name} must point to an administrator-owned JSON configuration file").into()
    })
}

fn parse_mode() -> Result<RuntimeMode, Box<dyn std::error::Error>> {
    match std::env::var("AXIOM_RUNTIME_MODE").as_deref() {
        Ok("enforce") => Ok(RuntimeMode::Enforce),
        Ok("observe") => Ok(RuntimeMode::Observe),
        Ok(_) => Err("AXIOM_RUNTIME_MODE must be 'enforce' or 'observe'".into()),
        Err(_) => Ok(RuntimeMode::Enforce),
    }
}

fn parse_dialect(value: &str) -> Result<DialectKind, Box<dyn std::error::Error>> {
    match value {
        "" | "generic" => Ok(DialectKind::Generic),
        "postgresql" => Ok(DialectKind::PostgreSql),
        "mysql" => Ok(DialectKind::MySql),
        "mssql" => Ok(DialectKind::MsSql),
        _ => Err(format!("unsupported SQL dialect '{value}'").into()),
    }
}

fn build_validator(
    path: &str,
    allowed_resources: &HashSet<String>,
) -> Result<AxiomArgumentValidator, Box<dyn std::error::Error>> {
    let config: ValidationConfig = read_json(path, "tool-validation")?;
    if config.profiles.is_empty() {
        return Err(
            "tool-validation configuration must contain at least one trusted profile".into(),
        );
    }
    if config
        .profiles
        .iter()
        .any(|profile| !allowed_resources.contains(&profile.target_server))
    {
        return Err(
            "tool-validation profile references a resource outside identity canonical_resources"
                .into(),
        );
    }
    let profiles = config
        .profiles
        .into_iter()
        .map(|profile| {
            Ok(ToolValidationProfile {
                target_server: profile.target_server,
                tool_name: profile.tool_name,
                tool_definition: profile.tool_definition,
                expected_tool_sha256: profile.expected_tool_sha256,
                sql_argument: profile.sql_argument,
                sql_dialect: parse_dialect(&profile.sql_dialect)?,
                allowed_sql_functions: profile.allowed_sql_functions,
                path_arguments: profile
                    .path_arguments
                    .into_iter()
                    .map(|path| PathArgumentSpec {
                        argument_name: path.argument_name,
                        root: path.root.into(),
                    })
                    .collect(),
                egress_arguments: profile
                    .egress_arguments
                    .into_iter()
                    .map(|egress| EgressArgumentSpec {
                        argument_name: egress.argument_name,
                        allowed_hosts: egress.allowed_hosts,
                    })
                    .collect(),
            })
        })
        .collect::<Result<Vec<_>, Box<dyn std::error::Error>>>()?;
    Ok(AxiomArgumentValidator::new(profiles)?)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let bind_addr: SocketAddr = std::env::var("AXIOM_EXTMCP_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:9001".to_owned())
        .parse()?;
    let identity_config: IdentityConfig =
        read_json(&required_path("AXIOM_IDENTITY_CONFIG")?, "identity")?;
    if identity_config.issuers.is_empty() || identity_config.canonical_resources.is_empty() {
        return Err(
            "identity configuration requires at least one trusted issuer and canonical resource"
                .into(),
        );
    }
    let canonical_resources: HashSet<String> = identity_config
        .canonical_resources
        .iter()
        .cloned()
        .collect();
    let resource_map_path = required_path("AXIOM_RESOURCE_MAP_CONFIG")?;
    let resources: HashMap<String, String> = read_json(&resource_map_path, "resource-map")?;
    if resources.is_empty() {
        return Err("resource-map configuration must contain at least one backend".into());
    }
    let configured_resources: HashSet<&str> = resources.values().map(String::as_str).collect();
    if configured_resources
        .iter()
        .any(|resource| !canonical_resources.contains(*resource))
    {
        return Err("resource-map contains a URI missing from identity canonical_resources".into());
    }
    let issuer_urls: Vec<String> = identity_config
        .issuers
        .iter()
        .map(|issuer| issuer.issuer.clone())
        .collect();
    let trusted_issuers = identity_config
        .issuers
        .into_iter()
        .map(|issuer| TrustedIssuer::new(issuer.issuer, &issuer.jwks_url))
        .collect::<Result<Vec<_>, _>>()?;
    let identity_verifier = Arc::new(OidcIdentityVerifier::new(
        trusted_issuers,
        identity_config.canonical_resources,
        Duration::from_secs(300),
    )?);
    for issuer in &issuer_urls {
        for resource in &canonical_resources {
            let mut warmed = false;
            for attempt in 1..=5 {
                if identity_verifier
                    .warm_cache(issuer, resource)
                    .await
                    .is_ok()
                {
                    warmed = true;
                    break;
                }
                if attempt < 5 {
                    tokio::time::sleep(Duration::from_millis(500 * attempt)).await;
                }
            }
            if !warmed {
                return Err(format!(
                    "could not warm trusted JWKS cache for issuer {issuer} after 5 attempts"
                )
                .into());
            }
        }
    }
    let identity_adapter = Arc::new(Team3IdentityAdapter::new(identity_verifier));

    let validator = Arc::new(build_validator(
        &required_path("AXIOM_VALIDATION_CONFIG")?,
        &canonical_resources,
    )?);
    let revocation_config: RevocationConfig =
        read_json(&required_path("AXIOM_REVOCATION_CONFIG")?, "revocation")?;
    let revocation_checker = Arc::new(ConfiguredRevocationChecker::new(revocation_config)?);

    // The identity verifier enforces the exact allow-list; startup rejects
    // resource-map and validator-profile drift before accepting traffic.
    let snapshot = load_snapshot(DEFAULT_POLICY_BUNDLE, AXIOM_SCHEMA_SRC)?;
    let policy_engine = Arc::new(PolicySnapshotStore::new(snapshot));
    let pipeline = Arc::new(CheckPipeline::new(
        identity_adapter,
        validator,
        revocation_checker,
        policy_engine,
    ));
    let adapter = ExtMcpAdapter::new(pipeline, resources, parse_mode()?, true)?;

    println!("Axiom NHI ExtMCP gRPC runtime listening on {}", bind_addr);
    adapter.serve(bind_addr).await?;
    Ok(())
}
