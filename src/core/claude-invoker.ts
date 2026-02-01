import { spawn, ChildProcess } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';
import { sharedDockerManager } from './shared-docker-manager.js';
import { workspaceManager } from '../config/workspaces.js';
import { settingsManager } from '../config/settings.js';
import { getGitCredentialEnv, cleanupGitCredentialEnv } from './git-credential-helper.js';

/**
 * Get a clean PATH that excludes claudedesk's node_modules to prevent dependency conflicts
 * This ensures Claude Code and child processes use the project's own dependencies
 */
function getCleanPath(): string {
  const currentPath = process.env.PATH || process.env.Path || '';
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const claudedeskDir = process.cwd(); // ClaudeDesk's working directory

  // Filter out paths that contain claudedesk's node_modules
  const cleanPaths = currentPath.split(pathSep).filter(p => {
    const normalized = p.toLowerCase().replace(/\\/g, '/');
    const claudedeskNormalized = claudedeskDir.toLowerCase().replace(/\\/g, '/');
    // Remove claudedesk's node_modules/.bin from PATH
    return !normalized.includes(`${claudedeskNormalized}/node_modules`);
  });

  return cleanPaths.join(pathSep);
}

export interface ClaudeStreamEvent {
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'result' | 'model_info';
  content?: string;        // For text events
  toolName?: string;       // For tool_use events (Read, Edit, Bash, etc.)
  toolInput?: unknown;      // For tool_use events (file path, command, etc.)
  isComplete?: boolean;    // For result events
  sessionId?: string;      // Claude session ID (from result event)
  // Usage tracking (from result event)
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  model?: string;
  costUsd?: number;
  durationMs?: number;
}

export interface ClaudeInvokeOptions {
  repoPath: string;
  prompt: string;
  artifactsDir: string;
  resumeSessionId?: string; // Claude session ID to resume (uses --resume flag)
  agentId?: string; // Agent ID to use (uses --agent flag)
  model?: string; // Override model (e.g., 'claude-3-5-haiku-20241022' for summarization)
  onProcessStart?: (proc: ChildProcess) => void; // Callback when process starts (for cancellation tracking)
  onStreamChunk?: (chunk: string, stream: 'stdout' | 'stderr') => void; // Legacy callback for raw output
  onStreamEvent?: (event: ClaudeStreamEvent) => void; // New callback for parsed stream events
}

export interface ClaudeInvokeResult {
  success: boolean;
  output: string;
  error?: string;
}

export class ClaudeInvoker {
  // Parse a stream-json line and extract relevant event info
  private parseStreamLine(line: string): ClaudeStreamEvent | null {
    try {
      const data = JSON.parse(line);

      // Handle different event types from Claude Code stream-json
      // See: https://docs.anthropic.com/en/docs/claude-code

      // Message start - contains model info
      if (data.type === 'message_start' && data.message?.model) {
        return {
          type: 'model_info',
          model: data.message.model,
        };
      }

      // Content block with text
      if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
        return {
          type: 'text',
          content: data.delta.text,
        };
      }

      // Tool use start
      if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
        return {
          type: 'tool_use',
          toolName: data.content_block.name,
          toolInput: data.content_block.input,
        };
      }

      // Assistant message with tool use (alternative format)
      if (data.type === 'assistant' && data.message?.content) {
        for (const block of data.message.content) {
          if (block.type === 'tool_use') {
            return {
              type: 'tool_use',
              toolName: block.name,
              toolInput: block.input,
            };
          }
          if (block.type === 'text' && block.text) {
            return {
              type: 'text',
              content: block.text,
            };
          }
        }
      }

      // Result/completion - includes session_id for resuming conversations and usage stats
      if (data.type === 'result') {
        return {
          type: 'result',
          content: typeof data.result === 'string' ? data.result : JSON.stringify(data.result),
          isComplete: true,
          sessionId: data.session_id, // Claude Code session ID for --resume
          // Usage tracking fields
          usage: data.usage ? {
            inputTokens: data.usage.input_tokens || 0,
            outputTokens: data.usage.output_tokens || 0,
            cacheCreationInputTokens: data.usage.cache_creation_input_tokens,
            cacheReadInputTokens: data.usage.cache_read_input_tokens,
          } : undefined,
          model: data.model,
          costUsd: data.cost_usd,
          durationMs: data.duration_ms,
        };
      }

      // Message stop
      if (data.type === 'message_stop') {
        return {
          type: 'result',
          isComplete: true,
        };
      }

      // Error
      if (data.type === 'error') {
        return {
          type: 'error',
          content: data.error?.message || JSON.stringify(data.error),
        };
      }

      return null;
    } catch {
      // Not valid JSON, ignore
      return null;
    }
  }

  // Format tool input for display
  private formatToolActivity(toolName: string, toolInput: unknown): string {
    const input = toolInput as Record<string, unknown>;
    switch (toolName) {
      case 'Read':
        return `Reading ${input?.file_path || 'file'}...`;
      case 'Edit':
        return `Editing ${input?.file_path || 'file'}...`;
      case 'Write':
        return `Writing ${input?.file_path || 'file'}...`;
      case 'Bash':
        const cmd = String(input?.command || '').slice(0, 50);
        return `Running: ${cmd}${cmd.length >= 50 ? '...' : ''}`;
      case 'Glob':
        return `Searching for ${input?.pattern || 'files'}...`;
      case 'Grep':
        return `Searching for "${input?.pattern || 'pattern'}"...`;
      case 'Task':
        return `Running task...`;
      case 'TodoWrite':
        return `Updating tasks...`;
      default:
        return `Using ${toolName}...`;
    }
  }

  async invoke(options: ClaudeInvokeOptions): Promise<ClaudeInvokeResult> {
    const { repoPath, prompt, artifactsDir, onProcessStart } = options;
    console.log(`[ClaudeInvoker] Starting Claude in ${repoPath}`);
    console.log(`[ClaudeInvoker] Prompt length: ${prompt.length} chars`);

    // Ensure artifacts directory exists
    const claudeDir = join(artifactsDir, 'claude');
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true });
    }

    // Write prompt to file for reference
    const promptFile = join(claudeDir, 'prompt.md');
    writeFileSync(promptFile, prompt);

    // Initialize output file for streaming
    const outputFile = join(claudeDir, 'output.txt');
    const stderrFile = join(claudeDir, 'stderr.txt');
    writeFileSync(outputFile, ''); // Create empty file for streaming

    return new Promise((resolve) => {
      let rawOutput = '';
      let textOutput = '';  // Accumulated text content only
      let errorOutput = '';
      let lineBuffer = '';  // Buffer for incomplete JSON lines
      let currentModel = '';  // Track model from message_start event

      // SEC-04: Resolve permission mode (workspace override > global setting)
      const workspace = workspaceManager.getWorkspaceForRepo(repoPath);
      const globalSettings = settingsManager.getClaude();
      const permissionMode = workspace?.claudePermissionMode ?? globalSettings.permissionMode ?? 'autonomous';

      console.log(`[ClaudeInvoker] Permission mode: ${permissionMode}`);

      // Invoke Claude Code CLI
      // Using --output-format stream-json to get streaming events
      // --verbose is required for stream-json format
      // -p enables print mode (non-interactive)
      // Passing prompt via stdin to avoid command line escaping issues
      const args = [
        '-p',
        '--output-format', 'stream-json',
        '--verbose',
      ];

      // SEC-04: Apply permission mode
      if (permissionMode === 'autonomous') {
        // Autonomous mode: skip all permission prompts
        args.unshift('--dangerously-skip-permissions');
      } else if (permissionMode === 'read-only') {
        // Read-only mode: allow only safe read tools
        args.unshift('--allowedTools', 'Read,Glob,Grep,WebFetch,WebSearch');
      }

      // Add --model flag if overriding model
      if (options.model) {
        args.push('--model', options.model);
        console.log(`[ClaudeInvoker] Using model override: ${options.model}`);
      }

      // Add --resume flag if resuming a session
      if (options.resumeSessionId) {
        args.push('--resume', options.resumeSessionId);
        console.log(`[ClaudeInvoker] Resuming session: ${options.resumeSessionId}`);
      }

      // Add --agent flag if using an agent
      if (options.agentId) {
        args.push('--agent', options.agentId);
        console.log(`[ClaudeInvoker] Using agent: ${options.agentId}`);
      }

      // Read prompt from stdin
      args.push('-');

      console.log(`[ClaudeInvoker] Running: claude ${args.join(' ')} (prompt via stdin)`);

      // Use clean PATH to prevent claudedesk's dependencies from being picked up by Claude Code
      const cleanPath = getCleanPath();
      let cleanEnv: Record<string, string | undefined> = {
        ...process.env,
        PATH: cleanPath,
        Path: cleanPath, // Windows uses 'Path'
      };

      // Inject git credentials if workspace has OAuth tokens
      let gitCredEnv: Record<string, string> | null = null;
      const gitCreds = workspaceManager.getGitCredentialsForRepo(repoPath);
      if (gitCreds.token && gitCreds.platform) {
        gitCredEnv = getGitCredentialEnv(gitCreds.token, gitCreds.platform, gitCreds.username || undefined);
        cleanEnv = { ...cleanEnv, ...gitCredEnv };
        console.log(`[ClaudeInvoker] Injecting ${gitCreds.platform} credentials for git operations`);
      }

      const proc = spawn('claude', args, {
        cwd: repoPath,
        env: cleanEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      console.log(`[ClaudeInvoker] Process spawned, PID: ${proc.pid}`);

      // Call onProcessStart callback for cancellation tracking
      if (onProcessStart) {
        onProcessStart(proc);
      }

      // Write prompt to stdin and close it
      if (proc.stdin) {
        proc.stdin.write(prompt);
        proc.stdin.end();
        console.log(`[ClaudeInvoker] Prompt written to stdin`);
      }

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        rawOutput += text;

        // Stream raw output to file
        appendFileSync(outputFile, text);

        // Legacy callback for raw output
        if (options.onStreamChunk) {
          options.onStreamChunk(text, 'stdout');
        }

        // Parse stream-json lines
        lineBuffer += text;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          const event = this.parseStreamLine(line);
          if (event) {
            // Capture model from message_start event
            if (event.type === 'model_info' && event.model) {
              currentModel = event.model;
              console.log(`[ClaudeInvoker] Captured model: ${currentModel}`);
            }

            // Inject captured model into result events
            if (event.type === 'result' && !event.model && currentModel) {
              event.model = currentModel;
            }

            // Accumulate text content
            if (event.type === 'text' && event.content) {
              textOutput += event.content;
            }

            // Format tool activity for display
            if (event.type === 'tool_use' && event.toolName) {
              event.content = this.formatToolActivity(event.toolName, event.toolInput);
            }

            // Call event callback
            if (options.onStreamEvent) {
              options.onStreamEvent(event);
            }
          }
        }

        // Log first bit of output to show progress
        if (rawOutput.length <= 500) {
          console.log(`[ClaudeInvoker] stdout: ${text.slice(0, 200)}`);
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        errorOutput += text;
        // Stream stderr to file in real-time
        appendFileSync(stderrFile, text);
        // Call streaming callback if provided
        if (options.onStreamChunk) {
          options.onStreamChunk(text, 'stderr');
        }
        console.log(`[ClaudeInvoker] stderr: ${text.slice(0, 200)}`);
      });

      proc.on('close', (code) => {
        console.log(`[ClaudeInvoker] Process closed with code ${code}`);

        // Clean up git credential helper script if created
        if (gitCredEnv) {
          cleanupGitCredentialEnv(gitCredEnv);
        }

        // Process any remaining buffer
        if (lineBuffer.trim()) {
          const event = this.parseStreamLine(lineBuffer);
          if (event) {
            // Capture model if in buffer
            if (event.type === 'model_info' && event.model) {
              currentModel = event.model;
            }
            // Inject model into result
            if (event.type === 'result' && !event.model && currentModel) {
              event.model = currentModel;
            }
            if (event.type === 'text' && event.content) {
              textOutput += event.content;
            }
            if (options.onStreamEvent) {
              options.onStreamEvent(event);
            }
          }
        }

        // Signal completion
        if (options.onStreamEvent) {
          options.onStreamEvent({ type: 'result', isComplete: true });
        }

        // Write output to file
        writeFileSync(join(claudeDir, 'output.txt'), textOutput || rawOutput);
        if (errorOutput) {
          writeFileSync(join(claudeDir, 'stderr.txt'), errorOutput);
        }

        if (code !== 0) {
          console.log(`[ClaudeInvoker] Failed: exit code ${code}`);
          resolve({
            success: false,
            output: textOutput || rawOutput,
            error: errorOutput || `Claude Code exited with code ${code}`,
          });
        } else {
          console.log(`[ClaudeInvoker] Success!`);
          resolve({
            success: true,
            output: textOutput || rawOutput,
          });
        }
      });

      proc.on('error', (err) => {
        // Clean up git credential helper script if created
        if (gitCredEnv) {
          cleanupGitCredentialEnv(gitCredEnv);
        }

        resolve({
          success: false,
          output: textOutput || rawOutput,
          error: `Failed to invoke Claude Code: ${err.message}`,
        });
      });
    });
  }

  // Generate a prompt for fixing build/test failures
  generateFixPrompt(
    repoId: string,
    failedStep: string,
    logs: string,
    goal?: string
  ): string {
    const sections = [
      this.getCommitGuidelines(),
      '',
      `# Task: Fix ${failedStep} failure in ${repoId}`,
      '',
      '## Goal',
      goal || `Fix the ${failedStep} step so it passes successfully.`,
      '',
      '## Failed Step Output',
      '```',
      logs.slice(-5000), // Last 5000 chars to avoid token limits
      '```',
      '',
    ];

    // Add Docker services context if available
    const dockerContext = sharedDockerManager.getDockerServicesContext();
    if (dockerContext) {
      sections.push(dockerContext, '');
    }

    // Add autonomy requirements
    sections.push(this.getAutonomyInstructions(), '');

    sections.push(
      '## Instructions',
      '1. Analyze the error output above',
      '2. Identify the root cause of the failure',
      '3. Set up any missing infrastructure (databases, env files, etc.)',
      '4. Make the minimal necessary changes to fix the issue',
      '5. Do NOT make unrelated changes or refactoring',
      '6. Ensure changes are production-ready',
      '',
      '## Constraints',
      '- Only modify files within this repository',
      '- Do not delete any critical files',
      '- Preserve existing functionality',
      '- Keep changes minimal and focused',
    );

    return sections.join('\n');
  }

  // Generate a prompt for implementing a feature
  generateFeaturePrompt(
    repoId: string,
    featureDescription: string,
    additionalContext?: string
  ): string {
    const sections = [
      this.getCommitGuidelines(),
      '',
      `# Task: Implement feature in ${repoId}`,
      '',
      '## Feature Description',
      featureDescription,
      '',
    ];

    // Add Docker services context if available
    const dockerContext = sharedDockerManager.getDockerServicesContext();
    if (dockerContext) {
      sections.push(dockerContext, '');
    }

    // Add autonomy requirements
    sections.push(this.getAutonomyInstructions(), '');

    if (additionalContext) {
      sections.push('## Additional Context', additionalContext, '');
    }

    sections.push(
      '## Instructions',
      '1. Understand the existing codebase structure',
      '2. Implement the feature following existing patterns',
      '3. Set up any required infrastructure (databases, env files, etc.)',
      '4. Add appropriate error handling',
      '5. Keep the implementation focused and minimal',
      '',
      '## Constraints',
      '- Only modify files within this repository',
      '- Follow existing code style and patterns',
      '- Do not add unnecessary dependencies',
      '- Ensure the code is production-ready',
    );

    return sections.join('\n');
  }

  // Wrap any prompt in plan-only mode
  generatePlanPrompt(originalPrompt: string): string {
    return `${originalPrompt}

## PLANNING MODE - DO NOT IMPLEMENT YET

You are in PLANNING MODE. Do NOT make any code changes or modify files.

Instead, provide:
1. **PLAN**: A detailed step-by-step plan of what you will do
2. **FILES**: List of files you will create/modify
3. **QUESTIONS**: Any clarifying questions (use format below)

### Question Format
If you have questions, output them exactly like this:
\`\`\`questions
[QUESTION]: What should the button text say?
[QUESTION]: Should this feature be behind a feature flag?
\`\`\`

After your plan is approved, you will be called again to implement it.`;
  }

  // Generate an execution prompt that includes the approved plan and user answers
  generateExecutionPrompt(
    originalPrompt: string,
    planOutput: string,
    answers: Record<string, string>,
    additionalContext?: string
  ): string {
    const sections = [originalPrompt, ''];

    sections.push('## APPROVED PLAN');
    sections.push('The following plan was approved. Implement it now:');
    sections.push('');
    sections.push(planOutput);
    sections.push('');

    if (Object.keys(answers).length > 0) {
      sections.push('## ANSWERS TO YOUR QUESTIONS');
      for (const [question, answer] of Object.entries(answers)) {
        sections.push(`**Q:** ${question}`);
        sections.push(`**A:** ${answer}`);
        sections.push('');
      }
    }

    if (additionalContext) {
      sections.push('## ADDITIONAL CONTEXT FROM USER');
      sections.push(additionalContext);
      sections.push('');
    }

    sections.push('## NOW IMPLEMENT THE PLAN');
    sections.push('Execute the approved plan above. Make the code changes now.');
    sections.push('');
    sections.push('**REMINDER:** You are in FULLY AUTONOMOUS mode. Do ALL the work yourself including:');
    sections.push('- Creating databases, running migrations, seeding data');
    sections.push('- Creating/updating .env files with required environment variables');
    sections.push('- Installing dependencies, creating directories');
    sections.push('- Never output instructions for the user to follow - DO IT YOURSELF.');

    return sections.join('\n');
  }

  // Parse questions from Claude's plan output
  parseQuestionsFromOutput(output: string): string[] {
    const questionBlock = output.match(/```questions\n([\s\S]*?)```/);
    if (!questionBlock) return [];

    const questions = questionBlock[1]
      .split('\n')
      .filter(line => line.startsWith('[QUESTION]:'))
      .map(line => line.replace('[QUESTION]:', '').trim())
      .filter(q => q.length > 0);

    return questions;
  }

  // Generate autonomy instructions for prompts
  getAutonomyInstructions(): string {
    return `## Autonomy Requirements - DO ALL THE WORK YOURSELF

You are running in FULLY AUTONOMOUS mode. Complete ALL tasks yourself without asking the user to do anything.

**You MUST do these things yourself (never instruct the user):**
- Create databases: Use \`psql\`, \`createdb\`, or run SQL commands directly
- Create/update .env files: Write the file with all required environment variables
- Run migrations: Execute migration commands directly
- Install dependencies: Run npm/yarn/pip install as needed
- Create directories: Use mkdir for any needed folders
- Seed data: Run seed scripts or insert initial data
- Start services: Run any required startup commands
- Configure connections: Set up database connections, API keys, etc.

**CRITICAL: Never output instructions for the user to follow. If something needs to be done, DO IT YOURSELF.**

## ⚠️ CRITICAL SAFETY RULES - PORTS 8787 AND 5173 ARE FORBIDDEN ⚠️

You are running inside ClaudeDesk, which uses ports 8787 (API) and 5173 (UI). If you kill these ports, you will crash the system.

**ABSOLUTELY FORBIDDEN COMMANDS:**
- \`npx kill-port 8787\` - WILL CRASH CLAUDEDESK
- \`npx kill-port 5173\` - WILL CRASH CLAUDEDESK
- \`taskkill /IM node.exe /F\` - WILL CRASH CLAUDEDESK (kills ALL Node)
- \`pkill node\` or \`killall node\` - WILL CRASH CLAUDEDESK
- Any command that kills processes on port 8787 or 5173
- Any command that kills all Node.js processes

**SAFE ALTERNATIVES for stopping apps:**
- Kill by specific PID: \`taskkill /PID 12345 /F\`
- Kill specific port (NOT 8787 or 5173): \`npx kill-port 3000\`
- Stop Docker: \`docker stop container-name\`

**Before killing ANY port, verify it is NOT 8787 or 5173.**

Example - WRONG approach:
"You need to create the database by running: createdb myapp"

Example - CORRECT approach:
*Actually run the createdb command to create the database*

## Git Commit Guidelines

When committing changes, follow these rules:
- **Keep commit messages SHORT** - max 72 characters for the subject line
- **Summarize the change**, don't include error logs or verbose output
- **Focus on WHAT changed**, not the full debugging history
- **Never include logs, stack traces, or error output** in commit messages

Example - WRONG commit message:
\`git commit -m "Fix error: [10:19:37] Starting npm... ERROR: Cannot find module... [500 lines of logs]"\`

Example - CORRECT commit message:
\`git commit -m "Fix missing @alloc/quick-lru dependency for TailwindCSS"\``;
  }

  // Get prominent commit guidelines to place at TOP of prompts
  getCommitGuidelines(): string {
    return `## CRITICAL: Git Commit Rules
**COMMIT MESSAGES MUST BE SHORT** - Maximum 50 characters for subject line.
- Summarize the change in a few words
- NEVER include logs, errors, or verbose output
- Example: "Fix missing database migration"`;
  }

  // Best practices learned from debugging sessions
  getBestPracticesGuidelines(): string {
    return `## Best Practices (MUST FOLLOW)

### Environment Variables
- **DO NOT add .env to .gitignore** - commit it with safe dev defaults (localhost, dev passwords)
- Use .env.example as a reference template if needed
- Environment variables should work out-of-the-box for local development
- Example DATABASE_URL: \`postgresql://claudedesk:claudedesk_dev@localhost:5432/myapp\`

### Prisma (if using database)
- Use \`prisma.config.ts\` for Prisma 7.x projects with driver adapters
- Schema location: \`prisma/schema.prisma\` (or \`apps/api/prisma/schema.prisma\` for monorepos)
- Run \`prisma db push\` for development database sync
- Do NOT use deprecated flags like \`--skip-generate\`

### Multi-Service / Monorepo Projects
- Use environment variables for inter-service communication
- Vite proxy config should use \`process.env.API_PORT || 3001\`, NOT hardcoded ports
- Backend should read port from \`API_PORT\` or \`PORT\` env var
- Example vite.config.ts proxy:
  \`\`\`
  proxy: { '/api': { target: \`http://localhost:\${process.env.API_PORT || 3001}\` } }
  \`\`\`

### API Best Practices
- Always include a health check endpoint at \`/api/health\` or \`/health\`
- Use retry logic for database connections on startup (database may not be ready immediately)
- Return JSON with \`{ status: 'ok' }\` for health checks
- Use environment variable for port: \`process.env.API_PORT || process.env.PORT || 3001\``;
  }

  // Generate a prompt for creating a new repository
  generateCreateRepoPrompt(
    repoName: string,
    templateId: string,
    description: string,
    scaffoldedFiles?: string[]
  ): string {
    const sections = [
      this.getCommitGuidelines(),
      '',
      `# Task: Create ${repoName} from ${templateId} template`,
      '',
      '## Project Description',
      description,
      '',
      this.getBestPracticesGuidelines(),
      '',
      this.getAutonomyInstructions(),
      '',
    ];

    if (scaffoldedFiles && scaffoldedFiles.length > 0) {
      sections.push(
        '## Already Scaffolded Files',
        'These files are already created from the template:',
        scaffoldedFiles.map(f => `- ${f}`).join('\n'),
        '',
        'Build upon these files. Do not recreate them unless necessary.',
        ''
      );
    }

    sections.push(
      '## Requirements',
      '1. Implement the project based on the description above',
      '2. Ensure the project builds and runs without errors',
      '3. Follow all best practices guidelines above',
      '4. Create a working application that passes health/proof checks',
      '5. Commit your changes with short, descriptive commit messages',
    );

    return sections.join('\n');
  }
}

export const claudeInvoker = new ClaudeInvoker();
