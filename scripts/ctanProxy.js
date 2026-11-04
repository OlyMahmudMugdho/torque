const CTAN_HOSTS = new Set(['www.ctan.org', 'mirrors.ctan.org']);

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
  return true;
}

export async function handleCtanRequest(req, res, requestUrl) {
  if (!requestUrl.pathname.startsWith('/api/ctan/')) {
    return false;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return true;
  }
  if (req.method !== 'GET') return false;

  try {
    if (requestUrl.pathname === '/api/ctan/search') {
      const phrase = requestUrl.searchParams.get('phrase')?.trim();
      if (!phrase) return writeJson(res, 400, { error: 'Missing phrase' });
      const target = new URL('https://www.ctan.org/search/json');
      target.searchParams.set('phrase', phrase);
      target.searchParams.set('max', requestUrl.searchParams.get('max') || '32');
      target.searchParams.set('ext', 'true');
      target.searchParams.set('PKG', 'true');
      const response = await fetch(target);
      return writeJson(res, response.status, await response.json());
    }

    const packageMatch = requestUrl.pathname.match(/^\/api\/ctan\/package\/([^/]+)$/);
    if (packageMatch) {
      const packageId = decodeURIComponent(packageMatch[1]);
      const response = await fetch(`https://www.ctan.org/json/3.0/pkg/${encodeURIComponent(packageId)}`);
      const body = response.status === 404 ? { error: 'Package not found' } : await response.json();
      return writeJson(res, response.status, body);
    }

    if (requestUrl.pathname === '/api/ctan/download') {
      const rawTarget = requestUrl.searchParams.get('url');
      if (!rawTarget) return writeJson(res, 400, { error: 'Missing download URL' });
      const target = new URL(rawTarget);
      if (target.protocol !== 'https:' || !CTAN_HOSTS.has(target.hostname)) {
        return writeJson(res, 400, { error: 'Only official CTAN hosts are allowed' });
      }
      const response = await fetch(target);
      if (!response.ok) {
        res.writeHead(response.status, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(`CTAN returned HTTP ${response.status}`);
        return true;
      }
      const data = Buffer.from(await response.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
        'Content-Length': data.length,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(data);
      return true;
    }

    writeJson(res, 404, { error: 'Unknown CTAN endpoint' });
  } catch (error) {
    console.error(`[ctan-proxy] ${req.method} ${requestUrl.pathname} failed:`, error);
    writeJson(res, 502, { error: error?.message || 'CTAN request failed' });
  }
  return true;
}
