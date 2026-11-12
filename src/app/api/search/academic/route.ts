import { NextResponse } from 'next/server';
import { searchAcademic } from '../../../../ai/searchService';

export const dynamic = 'force-static';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
};

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

    const source = (searchParams.get('source') as 'all' | 'arxiv' | 'semanticscholar') || undefined;
    const maxResultsParam = searchParams.get('maxResults');
    const maxResults = maxResultsParam ? parseInt(maxResultsParam, 10) : undefined;

    const results = await searchAcademic(query.trim(), {
      source,
      maxResults: Number.isFinite(maxResults) ? maxResults : undefined,
    });

    return NextResponse.json({ results }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Academic search failed' },
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

    const source = (body?.source as 'all' | 'arxiv' | 'semanticscholar') || undefined;
    const maxResults =
      typeof body?.maxResults === 'number'
        ? body.maxResults
        : body?.maxResults
        ? parseInt(body.maxResults, 10)
        : undefined;

    const results = await searchAcademic(query.trim(), {
      source,
      maxResults: Number.isFinite(maxResults) ? maxResults : undefined,
    });

    return NextResponse.json({ results }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Academic search failed' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
