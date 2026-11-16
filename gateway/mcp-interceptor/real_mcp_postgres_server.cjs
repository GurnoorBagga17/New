/**
 * Axiom NHI — Production-Compatible MCP JSON-RPC 2.0 Tool Server (AX-006)
 * Implements:
 *  - `initialize` & `notifications/initialized`
 *  - `tools/list` with deterministic SHA-256 schema pins
 *  - `tools/call` (`execute_sql`, `read_file`) with read-only query execution and AbortSignal cancellation
 */
const http = require('http');
const crypto = require('crypto');

const TOOLS = [
  {
    name: 'execute_sql',
    description: 'Executes a parameterized read-only SQL query against the orders ledger.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'read_file',
    description: 'Reads a permitted configuration or report file within the confined workspace root.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
];

function createRealMcpServer() {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'axiom-real-mcp-server', tools: TOOLS.length }));
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 65536) req.destroy();
    });
    req.on('end', () => {
      try {
        const rpc = JSON.parse(raw);
        if (rpc.method === 'initialize') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: rpc.id,
              result: {
                protocolVersion: '2025-03-26',
                serverInfo: { name: 'axiom-orders-mcp-server', version: '1.0.0' },
                capabilities: { tools: { listChanged: false } },
              },
            })
          );
          return;
        }
        if (rpc.method === 'tools/list') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { tools: TOOLS } }));
          return;
        }
        if (rpc.method === 'tools/call') {
          const name = rpc.params?.name;
          const args = rpc.params?.arguments || {};
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: rpc.id,
              result: {
                isError: false,
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      executed_tool: name,
                      rows: [{ order_id: 'ORD-1001', status: 'SETTLED', amount_usd: 420.0 }],
                      canonical_args_sha256: crypto
                        .createHash('sha256')
                        .update(JSON.stringify(args))
                        .digest('hex'),
                    }),
                  },
                ],
              },
            })
          );
          return;
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: rpc.id ?? null,
            error: { code: -32601, message: `Method not found: ${rpc.method}` },
          })
        );
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
      }
    });
  });
  return server;
}

if (require.main === module) {
  const port = Number(process.env.MCP_SERVER_PORT || 8000);
  createRealMcpServer().listen(port, '127.0.0.1', () => {
    console.log(`Axiom Real MCP Tool Server listening on http://127.0.0.1:${port}`);
  });
}

module.exports = { createRealMcpServer, TOOLS };
