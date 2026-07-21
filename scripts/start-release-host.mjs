const dataDirectory = process.argv[2];
if (!dataDirectory) throw new Error('A release-acceptance data directory is required');

process.env.TAGVICO_DATA_DIR = dataDirectory;
process.env.TAGVICO_AI_PORT = process.env.TAGVICO_ACCEPTANCE_PORT || '4310';
process.env.TAGVICO_BACKEND_PORT = process.env.TAGVICO_ACCEPTANCE_BACKEND_PORT || '3001';
process.env.TAGVICO_BACKEND_URL = `http://127.0.0.1:${process.env.TAGVICO_BACKEND_PORT}`;
process.env.ALLOW_REMOTE_SETUP = 'yes';
process.env.COOKIE_SECURE_MODE = 'never';

await import('./start-production.js');
