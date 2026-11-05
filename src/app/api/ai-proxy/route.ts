import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    },
  });
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'ai-proxy' });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { url, method = 'POST', headers = {}, body, stream = false } = payload || {};

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: url' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const forwardHeaders: Record<string, string> = {};
    if (headers && typeof headers === 'object') {
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() !== 'host') {
          forwardHeaders[k] = String(v);
        }
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers: forwardHeaders,
    };

    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const upstreamRes = await fetch(url, fetchOptions);

    if (stream && upstreamRes.body) {
      return new NextResponse(upstreamRes.body as any, {
        status: upstreamRes.status,
        statusText: upstreamRes.statusText,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const text = await upstreamRes.text();
    const contentType = upstreamRes.headers.get('content-type') || 'application/json';

    return new NextResponse(text, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Proxy request failed: ${err?.message || String(err)}` },
      { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
