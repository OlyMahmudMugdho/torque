import { NextResponse } from 'next/server';
import { detectTexLiveEnvironment, compileLatexNative, type ServerCompileRequest } from '../../../compiler/serverCompiler';

export const dynamic = 'force-static';

export async function GET(_request: Request) {
  try {
    // Return TeX Live environment detection by default for GET
    const env = detectTexLiveEnvironment();
    return NextResponse.json(env);
  } catch (err: any) {
    return NextResponse.json(
      {
        available: false,
        latexmk: false,
        pdflatex: false,
        xelatex: false,
        lualatex: false,
        texhash: false,
        synctex: false,
        version: null,
        error: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ServerCompileRequest;

    if (!body || !body.entry) {
      return NextResponse.json(
        { error: 'Missing required field: entry' },
        { status: 400 }
      );
    }

    const result = compileLatexNative(body);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'failed',
        pdf: null,
        synctex: null,
        diagnostics: [
          {
            severity: 'error',
            message: `Internal server error during compilation: ${String(err?.message || err)}`,
          },
        ],
        missing_files: [],
        missingFiles: [],
        resolved_packages: [],
        resolvedPackages: [],
        duration_ms: 0,
        durationMs: 0,
        stdout: '',
        stderr: String(err?.stack || err?.message || err),
      },
      { status: 500 }
    );
  }
}
