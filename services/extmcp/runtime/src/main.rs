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

mod admin;

use axiom_audit::{AuditBus, AuditBusConfig, AuditSink, AuditWriterConfig, SystemClock};
use axiom_kill_switch::{
    persistence::save_snapshot as save_revocation_snapshot, KillSwitchService,
    RevocationDecision, RevocationSnapshot, RevocationStore, RevocationTarget,
};
use axiom_kill_switch::sync::RevocationChecker as KillSwitchRevocationChecker;
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
    schema::{AXIOM_SCHEMA_SRC, DEFAULT_POLICY_BUNDLE},
    CedarPolicyEngine, PolicySnapshotStore,
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

struct SharedRevocationChecker(Arc<RevocationStore>);

impl RevocationChecker for SharedRevocationChecker {
    fn check_pre_identity(&self, server: &str, tool_name: &str) -> RevocationOutcome {
        map_revocation_decision(self.0.check_pre_identity(server, Some(tool_name)))
    }

    fn check_post_identity(&self, agent_id: &str, server: &str, tool_name: &str) -> RevocationOutcome {
        map_revocation_decision(self.0.check_post_identity(agent_id, server, Some(tool_name)))
    }
}

fn map_revocation_decision(decision: RevocationDecision) -> RevocationOutcome {
    match decision {
        RevocationDecision::Active { .. } => RevocationOutcome::Active,
        RevocationDecision::Revoked { primary, .. } => RevocationOutcome::Revoked { reason: primary.reason },
        RevocationDecision::Stale { primary: Some(primary), .. } => RevocationOutcome::Revoked { reason: primary.reason },
        RevocationDecision::Stale { .. } => RevocationOutcome::Revoked { reason: "revocation state is stale".into() },
        RevocationDecision::Unavailable { reason } => RevocationOutcome::Revoked { reason },
    }
}

fn seed_revocation_snapshot(config: &RevocationConfig) -> Result<RevocationSnapshot, Box<dyn std::error::Error>> {
    if config.state != "available" || config.version == 0 || !(1..=300).contains(&config.freshness_ttl_seconds) {
        return Err("revocation config must be available, versioned, and have freshness TTL from 1 to 300 seconds".into());
    }
    let clock = SystemClock;
    let now = axiom_audit::Clock::now_unix_ms(&clock);
    let mut snapshot = RevocationSnapshot::empty(format!("axiom-runtime-{}", std::process::id()), now);
    snapshot.version = config.version;
    let mut add = |target: RevocationTarget| {
        snapshot.entries.insert(target.canonical_key(), target.to_state(true, config.version, now, "Configured startup revocation"));
    };
    if config.global { add(RevocationTarget::global()); }
    for server in &config.servers { add(RevocationTarget::server(server.clone())?); }
    for agent in &config.agents { add(RevocationTarget::agent(agent.clone())?); }
    for tool in &config.tools {
        let (server, name) = tool.split_once('/').ok_or("revocation tool IDs must use server/tool form")?;
        add(RevocationTarget::tool(server, name)?);
    }
    Ok(snapshot)
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
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .try_init();

    let env_mode = std::env::var("AXIOM_ENV").unwrap_or_else(|_| "development".to_owned());
    let allow_anonymous = std::env::var("AXIOM_ALLOW_ANONYMOUS_LOCAL").unwrap_or_default() == "1";
    let dev_mode = std::env::var("AXIOM_DEV_MODE").unwrap_or_default() == "1";
    let runtime_mode = parse_mode()?;

    if env_mode == "production" {
        if allow_anonymous {
            return Err("FATAL SECURITY VIOLATION: AXIOM_ALLOW_ANONYMOUS_LOCAL=1 is strictly forbidden in AXIOM_ENV=production".into());
        }
        if dev_mode {
            return Err("FATAL SECURITY VIOLATION: AXIOM_DEV_MODE=1 is strictly forbidden in AXIOM_ENV=production".into());
        }
        if runtime_mode == RuntimeMode::Observe
            && std::env::var("AXIOM_ALLOW_OBSERVE_IN_PRODUCTION").as_deref() != Ok("1")
        {
            return Err("FATAL SECURITY VIOLATION: AXIOM_RUNTIME_MODE=observe is forbidden in production without explicit AXIOM_ALLOW_OBSERVE_IN_PRODUCTION=1 acknowledgment.".into());
        }
    }

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
                if std::env::var("AXIOM_ALLOW_ANONYMOUS_LOCAL").as_deref() == Ok("1")
                    || std::env::var("AXIOM_DEV_MODE").as_deref() == Ok("1")
                {
                    eprintln!("Dev mode: could not warm trusted JWKS cache for issuer {issuer}, skipping offline cache warm");
                } else {
                    return Err(format!(
                        "could not warm trusted JWKS cache for issuer {issuer} after 5 attempts"
                    )
                    .into());
                }
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
    let data_dir = std::env::var("AXIOM_DATA_DIR").unwrap_or_else(|_| "./data/axiom".into());
    fs::create_dir_all(&data_dir)?;
    let data_dir = Path::new(&data_dir);
    let revocation_path = data_dir.join("revocations.snapshot.json");
    let seed_snapshot = seed_revocation_snapshot(&revocation_config)?;
    let revocation_store = admin::load_revocation_store(&revocation_path, seed_snapshot.clone())?;
    if !revocation_path.exists() { save_revocation_snapshot(&revocation_path, &seed_snapshot)?; }
    let audit_bus = AuditBus::new(AuditBusConfig::default())?;
    let audit_path = data_dir.join("audit.jsonl");
    let _audit_writer = axiom_audit::spawn_file_writer(audit_bus.subscribe(), AuditWriterConfig::new(&audit_path))?;
    let audit_sink: Arc<dyn AuditSink> = Arc::new(audit_bus.emitter());
    let revocation_service = Arc::new(KillSwitchService::new(revocation_store.clone())
        .with_audit(audit_sink)
        .with_persistence(&revocation_path));

    let policy_path = data_dir.join("policy-bundle.json");
    let (snapshot, _policy_bundle) = admin::load_policy_bundle(&policy_path, DEFAULT_POLICY_BUNDLE, AXIOM_SCHEMA_SRC)?;
    if !policy_path.exists() {
        fs::write(&policy_path, serde_json::to_vec_pretty(&_policy_bundle)?)?;
    }

    let (event_sender, _) = tokio::sync::broadcast::channel(512);

    // M-06: Connect AuditBus events to the SSE event sender so that audit records stream to subscribers
    let audit_sub = audit_bus.subscribe();
    let audit_event_sender = event_sender.clone();
    tokio::task::spawn_blocking(move || {
        loop {
            match audit_sub.next_timeout(std::time::Duration::from_millis(500)) {
                axiom_audit::ReceiverOutcome::Record(record) => {
                    if let Ok(val) = serde_json::to_value(&record) {
                        let _ = audit_event_sender.send(val);
                    }
                }
                axiom_audit::ReceiverOutcome::Timeout => {}
                axiom_audit::ReceiverOutcome::Disconnected => break,
            }
        }
    });

    // Phase 2: Ingestion Linkage — drop chunked audit spool files for axiom-agent-supervisor
    let spool_dir = data_dir.join("spool");
    let _ = fs::create_dir_all(&spool_dir);
    let audit_sub_spool = audit_bus.subscribe();
    let spool_dir_clone = spool_dir.clone();
    tokio::task::spawn_blocking(move || {
        let mut buffer = Vec::new();
        let mut last_flush = std::time::Instant::now();
        loop {
            match audit_sub_spool.next_timeout(std::time::Duration::from_millis(1000)) {
                axiom_audit::ReceiverOutcome::Record(record) => {
                    if let Ok(line) = serde_json::to_string(&record) {
                        buffer.push(line);
                    }
                }
                axiom_audit::ReceiverOutcome::Timeout | axiom_audit::ReceiverOutcome::Disconnected => {}
            }
            if (!buffer.is_empty() && last_flush.elapsed() >= std::time::Duration::from_secs(5)) || buffer.len() >= 50 {
                let now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis();
                let filename = format!("spool_{}_{}.jsonl", now_ms, std::process::id());
                let tmp_path = spool_dir_clone.join(format!("{}.tmp", filename));
                let final_path = spool_dir_clone.join(filename);
                if let Ok(mut f) = fs::File::create(&tmp_path) {
                    use std::io::Write;
                    for line in &buffer {
                        let _ = writeln!(f, "{}", line);
                    }
                    let _ = f.flush();
                    let _ = fs::rename(tmp_path, final_path);
                }
                buffer.clear();
                last_flush = std::time::Instant::now();
            }
        }
    });

    // The identity verifier enforces the exact allow-list; startup rejects
    // resource-map and validator-profile drift before accepting traffic.
    let policy_store = Arc::new(PolicySnapshotStore::new(snapshot));
    let policy_engine = Arc::new(CedarPolicyEngine::new(policy_store.clone()));

    // Phase 2: Live Hot-Reload Watcher for supervisor-provided policy.cedar and bundle updates
    let policy_watcher_store = policy_store.clone();
    let cedar_file_path = data_dir.join("policy.cedar");
    let bundle_file_path = data_dir.join("policy-bundle.json");
    tokio::spawn(async move {
        let mut last_cedar_mtime = None;
        let mut last_bundle_mtime = None;
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            if let Ok(meta) = tokio::fs::metadata(&cedar_file_path).await {
                if let Ok(mtime) = meta.modified() {
                    if last_cedar_mtime.map_or(false, |prev| mtime > prev) {
                        if let Ok(content) = tokio::fs::read_to_string(&cedar_file_path).await {
                            if let Ok(new_snapshot) = extmcp_cedar::load_snapshot(&[&content], AXIOM_SCHEMA_SRC) {
                                let v = policy_watcher_store.swap(new_snapshot);
                                println!("Live hot-reload: updated Cedar policy v{} from {}", v, cedar_file_path.display());
                            }
                        }
                    }
                    last_cedar_mtime = Some(mtime);
                }
            }
            if let Ok(meta) = tokio::fs::metadata(&bundle_file_path).await {
                if let Ok(mtime) = meta.modified() {
                    if last_bundle_mtime.map_or(false, |prev| mtime > prev) {
                        if let Ok((new_snapshot, _)) = admin::load_policy_bundle(&bundle_file_path, DEFAULT_POLICY_BUNDLE, AXIOM_SCHEMA_SRC) {
                            let v = policy_watcher_store.swap(new_snapshot);
                            println!("Live hot-reload: updated Cedar policy bundle v{} from {}", v, bundle_file_path.display());
                        }
                    }
                    last_bundle_mtime = Some(mtime);
                }
            }
        }
    });
    let pipeline = Arc::new(CheckPipeline::new(
        identity_adapter,
        validator,
        Arc::new(SharedRevocationChecker(revocation_store)),
        policy_engine,
    ));
    let adapter = ExtMcpAdapter::new(pipeline, resources, runtime_mode, true)?
        .with_audit_events(event_sender.clone());

    println!("Axiom NHI ExtMCP gRPC runtime listening on {}", bind_addr);
    let is_dev_mode = std::env::var("AXIOM_DEV_MODE").as_deref() == Ok("1");
    let token = match std::env::var("AXIOM_ADMIN_TOKEN") {
        Ok(t) => t,
        Err(_) if is_dev_mode => {
            println!("AXIOM_DEV_MODE=1 active: using local development admin token");
            "axm_local_dev_token_for_browser_testing".to_string()
        }
        Err(_) => {
            return Err("AXIOM_ADMIN_TOKEN must be set to a high-entropy local admin secret (>=32 bytes)".into());
        }
    };
    if !is_dev_mode && token.len() < 32 {
        return Err("AXIOM_ADMIN_TOKEN must contain at least 32 bytes in production mode".into());
    }
    let actor = std::env::var("AXIOM_ADMIN_ACTOR").unwrap_or_else(|_| "local-operator".into());
    if actor.trim().is_empty() { return Err("AXIOM_ADMIN_ACTOR cannot be empty".into()); }
    let admin_addr: SocketAddr = std::env::var("AXIOM_ADMIN_ADDR").unwrap_or_else(|_| "127.0.0.1:8787".into()).parse()?;
    let lineage_engine = Arc::new(std::sync::Mutex::new(admin::create_seeded_lineage_engine()));

    // Automatic Embedded PostgreSQL 16 Lineage Migration Boot Hook & Connection Retain
    let mut postgres_lineage_opt = None;
    if let Ok(database_url) = std::env::var("DATABASE_URL") {
        if !database_url.trim().is_empty() {
            println!("Connecting to PostgreSQL 16 Lineage Database and executing migrations...");
            match axiom_lineage_graph::PostgresLineageGraph::connect(&database_url).await {
                Ok(postgres_graph) => {
                    if let Err(migration_err) = postgres_graph.run_migrations().await {
                        eprintln!("Error: Failed to run PostgreSQL lineage migrations: {migration_err}");
                        if !is_dev_mode {
                            return Err(format!("Fatal: Production mode failed to execute lineage migrations: {migration_err}").into());
                        }
                    } else {
                        println!("PostgreSQL 16 lineage schema migrations applied successfully (nhi_nodes, nhi_edges, simulate_revocation, tenant_rls, rls_fail_closed).");
                    }
                    postgres_lineage_opt = Some(Arc::new(postgres_graph));
                }
                Err(conn_err) => {
                    eprintln!("Warning: Could not connect to DATABASE_URL: {conn_err}. Falling back to in-memory lineage engine.");
                    if !is_dev_mode {
                        return Err(format!("Fatal: Production mode requires a reachable PostgreSQL database: {conn_err}").into());
                    }
                }
            }
        }
    }

    if !is_dev_mode && postgres_lineage_opt.is_none() {
        return Err("Fatal: Production mode requires DATABASE_URL to be set and connected (fail-closed)".into());
    }

    // OpenBao Client Initialization
    let openbao_client_opt = if let Ok(openbao_addr) = std::env::var("OPENBAO_ADDR") {
        if !openbao_addr.trim().is_empty() {
            let openbao_token = std::env::var("OPENBAO_TOKEN").ok();
            let config = axiom_secretless::OpenBaoConfig {
                base_url: openbao_addr,
                token: openbao_token,
                timeout: std::time::Duration::from_secs(5),
            };
            Some(Arc::new(axiom_secretless::OpenBaoClient::new(config)))
        } else {
            None
        }
    } else {
        None
    };

    let active_leases = Arc::new(std::sync::Mutex::new(vec![
        axiom_secretless::SecretlessLeaseMetadata {
            lease_id: "lease-attested-90a1bc".into(),
            vault_uri: "vault://openbao/database/creds/analyst".into(),
            workload_uid: "spiffe://axiom.internal/ns/prod/sa/reporting-worker-4".into(),
            target_resource: "db://prod-aurora-cluster".into(),
            ttl_seconds: 300,
            renewable: false,
            status: "ACTIVE".into(),
            zero_secret_redacted: true,
        },
        axiom_secretless::SecretlessLeaseMetadata {
            lease_id: "lease-attested-33df12".into(),
            vault_uri: "vault://openbao/github/app/token".into(),
            workload_uid: "spiffe://axiom.internal/ns/prod/sa/pr-summarizer".into(),
            target_resource: "mcp://github.internal".into(),
            ttl_seconds: 180,
            renewable: false,
            status: "ACTIVE".into(),
            zero_secret_redacted: true,
        },
    ]));

    let admin_state = admin::AdminApiState {
        policies: policy_store,
        policy_file: Arc::new(policy_path),
        policy_write_lock: Arc::new(std::sync::Mutex::new(())),
        revocations: revocation_service,
        token: Arc::new(token),
        actor: Arc::new(actor),
        events: event_sender,
        lineage: lineage_engine,
        postgres_lineage: postgres_lineage_opt,
        openbao_client: openbao_client_opt,
        active_leases,
        ticket_store: admin::SseTicketStore::default(),
    };
    let grpc = async { adapter.serve(bind_addr).await.map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) }) };
    let http = async { admin::serve(admin_state, admin_addr).await.map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) }) };
    tokio::try_join!(grpc, http)?;
    Ok(())
}
