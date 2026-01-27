#!/usr/bin/env node

import { homedir, platform } from 'os';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { startServer } from './index.js';

// Get the directory of this file (works when installed globally via npm)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get version from package.json
function getVersion(): string {
  try {
    // When installed via npm, package.json is one level up from dist/
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch {
    return '1.0.0';
  }
}

interface CLIOptions {
  port?: number;
  dataDir?: string;
  skipWizard?: boolean;
  allowRemote?: boolean;
  help?: boolean;
  version?: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--port':
        options.port = parseInt(args[++i], 10);
        break;
      case '--data-dir':
        options.dataDir = args[++i];
        break;
      case '--skip-wizard':
        options.skipWizard = true;
        break;
      case '--allow-remote':
        options.allowRemote = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--version':
      case '-v':
        options.version = true;
        break;
      default:
        if (arg.startsWith('--')) {
          console.warn(`Warning: Unknown option ${arg}`);
        }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
ClaudeDesk - AI-powered development platform

USAGE:
  claudedesk [OPTIONS]

OPTIONS:
  --port <port>         Port to listen on (default: 8787)
                        Environment: CLAUDEDESK_PORT

  --data-dir <path>     Data directory path (default: ~/.claudedesk or %APPDATA%\\claudedesk)
                        Environment: CLAUDEDESK_DATA_DIR

  --skip-wizard         Skip the initial setup wizard

  --allow-remote        Allow remote network access (default: localhost only)
                        Environment: ALLOW_REMOTE=true

  --help, -h            Show this help message

  --version, -v         Show version information

EXAMPLES:
  claudedesk
  claudedesk --port 3000
  claudedesk --data-dir /custom/data/path
  claudedesk --allow-remote
  claudedesk --port 3000 --data-dir ./data --skip-wizard

ENVIRONMENT VARIABLES:
  CLAUDEDESK_PORT       Port to listen on
  CLAUDEDESK_DATA_DIR   Data directory path
  ALLOW_REMOTE          Set to 'true' to allow remote access

For more information, visit: https://github.com/yourusername/claudedesk
`);
}

function printVersion(): void {
  console.log(`ClaudeDesk v${getVersion()}`);
  console.log(`Node.js ${process.version}`);
  console.log(`Platform: ${platform()}`);
}

function checkNodeVersion(): void {
  const requiredMajor = 18;
  const currentVersion = process.version;
  const major = parseInt(currentVersion.slice(1).split('.')[0], 10);

  if (major < requiredMajor) {
    console.error(`Error: Node.js ${requiredMajor}.x or higher is required`);
    console.error(`Current version: ${currentVersion}`);
    process.exit(1);
  }
}

function checkClaudeCLI(): void {
  try {
    execSync('claude --version', { stdio: 'pipe' });
  } catch (err) {
    console.warn('');
    console.warn('╔═══════════════════════════════════════════════════════════╗');
    console.warn('║                    ⚠️  WARNING  ⚠️                         ║');
    console.warn('╠═══════════════════════════════════════════════════════════╣');
    console.warn('║  Claude Code CLI not found in PATH                        ║');
    console.warn('║  Some terminal features may not work properly            ║');
    console.warn('║                                                           ║');
    console.warn('║  Install from: https://claude.ai/download                ║');
    console.warn('╚═══════════════════════════════════════════════════════════╝');
    console.warn('');
  }
}

function getDefaultDataDir(): string {
  // Check environment variable first
  if (process.env.CLAUDEDESK_DATA_DIR) {
    return process.env.CLAUDEDESK_DATA_DIR;
  }

  // Platform-specific defaults
  if (platform() === 'win32') {
    const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
    return join(appData, 'claudedesk');
  } else {
    return join(homedir(), '.claudedesk');
  }
}

function ensureDataDirectory(dataDir: string): void {
  // Create main data directory
  if (!existsSync(dataDir)) {
    console.log(`[Setup] Creating data directory: ${dataDir}`);
    mkdirSync(dataDir, { recursive: true });
  }

  // Create subdirectories
  const subdirs = [
    'config',
    join('config', 'skills'),
    join('config', 'usage'),
    join('config', 'usage', 'sessions'),
    'artifacts',
  ];

  for (const subdir of subdirs) {
    const dirPath = join(dataDir, subdir);
    if (!existsSync(dirPath)) {
      console.log(`[Setup] Creating directory: ${dirPath}`);
      mkdirSync(dirPath, { recursive: true });
    }
  }

  // Copy example config files if they don't exist
  copyExampleConfigs(dataDir);
}

function copyExampleConfigs(dataDir: string): void {
  const configDir = join(dataDir, 'config');

  // Try to find source config directory
  let sourceConfigDir: string | null = null;

  // Option 1: In development (running from src/)
  const devConfigDir = join(process.cwd(), 'config');
  if (existsSync(devConfigDir)) {
    sourceConfigDir = devConfigDir;
  }

  // Option 2: Installed via npm (config/ should be in package)
  const installedConfigDir = join(process.cwd(), '..', '..', 'config');
  if (!sourceConfigDir && existsSync(installedConfigDir)) {
    sourceConfigDir = installedConfigDir;
  }

  if (!sourceConfigDir) {
    console.warn('[Setup] Warning: Could not find example config files');
    return;
  }

  // Copy example JSON files
  const exampleFiles = ['settings.example.json', 'repos.example.json'];
  for (const file of exampleFiles) {
    const sourcePath = join(sourceConfigDir, file);
    const destPath = join(configDir, file);

    if (existsSync(sourcePath) && !existsSync(destPath)) {
      console.log(`[Setup] Copying example config: ${file}`);
      copyFileSync(sourcePath, destPath);
    }
  }

  // Copy skill files
  const skillsSourceDir = join(sourceConfigDir, 'skills');
  const skillsDestDir = join(configDir, 'skills');

  if (existsSync(skillsSourceDir)) {
    const skillFiles = readdirSync(skillsSourceDir).filter(f => f.endsWith('.md'));
    for (const file of skillFiles) {
      const sourcePath = join(skillsSourceDir, file);
      const destPath = join(skillsDestDir, file);

      if (!existsSync(destPath)) {
        console.log(`[Setup] Copying skill: ${file}`);
        copyFileSync(sourcePath, destPath);
      }
    }
  }

  // Initialize default config files if they don't exist
  const settingsPath = join(configDir, 'settings.json');
  if (!existsSync(settingsPath)) {
    const examplePath = join(configDir, 'settings.example.json');
    if (existsSync(examplePath)) {
      console.log('[Setup] Initializing settings.json from example');
      copyFileSync(examplePath, settingsPath);
    }
  }

  const reposPath = join(configDir, 'repos.json');
  if (!existsSync(reposPath)) {
    const examplePath = join(configDir, 'repos.example.json');
    if (existsSync(examplePath)) {
      console.log('[Setup] Initializing repos.json from example');
      copyFileSync(examplePath, reposPath);
    }
  }
}

function printBanner(dataDir: string, port: number): void {
  const version = getVersion();
  const versionLine = `CLAUDEDESK CLI v${version}`.padStart(30 + Math.floor(`CLAUDEDESK CLI v${version}`.length / 2)).padEnd(57);
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║${versionLine}║
╠═══════════════════════════════════════════════════════════╣
║  Data directory: ${dataDir.padEnd(39)}║
║  Port: ${String(port).padEnd(50)}║
║                                                           ║
║  Starting server...                                       ║
╚═══════════════════════════════════════════════════════════╝
  `);
}

async function main(): Promise<void> {
  const options = parseArgs();

  // Handle --help
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // Handle --version
  if (options.version) {
    printVersion();
    process.exit(0);
  }

  // Check Node.js version
  checkNodeVersion();

  // Check for Claude CLI (warn but continue)
  checkClaudeCLI();

  // Determine data directory
  const dataDir = options.dataDir || getDefaultDataDir();

  // Ensure data directory structure exists
  ensureDataDirectory(dataDir);

  // Change to data directory
  process.chdir(dataDir);

  // Set environment variables
  const port = options.port || parseInt(process.env.CLAUDEDESK_PORT || '8787', 10);

  if (options.allowRemote) {
    process.env.ALLOW_REMOTE = 'true';
  }

  // Print startup banner
  printBanner(dataDir, port);

  // Start the server
  try {
    await startServer({
      port,
      host: options.allowRemote ? '0.0.0.0' : undefined,
      skipWizard: options.skipWizard,
    });
  } catch (err) {
    console.error('[Fatal] Failed to start server:', err);
    process.exit(1);
  }
}

// Run CLI
main().catch((err) => {
  console.error('[Fatal] Unexpected error:', err);
  process.exit(1);
});
