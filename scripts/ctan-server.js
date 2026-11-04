import http from 'node:http';
import { handleCtanRequest } from './ctanProxy.js';

const port = Number(process.env.CTAN_PROXY_PORT || 8787);
const server = http.createServer(async (req, res) => {
  // Set CORS before routing so startup-level errors, unknown paths, and
  // upstream failures all remain readable to the development browser.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (!(await handleCtanRequest(req, res, requestUrl))) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    }
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: error?.message || 'CTAN proxy failed' }));
  }
});

server.listen(port, () => {
  console.log(`Torque CTAN proxy ready on http://localhost:${port}`);
});
server.on('error', (error) => {
  console.error(`Torque CTAN proxy could not listen on port ${port}: ${error.message}`);
  process.exitCode = 1;
});
