import express from 'express';
import { createServer, request as httpRequest } from 'http';
import { join, dirname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { platform } from 'os';

// Get the directory of this file (works when installed globally via npm)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get version from package.json
function getVersion(): string {
  try {
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch {
    return '1.0.0';
  }
}
import { apiRouter } from './api/routes.js';
import { terminalRouter } from './api/terminal-routes.js';
import { appRouter } from './api/app-routes.js';
import { authMiddleware, rateLimitMiddleware, errorHandler, getAuthToken } from './api/middleware.js';
import { sharedDockerManager } from './core/shared-docker-manager.js';
import { settingsManager } from './config/settings.js';
import { wsManager } from './core/ws-manager.js';
import { terminalSessionManager } from './core/terminal-session.js';
import { tunnelManager } from './core/tunnel-manager.js';
import { appManager } from './core/app-manager.js';
import { remoteTunnelManager } from './core/remote-tunnel-manager.js';
import { mcpManager } from './core/mcp-manager.js';
import { updateChecker } from './core/update-checker.js';

export interface StartServerOptions {
  port?: number;
  host?: string;
  skipWizard?: boolean;
  openBrowser?: boolean;
}

function openInBrowser(url: string): void {
  const os = platform();
  let command: string;
  if (os === 'win32') {
    command = `start "" "${url}"`;
  } else if (os === 'darwin') {
    command = `open "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }
  exec(command, (err) => {
    if (err) {
      console.warn(`[Browser] Could not open browser automatically. Visit: ${url}`);
    }
  });
}

let serverInstance: ReturnType<typeof createServer> | null = null;

/**
 * Clean up orphaned terminal worktrees from deleted sessions on startup
 */
function cleanupOrphanedTerminalWorktrees(): void {
  console.log('[Startup] Checking for orphaned terminal worktrees...');
  const cleanedCount = terminalSessionManager.cleanupOrphanedWorktrees();
  if (cleanedCount > 0) {
    console.log(`[Startup] Cleaned up ${cleanedCount} orphaned terminal worktree(s)`);
  }
}

export async function startServer(options: StartServerOptions = {}): Promise<void> {
  const PORT = options.port ?? (process.env.CLAUDEDESK_PORT ? parseInt(process.env.CLAUDEDESK_PORT, 10) : 8787);
  const HOST = options.host ?? (process.env.ALLOW_REMOTE === 'true' ? '0.0.0.0' : '127.0.0.1');

  // SEC-02: Warn when remote access is enabled
  if (HOST === '0.0.0.0') {
    console.warn('');
    console.warn('╔════════════════════════════════════════════════════════════════╗');
    console.warn('║                    ⚠️  SECURITY WARNING  ⚠️                     ║');
    console.warn('╠════════════════════════════════════════════════════════════════╣');
    console.warn('║  ALLOW_REMOTE=true: Server is accessible from your network    ║');
    console.warn('║  Anyone on your network can access this instance              ║');
    console.warn('║  Only use this in trusted network environments                ║');
    console.warn('╚════════════════════════════════════════════════════════════════╝');
    console.warn('');
  }

  // Run terminal worktree cleanup on startup
  cleanupOrphanedTerminalWorktrees();

  const app = express();

  // Middleware
  app.use(express.json());
  app.use(authMiddleware);
  app.use(rateLimitMiddleware);

  // API routes
  app.use('/api', apiRouter);
  app.use('/api/terminal', terminalRouter);
  app.use('/api/apps', appRouter);

  // Static UI files - serve from Vite build
  // Use __dirname to find client files relative to this file (works with global npm install)
  const staticDir = join(__dirname, 'client');
  const hasBuiltClient = existsSync(join(staticDir, 'index.html'));
  const viteDevPort = 5173;

  if (hasBuiltClient) {
    app.use(express.static(staticDir));
  }

  // SPA fallback - serve index.html for non-API routes
  // In dev mode (no built client), proxy to Vite dev server for tunnel support
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      if (hasBuiltClient) {
        const indexPath = join(staticDir, 'index.html');
        res.sendFile(indexPath);
      } else {
        // Dev mode: proxy to Vite dev server
        const proxyReq = httpRequest(
          {
            hostname: 'localhost',
            port: viteDevPort,
            path: req.url,
            method: req.method,
            headers: req.headers,
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            proxyRes.pipe(res, { end: true });
          }
        );

        proxyReq.on('error', () => {
          res.status(503).send(`
            <html>
              <head><title>ClaudeDesk - Dev Mode</title></head>
              <body style="font-family: system-ui; background: #0d1117; color: #c9d1d9; padding: 40px; text-align: center;">
                <h1>Vite Dev Server Not Running</h1>
                <p>The UI dev server is not available on port ${viteDevPort}.</p>
                <p style="color: #8b949e;">To use tunnels in development mode, run:</p>
                <pre style="background: #161b22; padding: 16px; border-radius: 8px; display: inline-block;">npm run dev</pre>
                <p style="color: #8b949e; margin-top: 24px;">Or for production mode:</p>
                <pre style="background: #161b22; padding: 16px; border-radius: 8px; display: inline-block;">npm run build && npm start</pre>
              </body>
            </html>
          `);
        });

        req.pipe(proxyReq, { end: true });
      }
    }
  });

  // Error handler
  app.use(errorHandler);

  // Create HTTP server (needed for WebSocket)
  const server = createServer(app);
  serverInstance = server;

  // Initialize WebSocket server
  const authToken = getAuthToken();
  wsManager.initialize(server, authToken);

  // In dev mode, set up WebSocket proxy to Vite for HMR support via tunnel
  if (!hasBuiltClient) {
    wsManager.setUpgradeFallback((request, socket, head) => {
      // Proxy WebSocket upgrade to Vite dev server
      const proxyReq = httpRequest(
        {
          hostname: 'localhost',
          port: viteDevPort,
          path: request.url,
          method: 'GET',
          headers: {
            ...request.headers,
            host: `localhost:${viteDevPort}`,
          },
        },
        () => {} // Response handled via upgrade
      );

      proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
        // Forward the upgrade response to the client
        socket.write(
          `HTTP/1.1 101 Switching Protocols\r\n` +
          `Upgrade: websocket\r\n` +
          `Connection: Upgrade\r\n` +
          `Sec-WebSocket-Accept: ${proxyRes.headers['sec-websocket-accept']}\r\n` +
          `\r\n`
        );

        // Pipe data between client and Vite
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);

        // Handle close
        socket.on('close', () => proxySocket.destroy());
        proxySocket.on('close', () => socket.destroy());
      });

      proxyReq.on('error', () => {
        socket.destroy();
      });

      proxyReq.end();
    });
  }

  // Initialize terminal session manager (loads saved sessions)
  // This is imported above, which triggers initialization

  // Start server
  server.listen(PORT, HOST, async () => {
      // Auto-start Docker services if enabled
      const dockerSettings = settingsManager.getDocker();
      let dockerStatus = 'Docker: disabled';
      if (dockerSettings.enabled && dockerSettings.autoStart) {
        sharedDockerManager.start()
          .then(() => {
            console.log('[Docker] Auto-started shared Docker services');
          })
          .catch((err) => {
            console.warn('[Docker] Failed to auto-start:', err.message);
          });
        dockerStatus = 'Docker: auto-starting...';
      } else if (dockerSettings.enabled) {
        dockerStatus = 'Docker: enabled (manual start)';
      }

      // Initialize MCP manager (auto-connects to enabled servers)
      mcpManager.initialize()
        .then(() => {
          console.log('[MCP] Manager initialized');
        })
        .catch((err) => {
          console.warn('[MCP] Failed to initialize:', err.message);
        });

      // Initialize update checker
      updateChecker.checkUpdateMarker();
      const updateSettings = settingsManager.getUpdate();
      updateChecker.startAutoCheck(updateSettings);

      // Auto-start remote tunnel if enabled
      const tunnelSettings = settingsManager.getTunnel();
      let tunnelStatus = 'Tunnel: disabled';
      if (tunnelSettings.enabled && tunnelSettings.autoStart) {
        remoteTunnelManager.start()
          .then((result) => {
            if (result.success) {
              console.log('[Tunnel] Auto-started remote access tunnel:', result.url);
            } else {
              console.warn('[Tunnel] Failed to auto-start:', result.error);
            }
          })
          .catch((err) => {
            console.warn('[Tunnel] Failed to auto-start:', err.message);
          });
        tunnelStatus = 'Tunnel: auto-starting...';
      } else if (tunnelSettings.enabled) {
        tunnelStatus = 'Tunnel: enabled (manual start)';
      }

      const sessionCount = terminalSessionManager.getAllSessions().length;
      const terminalStatus = sessionCount > 0
        ? `Terminal: ${sessionCount} session(s)`
        : 'Terminal: ready';

      const networkInfo = HOST === '0.0.0.0'
        ? `Network: ${HOST}:${PORT} (remote access enabled)`
        : `Network: localhost only`;

      const version = getVersion();
      const versionLine = `CLAUDEDESK v${version}`.padStart(29 + Math.floor(`CLAUDEDESK v${version}`.length / 2)).padEnd(57);
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║${versionLine}║
╠═══════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}                 ║
║  WebSocket: ws://localhost:${PORT}/ws                        ║
║  ${networkInfo.padEnd(43)}║
║  ${terminalStatus.padEnd(43)}║
║  ${dockerStatus.padEnd(43)}║
║  ${tunnelStatus.padEnd(43)}║
╚═══════════════════════════════════════════════════════════╝
  `);

      // Auto-open browser if enabled
      if (options.openBrowser) {
        const url = `http://localhost:${PORT}`;
        console.log(`[Browser] Opening ${url} ...`);
        openInBrowser(url);
      }
    });

  // REL-03: Comprehensive graceful shutdown to prevent orphaned processes
  let isShuttingDown = false;

  async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) {
      console.log(`[Shutdown] Already shutting down, ignoring ${signal}`);
      return;
    }
    isShuttingDown = true;

    console.log(`\n[Shutdown] Received ${signal}, cleaning up...`);

    try {
      // 1. Close WebSocket connections
      console.log('[Shutdown] Closing WebSocket connections...');
      wsManager.shutdown();

      // 2. Stop all running apps
      console.log('[Shutdown] Stopping running apps...');
      await appManager.stopAllApps();

      // 3. Stop all job tunnels (cloudflared processes)
      console.log('[Shutdown] Stopping tunnels...');
      await tunnelManager.stopAllTunnels();

      // 4. Kill Claude processes without deleting session data (preserves sessions for restart)
      console.log('[Shutdown] Stopping Claude processes (preserving sessions)...');
      const sessions = terminalSessionManager.getAllSessions();
      for (const session of sessions) {
        try {
          terminalSessionManager.cancelSession(session.id);
        } catch (err) {
          console.warn(`[Shutdown] Failed to stop session ${session.id}:`, err);
        }
      }

      // 5. Stop Docker services if they were auto-started
      const dockerSettings = settingsManager.getDocker();
      if (dockerSettings.enabled && dockerSettings.autoStart) {
        console.log('[Shutdown] Stopping Docker services...');
        try {
          await sharedDockerManager.stop();
        } catch (err) {
          console.warn('[Shutdown] Failed to stop Docker:', err);
        }
      }

      // 6. Stop remote tunnel
      console.log('[Shutdown] Stopping remote tunnel...');
      try {
        await remoteTunnelManager.shutdown();
      } catch (err) {
        console.warn('[Shutdown] Failed to stop tunnel:', err);
      }

      // 7. Shutdown MCP manager
      console.log('[Shutdown] Disconnecting MCP servers...');
      try {
        await mcpManager.shutdown();
      } catch (err) {
        console.warn('[Shutdown] Failed to shutdown MCP:', err);
      }

      // 8. Stop update checker
      updateChecker.shutdown();

      // 9. Close HTTP server
      console.log('[Shutdown] Closing HTTP server...');
      server.close();

      console.log('[Shutdown] Cleanup complete');
    } catch (err) {
      console.error('[Shutdown] Error during cleanup:', err);
    }

    process.exit(0);
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Handle uncaught errors to prevent zombie processes
  process.on('uncaughtException', (err) => {
    console.error('[Fatal] Uncaught exception:', err);
    gracefulShutdown('uncaughtException').catch(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Fatal] Unhandled rejection:', reason);
    gracefulShutdown('unhandledRejection').catch(() => process.exit(1));
  });
}

// Backward compatibility: if this file is run directly, start the server
// Cross-platform: Windows paths need file:/// prefix, Unix paths get it from the leading /
const isDirectRun = (() => {
  const scriptPath = process.argv[1]?.replace(/\\/g, '/');
  if (!scriptPath) return false;
  // Windows: C:/path needs file:///C:/path (3 slashes)
  // Unix: /path with file:// becomes file:///path (the / in path adds the 3rd slash)
  const fileUrl = /^[a-zA-Z]:/.test(scriptPath)
    ? `file:///${scriptPath}`
    : `file://${scriptPath}`;
  return import.meta.url === fileUrl;
})();

if (isDirectRun) {
  startServer().catch((err) => {
    console.error('[Fatal] Failed to start server:', err);
    process.exit(1);
  });
}
