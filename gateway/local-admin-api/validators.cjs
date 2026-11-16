/**
 * Axiom NHI — Centralized Runtime Input Validation Layer (Zod-Equivalent Schema Guard)
 * Protects all /v1/local/* and /v1/* endpoints from malformed payloads, prototype pollution,
 * oversized inputs, and secret leakage.
 */

const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /sk_(?:live|test)_[A-Za-z0-9]{16,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];

function containsRawSecret(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value || '');
  return SECRET_PATTERNS.some((pattern) => pattern.test(serialized));
}

function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasPrototypePollutionKeys(obj) {
  if (!isPlainObject(obj)) return false;
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return true;
    if (isPlainObject(obj[key]) && hasPrototypePollutionKeys(obj[key])) return true;
  }
  return false;
}

function validateDryRunRequest(body) {
  const errors = [];
  if (!isPlainObject(body)) {
    return { ok: false, errors: ['Request body must be a JSON object'] };
  }
  if (hasPrototypePollutionKeys(body)) {
    return { ok: false, errors: ['Forbidden prototype pollution property in payload'] };
  }
  if (containsRawSecret(body)) {
    return { ok: false, errors: ['ZERO-SECRET GUARD: Raw credential or token detected in dry-run request'] };
  }

  // Support both DraftDryRunRequest ({ sources, schema }) and Studio DryRunRequestBody ({ policies, schema, envelope })
  const policies = Array.isArray(body.policies)
    ? body.policies
    : Array.isArray(body.sources)
      ? body.sources.map((src, idx) => ({ id: `policy-${idx}`, source: src }))
      : null;

  if (!policies || policies.length === 0 || policies.length > 64) {
    errors.push('policies (or sources) must be a non-empty array of 1..64 Cedar policies');
  } else {
    policies.forEach((p, idx) => {
      const src = typeof p === 'string' ? p : p && p.source;
      if (typeof src !== 'string' || src.trim().length === 0 || src.length > 65536) {
        errors.push(`policies[${idx}].source must be a non-empty string <= 64 KiB`);
      }
    });
  }

  if (typeof body.schema !== 'string' || body.schema.trim().length === 0 || body.schema.length > 131072) {
    errors.push('schema must be a non-empty Cedar schema string <= 128 KiB');
  }

  if (body.envelope !== undefined) {
    if (!isPlainObject(body.envelope)) {
      errors.push('envelope must be a valid object');
    } else {
      if (typeof body.envelope.target_server !== 'string' || !body.envelope.target_server.trim()) {
        errors.push('envelope.target_server is required');
      }
      if (typeof body.envelope.tool_name !== 'string' || !body.envelope.tool_name.trim()) {
        errors.push('envelope.tool_name is required');
      }
      if (body.envelope.raw_arguments !== undefined && !isPlainObject(body.envelope.raw_arguments)) {
        errors.push('envelope.raw_arguments must be a JSON object');
      }
    }
  }

  return errors.length === 0 ? { ok: true, value: body } : { ok: false, errors };
}

function validatePolicyBundleRequest(body) {
  const errors = [];
  if (!isPlainObject(body) || hasPrototypePollutionKeys(body)) {
    return { ok: false, errors: ['Invalid JSON object for policy bundle activation'] };
  }
  if (containsRawSecret(body)) {
    return { ok: false, errors: ['ZERO-SECRET GUARD: Raw credential detected in policy bundle'] };
  }

  const policies = Array.isArray(body.policies)
    ? body.policies
    : Array.isArray(body.sources)
      ? body.sources.map((src, idx) => ({ id: `policy-${idx}`, source: src }))
      : null;

  if (!policies || policies.length === 0) {
    errors.push('At least one Cedar policy is required in bundle');
  }
  if (typeof body.schema !== 'string' || !body.schema.trim()) {
    errors.push('schema is required for bundle activation');
  }
  return errors.length === 0 ? { ok: true, value: body } : { ok: false, errors };
}

function validateRevokeRequest(body, sessionIdFromPath) {
  const errors = [];
  if (!isPlainObject(body) || hasPrototypePollutionKeys(body)) {
    return { ok: false, errors: ['Revoke request body must be a JSON object'] };
  }
  const allowedKinds = new Set(['agent_id', 'session_id', 'tool_id', 'global', 'mcp_server', 'agent', 'tool']);
  const targetKind = body.target_kind || 'session_id';
  if (!allowedKinds.has(targetKind)) {
    errors.push(`target_kind must be one of: ${Array.from(allowedKinds).join(', ')}`);
  }
  const targetId = body.target_id || sessionIdFromPath;
  if (typeof targetId !== 'string' || targetId.trim().length === 0 || targetId.length > 256) {
    errors.push('target_id (or path :id) must be a non-empty identifier <= 256 chars');
  }
  if (typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 1024) {
    errors.push('reason must be a descriptive string between 3 and 1024 characters');
  }
  return errors.length === 0
    ? {
        ok: true,
        value: {
          target_kind: targetKind,
          target_id: targetId.trim(),
          reason: body.reason.trim(),
          actor: typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'local-operator',
        },
      }
    : { ok: false, errors };
}

function validateAttestAndLeaseRequest(body) {
  const errors = [];
  if (!isPlainObject(body) || hasPrototypePollutionKeys(body)) {
    return { ok: false, errors: ['Attestation request body must be a JSON object'] };
  }
  if (typeof body.spiffe_id !== 'string' || !body.spiffe_id.startsWith('spiffe://')) {
    errors.push('spiffe_id must be a valid SPIFFE ID starting with spiffe://');
  }
  if (typeof body.workload_sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(body.workload_sha256)) {
    errors.push('workload_sha256 must be a 64-character hex SHA-256 binary measurement');
  }
  if (typeof body.target_vault_path !== 'string' || !body.target_vault_path.startsWith('vault://')) {
    errors.push('target_vault_path must start with vault://');
  }
  return errors.length === 0 ? { ok: true, value: body } : { ok: false, errors };
}

function validatePlaybookRequest(body) {
  const errors = [];
  if (!isPlainObject(body) || hasPrototypePollutionKeys(body)) {
    return { ok: false, errors: ['Playbook execution request must be a JSON object'] };
  }
  const validPlaybooks = new Set([
    'auto-rotate-compromised-secret',
    'quarantine-anomalous-agent',
    'sever-spicedb-delegation-chain',
    'enforce-step-up-approval',
  ]);
  if (!validPlaybooks.has(body.playbook_id)) {
    errors.push(`playbook_id must be one of: ${Array.from(validPlaybooks).join(', ')}`);
  }
  if (typeof body.entity_id !== 'string' || !body.entity_id.trim()) {
    errors.push('entity_id is required');
  }
  return errors.length === 0 ? { ok: true, value: body } : { ok: false, errors };
}

module.exports = {
  SECRET_PATTERNS,
  containsRawSecret,
  validateDryRunRequest,
  validatePolicyBundleRequest,
  validateRevokeRequest,
  validateAttestAndLeaseRequest,
  validatePlaybookRequest,
};
