module.exports = {
  apps: [
    {
      name: 'tagvico-backend', script: 'dist/server.js', instances: 1, autorestart: true, watch: false,
      exec_mode: 'fork', max_memory_restart: '1G', env: { NODE_ENV: 'production', TAGVICO_AI_PORT: process.env.TAGVICO_BACKEND_PORT || '3001' }, exp_backoff_restart_delay: 100
    },
    {
      name: 'tagvico-web', script: 'node_modules/next/dist/bin/next', args: `start -p ${process.env.TAGVICO_AI_PORT || '3000'}`,
      instances: 1, exec_mode: 'fork', autorestart: true, watch: false, max_memory_restart: '768M',
      env: { NODE_ENV: 'production', TAGVICO_BACKEND_URL: process.env.TAGVICO_BACKEND_URL || 'http://127.0.0.1:3001' }, exp_backoff_restart_delay: 100
    }
  ]
};
