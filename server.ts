import crypto from 'crypto';
import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createApp } from './src/server/app';
import { logStructured } from './src/server/logger';
import { attachVoiceLiveBridge } from './src/server/voiceLiveBridge';
import { attachFrontDeskVoiceStreamBridge } from './src/server/frontDeskVoiceStreamBridge';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveListenPort(rawPort?: string): number {
  if (!rawPort) return 3000;
  const trimmed = rawPort.trim();
  if (!/^\d+$/.test(trimmed)) return 3000;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return 3000;
  }
  return parsed;
}

const PORT = resolveListenPort(process.env.PORT);

function resolveDistDirectory(): string | null {
  const candidates = [
    path.resolve(__dirname, 'dist'),
    path.resolve(process.cwd(), 'dist'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return null;
}

async function startServer() {
  const {
    app,
    db,
    emailService,
    authService,
    ai,
    aiRuntimeConfig,
    aiToolsExecutor,
    frontDeskStore,
    frontDeskOperationsStore,
    localInferenceClient,
    frontDeskTokenSigner,
    frontDeskUnifiedGateway,
    allowedOrigins,
  } = createApp();
  const workerId = `worker-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;

  if (process.env.NODE_ENV !== 'production') {
    const publicDir = path.resolve(__dirname, 'public');
    const staticAssetOpts = { redirect: false, index: false };
    app.use('/resources', express.static(path.join(publicDir, 'resources'), staticAssetOpts));
    app.use('/documents', express.static(path.join(publicDir, 'documents'), staticAssetOpts));
    app.use('/branding', express.static(path.join(publicDir, 'branding'), staticAssetOpts));
    app.use('/worklets', express.static(path.join(publicDir, 'worklets'), staticAssetOpts));

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = resolveDistDirectory();
    if (distDir) {
      app.use(express.static(distDir));
      app.get('*', (req: Request, res: Response) => {
        if (req.path.startsWith('/api')) {
          res.status(404).json({ success: false, error: 'API endpoint not found' });
          return;
        }
        res.sendFile(path.join(distDir, 'index.html'));
      });
    } else {
      // API-only production deployment (e.g., Railway backend serving GitHub Pages frontend)
      app.get('/', (_req: Request, res: Response) => {
        res.status(200).json({
          success: true,
          service: 'DESTRIA NETWORK API Gateway',
          healthEndpoint: '/api/health',
        });
      });
      app.use((req: Request, res: Response) => {
        res.status(404).json({
          success: false,
          error: req.path.startsWith('/api') ? 'API endpoint not found' : 'Not found on API host',
        });
      });
    }
  }

  // Periodic background email outbox retry worker with atomic lease claiming
  let retryTimer: ReturnType<typeof setInterval> | null = null;
  if (db.isConfigured && emailService.isConfigured()) {
    retryTimer = setInterval(() => {
      void emailService.processRetryQueue(15, undefined, workerId, 120).catch((err) => {
        logStructured('warn', 'outbox_retry_worker_error', {
          workerId,
          error: err?.message,
        });
      });
    }, 60_000);
    retryTimer.unref();
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    const frontDeskPersistence = frontDeskStore.getPersistenceStatus();
    logStructured('info', 'server_started', {
      port: PORT,
      workerId,
      environment: process.env.NODE_ENV || 'development',
      databaseConfigured: db.isConfigured,
      frontDeskDurable: frontDeskPersistence.durable,
      frontDeskMode: frontDeskPersistence.mode,
      databaseMigrationVersion: '010',
      aiProviderMode: localInferenceClient.providerMode,
      localInferenceConfigured: localInferenceClient.isConfigured,
      geminiConfigured: Boolean(ai),
      geminiProviderStatus: aiRuntimeConfig.getCanonicalProviderStatus(),
      emailConfigured: emailService.isConfigured(),
      adminBootstrapConfigured: authService.isBootstrapLoginConfigured(),
      allowedOriginsCount: allowedOrigins.length,
    });
  });

  const voiceLiveBridge = attachVoiceLiveBridge(server, {
    ai,
    runtimeConfig: aiRuntimeConfig,
    toolsExecutor: aiToolsExecutor,
    allowedOrigins,
  });

  const frontDeskVoiceStreamBridge = attachFrontDeskVoiceStreamBridge(server, {
    gateway: frontDeskUnifiedGateway,
    operationsStore: frontDeskOperationsStore,
    localInferenceClient,
    tokenSigner: frontDeskTokenSigner,
    allowedOrigins,
  });

  // Harden HTTP server socket & header timeouts against slowloris / hung upstream connections
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 65_000;

  let isShuttingDown = false;
  const gracefulShutdown = (signal: NodeJS.Signals) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logStructured('info', 'server_shutdown_initiated', { signal, workerId });
    voiceLiveBridge.close();
    frontDeskVoiceStreamBridge.close();
    if (retryTimer) {
      clearInterval(retryTimer);
      retryTimer = null;
    }
    const forceExitTimer = setTimeout(() => {
      logStructured('warn', 'server_shutdown_forced_exit', { signal, workerId });
      process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    server.close((closeErr) => {
      clearTimeout(forceExitTimer);
      if (closeErr) {
        logStructured('error', 'server_shutdown_error', {
          signal,
          workerId,
          error: closeErr.message,
        });
        process.exit(1);
      }
      logStructured('info', 'server_shutdown_completed', { signal, workerId });
      process.exit(0);
    });
  };

  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.once('SIGINT', () => gracefulShutdown('SIGINT'));
}

// Guard auto-start when imported by unit tests
const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectExecution) {
  startServer().catch((err) => {
    logStructured('error', 'server_boot_failed', { error: err?.message || String(err) });
    process.exit(1);
  });
}
