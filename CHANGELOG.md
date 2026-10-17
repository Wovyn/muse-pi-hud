# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.1] - 2026-10-17

### Added
- Trend window buttons (1 / 5 / 15 / 30 MIN) above the trend chart: they set
  the view size only -- the buffer still holds 30 minutes. The choice is
  stored and applies to any selected metric; the trend label shows the
  active window.
- ROTATE button above the trend chart: cycles through all six trend metrics
  (CPU, MEM, SoC TEMP, DISK, NET RX, NET TX), 10s each, moving the gauge
  highlight with it. Clicking any gauge by hand stops rotation.

## [1.5.0] - 2026-10-16

### Added
- Ambient process sonification: each 5s processes tick diffs the top 15
  processes; moves past the deadband play a short random-pitch blip (up:
  1400-2600 Hz, down: 600-1100 Hz), capped at 5 blips per tick, staggered
  over ~4s. Purely sonic — no console entries.
- Process volume button in the Constellation header cycles Mute -> Low ->
  Medium -> Loud -> Mute (🔇 🔈 🔉 🔊), scaling the master volume
  (0 / 0.2 / 0.5 / 1.0); a PROCESS toggle in Settings -> Sound stays in sync
  (unchecking mutes, rechecking restores the previous level). Landing on a
  level plays a confirmation blip at that level; Settings has a TEST button
  (one up-blip + one down-blip). A missing saved preference defaults to Loud.
- Footer shows the running version (from package.json, via the hello
  message and /api/health).

### Changed
- Softer event beeps: command info voice changed from square to triangle;
  warn gain 0.4 -> 0.3, error gain 0.5 -> 0.35; a DynamicsCompressor on
  the master output keeps stacked blips from clipping.
- Process-sonification deadband is adaptive: thresholds track the 60th
  percentile of recent non-zero moves (floors 0.3 CPU points / 1% memory),
  so a quiet Pi still tinkles and a busy Pi does not chatter. Small moves
  sound softer (gain scales with move size).
- Viewport-filling layout: the page is a flex column, the grid grows to
  fill the browser height, and the trend chart flexes to fill the Vitals
  panel. On short screens the page scrolls rather than clipping panels.
- ResizeObserver keeps the ECharts gauges/trend/constellation and the rain
  canvas sized to their containers (previously only window resizes did).

## [1.4.0] - 2026-10-11

### Changed
- Header: the hamburger menu is now the far-right control (after theme,
  clock, and link status).
- Data Uplinks moved out of the main grid into a slim bar pinned to the
  bottom of the viewport; collectors render horizontally (name + status
  tag, full note on hover).
- Layout: Gadget Vitals takes the left 50%; the right 50% stacks the Process
  Constellation over the Event Console in equal halves. Both visualizations
  flex to fill their panels.
- Telemetry rain slowed to roughly half speed.
- Event lists are newest-first: the detail modal prepends new rows and pins
  to the top (scroll-lock follows the newest).

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
