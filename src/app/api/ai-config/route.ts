import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const dynamic = 'force-static';

function getAiConfigPath(): string {
  const home = os.homedir();
  const torqueDir = path.join(home, '.torque');
  return path.join(torqueDir, 'ai_config.json');
}

export async function GET() {
  try {
    const configPath = getAiConfigPath();
    if (!fs.existsSync(configPath)) {
      return NextResponse.json(
        { error: `AI config file not found at ${configPath}` },
        { status: 404 }
      );
    }

    const content = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(content);
    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to read AI config' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const configPath = getAiConfigPath();
    const torqueDir = path.dirname(configPath);
    if (!fs.existsSync(torqueDir)) {
      fs.mkdirSync(torqueDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(body, null, 2), 'utf8');
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to save AI config' },
      { status: 500 }
    );
  }
}
