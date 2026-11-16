/**
 * Mock ExtMCP Policy Engine Server
 * Supports AbortSignal cancellation (AX-012) and malformed response injection (AX-002).
 */

class MockExtMcpServer {
  constructor() {
    this.reset();
  }

  reset() {
    this.receivedCallouts = [];
    this.defaultBehavior = 'PERMIT';
    this.denyReason = 'Axiom NHI Policy Denial: prohibited action';
    this.killSwitchReason = 'REVOCATION_ACTIVE: agent revoked';
    this.delayMs = 0;
    this.abortedCallouts = 0;
    this.customRawResponse = undefined;
  }

  setBehavior(behavior, { reason, delayMs, rawResponse } = {}) {
    this.defaultBehavior = behavior;
    if (reason) this.denyReason = reason;
    if (delayMs !== undefined) this.delayMs = delayMs;
    this.customRawResponse = rawResponse;
  }

  async checkRequest(mcpRequestProto, options = {}) {
    const { signal, deadlineUnixMs } = options;
    this.receivedCallouts.push({
      serviceNames: mcpRequestProto.service_names,
      method: mcpRequestProto.method,
      metadataContext: mcpRequestProto.metadata_context,
      rawRequestLength: mcpRequestProto.mcp_request ? mcpRequestProto.mcp_request.length : 0,
      headers: mcpRequestProto.headers,
      deadlineUnixMs,
      receivedAt: new Date().toISOString(),
    });

    const waitWithAbort = (ms) =>
      new Promise((resolve, reject) => {
        if (signal?.aborted) {
          this.abortedCallouts += 1;
          reject(signal.reason || new Error('Aborted'));
          return;
        }
        const timer = setTimeout(resolve, ms);
        if (signal) {
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              this.abortedCallouts += 1;
              reject(signal.reason || new Error('Aborted'));
            },
            { once: true }
          );
        }
      });

    if (this.delayMs > 0) {
      await waitWithAbort(this.delayMs);
    }

    switch (this.defaultBehavior) {
      case 'PERMIT':
        return {
          request_id: mcpRequestProto.metadata_context?.fields?.axiom_request_id?.string_value,
          result: {
            pass: {
              policy_version: 'sha256:verified-v1',
            },
          },
        };

      case 'DENY':
        return {
          request_id: mcpRequestProto.metadata_context?.fields?.axiom_request_id?.string_value,
          result: {
            error: {
              code: -32001,
              message: this.denyReason,
              resource: mcpRequestProto.service_names ? mcpRequestProto.service_names[0] : 'unknown',
              name: 'CedarPolicyDenial',
            },
          },
        };

      case 'KILL_SWITCH':
        return {
          request_id: mcpRequestProto.metadata_context?.fields?.axiom_request_id?.string_value,
          result: {
            error: {
              code: -32001,
              message: this.killSwitchReason,
              resource: mcpRequestProto.service_names ? mcpRequestProto.service_names[0] : 'unknown',
              name: 'EmergencyRevocation',
            },
          },
        };

      case 'TIMEOUT':
        await waitWithAbort(50);
        return {
          result: {
            pass: {},
          },
        };

      case 'CUSTOM_RAW':
        return this.customRawResponse;

      default:
        throw new Error(`Unknown mock behavior: ${this.defaultBehavior}`);
    }
  }
}

module.exports = { MockExtMcpServer };
