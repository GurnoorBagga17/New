/**
 * Mock ExtMCP Policy Engine Server
 * Team 1 Prototype for Gate G1
 * 
 * Simulates the upstream agentgateway ExtMcp.CheckRequest RPC hook.
 * Records callouts and can be instructed to return Permit, Deny, Timeout, or Revocation.
 */

class MockExtMcpServer {
  constructor() {
    this.receivedCallouts = [];
    this.defaultBehavior = 'PERMIT'; // 'PERMIT', 'DENY', 'TIMEOUT', 'KILL_SWITCH'
    this.denyReason = 'Axiom NHI Policy Denial: prohibited action';
    this.killSwitchReason = 'REVOCATION_ACTIVE: agent revoked';
    this.delayMs = 0;
  }

  reset() {
    this.receivedCallouts = [];
    this.defaultBehavior = 'PERMIT';
    this.denyReason = 'Axiom NHI Policy Denial: prohibited action';
    this.killSwitchReason = 'REVOCATION_ACTIVE: agent revoked';
    this.delayMs = 0;
  }

  setBehavior(behavior, { reason, delayMs } = {}) {
    this.defaultBehavior = behavior;
    if (reason) this.denyReason = reason;
    if (delayMs !== undefined) this.delayMs = delayMs;
  }

  async checkRequest(mcpRequestProto) {
    this.receivedCallouts.push({
      serviceNames: mcpRequestProto.service_names,
      method: mcpRequestProto.method,
      metadataContext: mcpRequestProto.metadata_context,
      rawRequestLength: mcpRequestProto.mcp_request ? mcpRequestProto.mcp_request.length : 0,
      headers: mcpRequestProto.headers,
      receivedAt: new Date().toISOString()
    });

    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    switch (this.defaultBehavior) {
      case 'PERMIT':
        return {
          result: {
            pass: {}
          }
        };

      case 'DENY':
        return {
          result: {
            error: {
              code: -32001,
              message: this.denyReason,
              resource: mcpRequestProto.service_names ? mcpRequestProto.service_names[0] : 'unknown',
              name: 'CedarPolicyDenial'
            }
          }
        };

      case 'KILL_SWITCH':
        return {
          result: {
            error: {
              code: -32001,
              message: this.killSwitchReason,
              resource: mcpRequestProto.service_names ? mcpRequestProto.service_names[0] : 'unknown',
              name: 'EmergencyRevocation'
            }
          }
        };

      case 'TIMEOUT':
        // Delay beyond the 15ms deadline
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          result: {
            pass: {}
          }
        };

      default:
        throw new Error(`Unknown mock behavior: ${this.defaultBehavior}`);
    }
  }
}

module.exports = { MockExtMcpServer };
