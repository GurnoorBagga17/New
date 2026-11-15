/**
 * Mock MCP Backend Server
 * Team 1 Prototype for Gate G1
 * 
 * Simulates an upstream MCP tool server. Records all executed tool calls
 * so that tests can assert whether a prohibited side-effect executed.
 */

class MockMcpBackend {
  constructor() {
    this.executedCalls = [];
  }

  reset() {
    this.executedCalls = [];
  }

  async handleRequest(mcpRequest) {
    const { id, method, params } = mcpRequest;

    if (method === 'tools/call') {
      const toolName = params?.name || 'unknown_tool';
      const args = params?.arguments || {};

      // Record executed call (simulating database write, API call, etc.)
      this.executedCalls.push({
        id,
        method,
        toolName,
        args,
        executedAt: new Date().toISOString()
      });

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              // Do not echo caller-supplied arguments: they may contain secrets.
              text: `Mock backend executed tool '${toolName}'.`
            }
          ]
        }
      };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'execute_sql',
              description: 'Execute a SQL query against the database',
              inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
            },
            {
              name: 'read_file',
              description: 'Read a file from disk',
              inputSchema: { type: 'object', properties: { path: { type: 'string' } } }
            }
          ]
        }
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      result: { status: 'acknowledged', method }
    };
  }
}

module.exports = { MockMcpBackend };
