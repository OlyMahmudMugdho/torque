#!/usr/bin/env node

import http from 'node:http';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Make an HTTP POST request to the Torque MCP endpoint.
 */
function makeHttpRequest(host, port, payload) {
  return new Promise((resolve, reject) => {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const req = http.request(
      {
        hostname: host,
        port: port,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseBody);
          } else {
            // Check if response body is already a JSON-RPC error
            try {
              const parsed = JSON.parse(responseBody);
              if (parsed && (parsed.result !== undefined || parsed.error !== undefined)) {
                return resolve(responseBody);
              }
            } catch (_) {}
            const err = new Error(`HTTP ${res.statusCode}: ${responseBody || res.statusMessage}`);
            err.statusCode = res.statusCode;
            reject(err);
          }
        });
      }
    );

    req.on('error', (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Send a JSON-RPC payload to the Torque MCP server, trying candidate ports in sequence.
 * Successfully used port is prioritized for subsequent calls.
 */
export async function sendJsonRpcRequest(payload, options = {}) {
  const host = options.host || '127.0.0.1';
  const defaultPort = parseInt(process.env.TORQUE_MCP_PORT || '3030', 10);
  const candidatePorts = options.ports && options.ports.length > 0
    ? options.ports
    : Array.from(new Set([defaultPort, 3031]));

  let lastError = null;

  for (let i = 0; i < candidatePorts.length; i++) {
    const port = candidatePorts[i];
    try {
      const result = await makeHttpRequest(host, port, payload);
      if (i > 0) {
        // Move successful port to the front for next time
        candidatePorts.splice(i, 1);
        candidatePorts.unshift(port);
      }
      return result;
    } catch (err) {
      lastError = err;
      if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.code === 'EADDRNOTAVAIL') {
        continue;
      }
      continue;
    }
  }

  throw lastError || new Error('Failed to connect to Torque MCP server');
}

/**
 * Start the stdio bridge interface.
 */
export function startBridge(options = {}) {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const stderr = options.stderr || process.stderr;
  const host = options.host || '127.0.0.1';
  const defaultPort = parseInt(process.env.TORQUE_MCP_PORT || '3030', 10);
  const candidatePorts = options.ports && options.ports.length > 0
    ? [...options.ports]
    : Array.from(new Set([defaultPort, 3031]));

  const rl = readline.createInterface({
    input,
    output: undefined,
    terminal: false,
  });

  const sendResponse = (obj) => {
    output.write(JSON.stringify(obj) + '\n');
  };

  let inFlight = 0;
  let isClosed = false;

  const maybeExit = () => {
    if (isClosed && inFlight === 0 && options.exitOnClose) {
      process.exit(0);
    }
  };

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    inFlight++;
    try {
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch (parseErr) {
        sendResponse({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: `Parse error: ${parseErr.message || 'Invalid JSON'}`,
          },
        });
        return;
      }

      const id = (typeof parsed === 'object' && parsed !== null && 'id' in parsed)
        ? parsed.id
        : undefined;

      try {
        const responseBody = await sendJsonRpcRequest(trimmed, {
          host,
          ports: candidatePorts,
        });

        if (responseBody && responseBody.trim()) {
          output.write(responseBody.trim() + '\n');
        }
      } catch (err) {
        if (id !== undefined) {
          const isConnError = err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.code === 'EADDRNOTAVAIL';
          const errorMessage = isConnError
            ? `Torque is not running. Could not connect to Torque MCP server at ${candidatePorts.map((p) => `http://${host}:${p}`).join(' or ')}`
            : `Torque MCP error: ${err.message || 'Internal server error'}`;
          const errorCode = isConnError ? -32000 : -32603;

          sendResponse({
            jsonrpc: '2.0',
            id,
            error: {
              code: errorCode,
              message: errorMessage,
            },
          });
        } else {
          if (stderr && typeof stderr.write === 'function') {
            stderr.write(`[torque-mcp-bridge] Failed to forward notification: ${err.message}\n`);
          }
        }
      }
    } finally {
      inFlight--;
      maybeExit();
    }
  });

  rl.on('close', () => {
    isClosed = true;
    maybeExit();
  });

  return {
    close() {
      rl.close();
    },
    ports: candidatePorts,
  };
}

function getCommandLinePort() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
      const p = parseInt(args[i + 1], 10);
      if (!isNaN(p)) return p;
    }
    if (/^\d+$/.test(args[i])) {
      const p = parseInt(args[i], 10);
      if (!isNaN(p)) return p;
    }
  }
  return null;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') {
      process.exit(0);
    }
  });
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));

  const cliPort = getCommandLinePort();
  const defaultPort = cliPort || parseInt(process.env.TORQUE_MCP_PORT || '3030', 10);
  const ports = Array.from(new Set([defaultPort, 3031]));
  startBridge({ ports, exitOnClose: true });
}
