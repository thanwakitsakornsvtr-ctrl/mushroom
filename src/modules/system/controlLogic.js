// ค่าที่ ESP32 ใช้ตัดสินใจเปิด/ปิดเครื่องพ่นไอน้ำ — ใช้แสดงในหน้า "หลักการทำงาน" เท่านั้น
// ต้นฉบับอยู่ใน firmware ESP32: sketch_dht11/sketch_dht11.ino (server ไม่ได้ใช้ตัดสินใจ)
// ถ้าแก้ค่าใน firmware ให้แก้ไฟล์นี้ให้ตรงกันด้วย
module.exports = {
  mister: {
    onHumidityBelow: 80,        // HUMIDITY_NORMAL_MIN
    offHumidityAtOrAbove: 88,   // HUMIDITY_OFF_THRESHOLD
    minOnMinutes: 1,            // MISTER_MIN_ON_MS
    minOffMinutes: 3,           // MISTER_MIN_OFF_MS
  },
  co2DangerAtOrAbove: 1500,     // CO2_DANGER_MAX
  readEverySeconds: 5,          // SCD40 periodic measurement (ค่าใหม่ทุก ~5 วิ)
  smoothingReadings: 5,         // SMOOTHING_WINDOW_SIZE
  sensorFailMinutes: 3,         // SENSOR_STALE_MS
  plugCheckSeconds: 30,         // PLUG_POLL_MS
  plugRetrySeconds: 15,         // PLUG_RETRY_MS
  co2IsMocked: false,           // ใช้ SCD40 วัด CO2 จริงแล้ว
};
