import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const stubs = path.join(here, 'stubs');
const srcRoot = path.join(repo, 'src').replace(/\\/g, '/');

function copyGameAssets() {
  return {
    name: 'kilrun-copy-game-assets',
    buildStart() {
      const src = path.join(repo, 'public');
      const dest = path.join(here, 'public');
      fs.mkdirSync(dest, { recursive: true });
      for (const folder of ['game', 'shop']) {
        const from = path.join(src, folder);
        if (fs.existsSync(from)) {
          fs.cpSync(from, path.join(dest, folder), { recursive: true, force: true });
        }
      }
      for (const file of ['K2.png', 'kilrun.png', 'apple-icon.png']) {
        const from = path.join(src, file);
        if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dest, file));
      }
      const destSite = path.join(dest, 'uploads', 'site');
      fs.mkdirSync(destSite, { recursive: true });
      for (const file of ['wordmark-f0ed874d3b8a105f.png', 'bg3.png']) {
        const from = path.join(src, 'uploads', 'site', file);
        if (fs.existsSync(from)) fs.copyFileSync(from, path.join(destSite, file));
      }
    },
  };
}

function synthesizeServerStub(source: string): string {
  const fns = new Set<string>();
  const types = new Set<string>();
  for (const m of source.matchAll(/export\s+async\s+function\s+(\w+)/g)) fns.add(m[1]);
  for (const m of source.matchAll(/export\s+function\s+(\w+)/g)) fns.add(m[1]);
  for (const m of source.matchAll(/export\s+const\s+(\w+)/g)) fns.add(m[1]);
  for (const m of source.matchAll(/export\s+type\s+(\w+)/g)) types.add(m[1]);
  for (const m of source.matchAll(/export\s+interface\s+(\w+)/g)) types.add(m[1]);
  const lines = ['const _noop = async (..._args: unknown[]) => null;'];
  for (const t of types) lines.push(`export type ${t} = any;`);
  for (const f of fns) {
    if (types.has(f)) continue;
    lines.push(`export const ${f} = _noop;`);
  }
  lines.push('export default _noop;');
  return lines.join('\n');
}

const dedicatedStubs: Record<string, string> = {
  '@/auth': 'auth.ts',
  '@/lib/trusted-server': 'trusted-server.ts',
  '@/lib/prisma': 'prisma.ts',
  '@/generated/prisma': 'prisma.ts',
  '@/lib/game-map-actions': 'game-map-actions.ts',
  '@/lib/actions': 'actions.ts',
  '@/lib/prefab-library-actions': 'prefab-library-actions.ts',
  '@/lib/key-bindings-config': 'key-bindings-config.ts',
  '@/lib/power-tree-config': 'power-tree-config.ts',
  '@/lib/social-actions': 'social-actions.ts',
  '@/lib/admin-db-sync': 'admin-db-sync.ts',
  '@/lib/site-asset-upload': 'site-asset-upload.ts',
  '@/lib/model-asset-upload': 'model-asset-upload.ts',
  '@/lib/game-prefab-actions': 'game-prefab-actions.ts',
  '@/lib/ghost-actions': 'ghost-actions.ts',
  '@/lib/progression-actions': 'progression-actions.ts',
  '@/lib/game-progression-actions': 'game-progression-actions.ts',
  '@/lib/custom-move-sound-events': 'custom-move-sound-events.ts',
};

function stubServerModules(): Plugin {
  return {
    name: 'kilrun-stub-server-modules',
    enforce: 'pre',
    resolveId(id) {
      const bare = id.split('?')[0];
      const file = dedicatedStubs[bare];
      if (file) return path.join(stubs, file);
      for (const [find, stubFile] of Object.entries(dedicatedStubs)) {
        if (bare.startsWith(`${find}.`)) return path.join(stubs, stubFile);
      }
      return null;
    },
    load(id) {
      const filePath = id.split('?')[0];
      const norm = filePath.replace(/\\/g, '/');
      if (norm.endsWith('/src/auth.ts')) {
        return fs.readFileSync(path.join(stubs, 'auth.ts'), 'utf8');
      }
      if (norm.endsWith('/src/lib/trusted-server.ts')) {
        return fs.readFileSync(path.join(stubs, 'trusted-server.ts'), 'utf8');
      }
      if (norm.endsWith('/src/lib/prisma.ts') || norm.includes('/src/generated/prisma')) {
        return fs.readFileSync(path.join(stubs, 'prisma.ts'), 'utf8');
      }
      if (!norm.startsWith(srcRoot)) return null;
      if (!norm.endsWith('.ts') && !norm.endsWith('.tsx')) return null;
      let source = '';
      try {
        source = fs.readFileSync(filePath, 'utf8');
      } catch {
        return null;
      }
      if (!source.includes("'use server'")) return null;
      return synthesizeServerStub(source);
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: here,
  base: './',
  publicDir: path.join(here, 'public'),
  plugins: [stubServerModules(), react(), copyGameAssets()],
  css: {
    postcss: path.join(repo, 'postcss.config.mjs'),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    'process.env.NEXT_PUBLIC_GAME_SERVER_URL': JSON.stringify(
      process.env.NEXT_PUBLIC_GAME_SERVER_URL || ''
    ),
    'process.env.NEXT_PUBLIC_SITE_URL': JSON.stringify(process.env.NEXT_PUBLIC_SITE_URL || ''),
    'process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY': JSON.stringify(''),
  },
  resolve: {
    alias: [
      { find: 'next/dynamic', replacement: path.join(stubs, 'next-dynamic.tsx') },
      ...Object.entries(dedicatedStubs).map(([find, file]) => ({
        find,
        replacement: path.join(stubs, file),
      })),
      { find: '@shared', replacement: path.join(repo, 'shared').replace(/\\/g, '/') },
      { find: /^@\//, replacement: `${path.join(repo, 'src').replace(/\\/g, '/')}/` },
    ],
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: path.join(here, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
}));
