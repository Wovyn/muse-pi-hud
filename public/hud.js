/* MUSE-PI-1 HUD client — gauges, trend scope, process constellation,
   event console, synthesized sound engine.
   No build step. ECharts is vendored locally (vendor/echarts.min.js). */
(function () {
'use strict';

var CATS = ['system', 'sensor', 'command', 'network', 'app'];
/* ---------- theme palette (dark / light) ---------- */
var PAL = {};
function buildPalette() {
  var light = document.body.classList.contains('light');
  return {
    cat: light
      ? { system: '#0a7d99', sensor: '#0d8a4e', command: '#a86e00', network: '#8a3fd1', app: '#5468d8' }
      : { system: '#35e0ff', sensor: '#52ffa8', command: '#ffc857', network: '#d07bff', app: '#8f9bff' },
    gauge: light ? '#0a8aa8' : '#35e0ff',
    gaugeTrack: light ? 'rgba(10,138,168,0.20)' : 'rgba(53,224,255,0.15)',
    gaugeDetail: light ? '#0b3d4d' : '#c9f2ff',
    net: light ? '#8a3fd1' : '#d07bff',
    ifaces: light ? ['#0a8aa8', '#0d8a4e', '#a86e00', '#8a3fd1', '#cf3542', '#5468d8']
                  : ['#35e0ff', '#52ffa8', '#ffc857', '#d07bff', '#ff5f6b', '#8f9bff'],
    axisLabel: light ? '#5f7f8f' : '#5b7d8c',
    splitLine: light ? 'rgba(10,80,110,0.16)' : 'rgba(14,58,77,0.6)',
    procLine: light ? 'rgba(10,120,150,0.40)' : 'rgba(53,224,255,0.28)',
    procLabel: light ? 'rgba(25,85,105,0.9)' : 'rgba(158,208,228,0.8)',
    tipBg: light ? 'rgba(255,255,255,0.97)' : 'rgba(4,28,40,0.95)',
    tipBorder: light ? '#9fc6d4' : '#0e3a4d',
    tipText: light ? '#0b3d4d' : '#c9f2ff'
  };
}
function refreshPalette() { PAL = buildPalette(); }
var SEV_RANK = { info: 0, warn: 1, error: 2 };

/* ---------- tiny persistent settings ---------- */
var store = {
  get: function (k, d) { try { var v = localStorage.getItem('hud:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem('hud:' + k, JSON.stringify(v)); } catch (e) {} },
};

/* ---------- sound engine (WebAudio, fully synthesized) ---------- */
var Sound = {
  ctx: null, master: store.get('snd.master', true), vol: store.get('snd.vol', 50),
  cats: store.get('snd.cats', { system: true, sensor: true, command: true, network: true, app: true }),
  ensure: function () {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  // category -> [freqHz, durationMs, waveType, gainScale]
  voice: function (cat, sev) {
    if (sev === 'error') return [196, 320, 'sawtooth', 0.5];
    if (sev === 'warn') return [392, 160, 'triangle', 0.4];
    var m = {
      system: [660, 70, 'sine', 0.25], sensor: [880, 60, 'sine', 0.22],
      command: [520, 70, 'square', 0.12], network: [740, 90, 'triangle', 0.25],
      app: [600, 80, 'sine', 0.22],
    };
    return m[cat] || [500, 70, 'sine', 0.2];
  },
  play: function (cat, sev) {
    if (!this.master || !this.cats[cat]) return;
    this.ensure();
    if (!this.ctx) return;
    var v = this.voice(cat, sev || 'info');
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = v[2]; o.frequency.setValueAtTime(v[0], t);
    var peak = (this.vol / 100) * v[3];
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + v[1] / 1000);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + v[1] / 1000 + 0.05);
  },
};
document.addEventListener('pointerdown', function once() { Sound.ensure(); }, { once: false });

/* ---------- audit event details ----------
   Flight-recorder records carry the real payload in `detail` (the shell
   command text or the file path); `message` only holds the command type.
   This renders that payload as a dim second line under the event row. */
function fmtBytes(b) {
  b = +b || 0;
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}
function auditDetail(ev) {
  var r = ev.data;
  if (!r || typeof r !== 'object' || !r.command) return null;
  var detail = String(r.detail == null ? '' : r.detail);
  var prefix = r.command === 'system.run' ? '$ ' : '';
  var meta = [];
  if (r.duration_ms !== undefined && r.duration_ms !== null && r.duration_ms !== '') meta.push(r.duration_ms + 'ms');
  if (+r.bytes > 0) meta.push(fmtBytes(r.bytes));
  if (r.status && r.status !== 'ok') meta.push('status=' + r.status);
  var full = (prefix + detail + (meta.length ? '   ·   ' + meta.join(' · ') : '')).trim();
  if (!full) return null;
  return { short: full.length > 170 ? full.slice(0, 167) + '…' : full, full: full };
}

/* ---------- event console ---------- */
var Console_ = {
  el: document.getElementById('console'),
  paused: store.get('con.paused', false), lock: store.get('con.lock', true),
  minSev: store.get('con.sev', 'info'), count: 0,
  add: function (ev) {
    if (SEV_RANK[ev.severity || 'info'] < SEV_RANK[this.minSev]) return;
    this.count++;
    var row = document.createElement('div');
    row.className = 'ev sev-' + (ev.severity || 'info');
    var ts = document.createElement('span'); ts.className = 'ts';
    ts.textContent = (ev.t || '').slice(11, 19) + ' ';
    var tag = document.createElement('span'); tag.className = 'src cat-' + (ev.category || 'system');
    tag.textContent = '[' + (ev.source || '?') + '/' + (ev.category || 'system') + '] ';
    var msg = document.createElement('span'); msg.textContent = ev.message || '';
    row.appendChild(ts); row.appendChild(tag); row.appendChild(msg);
    var det = auditDetail(ev);
    if (det) {
      var dEl = document.createElement('div');
      dEl.className = 'ev-detail';
      dEl.textContent = det.short;
      if (det.full !== det.short) dEl.title = det.full;
      row.appendChild(dEl);
    }
    this.el.appendChild(row);
    while (this.el.children.length > 300) this.el.removeChild(this.el.firstChild);
    if (!this.paused && this.lock) this.el.scrollTop = this.el.scrollHeight;
    document.getElementById('ev-count').textContent = this.count + ' events';
    Sound.play(ev.category || 'system', ev.severity || 'info');
  },
  clear: function () { this.el.innerHTML = ''; },
};
function syncConsoleControls() {
  var p = document.getElementById('btn-pause');
  p.classList.toggle('active', Console_.paused);
  p.textContent = Console_.paused ? 'RESUME' : 'PAUSE';
  document.getElementById('btn-lock').classList.toggle('active', Console_.lock);
  document.getElementById('sev-filter').value = Console_.minSev;
}
document.getElementById('btn-pause').addEventListener('click', function () {
  Console_.paused = !Console_.paused;
  store.set('con.paused', Console_.paused);
  syncConsoleControls();
});
document.getElementById('btn-lock').addEventListener('click', function () {
  Console_.lock = !Console_.lock;
  store.set('con.lock', Console_.lock);
  syncConsoleControls();
});
document.getElementById('sev-filter').addEventListener('change', function () {
  Console_.minSev = this.value;
  store.set('con.sev', this.value);
});
document.getElementById('btn-clear').addEventListener('click', function () { Console_.clear(); });
document.getElementById('btn-theme').addEventListener('click', function () {
  applyTheme(document.body.classList.contains('light') ? 'dark' : 'light', false);
});

/* ---------- rolling history for every metric ----------
   Ring buffers keyed by metric id. Snapshots arrive ~every 2s;
   HIST_CAP samples ~= 30 minutes of rolling history, so switching
   the trend scope never starts from an empty chart. */
var HIST_CAP = 900;
var Hist = {
  bufs: {},
  push: function (id, v) {
    if (v === null || v === undefined || isNaN(v)) return;
    var b = this.bufs[id] || (this.bufs[id] = []);
    b.push(+v);
    if (b.length > HIST_CAP) b.splice(0, b.length - HIST_CAP);
  },
  get: function (id) { return this.bufs[id] || []; },
};

/* ---------- formatting ---------- */
function fmtRate(bps) {
  if (bps < 1024) return Math.round(bps) + ' B/s';
  if (bps < 1048576) return (bps / 1024).toFixed(1) + ' KB/s';
  return (bps / 1048576).toFixed(2) + ' MB/s';
}
function niceCeil(v) {
  if (!(v > 0)) return 1;
  var p = Math.pow(10, Math.floor(Math.log10(v)));
  var n = v / p;
  var m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return m * p;
}
function fmtUptime(s) {
  if (s === null || s === undefined) return '—';
  var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return (d ? d + 'd ' : '') + h + 'h ' + m + 'm';
}

/* ---------- gauges (ECharts) ---------- */
var gauges = {};
function gaugeOption(name, max, unit, fmtFn) {
  return {
    series: [{
      type: 'gauge', min: 0, max: max,
      progress: { show: true, width: 8, itemStyle: { color: PAL.gauge } },
      axisLine: { lineStyle: { width: 8, color: [[1, PAL.gaugeTrack]] } },
      axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
      pointer: { show: false }, anchor: { show: false },
      title: { show: false },
      detail: { valueAnimation: true, fontSize: 20, color: PAL.gaugeDetail, fontFamily: 'inherit',
        formatter: fmtFn || ('{value}' + unit), offsetCenter: [0, '35%'] },
      data: [{ value: 0, name: name }],
    }],
  };
}
var gaugeDefs = {};
function buildGaugeOption(id) {
  var d = gaugeDefs[id];
  var opt = gaugeOption(id, d.max, d.unit);
  if (d.rate) {
    opt.series[0].detail.formatter = function (v) { return fmtRate(v); };
    opt.series[0].progress.itemStyle.color = PAL.net;
  }
  return opt;
}
var netPeak = { rx: 2048, tx: 2048 }; // adaptive gauge ceilings, bytes/s
function initCharts() {
  if (!window.echarts) {
    document.querySelectorAll('.gauge-chart').forEach(function (el) {
      el.innerHTML = '<div class="dim" style="padding-top:40px;text-align:center">charts n/a</div>';
    });
    return;
  }
  var defs = [
    ['g-cpu', 100, '%', false], ['g-mem', 100, '%', false],
    ['g-temp', 100, '°C', false], ['g-disk', 100, '%', false],
    ['g-netrx', 2048, '', true], ['g-nettx', 2048, '', true],
  ];
  defs.forEach(function (g) {
    gaugeDefs[g[0]] = { max: g[1], unit: g[2], rate: g[3] };
    var c = echarts.init(document.getElementById(g[0]));
    c.setOption(buildGaugeOption(g[0]));
    gauges[g[0]] = c;
  });
  // every gauge is clickable -> retargets the trend scope
  document.querySelectorAll('.gauge[data-metric]').forEach(function (el) {
    el.addEventListener('click', function () { selectMetric(el.getAttribute('data-metric')); });
    el.title = 'click to trend this metric';
  });
  trendChart = echarts.init(document.getElementById('trend-chart'));
  trendChart.setOption(trendBaseOption());
  initProcGraph();
  selectMetric(store.get('trend.metric', 'cpu'));
  window.addEventListener('resize', function () {
    Object.keys(gauges).forEach(function (k) { gauges[k].resize(); });
    if (trendChart) trendChart.resize();
    if (procGraph) procGraph.resize();
  });
}
function setGauge(id, v) {
  if (gauges[id]) gauges[id].setOption({ series: [{ data: [{ value: Math.round(v * 10) / 10 }] }] });
}
function setRateGauge(id, rate) {
  var g = gauges[id];
  if (!g) return;
  var dir = id === 'g-netrx' ? 'rx' : 'tx';
  if (rate > netPeak[dir]) netPeak[dir] = rate;
  var max = niceCeil(Math.max(netPeak[dir] * 1.25, 2048));
  g.setOption({ series: [{ max: max, data: [{ value: rate }] }] });
}

/* ---------- trend scope: click any gauge, chart follows ----------
   Every metric keeps full rolling history, so switching renders
   the retained buffer immediately — never an empty chart. */
var trendChart = null;
var trendMetric = 'cpu';
var netIfaces = []; // discovered from the network collector

function trendDef() {
  // -> { label, yMax ('auto' ok), yFmt(v), series: [{key, name, color, width}] }
  switch (trendMetric) {
    case 'mem':   return { label: 'MEM', unit: '%', yMax: 100,
      yFmt: function (v) { return v + '%'; },
      series: [{ key: 'mem', name: 'MEM', color: PAL.gauge, width: 2 }] };
    case 'temp':  return { label: 'SOC TEMP', unit: '°C', yMax: 100,
      yFmt: function (v) { return v + '°'; },
      series: [{ key: 'temp', name: 'TEMP', color: PAL.gauge, width: 2 }] };
    case 'disk':  return { label: 'DISK', unit: '%', yMax: 100,
      yFmt: function (v) { return v + '%'; },
      series: [{ key: 'disk', name: 'DISK', color: PAL.gauge, width: 2 }] };
    case 'netrx':
    case 'nettx': {
      var dir = trendMetric === 'netrx' ? 'rx' : 'tx';
      var s = [{ key: 'net.' + dir + '.total', name: 'TOTAL', color: PAL.gauge, width: 2.2 }];
      netIfaces.forEach(function (iface, i) {
        s.push({ key: 'net.' + dir + '.' + iface, name: iface.toUpperCase(),
                 color: PAL.ifaces[(i + 1) % PAL.ifaces.length], width: 1.2 });
      });
      return { label: trendMetric === 'netrx' ? 'NET RX' : 'NET TX', unit: 'B/s', yMax: 'auto',
        yFmt: function (v) { return fmtRate(v); }, series: s };
    }
    default:      return { label: 'CPU', unit: '%', yMax: 100,
      yFmt: function (v) { return v + '%'; },
      series: [{ key: 'cpu', name: 'CPU', color: PAL.gauge, width: 2 }] };
  }
}
function trendBaseOption() {
  return {
    grid: { left: 44, right: 8, top: 8, bottom: 18 },
    xAxis: { type: 'category', show: false, boundaryGap: false },
    yAxis: { type: 'value', min: 0,
      axisLabel: { color: PAL.axisLabel, fontSize: 9 },
      splitLine: { lineStyle: { color: PAL.splitLine } } },
    series: [],
    animationDuration: 300,
  };
}
function renderTrend() {
  if (!trendChart) return;
  var def = trendDef();
  var series = def.series.map(function (s) {
    return { name: s.name, type: 'line', data: Hist.get(s.key).slice(),
      showSymbol: false, smooth: true,
      lineStyle: { color: s.color, width: s.width },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [{ offset: 0, color: s.color + '55' }, { offset: 1, color: s.color + '05' }] } } };
  });
  var yMax = def.yMax === 'auto'
    ? function (v) { return niceCeil(Math.max(v.max, 1) * 1.15); }
    : def.yMax;
  trendChart.setOption({
    grid: { left: 44, right: 8, top: 8, bottom: 18 },
    xAxis: { type: 'category', show: false, boundaryGap: false },
    yAxis: { type: 'value', min: 0, max: yMax,
      axisLabel: { color: PAL.axisLabel, fontSize: 9, formatter: def.yFmt },
      splitLine: { lineStyle: { color: PAL.splitLine } } },
    series: series,
    animationDuration: 300,
  }, true);
  document.getElementById('trend-label').textContent = 'TREND // ' + def.label;
}
function selectMetric(id) {
  trendMetric = id;
  store.set('trend.metric', id);
  document.querySelectorAll('.gauge[data-metric]').forEach(function (el) {
    el.classList.toggle('sel', el.getAttribute('data-metric') === id);
  });
  renderTrend();
}

/* ---------- process constellation: force-directed activity graph ----------
   Nodes = top processes by activity; size ~ CPU, color ~ memory,
   edges = real parent->child links (ppid from the collector).
   ECharts force layout gives the drift; data refresh animates it. */
var procGraph = null;
function memColor(memKb, maxMem) {
  var t = maxMem > 0 ? Math.min(1, memKb / maxMem) : 0;
  // cyan (#35e0ff) -> magenta (#d07bff)
  var r = Math.round(53 + (208 - 53) * t);
  var g = Math.round(224 + (123 - 224) * t);
  var b = Math.round(255 + (255 - 255) * t);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
function procGraphOption() {
  return {
    tooltip: { trigger: 'item',
      formatter: function (p) {
        if (p.dataType !== 'node') return '';
        var d = p.data.raw;
        return '<b>' + escapeHtml(d.name) + '</b> [' + d.pid + ']<br/>' +
               'CPU ' + d.cpu_pct + '% &nbsp; MEM ' + fmtMem(d.mem_kb);
      },
      backgroundColor: PAL.tipBg, borderColor: PAL.tipBorder,
      textStyle: { color: PAL.tipText, fontSize: 11 } },
    series: [{
      type: 'graph', layout: 'force',
      force: { repulsion: 70, gravity: 0.12, edgeLength: 55, friction: 0.55, layoutAnimation: true },
      roam: true, draggable: true,
      label: { show: true, position: 'right', fontSize: 9, color: PAL.procLabel },
      emphasis: { focus: 'adjacency', label: { show: true, color: PAL.gaugeDetail, fontSize: 10 } },
      lineStyle: { color: PAL.procLine, width: 1, curveness: 0.15 },
      data: [], links: [],
    }],
    animationDuration: 800, animationEasingUpdate: 'quinticInOut',
  };
}
function initProcGraph() {
  if (!window.echarts) return;
  procGraph = echarts.init(document.getElementById('proc-graph'));
  procGraph.setOption(procGraphOption());
}
function fmtMem(kb) {
  return kb > 1048576 ? (kb / 1048576).toFixed(1) + 'G'
       : kb > 1024 ? (kb / 1024).toFixed(1) + 'M'
       : Math.round(kb) + 'K';
}
function renderProcGraph(top) {
  if (!procGraph || !top || !top.length) return;
  var maxMem = Math.max.apply(null, top.map(function (p) { return p.mem_kb || 0; }).concat([1]));
  var ids = {};
  top.forEach(function (p) { ids[p.pid] = true; });
  var nodes = top.map(function (p) {
    return {
      id: String(p.pid), name: p.name,
      raw: p,
      symbolSize: 9 + Math.sqrt(Math.max(0, p.cpu_pct || 0)) * 5.5,
      itemStyle: { color: memColor(p.mem_kb || 0, maxMem),
        shadowBlur: 12, shadowColor: memColor(p.mem_kb || 0, maxMem) },
    };
  });
  var links = [];
  top.forEach(function (p) {
    if (p.ppid && p.ppid !== p.pid && ids[p.ppid]) links.push({ source: String(p.ppid), target: String(p.pid) });
  });
  procGraph.setOption({ series: [{ data: nodes, links: links }] });
}

/* ---------- snapshot -> UI ---------- */
function renderSnapshot(snap) {
  var cols = snap.collectors || {};
  // vitals
  var w = (cols.vitals && cols.vitals.data) || {};
  if (w.cpu) { setGauge('g-cpu', w.cpu.overall); Hist.push('cpu', w.cpu.overall); }
  if (w.mem) { setGauge('g-mem', w.mem.pct); Hist.push('mem', w.mem.pct); }
  if (w.temp_c !== null && w.temp_c !== undefined) { setGauge('g-temp', w.temp_c); Hist.push('temp', w.temp_c); }
  if (w.disk) { setGauge('g-disk', w.disk.pct); Hist.push('disk', w.disk.pct); }
  document.getElementById('r-load').textContent = w.load ? w.load.join(' ') : '—';
  document.getElementById('r-uptime').textContent = fmtUptime(w.uptime_s);
  // network
  var n = (cols.network && cols.network.data) || {};
  if (n.total) {
    setRateGauge('g-netrx', n.total.rx_rate);
    setRateGauge('g-nettx', n.total.tx_rate);
    Hist.push('net.rx.total', n.total.rx_rate);
    Hist.push('net.tx.total', n.total.tx_rate);
    var ifaces = n.interfaces ? Object.keys(n.interfaces) : [];
    var changed = ifaces.length !== netIfaces.length ||
      ifaces.some(function (f, i) { return netIfaces[i] !== f; });
    netIfaces = ifaces;
    ifaces.forEach(function (iface) {
      var d = n.interfaces[iface];
      Hist.push('net.rx.' + iface, d.rx_rate);
      Hist.push('net.tx.' + iface, d.tx_rate);
    });
    if (changed && (trendMetric === 'netrx' || trendMetric === 'nettx')) renderTrend();
  }
  renderTrend();
  // processes
  var p = (cols.processes && cols.processes.data) || {};
  document.getElementById('r-procs').textContent = p.count !== undefined ? p.count : '—';
  var pl = document.getElementById('proc-list');
  if (p.top && p.top.length) {
    var html = '<div class="proc-row proc-head"><span>PID</span><span>NAME</span>' +
      '<span style="text-align:right">CPU%</span><span style="text-align:right">MEM</span></div>';
    p.top.slice(0, 12).forEach(function (r) {
      var mem = r.mem_kb > 1024 ? (r.mem_kb / 1024).toFixed(1) + 'M' : Math.round(r.mem_kb) + 'K';
      html += '<div class="proc-row"><span class="pid">' + r.pid + '</span>' +
        '<span class="pname">' + escapeHtml(r.name) + '</span>' +
        '<span class="pcpu">' + r.cpu_pct.toFixed(1) + '</span>' +
        '<span class="pmem">' + mem + '</span></div>';
    });
    pl.innerHTML = html;
    renderProcGraph(p.top);
  }
  // collector uplinks
  var cl = document.getElementById('collector-list'), ch = '';
  Object.keys(cols).forEach(function (name) {
    var c = cols[name];
    ch += '<div class="coll-row"><span class="coll-name">' + escapeHtml(name) + '</span>' +
      '<span class="coll-status ' + escapeHtml(c.status) + '">' + escapeHtml(c.status.toUpperCase()) + '</span>' +
      (c.note ? '<span class="coll-note">' + escapeHtml(c.note) + '</span>' : '') + '</div>';
  });
  if (ch) cl.innerHTML = ch;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ---------- sound controls ---------- */
function buildSoundControls() {
  var box = document.getElementById('snd-cats');
  CATS.forEach(function (cat) {
    var lab = document.createElement('label');
    lab.className = 'cat-toggle';
    var cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !!Sound.cats[cat];
    cb.addEventListener('change', function () {
      Sound.cats[cat] = cb.checked; store.set('snd.cats', Sound.cats);
    });
    var dot = document.createElement('span');
    dot.className = 'cat-dot'; dot.style.background = PAL.cat[cat];
    dot.style.boxShadow = '0 0 6px ' + PAL.cat[cat];
    lab.appendChild(cb); lab.appendChild(dot);
    lab.appendChild(document.createTextNode(cat.toUpperCase()));
    box.appendChild(lab);
  });
  var m = document.getElementById('snd-master');
  m.checked = Sound.master;
  m.addEventListener('change', function () { Sound.master = m.checked; store.set('snd.master', m.checked); Sound.ensure(); });
  var v = document.getElementById('snd-vol');
  v.value = Sound.vol;
  v.addEventListener('input', function () { Sound.vol = +v.value; store.set('snd.vol', Sound.vol); });
}

/* ---------- websocket link ---------- */
var wsStatus = document.getElementById('ws-status');
function setLink(up) {
  wsStatus.className = 'ws-status ' + (up ? 'online' : 'offline');
  wsStatus.textContent = up ? 'LINK: ONLINE' : 'LINK: OFFLINE';
}
function connect() {
  var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  var ws = new WebSocket(proto + '//' + location.host + '/ws');
  ws.onopen = function () { setLink(true); };
  ws.onclose = function () { setLink(false); setTimeout(connect, 2500); };
  ws.onerror = function () { try { ws.close(); } catch (e) {} };
  ws.onmessage = function (m) {
    var msg;
    try { msg = JSON.parse(m.data); } catch (e) { return; }
    if (msg.type === 'hello') {
      renderSnapshot(msg.snapshot);
      (msg.events || []).forEach(function (ev) { Console_.add(ev); });
    } else if (msg.type === 'event') {
      Console_.add(msg.event);
    } else if (msg.type === 'snapshot') {
      var patch = { collectors: {} };
      patch.collectors[msg.collector] = msg.data;
      // merge into a cached full snapshot for consistent rendering
      lastSnapshot.collectors[msg.collector] = msg.data;
      renderSnapshot(lastSnapshot);
    }
  };
}
var lastSnapshot = { collectors: {} };
// wrap renderSnapshot to keep the cache fresh on hello
var _render = renderSnapshot;
renderSnapshot = function (snap) { lastSnapshot = snap; _render(snap); };

/* ---------- clock ---------- */
setInterval(function () {
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('en-GB');
}, 1000);

/* ---------- light / dark theme ---------- */
function updateThemeBtn() {
  var b = document.getElementById('btn-theme');
  if (b) b.textContent = document.body.classList.contains('light') ? '☾ DARK' : '☀ LIGHT';
}
function restyleCharts() {
  Object.keys(gauges).forEach(function (id) {
    var c = gauges[id];
    if (!c || !gaugeDefs[id]) return;
    var cur = null, curMax = null;
    try { var o = c.getOption().series[0]; cur = o.data[0].value; curMax = o.max; } catch (e) {}
    var opt = buildGaugeOption(id);
    if (cur !== null && cur !== undefined) opt.series[0].data[0].value = cur;
    if (curMax) opt.series[0].max = curMax;
    c.setOption(opt, true);
  });
  renderTrend();
  if (procGraph) {
    // merge only the style/tooltip config; data+links stay live (rebuilt every 2s anyway)
    var po = procGraphOption();
    delete po.series[0].data;
    delete po.series[0].links;
    procGraph.setOption(po);
  }
}
function applyTheme(mode, skipRestyle) {
  document.body.classList.toggle('light', mode === 'light');
  store.set('theme', mode);
  refreshPalette();
  updateThemeBtn();
  if (!skipRestyle) restyleCharts();
}

/* ---------- boot ---------- */
applyTheme(store.get('theme', 'dark'), true);
try { initCharts(); } catch (e) { console.error('initCharts failed:', e); }
try { buildSoundControls(); } catch (e) { console.error('buildSoundControls failed:', e); }
syncConsoleControls();
connect();
Console_.add({ t: new Date().toISOString(), source: 'hud-ui', category: 'system',
  severity: 'info', message: 'HUD interface initialized — establishing uplink…' });

})();
