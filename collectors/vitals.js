// Collector: system vitals from /proc + sysfs. Snapshot every 2s.
// Emits: snapshot { cpu:{overall,cores[]}, mem:{used_kb,total_kb,pct},
//          temp_c, load[3], uptime_s, disk:{used_kb,total_kb,pct} }
'use strict';
const fs = require('fs');
const { execFile } = require('child_process');

function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } }

let prevCpu = null;
function cpuSample() {
  const txt = read('/proc/stat');
  if (!txt) return null;
  const cpus = [];
  for (const line of txt.split('\n')) {
    const m = line.match(/^(cpu\d*)\s+(.*)$/);
    if (!m) continue;
    const v = m[2].trim().split(/\s+/).map(Number);
    const idle = v[3] + (v[4] || 0);
    const total = v.reduce((a, b) => a + b, 0);
    cpus.push({ id: m[1], idle, total });
  }
  return cpus;
}
function cpuPct() {
  const cur = cpuSample();
  if (!cur) return null;
  let out = null;
  if (prevCpu) {
    out = cur.map((c, i) => {
      const p = prevCpu[i];
      if (!p || p.id !== c.id) return { id: c.id, pct: 0 };
      const dt = c.total - p.total, di = c.idle - p.idle;
      const pct = dt > 0 ? (1 - di / dt) * 100 : 0;
      return { id: c.id, pct: Math.max(0, Math.min(100, pct)) };
    });
  }
  prevCpu = cur;
  return out;
}
function memInfo() {
  const txt = read('/proc/meminfo');
  if (!txt) return null;
  const vals = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^(\w+):\s+(\d+)/);
    if (m) vals[m[1]] = +m[2];
  }
  const total = vals.MemTotal || 0, avail = vals.MemAvailable || 0;
  return { total_kb: total, used_kb: total - avail, pct: total ? ((total - avail) / total) * 100 : 0 };
}
function socTemp() {
  const t = read('/sys/class/thermal/thermal_zone0/temp');
  return t ? parseFloat(t) / 1000 : null;
}
function loadAvg() {
  const t = read('/proc/loadavg');
  return t ? t.trim().split(/\s+/).slice(0, 3).map(Number) : null;
}
function uptimeS() {
  const t = read('/proc/uptime');
  return t ? Math.floor(parseFloat(t.split(' ')[0])) : null;
}

let disk = null;
function pollDisk() {
  execFile('df', ['-k', '--output=size,used', '/'], (err, out) => {
    if (err || !out) return;
    const parts = out.trim().split('\n')[1];
    if (!parts) return;
    const nums = parts.trim().split(/\s+/).map(Number);
    if (nums.length >= 2 && nums[0] > 0) {
      disk = { total_kb: nums[0], used_kb: nums[1], pct: (nums[1] / nums[0]) * 100 };
    }
  });
}

module.exports = {
  start(bus, api) {
    pollDisk();
    setInterval(pollDisk, 30000);
    const tick = () => {
      const cpus = cpuPct();
      api.setSnapshot({
        cpu: cpus ? { overall: +cpus[0].pct.toFixed(1), cores: cpus.slice(1).map((c) => +c.pct.toFixed(1)) } : null,
        mem: memInfo(),
        temp_c: socTemp(),
        load: loadAvg(),
        uptime_s: uptimeS(),
        disk,
      });
    };
    tick();
    setInterval(tick, 2000);
    bus.emit('event', { source: 'vitals', category: 'system', severity: 'info',
      message: 'vitals collector online (2s cadence)' });
  },
};
