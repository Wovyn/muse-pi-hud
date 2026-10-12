// Collector: flight-recorder audit tail.
// Watches ~/.local/share/muse-audit/ for JSONL command logs and streams each
// record into the HUD event console as { category:'command' }.
// If the directory doesn't exist yet (flight recorder not built), the
// collector parks in 'waiting' and re-checks every 60s — no error, no noise.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const AUDIT_DIR = path.join(os.homedir(), '.local', 'share', 'muse-audit');
const POLL_MS = 3000;

function startTailing(bus, api) {
  let file = null, offset = 0;
  const pickFile = () => {
    let files = [];
    try { files = fs.readdirSync(AUDIT_DIR).filter((f) => f.endsWith('.jsonl')).sort(); }
    catch (e) { return null; }
    return files.length ? path.join(AUDIT_DIR, files[files.length - 1]) : null;
  };
  const tail = () => {
    const f = pickFile();
    if (!f) return;
    if (f !== file) { file = f; offset = 0; } // new day's log (or first sighting)
    let st;
    try { st = fs.statSync(file); } catch (e) { return; }
    if (st.size < offset) offset = 0; // truncated/rotated
    if (st.size === offset) return;
    let chunk;
    try {
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(st.size - offset);
      fs.readSync(fd, buf, 0, buf.length, offset);
      fs.closeSync(fd);
      chunk = buf.toString('utf8');
    } catch (e) { return; }
    offset = st.size;
    for (const line of chunk.split('\n')) {
      if (!line.trim()) continue;
      let rec;
      try { rec = JSON.parse(line); } catch (e) { continue; }
      bus.emit('event', {
        source: 'audit',
        category: 'command',
        severity: rec.exit_code && rec.exit_code !== 0 ? 'warn' : 'info',
        message: (rec.task ? '[' + rec.task + '] ' : '') + (rec.command || JSON.stringify(rec)),
        data: rec,
      });
    }
  };
  api.setStatus('live', 'tailing ' + AUDIT_DIR);
  bus.emit('event', { source: 'audit', category: 'system', severity: 'info',
    message: 'audit log found — tailing flight-recorder JSONL' });
  tail();
  setInterval(tail, POLL_MS);
}

function waitForDir(bus, api) {
  api.setStatus('waiting', 'audit dir not present yet: ' + AUDIT_DIR);
  bus.emit('event', { source: 'audit', category: 'system', severity: 'info',
    message: 'flight recorder not present yet — audit collector waiting' });
  const timer = setInterval(() => {
    if (fs.existsSync(AUDIT_DIR)) {
      clearInterval(timer);
      startTailing(bus, api);
    }
  }, 60000);
  if (timer.unref) timer.unref();
}

module.exports = {
  start(bus, api) {
    if (fs.existsSync(AUDIT_DIR)) startTailing(bus, api);
    else waitForDir(bus, api);
  },
};
