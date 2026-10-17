// Muse-Pi-1 HUD — skeleton server.
// Plain Node.js (no build step). Serves the dashboard UI, a WebSocket event
// feed, and a tiny REST API. Collectors plug in via a small interface
// documented in README.md. No sudo required; runs as the musecell user.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const WebSocket = require('ws');
const PKG = require('./package.json');

const PORT = parseInt(process.env.HUD_PORT || '8080', 10);
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');

// ---- internal event bus -------------------------------------------------
const bus = new EventEmitter();
bus.setMaxListeners(100);

// Latest snapshot state, keyed by collector name.
const snapshot = {
  server: { started: new Date().toISOString(), port: PORT, node: process.version },
  collectors: {},
};

// Console event ring buffer (last 500).
const eventLog = [];
let wss = null; // assigned once the WebSocket server is created below
function pushEvent(ev) {
  const e = Object.assign({ t: new Date().toISOString() }, ev);
  eventLog.push(e);
  if (eventLog.length > 500) eventLog.shift();
  broadcast({ type: 'event', event: e });
}
bus.on('event', pushEvent);

// ---- collector registry (plugin interface, see README.md) ----------------
const collectors = [];
function registerCollector(name, mod) {
  collectors.push(name);
  snapshot.collectors[name] = { status: 'starting', updated: new Date().toISOString() };
  const api = {
    setSnapshot(data) {
      snapshot.collectors[name] = { status: 'live', updated: new Date().toISOString(), data };
      broadcast({ type: 'snapshot', collector: name, data: snapshot.collectors[name] });
    },
    setStatus(status, note) {
      snapshot.collectors[name] = { status, note: note || '', updated: new Date().toISOString() };
      broadcast({ type: 'snapshot', collector: name, data: snapshot.collectors[name] });
    },
  };
  try {
    mod.start(bus, api);
  } catch (err) {
    snapshot.collectors[name] = { status: 'error', note: String((err && err.message) || err) };
    pushEvent({ source: name, category: 'system', severity: 'error',
      message: 'collector failed to start: ' + ((err && err.message) || err) });
  }
}

for (const name of ['vitals', 'processes', 'network', 'mqtt', 'audit']) {
  registerCollector(name, require('./collectors/' + name + '.js'));
}

// ---- static files --------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (file !== path.join(PUBLIC, 'index.html') && !file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/snapshot') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(snapshot));
    return;
  }
  if (url === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(eventLog.slice(-200)));
    return;
  }
  if (url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: PKG.version, uptime_s: Math.floor(process.uptime()) }));
    return;
  }
  serveStatic(req, res);
});

// ---- WebSocket feed ------------------------------------------------------
wss = new WebSocket.Server({ server, path: '/ws' });
function broadcast(msg) {
  if (!wss) return; // collectors emit during startup, before the WS server exists
  const s = JSON.stringify(msg);
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) { try { c.send(s); } catch (e) { /* drop */ } }
  }
}
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', version: PKG.version, snapshot, events: eventLog.slice(-100) }));
});

pushEvent({ source: 'hud', category: 'system', severity: 'info',
  message: 'HUD server online — ' + collectors.length + ' collectors registered' });
server.listen(PORT, '0.0.0.0', () => console.log('HUD listening on 0.0.0.0:' + PORT));
