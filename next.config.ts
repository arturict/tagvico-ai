import type { NextConfig } from 'next';

const backend = process.env.TAGVICO_BACKEND_URL || 'http://127.0.0.1:3001';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['better-sqlite3'],
  async rewrites() {
    return {
      fallback: [
        { source: '/setup/:path*', destination: `${backend}/setup/:path*` },
        { source: '/dashboard/:path*', destination: `${backend}/dashboard/:path*` },
        { source: '/history/:path*', destination: `${backend}/history/:path*` },
        { source: '/operations/:path*', destination: `${backend}/operations/:path*` },
        { source: '/manual/:path*', destination: `${backend}/manual/:path*` },
        { source: '/review/:path*', destination: `${backend}/review/:path*` },
        { source: '/automation/settings', destination: `${backend}/settings` },
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
