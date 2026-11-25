import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

/**
 * Emits a refresh-safe static entry at `dist/portal/login/index.html` with
 * relative `./` asset references adjusted to `../../` so direct navigation,
 * page reloads, and bookmarks to `https://destriatech.com/portal/login`
 * return HTTP 200 on GitHub Pages without altering root `dist/index.html`.
 */
function portalLoginEntryPlugin(): Plugin {
  return {
    name: 'destria-portal-login-static-entry',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const rootIndexPath = path.join(distDir, 'index.html');
      if (!fs.existsSync(rootIndexPath)) return;

      const rootHtml = fs.readFileSync(rootIndexPath, 'utf8');
      const loginHtml = rootHtml.replace(
        /\b(href|src|content)="\.\//g,
        '$1="../../'
      );

      const loginDir = path.join(distDir, 'portal', 'login');
      fs.mkdirSync(loginDir, {recursive: true});
      fs.writeFileSync(path.join(loginDir, 'index.html'), loginHtml, 'utf8');
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), portalLoginEntryPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
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
