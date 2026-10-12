// Collector: MQTT sensor stream — STUBBED.
//
// Broker credentials live in Node-RED's encrypted credential store and are
// deliberately NOT read from here. To enable, provide credentials via
// environment (never commit them to a file in this repo):
//
//   HUD_MQTT_URL    e.g. mqtts://your-host.hivemq.cloud:8883
//   HUD_MQTT_USER   broker username
//   HUD_MQTT_PASS   broker password
//   HUD_MQTT_TOPIC  subscription topic (default: Wovyn/ESPHome/#)
//
// When live, this collector subscribes and emits:
//   - console events: { category:'sensor', severity:'info', message:'<topic>: <value>' }
//   - snapshot: { status:'live', latest:{ <topic>: {value, t} } }
'use strict';

module.exports = {
  start(bus, api) {
    const url = process.env.HUD_MQTT_URL;
    if (!url) {
      api.setStatus('stubbed', 'awaiting broker credentials — see collector source for HUD_MQTT_* env vars');
      bus.emit('event', { source: 'mqtt', category: 'system', severity: 'warn',
        message: 'MQTT collector stubbed — no HUD_MQTT_URL in environment' });
      return;
    }
    // Live client wiring goes here (mqtt.js). Kept out of the skeleton so the
    // dashboard runs with zero extra dependencies until credentials exist.
    api.setStatus('stubbed', 'HUD_MQTT_URL present but live client not implemented yet');
    bus.emit('event', { source: 'mqtt', category: 'system', severity: 'warn',
      message: 'MQTT env present; live subscribe not implemented in skeleton' });
  },
};
