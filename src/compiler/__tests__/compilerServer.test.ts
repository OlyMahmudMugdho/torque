import { describe, it, expect } from 'vitest';
import type http from 'node:http';
import * as serverModule from '../../../scripts/compiler-server.js';

describe('Standalone compiler-server.js', () => {
  it('exports helper functions', () => {
    expect(typeof serverModule.detectEnvironment).toBe('function');
    expect(typeof serverModule.parseDiagnosticsFromLog).toBe('function');
    expect(typeof serverModule.extractMissingFilesFromLog).toBe('function');
    expect(typeof serverModule.inferPackageCandidates).toBe('function');
    expect(typeof serverModule.compileProject).toBe('function');
    expect(serverModule.server).toBeDefined();
  });

  it('responds to GET /api/compile with environment info', async () => {
    const server: http.Server = serverModule.server;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as any;
    const port = addr.port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/compile`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(typeof data.available).toBe('boolean');
      expect(typeof data.latexmk).toBe('boolean');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects POST with missing entry', async () => {
    const server: http.Server = serverModule.server;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as any;
    const port = addr.port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'test' }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('entry');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
