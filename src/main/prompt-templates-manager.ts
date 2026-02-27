import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  PromptTemplate,
  PromptTemplatesData,
  TemplateCreateRequest,
  TemplateUpdateRequest,
} from '../shared/types/prompt-templates';
import { BUILT_IN_ACTIONS } from './built-in-actions';
import { CONFIG_DIR, ensureConfigDir } from './config-dir';

const TEMPLATES_FILE = path.join(CONFIG_DIR, 'prompt-templates.json');
const MAX_USER_TEMPLATES = 100;

function getDefaultData(): PromptTemplatesData {
  return {
    version: 1,
    templates: [],
    lastModified: Date.now(),
  };
}

function loadTemplatesData(): PromptTemplatesData {
  try {
    if (fs.existsSync(TEMPLATES_FILE)) {
      const data = fs.readFileSync(TEMPLATES_FILE, 'utf-8');
      const templates = JSON.parse(data) as PromptTemplatesData;

      // Validate version
      if (templates.version !== 1) {
        console.warn('Unknown templates version, using defaults');
        return getDefaultData();
      }

      return templates;
    }
  } catch (err) {
    console.error('Failed to load prompt templates:', err);
  }
  return getDefaultData();
}

function saveTemplatesData(data: PromptTemplatesData): void {
  try {
    ensureConfigDir();
    data.lastModified = Date.now();
    const tempFile = `${TEMPLATES_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, TEMPLATES_FILE);
  } catch (err) {
    console.error('Failed to save prompt templates:', err);
    throw err;
  }
}

export class PromptTemplatesManager {
  private data: PromptTemplatesData;

  constructor() {
    this.data = loadTemplatesData();
  }

  getAllTemplates(): PromptTemplate[] {
    // Return built-in actions + user templates
    return [...BUILT_IN_ACTIONS, ...this.data.templates];
  }

  getUserTemplates(): PromptTemplate[] {
    return [...this.data.templates];
  }

  getTemplateById(id: string): PromptTemplate | null {
    // Check built-in actions first
    const builtIn = BUILT_IN_ACTIONS.find(t => t.id === id);
    if (builtIn) return builtIn;

    // Check user templates
    const userTemplate = this.data.templates.find(t => t.id === id);
    return userTemplate || null;
  }

  addTemplate(request: TemplateCreateRequest): PromptTemplate {
    // Check user template limit
    if (this.data.templates.length >= MAX_USER_TEMPLATES) {
      throw new Error(`Maximum ${MAX_USER_TEMPLATES} user templates allowed`);
    }

    // Validate name
    const name = request.name.trim();
    if (!name || name.length > 100) {
      throw new Error('Template name must be 1-100 characters');
    }

    // Validate description
    const description = request.description.trim();
    if (description.length > 500) {
      throw new Error('Template description must be at most 500 characters');
    }

    // Validate prompt
    const prompt = request.prompt.trim();
    if (!prompt || prompt.length > 5000) {
      throw new Error('Template prompt must be 1-5000 characters');
    }

    // Validate keywords
    if (request.keywords.length > 20) {
      throw new Error('Maximum 20 keywords allowed');
    }

    const keywords = request.keywords.map(k => k.trim().toLowerCase()).filter(k => k.length > 0);

    const now = Date.now();
    const template: PromptTemplate = {
      id: uuidv4(),
      type: 'user',
      name,
      description,
      prompt,
      keywords,
      icon: request.icon,
      createdAt: now,
      updatedAt: now,
    };

    this.data.templates.push(template);
    saveTemplatesData(this.data);

    return template;
  }

  updateTemplate(request: TemplateUpdateRequest): PromptTemplate {
    const index = this.data.templates.findIndex(t => t.id === request.id);
    if (index === -1) {
      throw new Error('Template not found or is a built-in template (cannot be edited)');
    }

    const template = this.data.templates[index];

    // Validate and update name if provided
    if (request.name !== undefined) {
      const name = request.name.trim();
      if (!name || name.length > 100) {
        throw new Error('Template name must be 1-100 characters');
      }
      template.name = name;
    }

    // Validate and update description if provided
    if (request.description !== undefined) {
      const description = request.description.trim();
      if (description.length > 500) {
        throw new Error('Template description must be at most 500 characters');
      }
      template.description = description;
    }

    // Validate and update prompt if provided
    if (request.prompt !== undefined) {
      const prompt = request.prompt.trim();
      if (!prompt || prompt.length > 5000) {
        throw new Error('Template prompt must be 1-5000 characters');
      }
      template.prompt = prompt;
    }

    // Validate and update keywords if provided
    if (request.keywords !== undefined) {
      if (request.keywords.length > 20) {
        throw new Error('Maximum 20 keywords allowed');
      }
      template.keywords = request.keywords.map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
    }

    // Update icon if provided
    if (request.icon !== undefined) {
      template.icon = request.icon;
    }

    template.updatedAt = Date.now();
    saveTemplatesData(this.data);

    return template;
  }

  deleteTemplate(templateId: string): boolean {
    // Prevent deleting built-in templates
    const isBuiltIn = BUILT_IN_ACTIONS.some(t => t.id === templateId);
    if (isBuiltIn) {
      throw new Error('Cannot delete built-in templates');
    }

    const index = this.data.templates.findIndex(t => t.id === templateId);
    if (index === -1) {
      return false;
    }

    this.data.templates.splice(index, 1);
    saveTemplatesData(this.data);

    return true;
  }
}
