import type { NextConfig } from 'next';
import { PrismaPlugin } from '@prisma/nextjs-monorepo-workaround-plugin';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    // Server Actions default to a 1MB request body cap. Map publishing and
    // site-image/skybox uploads pass the payload straight to a server action
    // (see publishCloudMap in src/lib/game-map-actions.ts, which already has
    // its own 4.5MB post-strip size cap) — without raising this, those
    // requests 413 before the action body is even parsed.
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Turbopack (used by `next dev --turbopack`) has its own resolver, separate
  // from the webpack() config below — it doesn't see the extensionAlias set
  // there. shared/**/*.ts uses explicit .js-suffixed relative imports (e.g.
  // shared/ability-progression.ts → './power-definitions.js') because that
  // same code is also compiled by the standalone Colyseus server build
  // (server/tsconfig.json) under Node's native ESM loader, which requires
  // real .js extensions on relative imports. Without this, Turbopack dev
  // fails with "Module not found: Can't resolve './sim-constants.js'"
  // even though `next build` (webpack) compiles the exact same file fine.
  // Next 15 Turbopack has no extensionAlias equivalent (resolveExtensionAlias
  // only landed in a later release), so every shared/ module imported with a
  // .js suffix needs an explicit entry. Alias *values* resolve from the
  // project root, so map to './shared/<name>.ts'. Keep this list in sync with
  // `grep -rhoE "from '\./[a-z-]+\.js'" shared/`.
  turbopack: {
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
    resolveAlias: {
      './power-definitions.js': './shared/power-definitions.ts',
      './sim-constants.js': './shared/sim-constants.ts',
      './custom-moves.js': './shared/custom-moves.ts',
    },
  },
  // Ensure custom-output Prisma engines are traced into Vercel serverless bundles.
  outputFileTracingIncludes: {
    '/**': ['./src/generated/prisma/**/*'],
  },
  serverExternalPackages: ['@prisma/client', 'prisma'],
  webpack: (config, { isServer }) => {
    // PrismaPlugin only needed for Webpack (not Turbopack)
    // Turbopack has native support for Prisma without plugin
    if (isServer) {
      config.plugins = [...config.plugins, new PrismaPlugin()];
    }
    // shared/**/*.ts is also compiled by the separate Colyseus server build
    // (server/tsconfig.json), which runs on Node's native ESM loader and
    // therefore requires explicit .js extensions on relative imports
    // (e.g. shared/ability-progression.ts imports './power-definitions.js').
    // Webpack doesn't map a literal .js specifier back to its .ts source by
    // default, so without this alias those same imports 404 under Next.js.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'iili.io',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.postimg.cc',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.steamstatic.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.akamai.steamstatic.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'steamcdn-a.akamaihd.net',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'flagcdn.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/embed/:path*',
        headers: [
          // Allow forums / Twitch / Discord-style embeds to iframe this card.
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
        ],
      },
    ];
  },
};

export default nextConfig;
