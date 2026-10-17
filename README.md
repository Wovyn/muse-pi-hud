# muse-pi-hud

A real-time, sci-fi "spaceship" HUD for Raspberry Pi — the **Muse Gadget HUD**:
hardware vitals, live sensor trends, a Matrix-style telemetry-rain event
console, an animated process constellation, and synthesized beeps & boops.
A **Wovyn R&D project**.

Built for Muse-Pi-1 (Raspberry Pi 4, Debian 13). Runs as an unprivileged user
with no sudo, survives reboots via a user `@reboot` cron entry. Hand-rolled —
no frontend framework, no build step, ECharts vendored locally so the dashboard
works with no internet access.

**License:** Apache 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

- UI: http://&lt;pi-lan-ip&gt;:8080/ (port from `HUD_PORT`, default 8080)
- WebSocket feed: `ws://&lt;pi-lan-ip&gt;:8080/ws`
- REST: `GET /api/snapshot` (latest collector data), `GET /api/events`
  (recent console events), `GET /api/health`

## Running it

```bash
~/projects/muse-pi-hud/start.sh        # start (nohup, pidfile, appends to hud.log)
cat ~/projects/muse-pi-hud/hud.log     # logs
kill "$(cat ~/projects/muse-pi-hud/hud.pid)"   # stop
```

Survives reboots via a user `@reboot` cron entry (no systemd/linger needed,
no sudo):

```
@reboot /home/musecell/projects/muse-pi-hud/start.sh
```

Requirements: Node.js 22+ and `npm install` (one dependency: `ws`).

Firewall: inbound TCP on the chosen port (8080) must be open for LAN clients.

## Configuration

| Variable        | Default            | Purpose |
|-----------------|--------------------|---------|
| `HUD_PORT`      | `8080`             | HTTP + WebSocket listen port |
| `HUD_MQTT_URL`  | — (stubbed)        | Broker URL, e.g. `mqtts://host:8883` |
| `HUD_MQTT_USER` | —                  | Broker username |
| `HUD_MQTT_PASS` | —                  | Broker password (never commit this) |
| `HUD_MQTT_TOPIC`| `Wovyn/ESPHome/#`  | Subscription topic |

The MQTT collector is stubbed by design until credentials are provided via
environment. Broker credentials live in Node-RED's encrypted credential store
and are deliberately never read from files in this repo.

## Collector plugin interface

Collectors live in `collectors/<name>.js`. Each exports:

```js
module.exports = {
  // bus: EventEmitter — emit console feed entries:
  //   bus.emit('event', { source, category, severity, message, data? })
  //     category: 'system' | 'sensor' | 'command' | 'network' | 'app'
  //     severity: 'info' | 'warn' | 'error'
  // api: { setSnapshot(data), setStatus(status, note) }
  //     status: 'live' | 'starting' | 'stubbed' | 'waiting' | 'error'
  start(bus, api) { /* ... */ },
};
```

To add a collector: drop the file in `collectors/` and append its name to
the list in `server.js`. It will appear automatically in the UI's DATA UPLINKS
panel, its snapshots flow over the WebSocket as
`{ type:'snapshot', collector, data }`, and its events land in the console
(color-coded + sounded by category/severity).

Design rules for new collectors:
- Never block the event loop; poll on intervals, keep work small.
- Never log secrets (broker passwords, tokens, keys). Redact before emitting.
- If a dependency is missing (credentials, a log dir, a device), use
  `setStatus('stubbed'|'waiting', note)` and stay quiet — don't crash the bus.
- Keep per-tick allocations modest; this box also runs Node-RED.

## Current collectors

| name       | status  | notes |
|------------|---------|-------|
| vitals     | live    | CPU (overall + per-core), mem, disk, SoC temp, load, uptime from /proc + sysfs, 2s cadence |
| processes  | live    | per-process CPU%/mem + ppid from /proc, top 15, 5s cadence — feeds the process-constellation viz |
| network    | live    | per-interface rx/tx rates from sysfs (`/sys/class/net/*/statistics/`), interfaces discovered dynamically (lo excluded), 2s cadence |
| mqtt       | stubbed | subscribes `Wovyn/ESPHome/#`; needs `HUD_MQTT_*` env (see collectors/mqtt.js). Credentials stay out of this repo |
| audit      | waiting | tails the flight-recorder JSONL when it exists; parks quietly until then |

## Frontend

- `public/` is served statically. ECharts is vendored at
  `public/vendor/echarts.min.js` so the HUD works with no internet.
- Six clickable gauges (CPU, MEM, SoC TEMP, DISK, NET RX, NET TX) retarget the
  trend chart. Network gauges show total throughput; the trend chart breaks it
  out per interface.
- The trend chart keeps a 900-sample ring buffer per metric (~30 minutes at the
  2s snapshot cadence). Switching metrics renders the full retained history
  immediately — never an empty chart. Buffers are in-memory only; a page
  reload starts fresh.
- The PROCESSES CONSTELLATION panel renders top processes as a force-directed
  graph: node size ~ CPU activity, hue ~ memory, edges = parent→child (ppid),
  with always-on name labels and rich hover tooltips.
- Layout: Gadget Vitals takes the left half of the page; the right half stacks
  the Process Constellation over the Event Console in equal halves. Data
  Uplinks live in a slim bar pinned to the bottom of the viewport. The layout
  fills the browser height: the grid grows to fit, the trend chart flexes to
  fill the Vitals panel, and panels resize with the window. The footer shows
  the running version.
- The EVENT CONSOLE is a Matrix-style "telemetry rain": one lane per event
  category, each event falling as a severity-colored glyph. Hover a glyph for
  timestamp/source/summary; click to open the chronological detail modal
  (newest first). Pause, scroll-lock, severity filter, and clear carry over,
  and detail lines for audit entries (shell commands with `$` prefix, file
  paths, durations, byte counts) are preserved in the modal.
- Sounds are synthesized with WebAudio (no audio files): master toggle,
  per-category toggles, and volume. Ambient process sounds add short
  random-pitch blips for process CPU/memory rises (higher band) and falls
  (lower band), past an adaptive deadband that tracks recent activity, with
  a PROCESS toggle in Settings (plus a TEST button) and a speaker button in the Constellation header that cycles
  Mute -> Low -> Medium -> Loud.
- Light mode ("day shift") toggle in the header restyles all charts in place.
- Every dashboard preference — theme, selected gauge, console controls, sound
  settings — persists in browser localStorage and restores on reopen.
- Audio starts on first click per browser autoplay policy. Everything is one
  page, no framework — extend `hud.js` panels as new collectors come online.

## Project structure

```
muse-pi-hud/
├── server.js            # HTTP + WebSocket server, collector bus
├── start.sh             # launcher (nohup, pidfile); used by @reboot cron
├── package.json
├── collectors/          # vitals, processes, network, mqtt, audit
├── public/              # index.html, hud.css, hud.js, vendor/echarts.min.js
├── README.md
├── CHANGELOG.md
├── NOTICE               # attributions (Apache 2.0)
└── LICENSE              # Apache License 2.0
```

`hud.log`, `hud.pid`, and `node_modules/` are runtime artifacts and are not
committed (see `.gitignore`).

## Versioning

This project follows [Semantic Versioning](https://semver.org/). Changes are
documented in [CHANGELOG.md](CHANGELOG.md) in Keep a Changelog format.

## Credits

A Wovyn R&D project. Project concept, requirements, and specifications by
Scott; implementation by MuseCell-1.
