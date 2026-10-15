const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

// Each test file runs in its own process and owns its database and logs.
module.exports = function createRuntime() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mushroom-test-'));
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DB_PATH: path.join(directory, 'test.db'),
    LOG_DIR: path.join(directory, 'logs'),
    DEVICE_API_KEY: 'test-only-key',
    LOG_LEVEL: 'error',
    SITE_URL: 'https://example.test',
    TRUST_PROXY: '1',
    CORS_ORIGIN: 'https://example.test',
    DATA_RETENTION_DAYS: '30',
    DEVICE_OFFLINE_SECONDS: '60',
    PLUG_STALE_SECONDS: '90',
    READING_BROADCAST_MS: '5000',
    FARM_ADDRESS: '', FARM_PHONE: '', FARM_LINE: '', FARM_FACEBOOK_URL: '', FARM_MAP_URL: '',
  });

  let server;
  const sockets = new Set();
  return {
    directory,
    async listen(app) {
      await new Promise((resolve, reject) => {
        server = app.listen(0, '127.0.0.1', resolve);
        server.once('error', reject);
        server.on('connection', (socket) => {
          sockets.add(socket);
          socket.once('close', () => sockets.delete(socket));
        });
      });
      return `http://127.0.0.1:${server.address().port}`;
    },
    async cleanup() {
      const closedSockets = [...sockets].map((socket) => once(socket, 'close'));
      require('../../src/shared/events/sseHub').close();
      if (server) {
        await new Promise((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
          server.closeIdleConnections();
        });
      }
      await Promise.all(closedSockets);
      require('../../src/shared/db').close();
      const logger = require('../../src/shared/utils/logger');
      const finished = once(logger, 'finish');
      logger.end();
      await finished;
      logger.close();
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
};
