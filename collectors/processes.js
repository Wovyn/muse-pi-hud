// Collector: process list with per-process CPU% and memory.
// Snapshot every 5s: { count, top:[{pid, ppid, name, cpu_pct, mem_kb}], sampled }.
// The `top` array is the data source for the animated "process
// constellation" visualization — nodes sized/positioned by activity.
'use strict';
const fs = require('fs');
const CLK_TCK = 100;

function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } }

function sampleProcs() {
  let entries;
  try { entries = fs.readdirSync('/proc'); } catch (e) { return []; }
  const out = [];
  for (const e of entries) {
    if (!/^\d+$/.test(e)) continue;
    const stat = read('/proc/' + e + '/stat');
    if (!stat) continue;
    const lparen = stat.indexOf('('), rparen = stat.lastIndexOf(')');
    if (lparen < 0 || rparen < 0) continue;
    const name = stat.slice(lparen + 1, rparen);
    const rest = stat.slice(rparen + 2).trim().split(/\s+/);
    // fields after comm: [0]=state, [1]=ppid, [11]=utime, [12]=stime
    const ppid = +rest[1] || 0;
    const utime = +rest[11] || 0, stime = +rest[12] || 0;
    const sm = read('/proc/' + e + '/statm');
    const rssPages = sm ? (+sm.split(/\s+/)[1] || 0) : 0;
    out.push({ pid: +e, ppid, name, ticks: utime + stime, mem_kb: rssPages * 4 });
  }
  return out;
}

let prev = new Map(); // pid -> { ticks, at }
module.exports = {
  start(bus, api) {
    const tick = () => {
      const now = Date.now();
      const list = sampleProcs();
      const scored = list.map((p) => {
        const old = prev.get(p.pid);
        let cpu = 0;
        if (old && p.ticks >= old.ticks && now > old.at) {
          const dtTicks = (p.ticks - old.ticks) / CLK_TCK;
          const dtWall = (now - old.at) / 1000;
          cpu = dtWall > 0 ? Math.max(0, Math.min(100, (dtTicks / dtWall) * 100)) : 0;
        }
        return { pid: p.pid, ppid: p.ppid, name: p.name, cpu_pct: +cpu.toFixed(1), mem_kb: p.mem_kb };
      });
      prev = new Map(list.map((p) => [p.pid, { ticks: p.ticks, at: now }]));
      scored.sort((a, b) => (b.cpu_pct - a.cpu_pct) || (b.mem_kb - a.mem_kb));
      api.setSnapshot({ count: list.length, top: scored.slice(0, 15), sampled: new Date().toISOString() });
    };
    tick();
    setInterval(tick, 5000);
    bus.emit('event', { source: 'processes', category: 'system', severity: 'info',
      message: 'processes collector online (5s cadence)' });
  },
};
