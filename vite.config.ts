import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { generateStaticPagesRoutes } from './scripts/build-pages-routes.mjs';

function normalizeBasePath(rawBase?: string): string {
  if (!rawBase || !rawBase.trim()) return '/';
  let base = rawBase.trim();
  if (!base.startsWith('/')) base = `/${base}`;
  if (!base.endsWith('/')) base = `${base}/`;
  return base;
}

/**
 * Generates refresh-safe static `<route>/index.html` entry points for every
 * canonical static route in `src/config/routeManifest.json`, plus a clean SPA
 * `dist/404.html` and `dist/CNAME` for GitHub Pages custom-domain hosting.
 */
function enterpriseCleanRoutesPlugin(): Plugin {
  return {
    name: 'destria-enterprise-clean-routes',
    closeBundle() {
      const distDir = path.resolve(import.meta.dirname, 'dist');
      generateStaticPagesRoutes(distDir);
    },
  };
}

export default defineConfig(() => {
  const base = normalizeBasePath(process.env.VITE_BASE_PATH);

  return {
    base,
    plugins: [react(), tailwindcss(), enterpriseCleanRoutesPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
