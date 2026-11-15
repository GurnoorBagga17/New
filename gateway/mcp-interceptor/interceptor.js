/**
 * Gateway MCP Interceptor & Enforcement Engine
 * Team 1 Prototype for Gate G1
 * 
 * Implements request normalization, header allow-listing, ExtMCP callout
 * with a hard 15ms deadline, and runtime mode enforcement (observe-only vs enforce).
 */

const crypto = require('crypto');

// Allowed headers to forward through the gateway to internal processors
const ALLOWED_HEADERS = new Set([
  'authorization',
  'mcp-session-id',
  'traceparent',
  'baggage'
]);

class GatewayMcpInterceptor {
  constructor({
    extMcpClient,
    backendClient,
    runtimeMode = 'enforce', // 'enforce' | 'observe-only'
    calloutTimeoutMs = 15,    // Mandated 15ms callout deadline
    killSwitchOverridesObserveOnly = true,
    targetServer = 'mcp-backend-default'
  }) {
    this.extMcpClient = extMcpClient;
    this.backendClient = backendClient;
    this.runtimeMode = runtimeMode;
    this.calloutTimeoutMs = calloutTimeoutMs;
    this.killSwitchOverridesObserveOnly = killSwitchOverridesObserveOnly;
    this.targetServer = targetServer;
    this.emittedAuditEvents = [];
  }

  setRuntimeMode(mode) {
    if (mode !== 'enforce' && mode !== 'observe-only') {
      throw new Error(`Invalid runtime mode: ${mode}`);
    }
    this.runtimeMode = mode;
  }

  /**
   * Sanitizes headers: lowercases keys and filters against allow-list.
   * Explicitly preserves raw values for ExtMCP without writing to logs.
   */
  filterHeaders(rawHeaders = {}) {
    const filtered = [];
    for (const [key, value] of Object.entries(rawHeaders)) {
      const lowerKey = key.toLowerCase();
      if (ALLOWED_HEADERS.has(lowerKey)) {
        filtered.push({
          key: lowerKey,
          value: Buffer.from(String(value), 'utf-8')
        });
      }
    }
    return filtered;
  }

  /**
   * Generates a request ID and extracts W3C trace_id.
   */
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

  /**
   * Asynchronous, non-blocking emission of AuditEvent conforming to Team 5 contract.
   * Guarantees raw bearer tokens and sensitive credentials are never logged.
   */
  emitAuditEvent(event) {
    // Redaction assurance: bearer tokens are never retained
    const redactedEvent = {
      timestamp_rfc3339: new Date().toISOString(),
      request_id: event.requestId,
      trace_id: event.traceId,
      agent_id: event.agentId || 'anonymous',
      target_server: this.targetServer,
      tool_name: event.toolName || '',
      runtime_mode: this.runtimeMode,
      decision: event.decision, // "ALLOW" | "DENY" | "WOULD_DENY"
      policy_version: event.policyVersion || 'v0.1.0-draft',
      denial_reason: event.denialReason || null,
      validator_summary: event.validatorSummary || [],
      kill_switch_active: Boolean(event.killSwitchActive),
      latency_us: event.latencyUs || 0
    };

    // Stored in in-memory ring buffer (simulating non-blocking channel to Team 5)
    this.emittedAuditEvents.push(redactedEvent);
  }

  /**
   * Calls ExtMCP with a hard deadline.
   */
  async callExtMcpWithDeadline(mcpRequestProto) {
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const err = new Error(`ExtMCP callout exceeded ${this.calloutTimeoutMs}ms deadline`);
        err.name = 'TimeoutError';
        err.code = 'EXTMCP_DEADLINE_EXCEEDED';
        reject(err);
      }, this.calloutTimeoutMs);
    });

    try {
      const result = await Promise.race([
        this.extMcpClient.checkRequest(mcpRequestProto),
        timeoutPromise
      ]);
      clearTimeout(timeoutHandle);
      return result;
    } catch (err) {
      clearTimeout(timeoutHandle);
      throw err;
    }
  }

  /**
   * Main Intercept Entrypoint.
   */
  async intercept(mcpRpcRequest, rawHeaders = {}) {
    const startTime = process.hrtime.bigint();
    const { requestId, traceId } = this.extractCorrelation(rawHeaders);
    const headers = this.filterHeaders(rawHeaders);
    const method = mcpRpcRequest.method || 'unknown';
    const toolName = method === 'tools/call' ? mcpRpcRequest.params?.name : '';

    // Construct upstream McpRequest protobuf representation
    const mcpRequestProto = {
      service_names: [this.targetServer],
      method: method,
      metadata_context: {
        fields: {
          axiom_request_id: { string_value: requestId },
          trace_id: { string_value: traceId },
          runtime_mode: { string_value: this.runtimeMode }
        }
      },
      mcp_request: mcpRpcRequest.params ? Buffer.from(JSON.stringify(mcpRpcRequest.params)) : null,
      headers: headers
    };

    let extMcpResult = null;
    let calloutError = null;

    try {
      extMcpResult = await this.callExtMcpWithDeadline(mcpRequestProto);
    } catch (err) {
      calloutError = err;
    }

    const elapsedUs = Number((process.hrtime.bigint() - startTime) / 1000n);

    // =========================================================================
    // CASE 1: ExtMCP Deadline Exceeded or Transport Unavailable
    // =========================================================================
    if (calloutError) {
      if (this.runtimeMode === 'enforce') {
        this.emitAuditEvent({
          requestId,
          traceId,
          toolName,
          decision: 'DENY',
          denialReason: 'EXTMCP_TIMEOUT_FAIL_CLOSED',
          latencyUs: elapsedUs
        });

        // Fail Closed: Block execution
        return {
          statusCode: 504,
          body: {
            jsonrpc: '2.0',
            id: mcpRpcRequest.id,
            error: {
              code: -32001,
              message: 'Axiom NHI Security Gateway: Callout deadline exceeded (failClosed active).',
              data: { reason: 'EXTMCP_TIMEOUT', request_id: requestId }
            }
          }
        };
      } else {
        // Observe-only: Record shadow failure, forward to backend
        this.emitAuditEvent({
          requestId,
          traceId,
          toolName,
          decision: 'WOULD_DENY',
          denialReason: 'EXTMCP_TIMEOUT_FAIL_OPEN',
          latencyUs: elapsedUs
        });

        const backendResponse = await this.backendClient.handleRequest(mcpRpcRequest);
        return {
          statusCode: 200,
          body: backendResponse
        };
      }
    }

    // =========================================================================
    // CASE 2: ExtMCP Returned Authorization Error (Denial or Revocation)
    // =========================================================================
    if (extMcpResult && extMcpResult.result && extMcpResult.result.error) {
      const authError = extMcpResult.result.error;
      const isKillSwitch = authError.name === 'EmergencyRevocation' || authError.message.includes('REVOCATION_ACTIVE');

      // Check whether kill-switch takes precedence over observe-only
      const shouldBlock = (this.runtimeMode === 'enforce') || (this.runtimeMode === 'observe-only' && isKillSwitch && this.killSwitchOverridesObserveOnly);

      if (shouldBlock) {
        this.emitAuditEvent({
          requestId,
          traceId,
          toolName,
          decision: 'DENY',
          denialReason: authError.message,
          killSwitchActive: isKillSwitch,
          latencyUs: elapsedUs
        });

        // For tools/call policy denials in enforce mode: return HTTP 200 with isError: true
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
                    text: `Axiom NHI Policy Denial: ${authError.message}`
                  }
                ]
              }
            }
          };
        }

        // For non-tools/call methods or kill-switch aborts: return JSON-RPC error envelope
        return {
          statusCode: 403,
          body: {
            jsonrpc: '2.0',
            id: mcpRpcRequest.id,
            error: {
              code: authError.code || -32001,
              message: isKillSwitch ? `Axiom NHI Emergency Revocation: ${authError.message}` : `Axiom NHI Policy Denial: ${authError.message}`,
              data: {
                reason: isKillSwitch ? 'KILL_SWITCH_ACTIVE' : 'POLICY_DENIAL',
                request_id: requestId
              }
            }
          }
        };
      } else {
        // Observe-only non-blocking forward
        this.emitAuditEvent({
          requestId,
          traceId,
          toolName,
          decision: 'WOULD_DENY',
          denialReason: authError.message,
          killSwitchActive: isKillSwitch,
          latencyUs: elapsedUs
        });

        const backendResponse = await this.backendClient.handleRequest(mcpRpcRequest);
        return {
          statusCode: 200,
          body: backendResponse
        };
      }
    }

    // =========================================================================
    // CASE 3: ExtMCP Returned Pass (Permit)
    // =========================================================================
    this.emitAuditEvent({
      requestId,
      traceId,
      toolName,
      decision: 'ALLOW',
      latencyUs: elapsedUs
    });

    const backendResponse = await this.backendClient.handleRequest(mcpRpcRequest);
    return {
      statusCode: 200,
      body: backendResponse
    };
  }
}

module.exports = { GatewayMcpInterceptor };
