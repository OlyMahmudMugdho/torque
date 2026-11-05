import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as serverModule from '../../../scripts/compiler-server.js';

describe('MCP Server Endpoints & Tool Handlers in compiler-server.js', () => {
  let testProjectsDir: string;
  let server: http.Server;
  let port: number;
  let baseUrl: string;

  beforeAll(async () => {
    // Create temporary projects directory
    testProjectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'torque-mcp-tests-'));

    // Create a sample project: proj-1
    const p1Dir = path.join(testProjectsDir, 'proj-1');
    const p1Files = path.join(p1Dir, 'files');
    fs.mkdirSync(p1Files, { recursive: true });

    const p1Json = {
      id: 'proj-1',
      name: 'Paper One',
      rootEntry: 'main.tex',
      createdAt: 1000,
      updatedAt: 2000,
    };
    fs.writeFileSync(path.join(p1Dir, 'project.json'), JSON.stringify(p1Json, null, 2), 'utf-8');

    const mainTexContent = [
      '\\documentclass{article}',
      '\\begin{document}',
      'Hello MCP World',
      'This is line 4',
      '\\end{document}',
    ].join('\n');
    fs.writeFileSync(path.join(p1Files, 'main.tex'), mainTexContent, 'utf-8');

    // Also create a binary-like file
    fs.writeFileSync(path.join(p1Files, 'figure.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));

    // Configure compiler-server to use this test directory if setter exists
    if (typeof (serverModule as any).setProjectsDir === 'function') {
      (serverModule as any).setProjectsDir(testProjectsDir);
    }
    if (typeof (serverModule as any).setActiveProject === 'function') {
      (serverModule as any).setActiveProject('proj-1');
    }

    // Start server on ephemeral port
    if (typeof (serverModule as any).createCompilerServer === 'function') {
      server = (serverModule as any).createCompilerServer({
        projectsDir: testProjectsDir,
        activeProjectId: 'proj-1',
      });
    } else {
      server = serverModule.server;
    }

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as any;
    port = addr.port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      fs.rmSync(testProjectsDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // --- Helper & Utility Tests ---
  describe('Helper Functions', () => {
    it('slices lines with bounds clamping matching mcp.rs', () => {
      const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
      const slice = (serverModule as any).sliceLines;
      expect(typeof slice).toBe('function');

      // Full content
      expect(slice(content, null, null)).toEqual({
        content,
        totalLines: 5,
        startLine: 1,
        endLine: 5,
        isSliced: false,
      });

      // Middle slice [2, 4]
      expect(slice(content, 2, 4)).toEqual({
        content: 'Line 2\nLine 3\nLine 4',
        totalLines: 5,
        startLine: 2,
        endLine: 4,
        isSliced: true,
      });

      // Negative startLine clamped to 1
      expect(slice(content, -5, 2)).toEqual({
        content: 'Line 1\nLine 2',
        totalLines: 5,
        startLine: 1,
        endLine: 2,
        isSliced: true,
      });

      // Exceeded endLine clamped to 5
      expect(slice(content, 3, 100)).toEqual({
        content: 'Line 3\nLine 4\nLine 5',
        totalLines: 5,
        startLine: 3,
        endLine: 5,
        isSliced: true,
      });

      // startLine > endLine produces empty content
      expect(slice(content, 4, 2)).toEqual({
        content: '',
        totalLines: 5,
        startLine: 4,
        endLine: 2,
        isSliced: true,
      });

      // startLine > totalLines produces empty content
      expect(slice(content, 10, 20)).toEqual({
        content: '',
        totalLines: 5,
        startLine: 5,
        endLine: 5,
        isSliced: true,
      });

      // Empty string content
      expect(slice('', null, null)).toEqual({
        content: '',
        totalLines: 0,
        startLine: 1,
        endLine: 0,
        isSliced: false,
      });
    });

    it('normalizes paths and prevents traversal', () => {
      const normalize = (serverModule as any).normalizePath;
      expect(typeof normalize).toBe('function');

      expect(normalize('main.tex')).toBe('main.tex');
      expect(normalize('./foo/bar.tex')).toBe('foo/bar.tex');
      expect(normalize('foo\\\\bar.tex')).toBe('foo/bar.tex');
      expect(() => normalize('../secret.txt')).toThrow(/Parent traversal not allowed/);
      expect(() => normalize('foo/../../bar.tex')).toThrow(/Parent traversal not allowed/);
      expect(() => normalize('')).toThrow(/Path cannot be empty/);
    });

    it('identifies binary files accurately', () => {
      const isBinary = (serverModule as any).isBinaryFile;
      expect(typeof isBinary).toBe('function');

      expect(isBinary('image.png', Buffer.from([1, 2, 3]))).toBe(true);
      expect(isBinary('doc.pdf', Buffer.from([1, 2, 3]))).toBe(true);
      expect(isBinary('doc.tex', Buffer.from('hello world\n'))).toBe(false);
      expect(isBinary('unknown.dat', Buffer.from([0x48, 0x00, 0x49]))).toBe(true);
    });
  });

  // --- MCP JSON-RPC Endpoint Tests: /mcp ---
  describe('Direct /mcp Streamable HTTP Endpoint', () => {
    it('handles initialize method', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2024-11-05' },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.jsonrpc).toBe('2.0');
      expect(json.id).toBe(1);
      expect(json.result.protocolVersion).toBe('2024-11-05');
      expect(json.result.serverInfo.name).toBe('torque-latex-ide');
      expect(json.result.capabilities.tools).toBeDefined();
    });

    it('handles notifications/initialized without body response (204)', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        }),
      });

      expect(res.status).toBe(204);
    });

    it('handles tools/list returning 7 Torque tools', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'list-1',
          method: 'tools/list',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe('list-1');
      const tools = json.result.tools;
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(7);

      const names = tools.map((t: any) => t.name);
      expect(names).toContain('torque_list_projects');
      expect(names).toContain('torque_get_active_project');
      expect(names).toContain('torque_read_file');
      expect(names).toContain('torque_write_file');
      expect(names).toContain('torque_edit_file');
      expect(names).toContain('torque_compile');
      expect(names).toContain('torque_get_diagnostics');
    });

    it('calls torque_list_projects via tools/call', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'torque_list_projects',
            arguments: {},
          },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe(2);
      expect(json.result.isError).toBe(false);

      const data = JSON.parse(json.result.content[0].text);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data[0].id).toBe('proj-1');
      expect(data[0].name).toBe('Paper One');
    });

    it('calls torque_get_active_project returning project manifest', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'torque_get_active_project',
            arguments: {},
          },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.result.isError).toBe(false);

      const data = JSON.parse(json.result.content[0].text);
      expect(data.id).toBe('proj-1');
      expect(data.rootEntry).toBe('main.tex');
      expect(Array.isArray(data.files)).toBe(true);

      const paths = data.files.map((f: any) => f.path);
      expect(paths).toContain('main.tex');
      expect(paths).toContain('figure.png');

      const figureFile = data.files.find((f: any) => f.path === 'figure.png');
      expect(figureFile.isBinary).toBe(true);
    });

    it('reads file with line slicing via torque_read_file', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'torque_read_file',
            arguments: {
              path: 'main.tex',
              startLine: 2,
              endLine: 4,
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.result.isError).toBe(false);

      const data = JSON.parse(json.result.content[0].text);
      expect(data.isSliced).toBe(true);
      expect(data.totalLines).toBe(5);
      expect(data.startLine).toBe(2);
      expect(data.endLine).toBe(4);
      expect(data.content).toBe('\\begin{document}\nHello MCP World\nThis is line 4');
    });

    it('rejects reading a binary file as text', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'torque_read_file',
            arguments: { path: 'figure.png' },
          },
        }),
      });

      const json = await res.json();
      expect(json.error).toBeDefined();
      expect(json.error.code).toBe(-32602);
      expect(json.error.message).toContain('Cannot read binary file as text');
    });

    it('writes a new file via torque_write_file', async () => {
      const newFileContent = '\\section{New Section}\nContent here';
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: {
            name: 'torque_write_file',
            arguments: {
              path: 'section2.tex',
              content: newFileContent,
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.result.isError).toBe(false);

      const data = JSON.parse(json.result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.path).toBe('section2.tex');

      // Verify file was written to disk
      const filePath = path.join(testProjectsDir, 'proj-1', 'files', 'section2.tex');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(newFileContent);
    });

    it('performs surgical text replacement via torque_edit_file', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: {
            name: 'torque_edit_file',
            arguments: {
              path: 'main.tex',
              target: 'Hello MCP World',
              replacement: 'Hello Antigravity MCP Partner',
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.result.isError).toBe(false);

      const data = JSON.parse(json.result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.occurrencesReplaced).toBe(1);

      // Verify disk content
      const filePath = path.join(testProjectsDir, 'proj-1', 'files', 'main.tex');
      const updated = fs.readFileSync(filePath, 'utf-8');
      expect(updated).toContain('Hello Antigravity MCP Partner');
      expect(updated).not.toContain('Hello MCP World');
    });

    it('rejects torque_edit_file when target text is missing', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/call',
          params: {
            name: 'torque_edit_file',
            arguments: {
              path: 'main.tex',
              target: 'Nonexistent string 123456789',
              replacement: 'Replacement',
            },
          },
        }),
      });

      const json = await res.json();
      expect(json.error).toBeDefined();
      expect(json.error.code).toBe(-32602);
      expect(json.error.message).toContain('Target text not found in file');
    });

    it('compiles project via torque_compile tool', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'compile-1',
          method: 'tools/call',
          params: {
            name: 'torque_compile',
            arguments: { engine: 'pdflatex' },
          },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.result.isError).toBe(false);
      const data = JSON.parse(json.result.content[0].text);
      expect(data.status).toBeDefined();
      expect(typeof data.durationMs).toBe('number');
      expect(Array.isArray(data.diagnostics)).toBe(true);
    });

    it('returns latest diagnostics via torque_get_diagnostics', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: {
            name: 'torque_get_diagnostics',
            arguments: {},
          },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.result.isError).toBe(false);

      const data = JSON.parse(json.result.content[0].text);
      expect(data.status).toBeDefined();
      expect(Array.isArray(data.diagnostics)).toBe(true);
    });

    it('supports direct method calling format', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 10,
          method: 'torque_list_projects',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe(10);
      expect(Array.isArray(json.result)).toBe(true);
      expect(json.result[0].id).toBe('proj-1');
    });

    it('returns error for unknown method', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 11,
          method: 'unknown_method_xyz',
        }),
      });

      const json = await res.json();
      expect(json.error).toBeDefined();
      expect(json.error.code).toBe(-32601);
      expect(json.error.message).toContain('Method not found');
    });
  });

  // --- SSE Transport Tests: /sse + /message ---
  describe('SSE Transport (/sse + /message)', () => {
    it('establishes SSE stream and receives endpoint event with sessionId', async () => {
      const sseReceivedChunks: string[] = [];
      let resolveInitial: (chunk: string) => void;
      const initialChunkPromise = new Promise<string>((resolve) => {
        resolveInitial = resolve;
      });

      let resolveMessage: (msg: string) => void;
      const messagePromise = new Promise<string>((resolve) => {
        resolveMessage = resolve;
      });

      const sseReq = http.get(
        `${baseUrl}/sse`,
        { headers: { Accept: 'text/event-stream' } },
        (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toContain('text/event-stream');

          res.on('data', (chunk: Buffer) => {
            const text = chunk.toString('utf-8');
            sseReceivedChunks.push(text);
            if (text.includes('event: endpoint')) {
              resolveInitial(text);
            }
            if (text.includes('event: message')) {
              resolveMessage(text);
            }
          });
        }
      );

      try {
        const initialChunk = await initialChunkPromise;
        expect(initialChunk).toContain('event: endpoint');
        expect(initialChunk).toContain('/message?sessionId=');

        const match = initialChunk.match(/sessionId=([a-zA-Z0-9_-]+)/);
        expect(match).not.toBeNull();
        const sessionId = match![1];

        // Send a JSON-RPC message via POST /message?sessionId=...
        const postRes = await fetch(`${baseUrl}/message?sessionId=${sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 99,
            method: 'initialize',
            params: { protocolVersion: '2024-11-05' },
          }),
        });

        expect(postRes.status).toBe(200);
        const postJson = await postRes.json();
        expect(postJson.id).toBe(99);
        expect(postJson.result.protocolVersion).toBe('2024-11-05');

        // Wait for SSE stream message event
        const sseMsg = await messagePromise;
        expect(sseMsg).toContain('event: message');
        expect(sseMsg).toContain('"protocolVersion":"2024-11-05"');
      } finally {
        sseReq.destroy();
      }
    });
  });
});
