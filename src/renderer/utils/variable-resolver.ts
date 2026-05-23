interface VariableContext {
  clipboard?: string;
  currentDir?: string;
  selection?: string;
  sessionName?: string;
}

/**
 * Resolves template variables in a prompt string
 * Variables: {clipboard}, {current_dir}, {selection}, {datetime}, {date}, {session_name}
 */
export function resolveVariables(prompt: string, context: VariableContext): string {
  let resolved = prompt;

  // Replace {clipboard}
  if (context.clipboard !== undefined) {
    resolved = resolved.replace(/\{clipboard\}/g, context.clipboard);
  }

  // Replace {current_dir}
  if (context.currentDir !== undefined) {
    resolved = resolved.replace(/\{current_dir\}/g, context.currentDir);
  }

  // Replace {selection}
  if (context.selection !== undefined) {
    resolved = resolved.replace(/\{selection\}/g, context.selection);
  }

  // Replace {session_name}
  if (context.sessionName !== undefined) {
    resolved = resolved.replace(/\{session_name\}/g, context.sessionName);
  }

  // Replace {datetime} - e.g., "2024-02-05 14:30:45"
  const now = new Date();
  const datetime = now.toISOString().replace('T', ' ').substring(0, 19);
  resolved = resolved.replace(/\{datetime\}/g, datetime);

  // Replace {date} - e.g., "2024-02-05"
  const date = now.toISOString().substring(0, 10);
  resolved = resolved.replace(/\{date\}/g, date);

  return resolved;
}

/**
 * Extracts variables used in a prompt template
 */
export function extractVariables(prompt: string): string[] {
  const variableRegex = /\{(\w+)\}/g;
  const variables: string[] = [];
  let match;

  while ((match = variableRegex.exec(prompt)) !== null) {
    const varName = match[1];
    if (!variables.includes(varName)) {
      variables.push(varName);
    }
  }

  return variables;
}

/**
 * Checks if a prompt can be executed with the given context
 * Returns missing required variables
 */
export function getMissingVariables(prompt: string, context: VariableContext): string[] {
  const usedVars = extractVariables(prompt);
  const missing: string[] = [];

  for (const varName of usedVars) {
    // Skip datetime/date as they're always available
    if (varName === 'datetime' || varName === 'date') {
      continue;
    }

    // Check if the variable is available in context
    if (varName === 'clipboard' && context.clipboard === undefined) {
      missing.push(varName);
    } else if (varName === 'current_dir' && context.currentDir === undefined) {
      missing.push(varName);
    } else if (varName === 'selection' && context.selection === undefined) {
      missing.push(varName);
    } else if (varName === 'session_name' && context.sessionName === undefined) {
      missing.push(varName);
    }
  }

  return missing;
}

/**
 * Reads text from clipboard (browser API)
 */
export async function readClipboard(): Promise<string | null> {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      return text;
    }
  } catch (err) {
    console.error('Failed to read clipboard:', err);
  }
  return null;
}

/**
 * Gets terminal selection (placeholder - would need xterm.js integration)
 */
export function getTerminalSelection(): string | null {
  // This would need to be integrated with xterm.js
  // For now, return null
  return null;
}
