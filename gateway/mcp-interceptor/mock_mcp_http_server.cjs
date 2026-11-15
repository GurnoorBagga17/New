const http = require('node:http');
const { MockMcpBackend } = require('./mock_mcp_backend.js');

const host = process.env.MCP_BACKEND_HOST || '0.0.0.0';
const port = Number.parseInt(process.env.MCP_BACKEND_PORT || '8000', 10);
const maxBodyBytes = 1024 * 1024;
const backend = new MockMcpBackend();

const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"status":"ok"}');
    return;
  }

  if (request.method !== 'POST' || request.url !== '/mcp') {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end('{"error":"not_found"}');
    return;
  }

  let body = '';
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > maxBodyBytes) {
      response.writeHead(413, { 'content-type': 'application/json' });
      response.end('{"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"Request too large"}}');
      request.destroy();
      return;
    }
    body += chunk.toString('utf8');
  });

  request.on('end', async () => {
    if (response.writableEnded) return;
    let rpc;
    try {
      rpc = JSON.parse(body);
    } catch {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}');
      return;
    }

    if (!rpc || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ jsonrpc: '2.0', id: rpc?.id ?? null, error: { code: -32600, message: 'Invalid Request' } }));
      return;
    }

    try {
      const result = await backend.handleRequest(rpc);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(result));
    } catch {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id ?? null, error: { code: -32603, message: 'Internal error' } }));
    }
  });
});

server.listen(port, host, () => process.stdout.write(`Mock MCP backend listening on ${host}:${port}\n`));
