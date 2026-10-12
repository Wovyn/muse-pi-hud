# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
