import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  Playbook,
  PlaybooksData,
  PlaybookCreateRequest,
  PlaybookUpdateRequest,
  PlaybookExportData,
  PlaybookExecutionSettings,
} from '../shared/types/playbook-types';
import { BUILT_IN_PLAYBOOKS } from './built-in-playbooks';

const CONFIG_DIR = path.join(app.getPath('home'), '.claudedesk');
const PLAYBOOKS_FILE = path.join(CONFIG_DIR, 'playbooks.json');
const MAX_USER_PLAYBOOKS = 50;
const MAX_STEPS = 20;
const MAX_VARIABLES = 10;
const MAX_IMPORT_SIZE = 1024 * 1024; // 1MB

const DEFAULT_EXECUTION: PlaybookExecutionSettings = {
  silenceThresholdMs: 3000,
  interStepDelayMs: 1000,
  stepTimeoutMs: 300000,
  stepTimeoutPolicy: 'pause',
  createCheckpointBeforeRun: false,
};

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function getDefaultData(): PlaybooksData {
  return { version: 1, playbooks: [], lastModified: Date.now() };
}

function loadPlaybooksData(): PlaybooksData {
  try {
    if (fs.existsSync(PLAYBOOKS_FILE)) {
      const raw = fs.readFileSync(PLAYBOOKS_FILE, 'utf-8');
      const data = JSON.parse(raw) as PlaybooksData;
      if (data.version !== 1) {
        console.warn('[PlaybookManager] Unknown version, backing up and resetting');
        fs.copyFileSync(PLAYBOOKS_FILE, `${PLAYBOOKS_FILE}.bak`);
        return getDefaultData();
      }
      return data;
    }
  } catch (err) {
    console.error('[PlaybookManager] Failed to load playbooks, backing up:', err);
    try { fs.copyFileSync(PLAYBOOKS_FILE, `${PLAYBOOKS_FILE}.bak`); } catch { /* ignore */ }
  }
  return getDefaultData();
}

function savePlaybooksData(data: PlaybooksData): void {
  ensureConfigDir();
  data.lastModified = Date.now();
  const tempFile = `${PLAYBOOKS_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempFile, PLAYBOOKS_FILE);
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) {
    throw new Error('Playbook name must be 1-100 characters');
  }
  return trimmed;
}

function validateParamName(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid variable name: "${name}". Must be alphanumeric + underscore, starting with letter or underscore.`);
  }
}

export class PlaybookManager {
  private data: PlaybooksData;

  constructor() {
    this.data = loadPlaybooksData();
  }

  listAll(): Playbook[] {
    return [...BUILT_IN_PLAYBOOKS, ...this.data.playbooks];
  }

  get(id: string): Playbook | null {
    const builtIn = BUILT_IN_PLAYBOOKS.find(p => p.id === id);
    if (builtIn) return builtIn;
    return this.data.playbooks.find(p => p.id === id) || null;
  }

  add(request: PlaybookCreateRequest): Playbook {
    if (this.data.playbooks.length >= MAX_USER_PLAYBOOKS) {
      throw new Error(`Maximum ${MAX_USER_PLAYBOOKS} user playbooks allowed`);
    }

    const name = validateName(request.name);

    if (!request.steps || request.steps.length === 0) {
      throw new Error('Playbook must have at least 1 step');
    }
    if (request.steps.length > MAX_STEPS) {
      throw new Error(`Maximum ${MAX_STEPS} steps allowed`);
    }
    if (request.variables && request.variables.length > MAX_VARIABLES) {
      throw new Error(`Maximum ${MAX_VARIABLES} variables allowed`);
    }

    // Validate variable names are unique and valid
    const varNames = new Set<string>();
    for (const v of request.variables || []) {
      validateParamName(v.name);
      if (varNames.has(v.name)) {
        throw new Error(`Duplicate variable name: "${v.name}"`);
      }
      varNames.add(v.name);
    }

    const now = Date.now();
    const playbook: Playbook = {
      id: uuidv4(),
      type: 'user',
      name,
      description: (request.description || '').trim().slice(0, 500),
      icon: request.icon || '\u{1F4CB}',
      category: (request.category || 'Custom').trim().slice(0, 50),
      keywords: (request.keywords || []).map(k => k.trim().toLowerCase()).filter(k => k).slice(0, 20),
      variables: request.variables || [],
      steps: request.steps.map(s => ({ ...s, id: uuidv4() })),
      execution: { ...DEFAULT_EXECUTION, ...request.execution },
      createdAt: now,
      updatedAt: now,
    };

    this.data.playbooks.push(playbook);
    savePlaybooksData(this.data);
    return playbook;
  }

  update(request: PlaybookUpdateRequest): Playbook {
    const index = this.data.playbooks.findIndex(p => p.id === request.id);
    if (index === -1) {
      throw new Error('Playbook not found or is a built-in playbook (cannot be edited)');
    }

    const playbook = this.data.playbooks[index];

    if (request.name !== undefined) {
      playbook.name = validateName(request.name);
    }
    if (request.description !== undefined) {
      playbook.description = request.description.trim().slice(0, 500);
    }
    if (request.icon !== undefined) {
      playbook.icon = request.icon;
    }
    if (request.category !== undefined) {
      playbook.category = request.category.trim().slice(0, 50);
    }
    if (request.keywords !== undefined) {
      playbook.keywords = request.keywords.map(k => k.trim().toLowerCase()).filter(k => k).slice(0, 20);
    }
    if (request.variables !== undefined) {
      if (request.variables.length > MAX_VARIABLES) {
        throw new Error(`Maximum ${MAX_VARIABLES} variables allowed`);
      }
      const varNames = new Set<string>();
      for (const v of request.variables) {
        validateParamName(v.name);
        if (varNames.has(v.name)) {
          throw new Error(`Duplicate variable name: "${v.name}"`);
        }
        varNames.add(v.name);
      }
      playbook.variables = request.variables;
    }
    if (request.steps !== undefined) {
      if (request.steps.length === 0) {
        throw new Error('Playbook must have at least 1 step');
      }
      if (request.steps.length > MAX_STEPS) {
        throw new Error(`Maximum ${MAX_STEPS} steps allowed`);
      }
      playbook.steps = request.steps.map(s => ({ ...s, id: uuidv4() }));
    }
    if (request.execution !== undefined) {
      playbook.execution = { ...playbook.execution, ...request.execution };
    }

    playbook.updatedAt = Date.now();
    savePlaybooksData(this.data);
    return playbook;
  }

  delete(id: string): boolean {
    if (BUILT_IN_PLAYBOOKS.some(p => p.id === id)) {
      throw new Error('Cannot delete built-in playbooks');
    }
    const index = this.data.playbooks.findIndex(p => p.id === id);
    if (index === -1) return false;
    this.data.playbooks.splice(index, 1);
    savePlaybooksData(this.data);
    return true;
  }

  duplicate(id: string): Playbook {
    const source = this.get(id);
    if (!source) {
      throw new Error('Playbook not found');
    }
    return this.add({
      name: `${source.name} (copy)`,
      description: source.description,
      icon: source.icon,
      category: source.category,
      keywords: [...source.keywords],
      variables: source.variables.map(v => ({ ...v })),
      steps: source.steps.map(s => ({ name: s.name, prompt: s.prompt, requireConfirmation: s.requireConfirmation, timeoutMs: s.timeoutMs, silenceThresholdMs: s.silenceThresholdMs })),
      execution: { ...source.execution },
    });
  }

  exportPlaybook(id: string): PlaybookExportData {
    const playbook = this.get(id);
    if (!playbook) {
      throw new Error('Playbook not found');
    }
    const { id: _id, type: _type, createdAt: _c, updatedAt: _u, ...rest } = playbook;
    return { version: 1, playbook: rest };
  }

  importPlaybook(data: PlaybookExportData): Playbook {
    if (!data || data.version !== 1 || !data.playbook) {
      throw new Error('Invalid playbook import format');
    }
    const pb = data.playbook;
    return this.add({
      name: pb.name,
      description: pb.description,
      icon: pb.icon,
      category: pb.category,
      keywords: pb.keywords || [],
      variables: pb.variables || [],
      steps: pb.steps.map(s => ({
        name: s.name,
        prompt: s.prompt,
        requireConfirmation: s.requireConfirmation,
        timeoutMs: s.timeoutMs,
        silenceThresholdMs: s.silenceThresholdMs,
      })),
      execution: pb.execution,
    });
  }

  static get MAX_IMPORT_SIZE(): number {
    return MAX_IMPORT_SIZE;
  }
}
