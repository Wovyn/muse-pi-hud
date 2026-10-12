// Collector: per-interface network throughput from sysfs.
// Snapshot every 2s: { interfaces: { <iface>: { rx_bytes, tx_bytes, rx_rate, tx_rate, state } },
//                      total: { rx_rate, tx_rate }, sampled }.
// Interfaces are discovered dynamically; loopback is excluded. Rates are bytes/sec
// computed from counter deltas; a first sighting or counter reset yields 0.
'use strict';
const fs = require('fs');

const NET_BASE = '/sys/class/net';

function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } }

function discover() {
  try {
    return fs.readdirSync(NET_BASE).filter((n) => n !== 'lo');
  } catch (e) { return []; }
}

let prev = {}; // iface -> { rx, tx, at }

module.exports = {
  start(bus, api) {
    const tick = () => {
      const now = Date.now();
      const interfaces = {};
      let totalRx = 0, totalTx = 0;
      for (const iface of discover()) {
        const rx = Number(read(`${NET_BASE}/${iface}/statistics/rx_bytes`) || 0) || 0;
        const tx = Number(read(`${NET_BASE}/${iface}/statistics/tx_bytes`) || 0) || 0;
        const state = (read(`${NET_BASE}/${iface}/operstate`) || '').trim() || 'unknown';
        const p = prev[iface];
        let rxRate = 0, txRate = 0;
        if (p && now > p.at) {
          const dt = (now - p.at) / 1000;
          if (dt > 0) {
            // clamp at 0: counters can reset when an interface bounces
            rxRate = Math.max(0, (rx - p.rx) / dt);
            txRate = Math.max(0, (tx - p.tx) / dt);
          }
        }
        prev[iface] = { rx, tx, at: now };
        interfaces[iface] = {
          rx_bytes: rx,
          tx_bytes: tx,
          rx_rate: +rxRate.toFixed(1),
          tx_rate: +txRate.toFixed(1),
          state,
        };
        totalRx += rxRate;
        totalTx += txRate;
      }
      api.setSnapshot({
        interfaces,
        total: { rx_rate: +totalRx.toFixed(1), tx_rate: +totalTx.toFixed(1) },
        sampled: new Date().toISOString(),
      });
    };
    tick();
    setInterval(tick, 2000);
    bus.emit('event', { source: 'network', category: 'network', severity: 'info',
      message: 'network collector online (2s cadence)' });
  },
};
