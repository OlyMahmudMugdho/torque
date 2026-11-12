import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { searchWeb } from '../../../../ai/searchService';
import type { SearchSettings } from '../../../../types/ai';

export const dynamic = 'force-static';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
};

function getLocalSearchSettings(): SearchSettings | undefined {
  try {
    const configPath = path.join(os.homedir(), '.torque', 'ai_config.json');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed?.search) {
        return parsed.search;
      }
    }
  } catch {
    // Ignore error
  }
  return undefined;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    if (!query || !query.trim()) {
      return NextResponse.json(
        { error: 'Missing required parameter: query' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const maxResultsParam = searchParams.get('maxResults');
    const maxResults = maxResultsParam ? parseInt(maxResultsParam, 10) : undefined;

    let settings: SearchSettings | undefined;
    const provider = searchParams.get('provider') as 'free' | 'tavily' | 'brave' | null;
    const apiKey = searchParams.get('apiKey');
    if (provider) {
      settings = { provider, ...(apiKey ? { apiKey } : {}) };
    } else {
      settings = getLocalSearchSettings();
    }

    const results = await searchWeb(
      query.trim(),
      settings,
      Number.isFinite(maxResults) ? maxResults : undefined
    );

    return NextResponse.json({ results }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Web search failed' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function POST(request: Request) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const query =
      typeof body?.query === 'string' && body.query.trim()
        ? body.query
        : new URL(request.url).searchParams.get('query');

    if (!query || !query.trim()) {
      return NextResponse.json(
        { error: 'Missing required parameter: query' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const maxResults =
      typeof body?.maxResults === 'number'
        ? body.maxResults
        : body?.maxResults
        ? parseInt(body.maxResults, 10)
        : undefined;

    let settings: SearchSettings | undefined = body?.settings;
    if (!settings && body?.provider) {
      settings = {
        provider: body.provider,
        ...(body.apiKey ? { apiKey: body.apiKey } : {}),
      };
    }
    if (!settings) {
      settings = getLocalSearchSettings();
    }

    const results = await searchWeb(
      query.trim(),
      settings,
      Number.isFinite(maxResults) ? maxResults : undefined
    );

    return NextResponse.json({ results }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Web search failed' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
