// Collector: Hailo-8 NPU utilization from HailoRT monitor files.
// The HailoRT library writes utilization data to /tmp/nnc_utilization/ while
// a network is loaded, but only when the app opts in with HAILO_MONITOR=1
// (the detection cron sets it). Between inferences the files are absent,
// which means idle: utilization 0. Snapshot every 2s like vitals.
// Emits: snapshot { device, device_id, arch, firmware, util_pct, active,
//          model, pid, last_util_pct, last_active_at, last_detect_run }
"use strict";
const fs = require("fs");
const { execFile } = require("child_process");

const NNC_DIR = "/tmp/nnc_utilization";
const HMON_DIR = "/tmp/hmon_files";
const DETECT_LOG = "/home/pi/detections/log.csv";

let deviceInfo = null;
let lastUtil = null, lastActiveAt = null;

function readUtil() {
  try {
    const names = fs.readdirSync(NNC_DIR).filter((f) => f.startsWith("nnc_utilization"));
    for (const f of names) {
      const v = parseFloat(fs.readFileSync(NNC_DIR + "/" + f, "utf8"));
      if (Number.isFinite(v)) return v;
    }
  } catch (e) { /* absent -> idle */ }
  return null;
}
function readHmon() {
  // first line: PID, second: model name
  try {
    const names = fs.readdirSync(HMON_DIR);
    for (const f of names) {
      const lines = fs.readFileSync(HMON_DIR + "/" + f, "utf8").split("\n");
      if (lines.length >= 2) return { pid: lines[0].trim(), model: lines[1].trim() };
    }
  } catch (e) { /* absent -> idle */ }
  return {};
}
function lastDetectRun() {
  try {
    const txt = fs.readFileSync(DETECT_LOG, "utf8").trim();
    if (!txt) return null;
    const last = txt.split("\n").pop();
    return last.split(",")[0] || null;
  } catch (e) { return null; }
}
function probeDevice() {
  // one-shot: board identity for the snapshot; failure leaves it unknown
  execFile("hailortcli", ["fw-control", "identify"], (err, out) => {
    if (err || !out) return;
    const id = (out.match(/Executing on device:\s*(\S+)/) || [])[1] || null;
    const dev = (out.match(/Device Architecture:\s*(\S+)/) || [])[1] || null;
    const fw = (out.match(/Firmware Version:\s*([^\n(]+)/) || [])[1] || null;
    const board = (out.match(/Board Name:\s*(\S+)/) || [])[1] || null;
    deviceInfo = { device: board ? board.replace(/\0/g, "") : null, device_id: id, arch: dev, firmware: fw ? fw.trim() : null };
  });
}

module.exports = {
  start(bus, api) {
    if (!fs.existsSync("/dev/hailo0")) {
      api.setStatus("stubbed", "no Hailo device (/dev/hailo0 missing)");
      return;
    }
    probeDevice();
    const tick = () => {
      const util = readUtil();
      const hmon = util !== null ? readHmon() : {};
      if (util !== null) { lastUtil = util; lastActiveAt = new Date().toISOString(); }
      api.setSnapshot({
        device: deviceInfo ? deviceInfo.device : null,
        device_id: deviceInfo ? deviceInfo.device_id : null,
        arch: deviceInfo ? deviceInfo.arch : null,
        firmware: deviceInfo ? deviceInfo.firmware : null,
        util_pct: util !== null ? +util.toFixed(1) : 0,
        active: util !== null,
        model: hmon.model || null,
        pid: hmon.pid || null,
        last_util_pct: lastUtil !== null ? +lastUtil.toFixed(1) : null,
        last_active_at: lastActiveAt,
        last_detect_run: lastDetectRun(),
      });
    };
    tick();
    setInterval(tick, 2000);
    bus.emit("event", { source: "hailo", category: "system", severity: "info",
      message: "hailo collector online (2s cadence)" });
  },
};
