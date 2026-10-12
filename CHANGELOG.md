# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-10-11

### Added
- SWAP and AVAIL readouts alongside LOAD/UPTIME/PROCS. The vitals collector
  now reports `avail_kb` (MemAvailable) and swap totals/usage from
  `/proc/meminfo`; SWAP shows percent used with GB detail on hover, AVAIL
  shows usable headroom in GB. Swap is the early-warning canary for memory
  pressure on this host.

## [1.2.0] - 2026-10-11

### Changed
- Event Console redesigned as a Matrix-style "telemetry rain": one vertical
  lane per event category (system, sensor, command, network, app), each event
  falling as a severity-colored glyph with a fading trail. Hovering a glyph
  shows timestamp/source/summary; clicking opens a chronological detail modal
  with the full event log. Pause, scroll-lock (modal follow), severity
  filter, and clear carry over from the panel controls. The event buffer
  holds 600 events; the rain caps at 220 glyphs and renders on canvas.
  `prefers-reduced-motion` falls back to a static recent-events list;
  light-mode palette included.

## [1.1.0] - 2026-10-11

### Fixed
- Memory gauge/trend stuck at zero: the `memInfo()` parser in
  `collectors/vitals.js` built its `/proc/meminfo` matcher with an
  over-escaped dynamic regex that never matched, so `MemTotal`/`MemAvailable`
  always read 0. Replaced with a straightforward line parser. The gauge
  reports effective used memory (`MemTotal - MemAvailable`) as a percentage;
  Linux also exposes `MemFree`, buffers/cache, and swap fields, but
  `MemAvailable` is the right basis for "how much memory is actually used."

### Changed
- Renamed "Mission HUD" to "Muse Gadget HUD" and "Ship Vitals" to "Gadget
  Vitals" (header, page title, footer).
- Trend chart height doubled (90px to 180px).
- Grid panels now top-align (`align-items: start`), removing the blank space
  that stretched shorter panels to the tallest row height.
- Data Uplinks rows now share one format: name, shortened note, status tag.
  Full notes are available as hover tooltips; the panel sizes to its content.

### Added
- Process Constellation view toggle: GRAPH (default) / TABLE. The table lists
  PID, command, CPU%, and MEM% sorted by CPU. The choice persists in
  localStorage.
- Hamburger menu (top right) with a Settings item. Settings opens a modal
  with left-hand navigation; the Sound controls (master, volume,
  per-category toggles) moved there from their standalone panel, and the
  Event Console now spans the full grid width.

## [1.0.0] - 2026-10-11

### Added
- Initial release of the spaceship HUD dashboard for Muse-Pi-1.
- Node.js backend (Node 22+) with an open collector/plugin interface:
  `collectors/<name>.js` exporting `start(bus, api)`; snapshots broadcast over
  WebSocket, events feed the console.
- Live collectors: system vitals (CPU overall/per-core, memory, disk, load,
  uptime, SoC temp, 2s cadence), processes (CPU%/mem + ppid relationships, top
  15, 5s cadence), network (per-interface RX/TX rates, interfaces discovered
  dynamically, 2s cadence). MQTT collector stubbed by design (credentials via
  `HUD_MQTT_*` env only); audit collector tails the flight-recorder JSONL when
  present.
- REST API: `GET /api/snapshot`, `GET /api/events`, `GET /api/health`;
  WebSocket feed at `/ws`.
- Frontend: dark neon/scanline spaceship styling; six clickable gauges (CPU,
  MEM, SoC TEMP, DISK, NET RX, NET TX) retargeting the trend chart; 900-sample
  in-browser ring buffers (~30 min); animated force-directed process
  constellation (node size = CPU, hue = memory, edges = parent→child) with
  always-on labels and hover tooltips; scrolling event console with
  pause/scroll-lock/severity filter/clear plus audit detail lines; WebAudio
  synthesized sounds with master/per-category toggles; light mode ("day
  shift") with header toggle; all preferences persisted in localStorage.
- ECharts vendored locally (`public/vendor/echarts.min.js`) — no CDN
  dependency, works offline.
- `start.sh` launcher (nohup + pidfile, no sudo) and `@reboot` cron entry so
  the dashboard survives reboots.
- Project docs: README, CHANGELOG (this file), NOTICE attributions, Apache 2.0
  LICENSE, `.gitignore`.
