import type { NextConfig } from 'next';

const backend = process.env.TAGVICO_BACKEND_URL || 'http://127.0.0.1:3001';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['better-sqlite3'],
  async redirects() {
    return [
      // The start page is the chat. A page that redirected would answer only after
      // the loading state started streaming, so the browser would load the app
      // shell first and follow a client-side redirect. /companion still sends
      // installs without setup to /setup and signed-out visitors to /login.
      { source: '/', destination: '/companion', permanent: false },
      { source: '/automation/settings', destination: '/settings/automation', permanent: true },
      { source: '/documentation', destination: '/docs', permanent: true },
      { source: '/documentation/:path*', destination: '/docs/:path*', permanent: true }
    ];
  },
  async rewrites() {
    return {
      fallback: [
        { source: '/docs', destination: `${backend}/docs` },
        { source: '/docs/:path*', destination: `${backend}/docs/:path*` },
        { source: '/api-docs/:path*', destination: `${backend}/api-docs/:path*` },
        { source: '/logout', destination: `${backend}/logout` },
        { source: '/api/:path*', destination: `${backend}/api/:path*` }
      ]
    };
  },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
      ]
    }];
  }
};

export default nextConfig;
