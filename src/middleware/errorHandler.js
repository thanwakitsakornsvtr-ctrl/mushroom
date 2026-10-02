const logger = require('../utils/logger');

function notFoundHandler(req, res) {
  if (req.accepts('html')) {
    return res.status(404).render('error', { title: 'ไม่พบหน้านี้', robots: 'noindex', message: 'ไม่พบหน้าที่คุณต้องการ', status: 404 });
  }
  res.status(404).json({ error: 'Not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  logger.error(err.message, { stack: err.stack, path: req.path });

  if (req.path.startsWith('/api/')) {
    return res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
  }

  res.status(status).render('error', {
    title: 'เกิดข้อผิดพลาด',
    robots: 'noindex',
    message: status === 500 ? 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง' : err.message,
    status,
  });
}

module.exports = { notFoundHandler, errorHandler };
