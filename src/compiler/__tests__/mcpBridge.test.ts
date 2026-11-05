import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-ignore
import { startBridge, sendJsonRpcRequest } from '../../../scripts/torque-mcp-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bridgeScriptPath = path.resolve(__dirname, '../../../scripts/torque-mcp-bridge.js');

describe('Torque MCP Stdio Bridge (torque-mcp-bridge.js)', () => {
  let mockServer: http.Server;
  let mockServerPort: number;
  let receivedRequests: any[] = [];

  beforeAll(async () => {
    receivedRequests = [];
    mockServer = http.createServer((req, res) => {
      if (req.method === 'POST' && (req.url === '/mcp' || req.url === '/mcp/')) {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            receivedRequests.push(parsed);

            // Handle notifications
            if (parsed.id === undefined) {
              res.writeHead(204);
              res.end();
              return;
            }

            if (parsed.method === 'initialize') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: parsed.id,
                  result: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'torque-mock-mcp', version: '0.2.2' },
                  },
                })
              );
            } else if (parsed.method === 'tools/list') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: parsed.id,
                  result: {
                    tools: [
                      { name: 'torque_read_file', description: 'Read file content' },
                      { name: 'torque_compile', description: 'Compile LaTeX' },
                    ],
                  },
                })
              );
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: parsed.id,
                  result: { echo: parsed.method },
                })
              );
            }
          } catch (e: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address() as any;
        mockServerPort = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    }
  });

  it('sends JSON-RPC request to mock server via sendJsonRpcRequest', async () => {
    const response = await sendJsonRpcRequest(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
      { ports: [mockServerPort] }
    );
    expect(response).toBeTruthy();
    const parsed = JSON.parse(response!);
    expect(parsed.id).toBe(1);
    expect(parsed.result.serverInfo.name).toBe('torque-mock-mcp');
  });

  it('bridges stdin to stdout in startBridge with running server', async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    let outputData = '';
    output.on('data', chunk => {
      outputData += chunk.toString();
    });

    const bridge = startBridge({
      input,
      output,
      ports: [mockServerPort],
    });

    input.write(JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'tools/list' }) + '\n');

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(outputData).toContain('"id":10');
    expect(outputData).toContain('torque_read_file');

    bridge.close();
  });

  it('falls back to second port when first port connection is refused', async () => {
    // Choose an unused port for port 1
    const unusedPort = 59998;
    const input = new PassThrough();
    const output = new PassThrough();

    let outputData = '';
    output.on('data', chunk => {
      outputData += chunk.toString();
    });

    const bridge = startBridge({
      input,
      output,
      ports: [unusedPort, mockServerPort],
    });

    input.write(JSON.stringify({ jsonrpc: '2.0', id: 20, method: 'initialize' }) + '\n');

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(outputData).toContain('"id":20');
    expect(outputData).toContain('torque-mock-mcp');

    bridge.close();
  });

  it('outputs a JSON-RPC error response when Torque server is completely unreachable', async () => {
    const unusedPort1 = 59997;
    const unusedPort2 = 59996;
    const input = new PassThrough();
    const output = new PassThrough();

    let outputData = '';
    output.on('data', chunk => {
      outputData += chunk.toString();
    });

    const bridge = startBridge({
      input,
      output,
      ports: [unusedPort1, unusedPort2],
    });

    input.write(JSON.stringify({ jsonrpc: '2.0', id: 30, method: 'tools/list' }) + '\n');

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(outputData).toContain('"id":30');
    expect(outputData).toContain('error');
    expect(outputData).toContain('Torque is not running');

    bridge.close();
  });

  it('handles invalid JSON input line with standard JSON-RPC parse error', async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    let outputData = '';
    output.on('data', chunk => {
      outputData += chunk.toString();
    });

    const bridge = startBridge({
      input,
      output,
      ports: [mockServerPort],
    });

    input.write('not-valid-json-string\n');

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(outputData).toContain('"id":null');
    expect(outputData).toContain('-32700');
    expect(outputData).toContain('Parse error');

    bridge.close();
  });

  it('ignores empty lines and whitespace lines without error', async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    let outputData = '';
    output.on('data', chunk => {
      outputData += chunk.toString();
    });

    const bridge = startBridge({
      input,
      output,
      ports: [mockServerPort],
    });

    input.write('\n   \n\t\n');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(outputData).toBe('');

    bridge.close();
  });

  it('handles notifications (no id) without printing output on success', async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    let outputData = '';
    output.on('data', chunk => {
      outputData += chunk.toString();
    });

    const bridge = startBridge({
      input,
      output,
      ports: [mockServerPort],
    });

    input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(outputData).toBe('');

    bridge.close();
  });

function waitForOutput(
  child: ChildProcess,
  matcher: (out: string) => boolean,
  timeoutMs = 4000
): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for child process output. Received: "${out}"`));
    }, timeoutMs);

    child.stdout?.on('data', chunk => {
      out += chunk.toString();
      if (matcher(out)) {
        clearTimeout(timer);
        resolve(out);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

  it('executes bridge script as standalone child process with stdio', async () => {
    const child = spawn(process.execPath, [bridgeScriptPath], {
      env: {
        ...process.env,
        TORQUE_MCP_PORT: String(mockServerPort),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const outputPromise = waitForOutput(child, out => out.includes('"id":99'));

    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list' }) + '\n');

    const result = await outputPromise;
    expect(result).toContain('"id":99');
    expect(result).toContain('torque_compile');

    child.stdin.end();
    child.kill('SIGTERM');
  });

  it('executes bridge script as standalone child process returning error when port is offline', async () => {
    const child = spawn(process.execPath, [bridgeScriptPath], {
      env: {
        ...process.env,
        TORQUE_MCP_PORT: '59995',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const outputPromise = waitForOutput(child, out => out.includes('"id":101'));

    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 101, method: 'tools/list' }) + '\n');

    const result = await outputPromise;
    expect(result).toContain('"id":101');
    expect(result).toContain('Torque is not running');

    child.stdin.end();
    child.kill('SIGTERM');
  });

  it('executes bridge script as standalone child process using --port CLI argument', async () => {
    const child = spawn(process.execPath, [bridgeScriptPath, '--port', String(mockServerPort)], {
      env: {
        ...process.env,
        TORQUE_MCP_PORT: '59994', // env points to dead port, CLI argument should override
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const outputPromise = waitForOutput(child, out => out.includes('"id":102'));

    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 102, method: 'tools/list' }) + '\n');

    const result = await outputPromise;
    expect(result).toContain('"id":102');
    expect(result).toContain('torque_compile');

    child.stdin.end();
    child.kill('SIGTERM');
  });

  it('processes multiple requests sequentially over a single bridge instance', async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const responses: any[] = [];
    output.on('data', chunk => {
      const lines = chunk.toString().split('\n').filter((l: string) => l.trim().length > 0);
      for (const line of lines) {
        responses.push(JSON.parse(line));
      }
    });

    const bridge = startBridge({
      input,
      output,
      ports: [mockServerPort],
    });

    input.write(JSON.stringify({ jsonrpc: '2.0', id: 201, method: 'initialize' }) + '\n');
    await new Promise(r => setTimeout(r, 60));

    input.write(JSON.stringify({ jsonrpc: '2.0', id: 202, method: 'tools/list' }) + '\n');
    await new Promise(r => setTimeout(r, 60));

    input.write(JSON.stringify({ jsonrpc: '2.0', id: 203, method: 'custom_ping' }) + '\n');
    await new Promise(r => setTimeout(r, 60));

    expect(responses.length).toBe(3);
    expect(responses[0].id).toBe(201);
    expect(responses[1].id).toBe(202);
    expect(responses[2].id).toBe(203);
    expect(responses[2].result.echo).toBe('custom_ping');

    bridge.close();
  });

  it('handles server returning non-2xx HTTP status with appropriate error', async () => {
    const errServer = http.createServer((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Crash inside compiler backend');
    });

    let errServerPort: number;
    await new Promise<void>(resolve => {
      errServer.listen(0, '127.0.0.1', () => {
        errServerPort = (errServer.address() as any).port;
        resolve();
      });
    });

    try {
      const input = new PassThrough();
      const output = new PassThrough();

      let outputData = '';
      output.on('data', chunk => {
        outputData += chunk.toString();
      });

      const bridge = startBridge({
        input,
        output,
        ports: [errServerPort!],
      });

      input.write(JSON.stringify({ jsonrpc: '2.0', id: 301, method: 'tools/list' }) + '\n');

      await new Promise(r => setTimeout(r, 100));

      expect(outputData).toContain('"id":301');
      expect(outputData).toContain('Torque MCP error');
      expect(outputData).toContain('500');

      bridge.close();
    } finally {
      await new Promise<void>(resolve => errServer.close(() => resolve()));
    }
  });
});
