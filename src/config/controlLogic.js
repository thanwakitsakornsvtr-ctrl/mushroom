// ค่าที่ ESP32 ใช้ตัดสินใจเปิด/ปิดพัดลมและเครื่องพ่นไอน้ำ — ใช้แสดงในหน้า "หลักการทำงาน" เท่านั้น
// ต้นฉบับอยู่ใน Microcontroller/sketch_dht11/sketch_dht11.ino (server ไม่ได้ใช้ตัดสินใจ)
// ถ้าแก้ค่าใน firmware ให้แก้ไฟล์นี้ให้ตรงกันด้วย
module.exports = {
  fan: {
    onTempAbove: 30,      // TEMP_NORMAL_MAX
    offTempAtOrBelow: 28, // TEMP_OFF_THRESHOLD
    onCo2Above: 1000,     // CO2_NORMAL_MAX
    offCo2AtOrBelow: 800, // CO2_OFF_THRESHOLD
    minOnMinutes: 3,      // FAN_MIN_ON_MS
    minOffMinutes: 5,     // FAN_MIN_OFF_MS
  },
  mister: {
    onHumidityBelow: 80,        // HUMIDITY_NORMAL_MIN
    offHumidityAtOrAbove: 88,   // HUMIDITY_OFF_THRESHOLD
    minOnMinutes: 1,            // MISTER_MIN_ON_MS
    minOffMinutes: 3,           // MISTER_MIN_OFF_MS
    waitAfterFanMinutes: 2,     // HUMIDITY_GRACE_AFTER_FAN_MS
  },
  co2DangerAtOrAbove: 1500,     // CO2_DANGER_MAX
  readEverySeconds: 5,          // SCD40 periodic measurement (ค่าใหม่ทุก ~5 วิ)
  smoothingReadings: 5,         // SMOOTHING_WINDOW_SIZE
  sensorFailMinutes: 3,         // SENSOR_STALE_MS
  plugCheckSeconds: 30,         // PLUG_POLL_MS
  plugRetrySeconds: 15,         // PLUG_RETRY_MS
  co2IsMocked: false,           // ใช้ SCD40 วัด CO2 จริงแล้ว
};
