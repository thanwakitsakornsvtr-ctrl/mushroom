module.exports = {
  apps: [
    {
      name: 'mushroom-dashboard',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '300M',
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      time: true,
    },
  ],
};
