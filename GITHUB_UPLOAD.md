# อัป Mushroom Web ขึ้น GitHub

ใช้ Git ภายใน directory `mushroom-web` เท่านั้น
root ของ repo นี้มี `package.json`, `src/`, `test/`, `views/` และ `public/`
ส่วน firmware ESP32 ใช้อ้างอิงภาพรวมระบบและไม่รวมอยู่ใน repo นี้

## ตรวจงานในเครื่อง

```bash
git rev-parse --show-toplevel
git status --short --branch
git remote -v
git log --oneline origin/main..HEAD
npm ci
npm test
npm audit --omit=dev
docker build -t mushroom-web:check .
```

`npm test` ใช้ข้อมูลและ log ชั่วคราว จึงไม่ต้องคัดลอก `.env.example` เป็น `.env`
หรือเตรียมฐานข้อมูลจริงเพื่อรันเทส

ตรวจไฟล์ที่จะ commit หากมีการแก้ไขเพิ่ม:

```bash
git diff --check
git diff --stat
git diff --cached --stat
git ls-files .env data logs node_modules
```

คำสั่งสุดท้ายควรแสดงเฉพาะ `data/.gitkeep` และ `logs/.gitkeep`
เก็บ `.env.example`, `package-lock.json` และ source ของเทสใน Git
ส่วน env จริง, ฐานข้อมูล, log, backup และ dependencies ถูกกันด้วย `.gitignore`

## ส่ง commits ที่เตรียมไว้

ตรวจว่า `origin` เป็น repo ที่ต้องการใช้งาน ปลายทางที่ตั้งไว้สำหรับโปรเจกต์นี้คือ
`https://github.com/thanwakitsakornsvtr-ctrl/mushroom.git`

```bash
git fetch origin
git status --short --branch
git log --oneline --left-right origin/main...HEAD
git push origin main
```

หาก remote มี commits ใหม่ที่ local ยังไม่มี ให้รวมและตรวจงานนั้นก่อน push
หาก GitHub กำหนดให้ผ่าน pull request ให้ push ไป branch งานแล้วเปิด PR เข้า `main`

หลัง push ให้เปิดแท็บ **Actions** และตรวจ workflow **CI**:

- `Test (Node 22)` และ `Test (Node 24)` ต้องผ่าน
- `Docker build` ทำงานหลังเทสทั้งสองรุ่นผ่าน
- เทสไม่ต้องใช้ GitHub secrets หรือข้อมูลจากระบบจริง

Workflow นี้ตรวจเทสและ build เท่านั้น การ deploy ทำตาม
[VPS_DEPLOY.md](VPS_DEPLOY.md) หรือ [RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md)
