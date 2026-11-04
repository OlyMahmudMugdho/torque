import { isTauri, uint8ArrayToBase64, base64ToUint8Array } from '../storage/tauriStorage';
import type { Diagnostic } from '../types/workspace';

export interface TexLiveEnvironment {
  available: boolean;
  latexmk: boolean;
  pdflatex: boolean;
  xelatex: boolean;
  lualatex: boolean;
  texhash: boolean;
  synctex: boolean;
  version?: string | null;
}

export interface CompileDriverRequest {
  projectId: string;
  files: Record<string, Uint8Array | string>;
  entry: string;
  engine?: 'pdflatex' | 'xelatex' | 'lualatex';
  synctex?: boolean;
}

export interface CompileDriverResponse {
  status: 'success' | 'spotless' | 'warnings' | 'errors' | 'failed';
  pdfBytes: Uint8Array | null;
  synctexBytes: Uint8Array | null;
  diagnostics: Diagnostic[];
  missingFiles: string[];
  resolvedPackages: string[];
  missingRequirements?: string[];
  durationMs: number;
  stdout: string;
  stderr: string;
}

export interface CompilerDriver {
  detectEnvironment(): Promise<TexLiveEnvironment>;
  compile(request: CompileDriverRequest): Promise<CompileDriverResponse>;
}

export type TauriInvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function normalizeResponsePayload(raw: any): CompileDriverResponse {
  let pdfBytes: Uint8Array | null = null;
  const rawPdf = raw?.pdf ?? raw?.pdfBytes;
  if (rawPdf) {
    if (typeof rawPdf === 'string') {
      pdfBytes = base64ToUint8Array(rawPdf);
    } else if (rawPdf instanceof Uint8Array) {
      pdfBytes = rawPdf;
    } else if (Array.isArray(rawPdf)) {
      pdfBytes = new Uint8Array(rawPdf);
    }
  }

  let synctexBytes: Uint8Array | null = null;
  const rawSynctex = raw?.synctex ?? raw?.synctexBytes;
  if (rawSynctex) {
    if (typeof rawSynctex === 'string') {
      synctexBytes = base64ToUint8Array(rawSynctex);
    } else if (rawSynctex instanceof Uint8Array) {
      synctexBytes = rawSynctex;
    } else if (Array.isArray(rawSynctex)) {
      synctexBytes = new Uint8Array(rawSynctex);
    }
  }

  const rawStatus = String(raw?.status || 'failed').toLowerCase();
  let status: CompileDriverResponse['status'] = 'failed';
  if (rawStatus === 'spotless' || rawStatus === 'success') {
    status = 'spotless';
  } else if (rawStatus === 'warnings') {
    status = 'warnings';
  } else if (rawStatus === 'errors') {
    status = 'errors';
  } else {
    status = 'failed';
  }

  const diagnostics: Diagnostic[] = Array.isArray(raw?.diagnostics)
    ? raw.diagnostics.map((d: any) => ({
        severity: d?.severity === 'warning' ? 'warning' : d?.severity === 'info' ? 'info' : 'error',
        file: d?.file,
        line: typeof d?.line === 'number' ? d.line : undefined,
        message: String(d?.message || ''),
      }))
    : [];

  const missingFiles: string[] = Array.isArray(raw?.missing_files)
    ? raw.missing_files
    : Array.isArray(raw?.missingFiles)
    ? raw.missingFiles
    : [];

  const resolvedPackages: string[] = Array.isArray(raw?.resolved_packages)
    ? raw.resolved_packages
    : Array.isArray(raw?.resolvedPackages)
    ? raw.resolvedPackages
    : [];

  const rawReq = raw?.missing_requirements ?? raw?.missingRequirements;
  const missingRequirements: string[] | undefined =
    Array.isArray(rawReq) && rawReq.length > 0 ? rawReq.map(String) : undefined;

  const durationMs = Number(raw?.duration_ms ?? raw?.durationMs ?? 0);
  const stdout = String(raw?.stdout || '');
  const stderr = String(raw?.stderr || '');

  return {
    status,
    pdfBytes,
    synctexBytes,
    diagnostics,
    missingFiles,
    resolvedPackages,
    ...(missingRequirements ? { missingRequirements } : {}),
    durationMs,
    stdout,
    stderr,
  };
}

export class TauriCompilerDriver implements CompilerDriver {
  private invokeFn?: TauriInvokeFn;

  constructor(invokeFn?: TauriInvokeFn) {
    this.invokeFn = invokeFn;
  }

  private async getInvoke(): Promise<TauriInvokeFn> {
    if (this.invokeFn) {
      return this.invokeFn;
    }
    const g = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
    if (g?.__TAURI_INTERNALS__?.invoke) {
      return g.__TAURI_INTERNALS__.invoke;
    }
    const tauriApi = await import('@tauri-apps/api/core');
    return tauriApi.invoke;
  }

  async detectEnvironment(): Promise<TexLiveEnvironment> {
    if (!isTauri() && !this.invokeFn) {
      return {
        available: false,
        latexmk: false,
        pdflatex: false,
        xelatex: false,
        lualatex: false,
        texhash: false,
        synctex: false,
        version: null,
      };
    }
    try {
      const invoke = await this.getInvoke();
      const res = await invoke<TexLiveEnvironment>('tauri_detect_texlive');
      return {
        available: Boolean(res?.available),
        latexmk: Boolean(res?.latexmk),
        pdflatex: Boolean(res?.pdflatex),
        xelatex: Boolean(res?.xelatex),
        lualatex: Boolean(res?.lualatex),
        texhash: Boolean(res?.texhash),
        synctex: Boolean(res?.synctex),
        version: res?.version ?? null,
      };
    } catch {
      return {
        available: false,
        latexmk: false,
        pdflatex: false,
        xelatex: false,
        lualatex: false,
        texhash: false,
        synctex: false,
        version: null,
      };
    }
  }

  async compile(request: CompileDriverRequest): Promise<CompileDriverResponse> {
    const invoke = await this.getInvoke();
    const projectFiles = Object.entries(request.files).map(([path, content]) => {
      const isBinary = content instanceof Uint8Array;
      return {
        projectId: request.projectId,
        path,
        content: isBinary ? uint8ArrayToBase64(content) : content,
        isBinary,
        updatedAt: Date.now(),
      };
    });

    const raw = await invoke<any>('tauri_compile_latex', {
      projectId: request.projectId,
      files: projectFiles,
      entry: request.entry,
      engine: request.engine || 'pdflatex',
      synctex: request.synctex !== false,
    });

    return normalizeResponsePayload(raw);
  }
}

export class HttpCompilerDriver implements CompilerDriver {
  constructor(
    private endpointUrl: string = '/api/compile',
    private customFetch?: typeof fetch
  ) {}

  async detectEnvironment(): Promise<TexLiveEnvironment> {
    try {
      const fetcher = this.customFetch || fetch;
      const url = this.endpointUrl.includes('?')
        ? `${this.endpointUrl}&action=detect`
        : `${this.endpointUrl}?action=detect`;

      const res = await fetcher(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        return {
          available: false,
          latexmk: false,
          pdflatex: false,
          xelatex: false,
          lualatex: false,
          texhash: false,
          synctex: false,
          version: null,
        };
      }

      const data = await res.json();
      return {
        available: Boolean(data?.available),
        latexmk: Boolean(data?.latexmk),
        pdflatex: Boolean(data?.pdflatex),
        xelatex: Boolean(data?.xelatex),
        lualatex: Boolean(data?.lualatex),
        texhash: Boolean(data?.texhash),
        synctex: Boolean(data?.synctex),
        version: data?.version ?? null,
      };
    } catch {
      return {
        available: false,
        latexmk: false,
        pdflatex: false,
        xelatex: false,
        lualatex: false,
        texhash: false,
        synctex: false,
        version: null,
      };
    }
  }

  async compile(request: CompileDriverRequest): Promise<CompileDriverResponse> {
    const fetcher = this.customFetch || fetch;
    const serializedFiles: Array<{ path: string; content: string; isBinary: boolean }> = [];

    for (const [path, content] of Object.entries(request.files)) {
      if (content instanceof Uint8Array) {
        serializedFiles.push({
          path,
          content: uint8ArrayToBase64(content),
          isBinary: true,
        });
      } else {
        serializedFiles.push({
          path,
          content: String(content),
          isBinary: false,
        });
      }
    }

    const payload = {
      projectId: request.projectId,
      files: serializedFiles,
      entry: request.entry,
      engine: request.engine || 'pdflatex',
      synctex: request.synctex !== false,
    };

    const res = await fetcher(this.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let errText = '';
      try {
        const errJson = await res.json();
        errText = errJson?.error || errJson?.message || JSON.stringify(errJson);
      } catch {
        errText = await res.text();
      }
      return {
        status: 'failed',
        pdfBytes: null,
        synctexBytes: null,
        diagnostics: [
          {
            severity: 'error',
            file: request.entry,
            message: `HTTP compiler error (${res.status}): ${errText}`,
          },
        ],
        missingFiles: [],
        resolvedPackages: [],
        durationMs: 0,
        stdout: '',
        stderr: errText,
      };
    }

    const raw = await res.json();
    return normalizeResponsePayload(raw);
  }
}

export interface CompilerDriverOptions {
  remoteUrl?: string;
  forceDriver?: 'tauri' | 'http';
  invokeFn?: TauriInvokeFn;
  customFetch?: typeof fetch;
}

let activeDriver: CompilerDriver | null = null;

export function getCompilerDriver(options?: CompilerDriverOptions): CompilerDriver {
  if (options?.forceDriver === 'tauri') {
    return new TauriCompilerDriver(options.invokeFn);
  }
  if (options?.forceDriver === 'http') {
    return new HttpCompilerDriver(options.remoteUrl || '/api/compile', options.customFetch);
  }
  if (options?.remoteUrl) {
    return new HttpCompilerDriver(options.remoteUrl, options.customFetch);
  }
  if (isTauri()) {
    return new TauriCompilerDriver(options?.invokeFn);
  }
  return new HttpCompilerDriver(options?.remoteUrl || '/api/compile', options?.customFetch);
}

export function setCompilerDriver(driver: CompilerDriver | null): void {
  activeDriver = driver;
}

export function getActiveCompilerDriver(options?: CompilerDriverOptions): CompilerDriver {
  if (activeDriver) return activeDriver;
  return getCompilerDriver(options);
}
