import { spawn, execSync, ChildProcess } from 'child_process';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { stringify as stringifyYaml } from 'yaml';
import { settingsManager, DockerSettings, DockerService } from '../config/settings.js';

export interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'error' | 'starting';
  port: number;
  containerId?: string;
  health?: 'healthy' | 'unhealthy' | 'starting' | 'none';
}

export interface SharedDockerState {
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  services: Record<string, ServiceStatus>;
  error?: string;
  startedAt?: string;
}

export interface ConnectionInfo {
  url: string;
  env: Record<string, string>;
}

export class SharedDockerManager {
  private state: SharedDockerState;

  constructor() {
    this.state = {
      status: 'stopped',
      services: {},
    };
  }

  // Lazy path resolution - evaluated when needed, not at construction time
  // This ensures process.cwd() returns the correct data directory after cli.ts calls process.chdir()
  private getConfigDir(): string {
    return join(process.cwd(), 'config');
  }

  private getComposeFilePath(): string {
    return join(this.getConfigDir(), 'docker-compose.yml');
  }

  async isDockerAvailable(): Promise<boolean> {
    try {
      execSync('docker info', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  async isComposeAvailable(): Promise<boolean> {
    try {
      // Try docker compose (V2) first
      execSync('docker compose version', { stdio: 'pipe' });
      return true;
    } catch {
      try {
        // Fallback to docker-compose (V1)
        execSync('docker-compose version', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    }
  }

  private getComposeCommand(): string[] {
    try {
      execSync('docker compose version', { stdio: 'pipe' });
      return ['docker', 'compose'];
    } catch {
      return ['docker-compose'];
    }
  }

  generateComposeFile(): string {
    const settings = settingsManager.getDocker();
    const services: Record<string, object> = {};
    const volumes: string[] = [];

    if (settings.services.postgres.enabled) {
      const pg = settings.services.postgres;
      services.postgres = {
        image: `${pg.image}:${pg.version || '16-alpine'}`,
        container_name: 'claudedesk-postgres',
        ports: [`${pg.port}:5432`],
        environment: {
          POSTGRES_USER: pg.username || 'claudedesk',
          POSTGRES_PASSWORD: pg.password || 'claudedesk_dev',
          POSTGRES_DB: pg.database || 'claudedesk_dev',
        },
        ...(pg.dataVolume ? { volumes: ['claudedesk-postgres-data:/var/lib/postgresql/data'] } : {}),
        healthcheck: {
          test: ['CMD-SHELL', `pg_isready -U ${pg.username || 'claudedesk'}`],
          interval: '5s',
          timeout: '5s',
          retries: 5,
        },
        restart: 'unless-stopped',
      };
      if (pg.dataVolume) {
        volumes.push('claudedesk-postgres-data');
      }
    }

    if (settings.services.redis.enabled) {
      const redis = settings.services.redis;
      services.redis = {
        image: `${redis.image}:${redis.version || '7-alpine'}`,
        container_name: 'claudedesk-redis',
        ports: [`${redis.port}:6379`],
        healthcheck: {
          test: ['CMD', 'redis-cli', 'ping'],
          interval: '5s',
          timeout: '5s',
          retries: 5,
        },
        restart: 'unless-stopped',
      };
    }

    const compose: Record<string, unknown> = {
      version: '3.8',
      services,
    };

    if (volumes.length > 0) {
      compose.volumes = volumes.reduce((acc, v) => ({ ...acc, [v]: {} }), {});
    }

    compose.networks = {
      default: { name: settings.networkName },
    };

    // MAINT-01: Use yaml package instead of custom implementation for reliability
    return stringifyYaml(compose, { lineWidth: 0 });
  }

  private writeComposeFile(): void {
    const configDir = this.getConfigDir();
    const composeFilePath = this.getComposeFilePath();
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    const yaml = this.generateComposeFile();
    writeFileSync(composeFilePath, yaml.trim());
    console.log(`[SharedDockerManager] Wrote docker-compose.yml to ${composeFilePath}`);
  }

  async start(): Promise<SharedDockerState> {
    const settings = settingsManager.getDocker();

    if (!settings.enabled) {
      throw new Error('Docker is not enabled in settings');
    }

    const hasEnabledServices = settings.services.postgres.enabled || settings.services.redis.enabled;
    if (!hasEnabledServices) {
      throw new Error('No Docker services are enabled');
    }

    if (!await this.isDockerAvailable()) {
      throw new Error('Docker is not available. Please ensure Docker Desktop is running.');
    }

    if (!await this.isComposeAvailable()) {
      throw new Error('Docker Compose is not available.');
    }

    this.state.status = 'starting';
    this.state.error = undefined;

    try {
      // Generate and write docker-compose.yml
      this.writeComposeFile();

      // Start docker compose
      const [cmd, ...args] = this.getComposeCommand();
      const fullArgs = [...args, '-f', this.getComposeFilePath(), 'up', '-d'];

      console.log(`[SharedDockerManager] Running: ${cmd} ${fullArgs.join(' ')}`);

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(cmd, fullArgs, {
          stdio: 'pipe',
        });

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data) => {
          stdout += data.toString();
          console.log('[SharedDockerManager] stdout:', data.toString());
        });

        proc.stderr?.on('data', (data) => {
          stderr += data.toString();
          console.log('[SharedDockerManager] stderr:', data.toString());
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Docker Compose failed: ${stderr || stdout}`));
          }
        });

        proc.on('error', (err) => {
          reject(err);
        });
      });

      // Wait for services to be healthy
      await this.waitForHealthy();

      this.state.status = 'running';
      this.state.startedAt = new Date().toISOString();

      // Update service statuses
      await this.refreshServiceStatuses();

      return this.state;
    } catch (error) {
      this.state.status = 'error';
      this.state.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async stop(): Promise<SharedDockerState> {
    if (!await this.isDockerAvailable()) {
      this.state.status = 'stopped';
      return this.state;
    }

    this.state.status = 'stopping';

    try {
      const [cmd, ...args] = this.getComposeCommand();
      const fullArgs = [...args, '-f', this.getComposeFilePath(), 'down'];

      console.log(`[SharedDockerManager] Running: ${cmd} ${fullArgs.join(' ')}`);

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(cmd, fullArgs, {
          stdio: 'pipe',
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error('Failed to stop Docker Compose'));
          }
        });

        proc.on('error', reject);
      });

      this.state.status = 'stopped';
      this.state.services = {};
      this.state.startedAt = undefined;

      return this.state;
    } catch (error) {
      this.state.status = 'error';
      this.state.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async restart(): Promise<SharedDockerState> {
    await this.stop();
    return this.start();
  }

  private async waitForHealthy(timeout = 60000): Promise<void> {
    const start = Date.now();
    const settings = settingsManager.getDocker();

    while (Date.now() - start < timeout) {
      let allHealthy = true;

      if (settings.services.postgres.enabled) {
        const healthy = await this.checkContainerHealth('claudedesk-postgres');
        if (!healthy) allHealthy = false;
      }

      if (settings.services.redis.enabled) {
        const healthy = await this.checkContainerHealth('claudedesk-redis');
        if (!healthy) allHealthy = false;
      }

      if (allHealthy) {
        console.log('[SharedDockerManager] All services healthy');
        return;
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    console.warn('[SharedDockerManager] Timeout waiting for healthy services');
  }

  private async checkContainerHealth(containerName: string): Promise<boolean> {
    try {
      const result = execSync(
        `docker inspect --format='{{.State.Health.Status}}' ${containerName}`,
        { stdio: 'pipe', encoding: 'utf-8' }
      ).trim();
      return result === 'healthy';
    } catch {
      return false;
    }
  }

  private async refreshServiceStatuses(): Promise<void> {
    const settings = settingsManager.getDocker();

    // Run both container checks in parallel
    const checks: Promise<void>[] = [];

    if (settings.services.postgres.enabled) {
      checks.push(
        this.getContainerStatus('postgres', 'claudedesk-postgres', settings.services.postgres.port)
          .then(status => { this.state.services.postgres = status; })
      );
    }

    if (settings.services.redis.enabled) {
      checks.push(
        this.getContainerStatus('redis', 'claudedesk-redis', settings.services.redis.port)
          .then(status => { this.state.services.redis = status; })
      );
    }

    await Promise.all(checks);
  }

  private async getContainerStatus(name: string, containerName: string, port: number): Promise<ServiceStatus> {
    try {
      // Use single docker inspect with JSON output instead of 3 separate calls
      const inspectOutput = execSync(
        `docker inspect ${containerName}`,
        { stdio: 'pipe', encoding: 'utf-8' }
      );

      const inspectData = JSON.parse(inspectOutput);
      if (!inspectData || inspectData.length === 0) {
        return { name, status: 'stopped', port };
      }

      const container = inspectData[0];
      const running = container.State?.Running === true;
      const containerId = container.Id?.substring(0, 12) || '';

      let health: 'healthy' | 'unhealthy' | 'starting' | 'none' = 'none';
      const healthStatus = container.State?.Health?.Status;
      if (healthStatus === 'healthy') health = 'healthy';
      else if (healthStatus === 'unhealthy') health = 'unhealthy';
      else if (healthStatus === 'starting') health = 'starting';

      return {
        name,
        status: running ? 'running' : 'stopped',
        port,
        containerId,
        health,
      };
    } catch {
      return {
        name,
        status: 'stopped',
        port,
      };
    }
  }

  async getStatus(): Promise<SharedDockerState> {
    if (!await this.isDockerAvailable()) {
      return {
        status: 'stopped',
        services: {},
        error: 'Docker is not available',
      };
    }

    // Refresh service statuses
    await this.refreshServiceStatuses();

    // Update overall status based on services
    const settings = settingsManager.getDocker();
    if (!settings.enabled) {
      this.state.status = 'stopped';
    } else {
      const enabledServices = Object.values(this.state.services);
      if (enabledServices.length === 0) {
        this.state.status = 'stopped';
      } else if (enabledServices.every(s => s.status === 'running')) {
        this.state.status = 'running';
      } else if (enabledServices.some(s => s.status === 'running')) {
        this.state.status = 'running'; // Partial running
      } else {
        this.state.status = 'stopped';
      }
    }

    return { ...this.state };
  }

  async getServiceLogs(serviceName: string, tail = 100): Promise<string> {
    const containerName = serviceName === 'postgres' ? 'claudedesk-postgres' :
                          serviceName === 'redis' ? 'claudedesk-redis' : serviceName;

    try {
      const logs = execSync(
        `docker logs --tail ${tail} ${containerName}`,
        { stdio: 'pipe', encoding: 'utf-8' }
      );
      return logs;
    } catch (error) {
      return `Failed to get logs: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  getConnectionInfo(): Record<string, ConnectionInfo> {
    const settings = settingsManager.getDocker();
    const connections: Record<string, ConnectionInfo> = {};

    if (settings.services.postgres.enabled) {
      const pg = settings.services.postgres;
      const url = `postgresql://${pg.username}:${pg.password}@localhost:${pg.port}/${pg.database}`;
      connections.postgres = {
        url,
        env: {
          DATABASE_URL: url,
          POSTGRES_HOST: 'localhost',
          POSTGRES_PORT: String(pg.port),
          POSTGRES_USER: pg.username || 'claudedesk',
          POSTGRES_PASSWORD: pg.password || 'claudedesk_dev',
          POSTGRES_DB: pg.database || 'claudedesk_dev',
        },
      };
    }

    if (settings.services.redis.enabled) {
      const redis = settings.services.redis;
      const url = `redis://localhost:${redis.port}`;
      connections.redis = {
        url,
        env: {
          REDIS_URL: url,
          REDIS_HOST: 'localhost',
          REDIS_PORT: String(redis.port),
        },
      };
    }

    return connections;
  }

  getDockerServicesContext(): string {
    const settings = settingsManager.getDocker();

    if (!settings.enabled) {
      return '';
    }

    const enabledServices: string[] = [];

    if (settings.services.postgres.enabled) {
      const pg = settings.services.postgres;
      enabledServices.push(`### PostgreSQL Database
- Connection URL: \`postgresql://${pg.username}:${pg.password}@localhost:${pg.port}/${pg.database}\`
- Host: localhost, Port: ${pg.port}
- Username: ${pg.username}, Password: ${pg.password}
- Default database: ${pg.database}`);
    }

    if (settings.services.redis.enabled) {
      const redis = settings.services.redis;
      enabledServices.push(`### Redis Cache
- Connection URL: \`redis://localhost:${redis.port}\`
- Host: localhost, Port: ${redis.port}`);
    }

    if (enabledServices.length === 0) {
      return '';
    }

    return `## Available Development Services

ClaudeDesk provides these shared Docker services. Use them instead of creating new ones:

${enabledServices.join('\n\n')}

**IMPORTANT:** Do not start new Docker containers or databases. Configure your application to use the existing services above.`;
  }
}

// Lazy singleton - only created on first access (after cli.ts has called process.chdir())
// This ensures process.cwd() returns the correct data directory
let _sharedDockerManager: SharedDockerManager | null = null;

function getSharedDockerManagerInstance(): SharedDockerManager {
  if (!_sharedDockerManager) {
    _sharedDockerManager = new SharedDockerManager();
  }
  return _sharedDockerManager;
}

// Export a proxy that forwards all property/method access to the lazy instance
export const sharedDockerManager = new Proxy({} as SharedDockerManager, {
  get(_, prop) {
    const instance = getSharedDockerManagerInstance();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as Function).bind(instance) : value;
  }
});
