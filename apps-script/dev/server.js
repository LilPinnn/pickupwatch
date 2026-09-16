/**
 * Local dev server so `Index.html` and the login/session flow can be
 * iterated on without pushing to Apps Script every time. Not used in
 * production — Apps Script serves Index.html itself via doGet().
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const PORT = process.env.PORT || 3000;
const INDEX_HTML_PATH = path.join(__dirname, '../src/Index.html');
const SHIM_PATH = path.join(__dirname, 'script-run-shim.js');

const API = { login: store.login, logout: store.logout, getConfig: store.getConfig, saveConfig: store.saveConfig, fetchAllStock: store.fetchAllStock };

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function serveIndex(res) {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  // Inject the google.script.run shim right after <head> so it's defined
  // before Index.html's own <script> block runs.
  const withShim = html.replace('<head>', '<head>\n  <script src="/__shim.js"></script>');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(withShim);
}

function serveShim(res) {
  const js = fs.readFileSync(SHIM_PATH, 'utf8');
  res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
  res.end(js);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') return serveIndex(res);
    if (req.method === 'GET' && req.url === '/__shim.js') return serveShim(res);

    if (req.method === 'POST' && req.url.startsWith('/__api__/')) {
      const fnName = req.url.slice('/__api__/'.length);
      const fn = API[fnName];
      if (!fn) return sendJson(res, 404, { message: 'Unknown function: ' + fnName });

      const { args } = await readBody(req);
      const result = await fn(...(args || []));
      return sendJson(res, 200, result);
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    sendJson(res, err.status || 500, { message: err.message || String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`[dev] Apple Fulfillment Monitor running at http://localhost:${PORT}`);
  console.log('[dev] set MOCK_APPLE=1 to skip real calls to apple.com while iterating on the UI');
});
