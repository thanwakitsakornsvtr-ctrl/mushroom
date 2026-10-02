/**
 * ข้อมูลสาธารณะของฟาร์ม — ใช้ในหน้าแรก, footer, meta/SEO
 *
 * ค่าที่เป็นข้อมูลจริงของฟาร์ม (ที่อยู่ เบอร์โทร LINE ฯลฯ) ตั้งผ่าน env เท่านั้น
 * ถ้าไม่ได้ตั้ง ส่วนนั้นจะถูกซ่อนบนหน้าเว็บ — ไม่มีข้อมูลสมมติแสดงให้คนทั่วไปเห็น
 */
const config = require('./index');

const env = (name) => (process.env[name] || '').trim();

const phone = env('FARM_PHONE');

module.exports = {
  name: 'โรงเห็ดนางฟ้า',
  nameEn: 'Nang Fa Mushroom Farm',
  area: 'กันทรลักษ์ · ศรีสะเกษ',
  areaFull: 'อำเภอกันทรลักษ์ จังหวัดศรีสะเกษ',
  tagline: 'เห็ดนางฟ้าสดจากโรงเรือนที่ดูแลสภาพอากาศอัตโนมัติ',
  description: 'โรงเห็ดนางฟ้า อำเภอกันทรลักษ์ จังหวัดศรีสะเกษ — เพาะเห็ดนางฟ้าในโรงเรือนที่เฝ้าระวัง CO₂ อุณหภูมิ และความชื้นแบบเรียลไทม์ ดูสภาพโรงเรือนสดได้ทุกเวลา',
  baseUrl: config.siteUrl,
  locale: 'th_TH',
  themeColor: '#F5F0E8',
  contact: {
    address: env('FARM_ADDRESS'),
    phone,
    phoneHref: phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : '',
    line: env('FARM_LINE'),
    lineHref: env('FARM_LINE')
      ? `https://line.me/ti/p/${encodeURIComponent(env('FARM_LINE'))}`
      : '',
    facebookUrl: env('FARM_FACEBOOK_URL'),
    mapUrl: env('FARM_MAP_URL'),
  },
  // รายการผลผลิตที่หน้าแรกจะแสดง — เติมเมื่อมีข้อมูลจริง เช่น
  // { name: 'เห็ดนางฟ้าสด', note: 'เก็บสดทุกเช้า' }
  products: [],
};
