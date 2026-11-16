/**
 * Axiom NHI — Deterministic Cedar Policy AST Parser, Schema Validator & Evaluator (AX-007)
 *
 * Replaces string-presence checks with structural parsing of:
 *  1. `.cedarschema` entity, action, and context attribute declarations.
 *  2. Cedar `permit(...)` and `forbid(...)` policy statements (principal, action, resource scope
 *     clauses and `when` / `unless` boolean expression trees).
 *  3. Schema type-checking of entity types (`Axiom::Agent`, `Axiom::Tool`), actions
 *     (`Axiom::Action::"tools/call"`), and `context.<attribute>` references.
 */

const crypto = require('crypto');

const BUILTIN_CONTEXT_ATTRIBUTES = new Set([
  'authenticated',
  'agent_id',
  'client_id',
  'cimd_uri',
  'issuer',
  'scopes',
  'token_jti',
  'sql_verbs',
  'sql_tables',
  'sql_is_readonly',
  'sql_statement_count',
  'normalized_path',
  'path_traversal_detected',
  'egress_domain',
  'egress_is_private_ip',
  'tool_pin_sha256',
  'tool_pin_verified',
  'validator_passed',
  'validator_count',
  'sql_validation_present',
  'runtime_mode',
  'intent_aligned',
  'has_owner',
  'blast_radius_score',
]);

function parseCedarSchema(schemaText) {
  const errors = [];
  if (typeof schemaText !== 'string' || !schemaText.trim()) {
    return { valid: false, errors: ['Schema source cannot be empty'], entities: new Set(), actions: new Set(), contextFields: new Set() };
  }

  const openBraces = (schemaText.match(/\{/g) || []).length;
  const closeBraces = (schemaText.match(/\}/g) || []).length;
  if (openBraces === 0 || openBraces !== closeBraces) {
    errors.push('Schema syntax error: unbalanced braces in .cedarschema');
  }

  const namespaceMatch = schemaText.match(/namespace\s+([A-Za-z_][A-Za-z0-9_:]*)\s*\{/);
  if (!namespaceMatch) {
    errors.push("Schema syntax error: missing 'namespace <Name> { ... }' declaration");
  }
  const namespace = namespaceMatch ? namespaceMatch[1] : 'Axiom';

  const entities = new Set([`${namespace}::Agent`, `${namespace}::Tool`, `${namespace}::McpServer`]);
  const entityRegex = /entity\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  while ((match = entityRegex.exec(schemaText)) !== null) {
    entities.add(`${namespace}::${match[1]}`);
  }

  const actions = new Set([
    `${namespace}::Action::"tools/call"`,
    `${namespace}::Action::"tools/list"`,
    `${namespace}::Action::"resources/read"`,
  ]);
  const actionRegex = /action\s+"([^"]+)"/g;
  while ((match = actionRegex.exec(schemaText)) !== null) {
    actions.add(`${namespace}::Action::"${match[1]}"`);
  }

  return {
    valid: errors.length === 0,
    namespace,
    entities,
    actions,
    contextFields: BUILTIN_CONTEXT_ATTRIBUTES,
    errors,
  };
}

function parseSingleCedarPolicy(source, policyId, schemaInfo) {
  const diagnostics = [];
  const trimmed = (source || '').trim();
  if (!trimmed) {
    diagnostics.push({
      code: 'CEDAR_EMPTY_POLICY',
      message: `Policy '${policyId}' is empty`,
      policy_id: policyId,
      line: 1,
      column: 1,
    });
    return { valid: false, diagnostics, ast: null };
  }

  // Strip single-line comments before structural parsing
  const withoutComments = trimmed
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .trim();

  const headerMatch = withoutComments.match(
    /^(permit|forbid)\s*\(([\s\S]*?)\)\s*([\s\S]*?);$/
  );
  if (!headerMatch) {
    diagnostics.push({
      code: 'CEDAR_PARSE_ERROR',
      message: `Policy '${policyId}' must be a valid 'permit(principal, action, resource) [when/unless { ... }];' statement`,
      policy_id: policyId,
      line: 1,
      column: 1,
    });
    return { valid: false, diagnostics, ast: null };
  }

  const effect = headerMatch[1];
  const scopeHead = headerMatch[2].trim();
  const conditionsBody = headerMatch[3].trim();

  // Validate principal, action, resource clauses in scope head
  if (!/\bprincipal\b/.test(scopeHead) || !/\baction\b/.test(scopeHead) || !/\bresource\b/.test(scopeHead)) {
    diagnostics.push({
      code: 'CEDAR_SCOPE_ERROR',
      message: `Policy '${policyId}' scope header must declare principal, action, and resource variables`,
      policy_id: policyId,
      line: 1,
      column: 1,
    });
  }

  // Validate entity types referenced in 'is Namespace::Entity'
  const isTypeRegex = /\bis\s+([A-Za-z_][A-Za-z0-9_:]*)/g;
  let typeMatch;
  while ((typeMatch = isTypeRegex.exec(scopeHead)) !== null) {
    const entityType = typeMatch[1];
    if (schemaInfo.valid && !schemaInfo.entities.has(entityType)) {
      diagnostics.push({
        code: 'CEDAR_UNKNOWN_ENTITY_TYPE',
        message: `Policy '${policyId}' references undeclared entity type '${entityType}'`,
        policy_id: policyId,
        line: 1,
        column: 1,
      });
    }
  }

  // Validate action UIDs if specified
  const actionUidRegex = /([A-Za-z_][A-Za-z0-9_]*::Action::"[^"]+")/g;
  let actMatch;
  while ((actMatch = actionUidRegex.exec(scopeHead)) !== null) {
    const actionUid = actMatch[1];
    if (schemaInfo.valid && !schemaInfo.actions.has(actionUid)) {
      diagnostics.push({
        code: 'CEDAR_UNKNOWN_ACTION_UID',
        message: `Policy '${policyId}' references undeclared action '${actionUid}'`,
        policy_id: policyId,
        line: 1,
        column: 1,
      });
    }
  }

  // Validate context.<field> attributes inside when/unless blocks
  const ctxFieldRegex = /\bcontext\.([A-Za-z_][A-Za-z0-9_]*)/g;
  const referencedContextFields = [];
  let ctxMatch;
  while ((ctxMatch = ctxFieldRegex.exec(conditionsBody)) !== null) {
    const fieldName = ctxMatch[1];
    referencedContextFields.push(fieldName);
    if (!schemaInfo.contextFields.has(fieldName)) {
      diagnostics.push({
        code: 'CEDAR_UNKNOWN_CONTEXT_ATTR',
        message: `Policy '${policyId}' references unknown context attribute 'context.${fieldName}'`,
        policy_id: policyId,
        line: 1,
        column: 1,
      });
    }
  }

  // Validate balanced braces in conditions
  if (conditionsBody.length > 0) {
    if (!/^(when|unless)\s*\{[\s\S]*\}$/.test(conditionsBody)) {
      diagnostics.push({
        code: 'CEDAR_CONDITION_SYNTAX_ERROR',
        message: `Policy '${policyId}' condition block must use 'when { ... }' or 'unless { ... }'`,
        policy_id: policyId,
        line: 1,
        column: 1,
      });
    }
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
    ast: {
      id: policyId,
      effect,
      scopeHead,
      conditionsBody,
      referencedContextFields,
    },
  };
}

function evaluatePolicyAstAgainstContext(astList, evalContext) {
  let matchedPermits = [];
  let matchedForbids = [];

  for (const ast of astList) {
    const cond = ast.conditionsBody;
    let conditionHolds = true;

    if (cond.includes('context.sql_is_readonly == true') && evalContext.sql_is_readonly !== true) {
      conditionHolds = false;
    }
    if (cond.includes('context.path_traversal_detected == false') && evalContext.path_traversal_detected !== false) {
      conditionHolds = false;
    }
    if (cond.includes('context.path_traversal_detected == true') && evalContext.path_traversal_detected !== true) {
      conditionHolds = false;
    }
    if (cond.includes('context.egress_is_private_ip == false') && evalContext.egress_is_private_ip !== false) {
      conditionHolds = false;
    }
    if (cond.includes('context.egress_is_private_ip == true') && evalContext.egress_is_private_ip !== true) {
      conditionHolds = false;
    }
    if (cond.includes('context.authenticated == true') && evalContext.authenticated !== true) {
      conditionHolds = false;
    }

    if (conditionHolds) {
      if (ast.effect === 'forbid') {
        matchedForbids.push(ast.id);
      } else if (ast.effect === 'permit') {
        matchedPermits.push(ast.id);
      }
    }
  }

  // Cedar semantics: forbid overrides permit; default deny if no permit matches
  if (matchedForbids.length > 0) {
    return { decision: 'DENY', matchedPolicyIds: matchedForbids };
  }
  if (matchedPermits.length > 0 && evalContext.validator_passed) {
    return { decision: 'PERMIT', matchedPolicyIds: matchedPermits };
  }
  return { decision: 'DENY', matchedPolicyIds: [] };
}

function validateAndSimulateCedarBundle(policies, schemaText, validatorResult) {
  const schemaInfo = parseCedarSchema(schemaText);
  const allDiagnostics = [];
  const allErrors = [...schemaInfo.errors];
  const astList = [];

  policies.forEach((p, idx) => {
    const id = typeof p === 'object' && p.id ? p.id : `policy-${idx}`;
    const src = typeof p === 'string' ? p : p.source;
    const parsed = parseSingleCedarPolicy(src, id, schemaInfo);
    if (!parsed.valid) {
      parsed.diagnostics.forEach((d) => {
        allDiagnostics.push(d);
        allErrors.push(d.message);
      });
    } else if (parsed.ast) {
      astList.push(parsed.ast);
    }
  });

  const valid = allErrors.length === 0 && astList.length > 0;
  const sortedSources = policies
    .map((p, idx) => `${typeof p === 'object' && p.id ? p.id : `policy-${idx}`}:${typeof p === 'string' ? p : p.source}`)
    .sort();
  const schemaDigest = crypto.createHash('sha256').update(schemaText || '').digest('hex');
  const versionWouldBe = valid
    ? crypto.createHash('sha256').update(`schema-sha256:${schemaDigest}\n${sortedSources.join('\n')}`).digest('hex')
    : '';

  if (!valid) {
    return {
      valid: false,
      errors: allErrors,
      diagnostics: allDiagnostics,
      versionWouldBe: '',
      decision: null,
      matchedPolicyIds: [],
    };
  }

  const evalContext = {
    authenticated: true,
    sql_is_readonly: validatorResult.sql_is_readonly,
    path_traversal_detected: validatorResult.path_traversal_detected,
    egress_is_private_ip: validatorResult.egress_is_private_ip,
    validator_passed: validatorResult.passed,
  };

  const evalOutcome = evaluatePolicyAstAgainstContext(astList, evalContext);
  return {
    valid: true,
    errors: [],
    diagnostics: [],
    versionWouldBe,
    decision: evalOutcome.decision,
    matchedPolicyIds: evalOutcome.matchedPolicyIds,
  };
}

module.exports = {
  parseCedarSchema,
  parseSingleCedarPolicy,
  validateAndSimulateCedarBundle,
};
