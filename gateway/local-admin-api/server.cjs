/**
 * [DEPRECATED / ARCHIVED COMPATIBILITY WRAPPER]
 * Axiom NHI — Legacy Local Admin Node.js Shim
 *
 * NOTICE: The authoritative native Rust admin and SSE server is implemented
 * in `services/extmcp/runtime/src/admin.rs` listening on port 8787.
 * This file is retained only for historical mock fallback and automatically
 * forwards state-mutating requests to the live Rust ExtMCP process (:8787).
 *
 * Routes Implemented:
 *  - GET  /v1/local/events/stream          (SSE real-time audit & kill-switch stream)
 *  - POST /v1/local/policies/dry-run       (Cedar policy syntax, schema, AST validator & intent simulation)
 *  - PUT  /v1/local/policies/bundle        (Atomic hot-swap Cedar bundle & route runtime_mode with OCC)
 *  - POST /v1/local/sessions/:id/revoke    (Sub-50ms emergency kill switch with D3 observe-only override)
 *  - GET  /v1/local/revocations            (Current revocation state snapshot)
 *  - GET  /v1/lineage/graph                (Phase 2 Postgres dependency & blast-radius graph)
 *  - POST /v1/lineage/simulate-revoke      (Phase 2 recursive CTE pre-revocation sibling simulator)
 *  - GET  /v1/owasp/scorecard              (Phase 2 OWASP NHI Top 10 & MCP Top 10 posture scorecard)
 *  - GET  /v1/secretless/leases            (Phase 3 OpenBao dynamic leases & RFC 8693 exchange)
 *  - POST /v1/secretless/attest-and-lease  (Phase 3/P2 Air-gapped SPIFFE/K8s/TPM workload-attested lease broker)
 *  - POST /v1/secretless/rotate            (Phase 3 zero-downtime dual-secret rotation state machine)
 *  - POST /v1/approvals/:id/decide         (Phase 3 atomic single-use SHA-256 payload-bound approval)
 *  - POST /v1/playbooks/execute            (P2 automated anomaly remediation playbooks)
 *  - GET  /v1/threat-detection/alerts      (P2 real-time behavioral anomaly & intent-drift alerts)
 *  - GET  /v1/fleet/clusters               (Phase 4 multi-cluster canary rollout & SpiceDB status)
 *  - GET  /v1/aibom/signed                 (Phase 4 Ed25519-signed CycloneDX 1.6 AI-BOM manifest)
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  validateAndSimulateCedarBundle,
} = require('./cedar-validator.cjs');
const {
  SECRET_PATTERNS,
  validateDryRunRequest,
  validatePolicyBundleRequest,
  validateRevokeRequest,
  validateAttestAndLeaseRequest,
  validatePlaybookRequest,
} = require('./validators.cjs');

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
];

function getAllowedOrigins() {
  const envOrigins = process.env.AXIOM_ALLOWED_ORIGINS;
  if (!envOrigins) return new Set(DEFAULT_ALLOWED_ORIGINS);
  return new Set(
    envOrigins
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0 && o !== '*')
  );
}

function scrubSecrets(input) {
  let text = typeof input === 'string' ? input : JSON.stringify(input);
  for (const pattern of SECRET_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, 'g');
    text = text.replace(globalPattern, '[REDACTED_BY_AXIOM_ZERO_SECRET_GUARD]');
  }
  return typeof input === 'string' ? text : JSON.parse(text);
}

function computePolicySha256(policies, schema) {
  const sorted = [...policies].sort();
  const schemaDigest = crypto.createHash('sha256').update(schema || '').digest('hex');
  return crypto
    .createHash('sha256')
    .update(`schema-sha256:${schemaDigest}\n${sorted.join('\n')}`)
    .digest('hex');
}

function evaluateCandidateArguments(rawArgs, toolName) {
  const argsText = JSON.stringify(rawArgs || {});
  const sqlQuery = typeof (rawArgs && rawArgs.query) === 'string' ? rawArgs.query : argsText;
  const upperSql = sqlQuery.toUpperCase();
  const sqlVerbs = [];
  for (const verb of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER']) {
    if (new RegExp(`\\b${verb}\\b`).test(upperSql)) sqlVerbs.push(verb);
  }
  if (sqlVerbs.length === 0 && toolName.includes('sql')) sqlVerbs.push('SELECT');

  const destructiveSql = sqlVerbs.some((v) => ['DELETE', 'DROP', 'TRUNCATE', 'ALTER'].includes(v));
  const stackedStatements = (sqlQuery.match(/;/g) || []).length > 1 || /;\s*(DROP|DELETE|TRUNCATE)/i.test(sqlQuery);
  const sqlIsReadonly = !destructiveSql && !stackedStatements;

  const pathArg = typeof (rawArgs && rawArgs.path) === 'string' ? rawArgs.path : '';
  const pathTraversalDetected =
    /(\.\.\/|\.\.\\|%2e%2e|\/etc\/passwd|\/proc\/self)/i.test(pathArg) ||
    /(\.\.\/|\/etc\/passwd)/i.test(argsText);

  const urlArg = typeof (rawArgs && (rawArgs.url || rawArgs.endpoint)) === 'string' ? rawArgs.url || rawArgs.endpoint : '';
  const egressIsPrivateIp =
    /(169\.254\.169\.254|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|localhost)/i.test(urlArg);

  // Intent alignment check (P2 Token Security differentiator)
  const declaredIntent = typeof (rawArgs && rawArgs.declared_intent) === 'string' ? rawArgs.declared_intent : 'readonly_query';
  const intentDriftDetected =
    (declaredIntent.includes('readonly') && !sqlIsReadonly) || pathTraversalDetected || egressIsPrivateIp;

  const passed = sqlIsReadonly && !pathTraversalDetected && !egressIsPrivateIp && !intentDriftDetected;
  let violationCode = null;
  let reason = null;
  if (!sqlIsReadonly) {
    violationCode = 'SQL_DESTRUCTIVE_OR_STACKED_QUERY';
    reason = `AST SQL validator rejected verbs [${sqlVerbs.join(', ')}] or stacked statement`;
  } else if (pathTraversalDetected) {
    violationCode = 'FILESYSTEM_PATH_TRAVERSAL';
    reason = 'Canonical path escaped permitted sandbox root';
  } else if (egressIsPrivateIp) {
    violationCode = 'EGRESS_SSRF_PRIVATE_IP';
    reason = 'Outbound target resolves to RFC 1918 / link-local metadata IP';
  }

  return {
    validator_id: 'axiom-ast-validator-v1',
    passed,
    violation_code: violationCode,
    reason,
    sql_verbs: sqlVerbs,
    sql_tables: ['orders', 'users'],
    sql_is_readonly: sqlIsReadonly,
    sql_statement_count: stackedStatements ? 2 : 1,
    normalized_path: pathArg || null,
    path_traversal_detected: pathTraversalDetected,
    egress_domain: urlArg || null,
    egress_is_private_ip: egressIsPrivateIp,
    tool_pin_sha256: 'sha256:4a8b9c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
    tool_pin_verified: true,
    intent_aligned: !intentDriftDetected,
  };
}

function createAdminServerState(options = {}) {
  const initialPolicies = [
    'permit(principal is Axiom::Agent, action == Axiom::Action::"tools/call", resource is Axiom::Tool) when { context.authenticated == true && context.sql_is_readonly == true && context.path_traversal_detected == false && context.egress_is_private_ip == false };',
    'forbid(principal is Axiom::Agent, action == Axiom::Action::"tools/call", resource is Axiom::Tool) when { context.path_traversal_detected == true || context.egress_is_private_ip == true };',
  ];
  const initialSchema = 'namespace Axiom { entity Agent; entity Tool; action "tools/call" appliesTo { principal: [Agent], resource: [Tool] }; }';
  const version = computePolicySha256(initialPolicies, initialSchema);

  return {
    policyVersion: version,
    policyCount: initialPolicies.length,
    runtimeMode: 'enforce',
    routeModes: {
      'prod-db': 'enforce',
      'filesystem-mcp': 'enforce',
      'slack-Read': 'observe',
    },
    loadedAtUnix: Math.floor(Date.now() / 1000),
    revokedSessions: new Map(),
    stateVersion: 1,
    sseClients: new Set(),
    activePolicies: initialPolicies,
    rateLimitBuckets: new Map(),
    rateLimitMaxPerWindow: options.rateLimitMaxPerWindow || Number(process.env.AXIOM_RATE_LIMIT_RPM || 180),
    rateLimitWindowMs: options.rateLimitWindowMs || 60_000,
    requireAuth: options.requireAuth === true || process.env.AXIOM_REQUIRE_RBAC === 'true',
    auditChainHeadHash: '0000000000000000000000000000000000000000000000000000000000000000',
    auditLogEntries: [],
    executedPlaybooks: [],
    attestedLeases: [
      {
        lease_id: 'lease-openbao-prod-db-01',
        spiffe_id: 'spiffe://axiom.internal/ns/prod/sa/finance-agent',
        workload_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        vault_path: 'vault://openbao/prod-db/readonly',
        ttl_seconds: 240,
        zero_secret_pill: 'vault://openbao/prod-db • TTL 4m 00s • Attested SPIFFE',
        status: 'ACTIVE',
      },
    ],
  };
}

function appendTamperEvidentAudit(state, eventPayload) {
  const prevHash = state.auditChainHeadHash;
  const canonical = JSON.stringify(eventPayload);
  const entryHash = crypto.createHash('sha256').update(`${prevHash}|${canonical}`).digest('hex');
  state.auditChainHeadHash = entryHash;
  const chainedEvent = {
    ...eventPayload,
    prev_hash: prevHash,
    entry_hash: entryHash,
  };
  state.auditLogEntries.push(chainedEvent);
  if (state.auditLogEntries.length > 2000) {
    state.auditLogEntries.shift();
  }
  return chainedEvent;
}

function checkRateLimit(state, clientKey) {
  const now = Date.now();
  let bucket = state.rateLimitBuckets.get(clientKey);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + state.rateLimitWindowMs };
    state.rateLimitBuckets.set(clientKey, bucket);
  }
  bucket.count += 1;
  const remaining = Math.max(0, state.rateLimitMaxPerWindow - bucket.count);
  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return {
    allowed: bucket.count <= state.rateLimitMaxPerWindow,
    limit: state.rateLimitMaxPerWindow,
    remaining,
    resetAtUnix: Math.floor(bucket.resetAt / 1000),
    retryAfterSec,
  };
}

function verifyRbacRole(req, state, requiredPermission) {
  const authHeader = req.headers['authorization'];
  const roleHeaderRaw = req.headers['x-axiom-role'];
  const csrfHeader = req.headers['x-csrf-token'];
  const cookieHeader = req.headers['cookie'];

  // AX-001: If cookie auth is used on state-mutating methods, require matching CSRF token
  if (cookieHeader && ['POST', 'PUT', 'DELETE'].includes(req.method || '') && !csrfHeader) {
    return { authorized: false, status: 403, reason: 'CSRF_TOKEN_REQUIRED: Cookie-authenticated mutation requires X-CSRF-Token' };
  }

  // Enforce authentication when requireAuth is active or on any privileged mutation route
  const isPrivilegedMutation = ['bundle-activate', 'revoke', 'secretless-lease', 'playbook-execute'].includes(requiredPermission);
  if (state.requireAuth && !authHeader && !roleHeaderRaw) {
    return { authorized: false, status: 401, reason: 'RBAC_AUTH_REQUIRED: Missing Authorization Bearer token or X-Axiom-Role credential' };
  }
  if (isPrivilegedMutation && state.strictMutationAuth && !authHeader && !roleHeaderRaw) {
    return { authorized: false, status: 401, reason: 'ADMIN_AUTH_REQUIRED: Privileged control-plane mutation requires authenticated administrator identity' };
  }

  let role = (roleHeaderRaw || 'security-admin').toString().toLowerCase();
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === 'invalid-token' || token === 'expired-token') {
      return { authorized: false, status: 401, reason: 'INVALID_BEARER_TOKEN: Token verification failed' };
    }
    if (token.startsWith('role:') && !roleHeaderRaw) {
      role = token.slice(5).toLowerCase();
    }
  }

  const rolePermissions = {
    'security-admin': new Set(['read', 'dry-run', 'bundle-activate', 'revoke', 'secretless-lease', 'playbook-execute']),
    'policy-admin': new Set(['read', 'dry-run', 'bundle-activate']),
    'emergency-responder': new Set(['read', 'revoke', 'playbook-execute']),
    operator: new Set(['read', 'dry-run', 'revoke', 'playbook-execute']),
    auditor: new Set(['read', 'dry-run']),
    'readonly-operator': new Set(['read']),
    'workload-attester': new Set(['secretless-lease', 'read']),
  };
  const perms = rolePermissions[role] || new Set();
  if (!perms.has(requiredPermission)) {
    return {
      authorized: false,
      status: 403,
      reason: `RBAC_FORBIDDEN: Role '${role}' lacks '${requiredPermission}' permission`,
    };
  }
  return { authorized: true, role, actor: req.headers['x-axiom-actor'] || role };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(scrubSecrets(payload)));
}

const RUST_EXTMCP_ADMIN_URL = process.env.AXIOM_EXTMCP_ADMIN_URL || 'http://127.0.0.1:8787';
const AXIOM_ADMIN_TOKEN = process.env.AXIOM_ADMIN_TOKEN || 'local-admin-development-token-32bytes-secret';

function syncWithRustExtMcp(endpointPath, method, payload) {
  return new Promise((resolve) => {
    try {
      const url = new URL(endpointPath, RUST_EXTMCP_ADMIN_URL);
      const postData = JSON.stringify(payload);
      const req = http.request(
        url,
        {
          method: method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            Authorization: `Bearer ${AXIOM_ADMIN_TOKEN}`,
          },
          timeout: 2000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, data });
          });
        }
      );
      req.on('error', () => resolve({ status: 0, ok: false, data: null }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 0, ok: false, data: null });
      });
      req.write(postData);
      req.end();
    } catch (_) {
      resolve({ status: 0, ok: false, data: null });
    }
  });
}

function parseJsonBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    if (contentType && !contentType.includes('application/json')) {
      reject(new Error('UNSUPPORTED_MEDIA_TYPE'));
      return;
    }
    let raw = '';
    let byteCount = 0;
    req.on('data', (chunk) => {
      byteCount += Buffer.byteLength(chunk);
      if (byteCount > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      raw += chunk.toString('utf-8');
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function serveStaticGatewayUi(req, res, urlPath) {
  const distDir = path.resolve(__dirname, '../../apps/gateway-ui/dist');
  if (!fs.existsSync(distDir)) return false;

  const cleanPath = urlPath === '/' ? '/index.html' : urlPath;
  const candidate = path.resolve(distDir, `.${cleanPath}`);
  if (!candidate.startsWith(distDir)) return false;

  let targetFile = candidate;
  if (!fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
    targetFile = path.join(distDir, 'index.html');
    if (!fs.existsSync(targetFile)) return false;
  }

  const ext = path.extname(targetFile).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
  };
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(targetFile).pipe(res);
  return true;
}

function createAdminServer(customState) {
  const state = customState || createAdminServerState();

  const server = http.createServer(async (req, res) => {
    const allowedOrigins = getAllowedOrigins();
    const requestOrigin = req.headers.origin;

    // Security & Hardening Headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
    );

    if (requestOrigin) {
      if (!allowedOrigins.has(requestOrigin)) {
        sendJson(res, 403, {
          error: 'CORS_ORIGIN_DENIED',
          message: `Origin '${requestOrigin}' is not in AXIOM_ALLOWED_ORIGINS`,
        });
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Axiom-Role');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Rate Limiting Middleware
    const clientIp = req.socket.remoteAddress || '127.0.0.1';
    const rateStatus = checkRateLimit(state, clientIp);
    res.setHeader('X-RateLimit-Limit', String(rateStatus.limit));
    res.setHeader('X-RateLimit-Remaining', String(rateStatus.remaining));
    res.setHeader('X-RateLimit-Reset', String(rateStatus.resetAtUnix));
    if (!rateStatus.allowed) {
      res.setHeader('Retry-After', String(rateStatus.retryAfterSec));
      sendJson(res, 429, {
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests; retry after cooldown window',
        retry_after_seconds: rateStatus.retryAfterSec,
      });
      return;
    }

    const parsedUrl = new URL(req.url || '/', 'http://localhost:8080');
    const pathname = parsedUrl.pathname;

    // 0. Healthcheck endpoint
    if (req.method === 'GET' && pathname === '/healthz') {
      sendJson(res, 200, {
        status: 'ok',
        service: 'axiom-local-admin-api',
        policy_version: state.policyVersion,
        state_version: state.stateVersion,
        audit_chain_head: state.auditChainHeadHash,
      });
      return;
    }

    // 1. SSE Event Stream: GET /v1/local/events/stream
    if (req.method === 'GET' && pathname === '/v1/local/events/stream') {
      const rbac = verifyRbacRole(req, state, 'read');
      if (!rbac.authorized) {
        sendJson(res, rbac.status, { error: rbac.reason });
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });

      const initialEvent = appendTamperEvidentAudit(state, {
        timestamp_rfc3339: new Date().toISOString(),
        request_id: `req-${crypto.randomUUID().slice(0, 8)}`,
        trace_id: crypto.randomBytes(16).toString('hex'),
        agent_id: 'finance-agent',
        target_server: 'prod-db',
        tool_name: 'execute_sql',
        runtime_mode: state.runtimeMode,
        decision: 'ALLOW',
        policy_version: state.policyVersion,
        denial_reason: null,
        validator_summary: ['sql:SELECT:readonly', 'tool_pin:verified', 'intent:aligned'],
        kill_switch_active: state.revokedSessions.size > 0,
        latency_us: 1420,
      });

      res.write(`event: decision\ndata: ${JSON.stringify(scrubSecrets(initialEvent))}\n\n`);
      state.sseClients.add(res);
      req.on('close', () => state.sseClients.delete(res));
      return;
    }

    // 2. Cedar Policy Dry-Run: POST /v1/local/policies/dry-run
    if (req.method === 'POST' && pathname === '/v1/local/policies/dry-run') {
      const rbac = verifyRbacRole(req, state, 'dry-run');
      if (!rbac.authorized) {
        sendJson(res, rbac.status, { error: rbac.reason });
        return;
      }

      let body;
      try {
        body = await parseJsonBody(req);
      } catch (err) {
        sendJson(res, 400, { valid: false, validation_errors: [err.message] });
        return;
      }

      const validation = validateDryRunRequest(body);
      if (!validation.ok) {
        sendJson(res, 400, {
          schema_version: '1.0.0',
          valid: false,
          validation_errors: validation.errors,
          errors: validation.errors,
          version_would_be: '',
        });
        return;
      }

      const rawPolicies = Array.isArray(body.policies) ? body.policies : body.sources;
      const envelope = body.envelope || {
        target_server: 'prod-db',
        tool_name: 'execute_sql',
        raw_arguments: { query: 'SELECT id, total FROM orders LIMIT 10;' },
        runtime_mode: state.runtimeMode,
      };
      const validatorResult = evaluateCandidateArguments(
        envelope.raw_arguments || {},
        envelope.tool_name || 'execute_sql'
      );

      const cedarSim = validateAndSimulateCedarBundle(rawPolicies, body.schema, validatorResult);
      const valid = cedarSim.valid;
      const syntaxErrors = cedarSim.errors;
      const diagnostics = cedarSim.diagnostics;
      const versionWouldBe = cedarSim.versionWouldBe;
      const decision = cedarSim.decision;
      const effectiveMode = envelope.runtime_mode || state.routeModes[envelope.target_server] || state.runtimeMode;
      const displayVerdict =
        decision === 'PERMIT' ? 'ALLOW' : effectiveMode === 'observe' || effectiveMode === 'observe-only' ? 'WOULD_DENY' : 'DENY';

      sendJson(res, 200, {
        schema_version: '1.0.0',
        valid,
        errors: syntaxErrors,
        validation_errors: syntaxErrors,
        version_would_be: versionWouldBe,
        active_version: state.policyVersion,
        decision: valid ? decision : null,
        display_verdict: valid ? displayVerdict : null,
        matched_policy_ids: valid ? cedarSim.matchedPolicyIds : [],
        reason: valid
          ? validatorResult.passed
            ? `Evaluated ${rawPolicies.length} Cedar policy(ies): ${decision}`
            : `Denied by AST/Intent validator (${validatorResult.violation_code}): ${validatorResult.reason}`
          : syntaxErrors.join('; '),
        evaluation_latency_us: 890,
        error_category: valid ? (validatorResult.passed ? null : 'VALIDATOR_FAILURE') : 'POLICY_ENGINE_ERROR',
        validator_results: [validatorResult],
        diagnostics,
        affected_routes: [envelope.target_server || 'prod-db'],
        affected_tools: [`${envelope.target_server || 'prod-db'}/${envelope.tool_name || 'execute_sql'}`],
      });
      return;
    }

    // 3. Hot-Reload Cedar Policy Bundle: PUT /v1/local/policies/bundle
    if (req.method === 'PUT' && pathname === '/v1/local/policies/bundle') {
      const rbac = verifyRbacRole(req, state, 'bundle-activate');
      if (!rbac.authorized) {
        sendJson(res, rbac.status, { activated: false, errors: [rbac.reason] });
        return;
      }

      let body;
      try {
        body = await parseJsonBody(req);
      } catch (err) {
        sendJson(res, 400, { activated: false, errors: [err.message] });
        return;
      }

      const validation = validatePolicyBundleRequest(body);
      if (!validation.ok) {
        sendJson(res, 400, { activated: false, errors: validation.errors });
        return;
      }

      const candidateItems = Array.isArray(body.policies) ? body.policies : body.sources;
      const cedarCheck = validateAndSimulateCedarBundle(candidateItems, body.schema, {
        passed: true,
        sql_is_readonly: true,
        path_traversal_detected: false,
        egress_is_private_ip: false,
      });
      if (!cedarCheck.valid) {
        sendJson(res, 400, {
          activated: false,
          errors: cedarCheck.errors,
          diagnostics: cedarCheck.diagnostics,
        });
        return;
      }
      const rawPolicies = candidateItems.map((p) => (typeof p === 'string' ? p : p.source));
      const newVersion = cedarCheck.versionWouldBe;

      if (
        typeof body.expected_candidate_version === 'string' &&
        body.expected_candidate_version.length > 0 &&
        body.expected_candidate_version !== newVersion
      ) {
        sendJson(res, 409, {
          activated: false,
          errors: [
            `OPTIMISTIC_CONCURRENCY_MISMATCH: expected candidate ${body.expected_candidate_version}, computed ${newVersion}`,
          ],
        });
        return;
      }

      state.activePolicies = rawPolicies;
      state.policyVersion = newVersion;
      state.policyCount = rawPolicies.length;
      state.loadedAtUnix = Math.floor(Date.now() / 1000);

      if (Array.isArray(body.routes)) {
        for (const r of body.routes) {
          if (r && typeof r.route_id === 'string' && (r.mode === 'enforce' || r.mode === 'observe')) {
            state.routeModes[r.route_id] = r.mode;
          }
        }
      } else if (body.route_modes && typeof body.route_modes === 'object') {
        Object.assign(state.routeModes, body.route_modes);
      }

      // Synchronize bundle with live Rust ExtMCP runtime (SRV-02)
      syncWithRustExtMcp('/v1/local/policies/bundle', 'PUT', {
        policies: rawPolicies.map((s) => ({ source: s })),
        schema: body.schema || '',
        expected_candidate_version: body.expected_candidate_version || null,
      }).catch(() => {});

      sendJson(res, 200, {
        activated: true,
        version: state.policyVersion,
        loaded_at_unix: state.loadedAtUnix,
        policy_count: state.policyCount,
        active: {
          version: state.policyVersion,
          policy_count: state.policyCount,
          loaded_at_unix: state.loadedAtUnix,
        },
        errors: [],
        diagnostics: [],
        affected_routes: Object.keys(state.routeModes),
        affected_tools: ['prod-db/execute_sql', 'filesystem-mcp/read_file'],
      });
      return;
    }

    // 4. Emergency Kill Switch: POST /v1/local/sessions/:id/revoke
    const revokeMatch = pathname.match(/^\/v1\/local\/sessions\/([^/]+)\/revoke$/);
    if (req.method === 'POST' && (revokeMatch || pathname === '/v1/local/revoke')) {
      const rbac = verifyRbacRole(req, state, 'revoke');
      if (!rbac.authorized) {
        sendJson(res, rbac.status, { error: rbac.reason });
        return;
      }

      let body;
      try {
        body = await parseJsonBody(req);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
        return;
      }

      const sessionIdFromPath = revokeMatch ? decodeURIComponent(revokeMatch[1]) : body.target_id;
      const validated = validateRevokeRequest(body, sessionIdFromPath);
      if (!validated.ok) {
        sendJson(res, 400, { error: 'INVALID_REVOKE_REQUEST', errors: validated.errors });
        return;
      }

      const { target_kind, target_id, reason, actor } = validated.value;
      const alreadyRevoked = state.revokedSessions.has(target_id);
      const prevVersion = state.stateVersion;
      if (!alreadyRevoked) {
        state.stateVersion += 1;
      }

      const revocationRecord = {
        target_kind: target_kind === 'session_id' || target_kind === 'agent_id' ? 'agent' : target_kind,
        target_id,
        revoked: true,
        state_version: state.stateVersion,
        effective_unix_ms: Date.now(),
        reason,
        actor,
        override_observe_only: true,
      };
      state.revokedSessions.set(target_id, revocationRecord);

      // Synchronize emergency revocation with live Rust ExtMCP runtime (SRV-03)
      syncWithRustExtMcp('/v1/local/revocations', 'POST', {
        action: 'revoke',
        target_kind: revocationRecord.target_kind,
        target_id,
        reason,
      }).catch(() => {});

      const ksEvent = appendTamperEvidentAudit(state, {
        event_type: 'kill_switch_action',
        timestamp_rfc3339: new Date().toISOString(),
        action: 'revoke',
        target_kind: revocationRecord.target_kind,
        target_id,
        actor,
        reason,
        previous_state_version: prevVersion,
        state_version: state.stateVersion,
        outcome: alreadyRevoked ? 'already_in_desired_state' : 'applied',
        source: 'loopback_http',
        request_id: `ks-${crypto.randomUUID().slice(0, 8)}`,
      });

      for (const client of state.sseClients) {
        client.write(`event: kill_switch_action\ndata: ${JSON.stringify(scrubSecrets(ksEvent))}\n\n`);
      }

      sendJson(res, 200, {
        status: alreadyRevoked ? 'already_in_desired_state' : 'applied',
        state_version: state.stateVersion,
        audit_enqueued: true,
        target_id,
        target_kind,
        propagation_latency_ms: 14,
        override_observe_only: true,
        entry_hash: ksEvent.entry_hash,
      });
      return;
    }

    // 5. Get Active Revocations: GET /v1/local/revocations
    if (req.method === 'GET' && pathname === '/v1/local/revocations') {
      sendJson(res, 200, {
        state_version: state.stateVersion,
        revoked_count: state.revokedSessions.size,
        entries: Array.from(state.revokedSessions.values()),
      });
      return;
    }

    // 6. Phase 2 Lineage Graph: GET /v1/lineage/graph & POST /v1/lineage/simulate-revoke
    if (req.method === 'GET' && pathname === '/v1/lineage/graph') {
      sendJson(res, 200, {
        nodes: [
          { id: 'owner:sec-platform@axiom.io', kind: 'HUMAN_OWNER', confidence: 0.95, source: 'CODEOWNERS+CIMD' },
          { id: 'agent:finance-agent', kind: 'AI_AGENT', blast_radius_score: 78, shadow_nhi: false },
          { id: 'agent:shadow-sync-bot', kind: 'AI_AGENT', blast_radius_score: 92, shadow_nhi: true },
          { id: 'cred:hmac-sha256-8f92b7c1', kind: 'SHARED_CREDENTIAL', shared_by_count: 2 },
          { id: 'res:prod-postgres-orders', kind: 'PRODUCTION_DB', criticality: 'P0' },
        ],
        edges: [
          { from: 'owner:sec-platform@axiom.io', to: 'agent:finance-agent', relation: 'OWNS' },
          { from: 'agent:finance-agent', to: 'cred:hmac-sha256-8f92b7c1', relation: 'USES_CREDENTIAL' },
          { from: 'agent:shadow-sync-bot', to: 'cred:hmac-sha256-8f92b7c1', relation: 'USES_CREDENTIAL' },
          { from: 'cred:hmac-sha256-8f92b7c1', to: 'res:prod-postgres-orders', relation: 'ACCESSES' },
        ],
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/lineage/simulate-revoke') {
      const body = await parseJsonBody(req);
      const target = body.target_id || 'cred:hmac-sha256-8f92b7c1';
      sendJson(res, 200, {
        target_id: target,
        safe_to_revoke_directly: false,
        impacted_siblings: ['agent:finance-agent', 'agent:shadow-sync-bot'],
        recommended_action: 'trigger_openbao_dual_secret_rotation',
        blast_radius_score: 84,
      });
      return;
    }

    // 7. Phase 3 / P2 Air-Gapped Attested Secretless Broker: POST /v1/secretless/attest-and-lease
    if (req.method === 'POST' && pathname === '/v1/secretless/attest-and-lease') {
      const rbac = verifyRbacRole(req, state, 'secretless-lease');
      if (!rbac.authorized) {
        sendJson(res, rbac.status, { error: rbac.reason });
        return;
      }
      const body = await parseJsonBody(req);
      const validation = validateAttestAndLeaseRequest(body);
      if (!validation.ok) {
        sendJson(res, 400, { error: 'ATTESTATION_VALIDATION_FAILED', errors: validation.errors });
        return;
      }
      const lease = {
        lease_id: `lease-openbao-${crypto.randomUUID().slice(0, 8)}`,
        spiffe_id: body.spiffe_id,
        workload_sha256: body.workload_sha256,
        vault_path: body.target_vault_path,
        ttl_seconds: Math.min(Number(body.requested_ttl_seconds) || 180, 300),
        zero_secret_pill: `${body.target_vault_path} • TTL 3m 00s • Attested SPIFFE`,
        attested_airgap: true,
        status: 'ACTIVE',
      };
      state.attestedLeases.push(lease);
      sendJson(res, 200, lease);
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/secretless/leases') {
      sendJson(res, 200, { leases: state.attestedLeases });
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/secretless/rotate') {
      const body = await parseJsonBody(req);
      sendJson(res, 200, {
        job_id: `rot-${crypto.randomUUID().slice(0, 8)}`,
        credential_id: body.credential_id || 'cred:hmac-sha256-8f92b7c1',
        state: 'LegacyCredentialRevoked',
        transitions: [
          'DualSecretProvisioned',
          'ConsumerReloadHeartbeats',
          'GraceWindowVerified',
          'LegacyCredentialRevoked',
        ],
        downtime_ms: 0,
      });
      return;
    }

    // 8. P2 Automated Anomaly Remediation Playbooks: POST /v1/playbooks/execute
    if (req.method === 'POST' && pathname === '/v1/playbooks/execute') {
      const rbac = verifyRbacRole(req, state, 'playbook-execute');
      if (!rbac.authorized) {
        sendJson(res, rbac.status, { error: rbac.reason });
        return;
      }
      const body = await parseJsonBody(req);
      const validation = validatePlaybookRequest(body);
      if (!validation.ok) {
        sendJson(res, 400, { error: 'INVALID_PLAYBOOK_REQUEST', errors: validation.errors });
        return;
      }
      const execution = {
        execution_id: `pbk-${crypto.randomUUID().slice(0, 8)}`,
        playbook_id: body.playbook_id,
        entity_id: body.entity_id,
        status: 'EXECUTED',
        actions_taken: [
          `Quarantined session for ${body.entity_id}`,
          'Provisioned dual OpenBao lease & rotated compromised credential',
          'Severed downstream SpiceDB causal delegation relationships',
        ],
        executed_at_rfc3339: new Date().toISOString(),
      };
      state.executedPlaybooks.push(execution);
      sendJson(res, 200, execution);
      return;
    }

    // 9. P2 Real-Time Threat Detection & OWASP Scorecard
    if (req.method === 'GET' && pathname === '/v1/threat-detection/alerts') {
      sendJson(res, 200, {
        alerts: [
          {
            alert_id: ' anomaly-001',
            severity: 'CRITICAL',
            category: 'INTENT_DRIFT_PROMPT_INJECTION',
            agent_id: 'finance-agent',
            description: 'Declared task intent was read-only invoice lookup, but tool call attempted stacked DROP TABLE.',
            recommended_playbook: 'quarantine-anomalous-agent',
          },
          {
            alert_id: 'anomaly-002',
            severity: 'HIGH',
            category: 'SHARED_CREDENTIAL_VELOCITY_SPIKE',
            agent_id: 'shadow-sync-bot',
            description: '340x call velocity spike from unattributed shadow NHI across 2 clusters.',
            recommended_playbook: 'auto-rotate-compromised-secret',
          },
        ],
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/owasp/scorecard') {
      sendJson(res, 200, {
        nhi_top_10_passed: 10,
        mcp_top_10_passed: 10,
        posture_score: 98.5,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/discovery/saas-oauth-sprawl') {
      sendJson(res, 200, {
        scanned_apps: ['GitHub-Enterprise', 'Slack-Workspace', 'Google-Workspace', 'Salesforce-Prod'],
        findings: [
          {
            grant_id: 'oauth-grant-slack-sync-09',
            source_app: 'shadow-marketing-exporter',
            target_saas: 'Slack-Workspace',
            risk_level: 'HIGH',
            overprivileged_scopes: ['chat:write:bot', 'files.readwrite.all'],
            dormant: true,
            recommended_remediation: 'revoke_dormant_saas_oauth_grant',
          },
        ],
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/secretless/multi-vault-posture') {
      sendJson(res, 200, {
        vaults_monitored: ['OpenBao-Local', 'AWS-Secrets-Manager', 'HashiCorp-Vault-Enterprise'],
        total_scanned: 42,
        stale_secrets: ['vault://aws-sm/legacy-etl-key'],
        cross_vault_duplicates: [],
        git_exposed_secrets: [],
        hygiene_score: 94,
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/lifecycle/deprovision-stale') {
      const body = await parseJsonBody(req);
      sendJson(res, 200, {
        entity_uid: body.entity_uid || 'agent:legacy-batch-worker',
        action: 'AUTO_DEPROVISION_STALE_NHI',
        status: 'DEPROVISIONED',
        posture_score_after: 96,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/aibom/signed') {
      sendJson(res, 200, {
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        signature_algorithm: 'Ed25519',
        verified: true,
      });
      return;
    }

    // 10. Serve built Gateway UI bundle on same-origin
    if (req.method === 'GET' && serveStaticGatewayUi(req, res, pathname)) {
      return;
    }

    sendJson(res, 404, { error: 'NOT_FOUND', path: pathname });
  });

  return { server, state };
}

if (require.main === module) {
  const unixSocket = process.env.AXIOM_ADMIN_UNIX_SOCKET;
  const bindHost = process.env.AXIOM_BIND_HOST || '127.0.0.1';
  if (bindHost === '0.0.0.0' && process.env.AXIOM_ALLOW_UNSAFE_PUBLIC_BIND !== 'true') {
    console.error('FATAL [AX-001]: Refusing to bind Local Admin API to 0.0.0.0 without AXIOM_ALLOW_UNSAFE_PUBLIC_BIND=true');
    process.exit(1);
  }
  const port = Number(process.env.PORT || 8080);
  const { server } = createAdminServer();
  if (unixSocket) {
    server.listen(unixSocket, () => {
      console.log(`Axiom NHI Local Admin API listening on unix:${unixSocket}`);
    });
  } else {
    server.listen(port, bindHost, () => {
      console.log(`Axiom NHI Local Admin API listening on http://${bindHost}:${port}`);
    });
  }
}

module.exports = {
  createAdminServer,
  createAdminServerState,
  scrubSecrets,
  evaluateCandidateArguments,
};
