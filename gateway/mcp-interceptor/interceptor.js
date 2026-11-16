/**
 * Gateway MCP Interceptor & Enforcement Engine (Remediated for AX-002 & AX-012)
 *
 * Security Invariants Enforced:
 *  1. Strict Default-Deny ExtMCP Response Validation (AX-002):
 *     - Rejects null, undefined, {}, missing `result`, unknown result variants,
 *       contradictory pass+error payloads, or mismatched correlation/request IDs.
 *     - Only an explicit, schema-valid `result.pass` object can trigger ALLOW.
 *  2. Deadline Propagation, Request Cancellation & Concurrency Bulkhead (AX-012):
 *     - Propagates an `AbortSignal` and `deadlineUnixMs` to `extMcpClient.checkRequest`.
 *     - Calls `controller.abort()` immediately on timeout so timed-out work is cancelled.
 *     - Bounds concurrent in-flight ExtMCP callouts (`maxConcurrentCallouts`).
 */

const crypto = require('crypto');

const ALLOWED_HEADERS = new Set([
  'authorization',
  'mcp-session-id',
  'traceparent',
  'baggage',
]);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates the ExtMCP response envelope under strict default-deny semantics (AX-002).
 */
function validateExtMcpResponse(extMcpResult, expectedRequestId) {
  if (!isPlainObject(extMcpResult) || !isPlainObject(extMcpResult.result)) {
    return {
      valid: false,
      kind: 'MALFORMED_RESPONSE',
      reason: 'EXTMCP_INVALID_RESPONSE: Missing or non-object result envelope',
    };
  }

  const res = extMcpResult.result;
  const hasPass = Object.prototype.hasOwnProperty.call(res, 'pass');
  const hasError = Object.prototype.hasOwnProperty.call(res, 'error');

  // Must have exactly one of `pass` or `error`
  if ((hasPass && hasError) || (!hasPass && !hasError)) {
    return {
      valid: false,
      kind: 'MALFORMED_RESPONSE',
      reason: 'EXTMCP_INVALID_RESPONSE: Result must contain exclusively `pass` or `error`',
    };
  }

  // Reject unknown top-level keys inside result
  const unknownKeys = Object.keys(res).filter((k) => k !== 'pass' && k !== 'error');
  if (unknownKeys.length > 0) {
    return {
      valid: false,
      kind: 'MALFORMED_RESPONSE',
      reason: `EXTMCP_INVALID_RESPONSE: Unknown result variant keys [${unknownKeys.join(', ')}]`,
    };
  }

  // Verify request_id correlation if present on response
  if (
    typeof extMcpResult.request_id === 'string' &&
    extMcpResult.request_id.length > 0 &&
    extMcpResult.request_id !== expectedRequestId
  ) {
    return {
      valid: false,
      kind: 'CORRELATION_MISMATCH',
      reason: `EXTMCP_CORRELATION_MISMATCH: expected '${expectedRequestId}', received '${extMcpResult.request_id}'`,
    };
  }

  if (hasError) {
    if (!isPlainObject(res.error) || typeof res.error.message !== 'string' || !res.error.message.trim()) {
      return {
        valid: false,
        kind: 'MALFORMED_RESPONSE',
        reason: 'EXTMCP_INVALID_ERROR_OBJECT: error variant missing string message',
      };
    }
    return {
      valid: true,
      kind: 'DENY',
      error: res.error,
    };
  }

  if (!isPlainObject(res.pass)) {
    return {
      valid: false,
      kind: 'MALFORMED_RESPONSE',
      reason: 'EXTMCP_INVALID_PASS_OBJECT: pass variant must be a valid object',
    };
  }

  return {
    valid: true,
    kind: 'PERMIT',
    policyVersion: typeof res.pass.policy_version === 'string' && res.pass.policy_version.trim()
      ? res.pass.policy_version
      : 'v1.0.0-verified',
  };
}

class GatewayMcpInterceptor {
  constructor({
    extMcpClient,
    backendClient,
    runtimeMode = 'enforce',
    calloutTimeoutMs = 15,
    killSwitchOverridesObserveOnly = true,
    targetServer = 'mcp-backend-default',
    maxConcurrentCallouts = 256,
    maxAuditHistory = 1000,
  }) {
    this.extMcpClient = extMcpClient;
    this.backendClient = backendClient;
    this.runtimeMode = runtimeMode;
    this.calloutTimeoutMs = calloutTimeoutMs;
    this.killSwitchOverridesObserveOnly = killSwitchOverridesObserveOnly;
    this.targetServer = targetServer;
    this.maxConcurrentCallouts = maxConcurrentCallouts;
    this.maxAuditHistory = maxAuditHistory;
    this.inFlightCallouts = 0;
    this.cancelledCalloutCount = 0;
    this.emittedAuditEvents = [];
  }

  setRuntimeMode(mode) {
    if (mode !== 'enforce' && mode !== 'observe-only') {
      throw new Error(`Invalid runtime mode: ${mode}`);
    }
    this.runtimeMode = mode;
  }

  filterHeaders(rawHeaders = {}) {
    const filtered = [];
    for (const [key, value] of Object.entries(rawHeaders)) {
      const lowerKey = key.toLowerCase();
      if (ALLOWED_HEADERS.has(lowerKey)) {
        filtered.push({
          key: lowerKey,
          value: Buffer.from(String(value), 'utf-8'),
        });
      }
    }
    return filtered;
  }

  extractCorrelation(rawHeaders = {}) {
    const requestId = crypto.randomUUID();
    let traceId = '';

    for (const [k, v] of Object.entries(rawHeaders)) {
      if (k.toLowerCase() === 'traceparent' && typeof v === 'string') {
        const parts = v.split('-');
        if (parts.length >= 2) {
          traceId = parts[1];
        }
      }
    }

    if (!traceId) {
      traceId = crypto.randomBytes(16).toString('hex');
    }

    return { requestId, traceId };
  }

  emitAuditEvent(event) {
    const redactedEvent = {
      timestamp_rfc3339: new Date().toISOString(),
      request_id: event.requestId,
      trace_id: event.traceId,
      agent_id: event.agentId || 'anonymous',
      target_server: this.targetServer,
      tool_name: event.toolName || '',
      runtime_mode: this.runtimeMode,
      decision: event.decision,
      policy_version: event.policyVersion || 'v1.0.0-verified',
      denial_reason: event.denialReason || null,
      validator_summary: event.validatorSummary || [],
      kill_switch_active: Boolean(event.killSwitchActive),
      latency_us: event.latencyUs || 0,
    };
    if (this.emittedAuditEvents.length >= this.maxAuditHistory) {
      this.emittedAuditEvents.shift();
    }
    this.emittedAuditEvents.push(redactedEvent);
  }

  /**
   * Calls ExtMCP with a hard deadline, AbortSignal propagation, and bulkhead concurrency limit (AX-012).
   */
  async callExtMcpWithDeadline(mcpRequestProto) {
    if (this.inFlightCallouts >= this.maxConcurrentCallouts) {
      const busyErr = new Error('ExtMCP bulkhead concurrency limit exceeded');
      busyErr.name = 'BulkheadExhaustedError';
      busyErr.code = 'EXTMCP_BULKHEAD_EXHAUSTED';
      throw busyErr;
    }

    const controller = new AbortController();
    const deadlineUnixMs = Date.now() + this.calloutTimeoutMs;
    let timeoutHandle;

    this.inFlightCallouts += 1;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        this.cancelledCalloutCount += 1;
        controller.abort(new Error('EXTMCP_DEADLINE_ABORT'));
        const err = new Error(`ExtMCP callout exceeded ${this.calloutTimeoutMs}ms deadline`);
        err.name = 'TimeoutError';
        err.code = 'EXTMCP_DEADLINE_EXCEEDED';
        reject(err);
      }, this.calloutTimeoutMs);
    });

    try {
      const result = await Promise.race([
        this.extMcpClient.checkRequest(mcpRequestProto, {
          signal: controller.signal,
          deadlineUnixMs,
        }),
        timeoutPromise,
      ]);
      clearTimeout(timeoutHandle);
      return result;
    } catch (err) {
      clearTimeout(timeoutHandle);
      if (!controller.signal.aborted) {
        controller.abort();
      }
      throw err;
    } finally {
      this.inFlightCallouts = Math.max(0, this.inFlightCallouts - 1);
    }
  }

  async intercept(mcpRpcRequest, rawHeaders = {}) {
    const startTime = process.hrtime.bigint();
    const { requestId, traceId } = this.extractCorrelation(rawHeaders);
    const headers = this.filterHeaders(rawHeaders);
    const method = mcpRpcRequest.method || 'unknown';
    const toolName = method === 'tools/call' ? mcpRpcRequest.params?.name : '';

    // Never allow untrusted client headers or params to override gateway runtimeMode
    const mcpRequestProto = {
      service_names: [this.targetServer],
      method,
      metadata_context: {
        fields: {
          axiom_request_id: { string_value: requestId },
          trace_id: { string_value: traceId },
          runtime_mode: { string_value: this.runtimeMode },
        },
      },
      mcp_request: mcpRpcRequest.params ? Buffer.from(JSON.stringify(mcpRpcRequest.params)) : null,
      headers,
    };

    let extMcpResult = null;
    let calloutError = null;

    try {
      extMcpResult = await this.callExtMcpWithDeadline(mcpRequestProto);
    } catch (err) {
      calloutError = err;
    }

    const elapsedUs = Number((process.hrtime.bigint() - startTime) / 1000n);

    // CASE 1: ExtMCP Deadline Exceeded or Transport Unavailable
    if (calloutError) {
      if (this.runtimeMode === 'enforce') {
        this.emitAuditEvent({
          requestId,
          traceId,
          toolName,
          decision: 'DENY',
          denialReason: 'EXTMCP_TIMEOUT_FAIL_CLOSED',
          latencyUs: elapsedUs,
        });

        return {
          statusCode: 504,
          body: {
            jsonrpc: '2.0',
            id: mcpRpcRequest.id,
            error: {
              code: -32001,
              message: 'Axiom NHI Security Gateway: Callout deadline exceeded (failClosed active).',
              data: { reason: 'EXTMCP_TIMEOUT', request_id: requestId },
            },
          },
        };
      } else {
        this.emitAuditEvent({
          requestId,
          traceId,
          toolName,
          decision: 'WOULD_DENY',
          denialReason: 'EXTMCP_TIMEOUT_FAIL_OPEN',
          latencyUs: elapsedUs,
        });

        const backendResponse = await this.backendClient.handleRequest(mcpRpcRequest);
        return {
          statusCode: 200,
          body: backendResponse,
        };
      }
    }

    // Validate response envelope strictly (AX-002 Default-Deny Invariant)
    const validated = validateExtMcpResponse(extMcpResult, requestId);

    if (!validated.valid) {
      if (this.runtimeMode === 'enforce') {
        this.emitAuditEvent({
          requestId,
          traceId,
          toolName,
          decision: 'DENY',
          denialReason: validated.reason,
          latencyUs: elapsedUs,
        });
        return {
          statusCode: 502,
          body: {
            jsonrpc: '2.0',
            id: mcpRpcRequest.id,
            error: {
              code: -32001,
              message: `Axiom NHI Security Gateway: Invalid authorization response (${validated.reason}).`,
              data: { reason: validated.kind, request_id: requestId },
            },
          },
        };
      } else {
        this.emitAuditEvent({
          requestId,
          traceId,
          toolName,
          decision: 'WOULD_DENY',
          denialReason: validated.reason,
          latencyUs: elapsedUs,
        });
        const backendResponse = await this.backendClient.handleRequest(mcpRpcRequest);
        return {
          statusCode: 200,
          body: backendResponse,
        };
      }
    }

    // CASE 2: Explicit Authorization Error (Denial or Revocation)
    if (validated.kind === 'DENY') {
      const authError = validated.error;
      const isKillSwitch =
        authError.name === 'EmergencyRevocation' || authError.message.includes('REVOCATION_ACTIVE');

      const shouldBlock =
        this.runtimeMode === 'enforce' ||
        (this.runtimeMode === 'observe-only' && isKillSwitch && this.killSwitchOverridesObserveOnly);

      if (shouldBlock) {
        this.emitAuditEvent({
          requestId,
          traceId,
          toolName,
          decision: 'DENY',
          denialReason: authError.message,
          killSwitchActive: isKillSwitch,
          latencyUs: elapsedUs,
        });

        if (method === 'tools/call' && !isKillSwitch) {
          return {
            statusCode: 200,
            body: {
              jsonrpc: '2.0',
              id: mcpRpcRequest.id,
              result: {
                isError: true,
                content: [
                  {
                    type: 'text',
                    text: `Axiom NHI Policy Denial: ${authError.message}`,
                  },
                ],
              },
            },
          };
        }

        return {
          statusCode: 403,
          body: {
            jsonrpc: '2.0',
            id: mcpRpcRequest.id,
            error: {
              code: authError.code || -32001,
              message: isKillSwitch
                ? `Axiom NHI Emergency Revocation: ${authError.message}`
                : `Axiom NHI Policy Denial: ${authError.message}`,
              data: {
                reason: isKillSwitch ? 'KILL_SWITCH_ACTIVE' : 'POLICY_DENIAL',
                request_id: requestId,
              },
            },
          },
        };
      } else {
        this.emitAuditEvent({
          requestId,
          traceId,
          toolName,
          decision: 'WOULD_DENY',
          denialReason: authError.message,
          killSwitchActive: isKillSwitch,
          latencyUs: elapsedUs,
        });

        const backendResponse = await this.backendClient.handleRequest(mcpRpcRequest);
        return {
          statusCode: 200,
          body: backendResponse,
        };
      }
    }

    // CASE 3: Explicit, Schema-Validated Permit (`validated.kind === 'PERMIT'`)
    this.emitAuditEvent({
      requestId,
      traceId,
      toolName,
      decision: 'ALLOW',
      policyVersion: validated.policyVersion,
      latencyUs: elapsedUs,
    });

    const backendResponse = await this.backendClient.handleRequest(mcpRpcRequest);
    return {
      statusCode: 200,
      body: backendResponse,
    };
  }
}

module.exports = { GatewayMcpInterceptor, validateExtMcpResponse };
