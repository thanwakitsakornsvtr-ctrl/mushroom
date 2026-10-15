# Mushroom Web

เว็บติดตามสภาพโรงเรือนเห็ดนางฟ้า ใช้ Node.js, Express, EJS และ SQLite
จัดโครงสร้างเป็น **Modular Monolith**: แบ่งโค้ดตามหน้าที่ของระบบ
ทุกโมดูลทำงานใน Node.js process เดียว ใช้ฐานข้อมูล SQLite ร่วมกัน และ deploy เป็นแอปเดียว

## โครงสร้าง

```text
src/
├── app.js                  # ประกอบ Express middleware และ routes ของโมดูล
├── server.js               # เปิด HTTP server และปิด resources เมื่อหยุดแอป
├── scheduler.js            # เรียกแต่ละโมดูลล้างประวัติที่หมดอายุ
├── modules/
│   ├── dashboard/          # หน้าเว็บ ข้อมูลฟาร์ม และสถานะบน navbar
│   ├── sensors/            # รับ/อ่านค่าเซนเซอร์ ประวัติ สถิติ และจุดกราฟ
│   └── system/             # รับผลการตัดสินใจ ผลสั่งอุปกรณ์ และสถานะปลั๊ก
└── shared/
    ├── config/             # อ่าน environment variables
    ├── db/                 # เปิด SQLite connection และตั้งค่า WAL
    ├── events/             # ส่ง event ไป browser ผ่าน SSE
    ├── http/               # Health check
    ├── middleware/         # API key, request logging และ error handling
    └── utils/              # Logger และ async handler
public/                     # CSS, JavaScript, รูป และ manifest
views/                      # EJS templates และ partials
test/                       # Function, validation, API, SSE และหน้าเว็บ
```

ในแต่ละโมดูล ไฟล์มีหน้าที่ดังนี้ โดยเพิ่มเฉพาะไฟล์ที่โมดูลนั้นต้องใช้:

| ไฟล์ | หน้าที่ |
| --- | --- |
| `index.js` | ช่องทางเรียกใช้โมดูลจากภายนอก |
| `routes.js` | ผูก URL, rate limit และ middleware กับ controller |
| `controller.js` | รับ HTTP request ตรวจ payload และส่ง response |
| `validation.js` | กฎตรวจข้อมูลขาเข้า |
| `service.js` | พฤติกรรมของโมดูลและการส่ง event |
| `repository.js` | อ่าน/เขียนตารางที่โมดูลรับผิดชอบ |
| `schema.js` | สร้างตารางและ index ของโมดูลเมื่อเริ่มใช้งาน |

`sensors` ดูแลตาราง `readings` และเกณฑ์จำแนกค่าใน `thresholds.js`
ส่วน `system` ดูแล `control_decisions`, `actuator_events`, `plug_status`
และค่าที่ใช้แสดงคำอธิบายการควบคุมใน `controlLogic.js`
ชื่อและรูปแบบตารางเดิมยังใช้ได้ จึงเปิดฐานข้อมูลเดิมต่อได้โดยไม่ต้องย้ายข้อมูล

## ขอบเขตระหว่างโมดูล

- เรียกข้ามโมดูลผ่าน `index.js` เช่น `require('../sensors')`
  ให้ repository, controller และรายละเอียดภายในอยู่ในโมดูลเจ้าของ
- `dashboard` อ่านข้อมูลจาก public interface ของ `sensors` และ `system`
- `sensors` และ `system` ใช้ `shared` และดูแลข้อมูลของตัวเอง
- `shared` ไม่เรียกกลับเข้าโมดูล ส่วน `app.js`, `server.js`, `scheduler.js`
  เป็นตัวประกอบระบบและจัดการ lifecycle
- เมื่อเพิ่มงานใหม่ ให้เริ่มจากโมดูลเจ้าของหน้าที่นั้น
  ย้ายเข้า `shared` เมื่อเป็นโครงสร้างพื้นฐานที่ใช้ร่วมกันจริง

การตัดสินใจเปิด/ปิดอุปกรณ์เกิดบน **ESP32** เว็บรับและแสดงรายงาน
`system/controlLogic.js` ใช้อธิบายค่าจาก firmware บนหน้าเว็บ
เมื่อ firmware เปลี่ยนเกณฑ์ ต้องตรวจไฟล์นี้ให้ตรงกันด้วย

## การไหลของข้อมูล

```text
ESP32 → sensors routes → validation → service → repository → SQLite
ESP32 → system routes  → validation → service → repository → SQLite
                                      ↓
                                shared SSE → browser

browser → dashboard → sensors / system public interfaces → EJS
```

| URL | หน้าที่ |
| --- | --- |
| `/`, `/about`, `/logic` | สภาพโรงเรือน ข้อมูลฟาร์ม และคำอธิบายการควบคุม |
| `POST /api/sensors/readings` | รับค่าจาก ESP32 |
| `GET /api/sensors/latest`, `/api/sensors/history` | ค่าล่าสุดและประวัติ |
| `GET /api/sensors/events` | SSE: `reading`, `control`, `actuator`, `plug` |
| `GET/POST /api/system/decisions` | อ่าน/รับผลการตัดสินใจ |
| `GET /api/system/actuators` | ผลการสั่งอุปกรณ์ล่าสุด |
| `GET/POST /api/system/plugs` | อ่าน/รับสถานะปลั๊ก |
| `GET /healthz` | Health check |

คำขอ `POST` สำหรับอุปกรณ์ต้องส่ง header `X-API-Key`
ลิงก์เดิม `/dashboard` และ `/how-it-works` ยังคง redirect ถาวรตามเดิม

## เริ่มพัฒนา

ใช้ Node.js ตาม `engines` ใน `package.json` (ตั้งแต่ 22.13.0):

```bash
npm ci
cp .env.example .env
# ตั้ง DEVICE_API_KEY เป็นค่าของระบบก่อนเริ่ม production
npm run dev
```

`npm start` เปิดแอปผ่าน `src/server.js` เช่นเดียวกับ Docker และ PM2
อ่านวิธี deploy ได้ที่ [VPS_DEPLOY.md](VPS_DEPLOY.md) และ [RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md)

## ทดสอบ

```bash
npm test
```

เทสตรวจฟังก์ชันกับ SQLite จริง รวมถึงขอบเขต validation, อายุข้อมูล,
สถิติ/กราฟ, การรักษาเวลาเปลี่ยนสถานะปลั๊ก, ผลการสั่งอุปกรณ์,
API key, HTTP response, SSE, หน้าเว็บ, rate limit และการเริ่ม/หยุด server
เทสการทำงานใช้ฐานข้อมูลและ log ใน temporary directory แยกต่อ test process
และปิด HTTP/SSE, SQLite, logger ก่อนลบ directory เมื่อจบ
จึงไม่เพิ่ม log หรือแก้ฐานข้อมูลใน `data/` ของโปรเจกต์

## ไฟล์ runtime และการเก็บกวาด

- เก็บ `test/`, `.env.example` และ `package-lock.json` ใน Git
- `.gitignore` กัน dependencies, env จริง, runtime data, backups, test output
  และไฟล์ชั่วคราว โดยเว้น `data/.gitkeep` กับ `logs/.gitkeep`
- `.dockerignore` กันเทสและไฟล์ local ออกจาก build context;
  Dockerfile คัดลอก `src/`, `views/`, `public/` และติดตั้ง dependencies
- `DB_PATH` กำหนดฐานข้อมูล และ `LOG_DIR` กำหนดที่เก็บ log (ค่าเริ่มต้น `./logs`)
- Logger ตั้งระยะเก็บ 14 วัน ส่วนประวัติในฐานข้อมูลใช้ `DATA_RETENTION_DAYS`
  ซึ่งเริ่มต้นที่ 30 วัน และ scheduler เรียกเก็บกวาดเมื่อเริ่ม server และทุกวัน
- ก่อนลบ log เก่า ให้ตรวจวันที่และว่าไม่มี process เปิดไฟล์อยู่
  รักษาไฟล์ `*-audit.json` ที่ระบบหมุน log ใช้ติดตามไฟล์
