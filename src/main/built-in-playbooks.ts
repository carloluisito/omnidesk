import type { Playbook, PlaybookExecutionSettings } from '../shared/types/playbook-types';

const DEFAULT_EXECUTION: PlaybookExecutionSettings = {
  silenceThresholdMs: 3000,
  interStepDelayMs: 1000,
  stepTimeoutMs: 300000,
  stepTimeoutPolicy: 'pause',
  createCheckpointBeforeRun: false,
};

let stepCounter = 0;
function stepId(): string {
  return `builtin-step-${++stepCounter}`;
}

export const BUILT_IN_PLAYBOOKS: Playbook[] = [
  {
    id: 'builtin-add-api-endpoint',
    type: 'built-in',
    name: 'Add API Endpoint',
    description: 'Scaffold a new REST API endpoint with route, handler, validation, and tests.',
    icon: '\u{1F310}',
    category: 'Backend',
    keywords: ['api', 'endpoint', 'route', 'rest', 'handler', 'scaffold'],
    variables: [
      { name: 'method', label: 'HTTP Method', type: 'select', required: true, options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      { name: 'path', label: 'Route Path', type: 'text', required: true, placeholder: '/api/users/:id' },
      { name: 'description', label: 'Endpoint Description', type: 'text', required: true, placeholder: 'Fetch user by ID' },
      { name: 'auth', label: 'Authentication', type: 'select', required: true, default: 'required', options: ['required', 'optional', 'none'] },
    ],
    steps: [
      {
        id: stepId(),
        name: 'Analyze existing patterns',
        prompt: 'Look at the existing API routes and handlers in this project. Identify the patterns used for routing, request validation, error handling, and response formatting. Summarize the conventions you find.',
        requireConfirmation: false,
      },
      {
        id: stepId(),
        name: 'Create route and handler',
        prompt: 'Create a new {{method}} endpoint at {{path}} — {{description}}. Authentication: {{auth}}. Follow the existing project patterns you identified. Include request validation and proper error handling.',
        requireConfirmation: true,
      },
      {
        id: stepId(),
        name: 'Add tests',
        prompt: 'Write tests for the new {{method}} {{path}} endpoint. Cover: successful request, validation errors, authentication (if {{auth}} is not "none"), and edge cases. Follow the existing test patterns.',
        requireConfirmation: false,
      },
      {
        id: stepId(),
        name: 'Verify and document',
        prompt: 'Run the tests you just wrote. If any fail, fix them. Then add a brief description of the new endpoint to any existing API documentation files if present.',
        requireConfirmation: false,
      },
    ],
    execution: DEFAULT_EXECUTION,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-bug-investigation',
    type: 'built-in',
    name: 'Bug Investigation',
    description: 'Systematic bug investigation: reproduce, find root cause, fix, and verify.',
    icon: '\u{1F41B}',
    category: 'Debugging',
    keywords: ['bug', 'debug', 'fix', 'investigate', 'error', 'issue'],
    variables: [
      { name: 'bug_description', label: 'Bug Description', type: 'multiline', required: true, placeholder: 'Describe the bug behavior...' },
      { name: 'expected_behavior', label: 'Expected Behavior', type: 'text', required: true, placeholder: 'What should happen instead?' },
      { name: 'affected_area', label: 'Affected Area', type: 'text', required: false, placeholder: 'e.g., login page, API, database' },
    ],
    steps: [
      {
        id: stepId(),
        name: 'Understand and locate',
        prompt: 'I need to investigate this bug:\n\n{{bug_description}}\n\nExpected behavior: {{expected_behavior}}\nAffected area: {{affected_area}}\n\nSearch the codebase to find the relevant files and understand the current code flow. Identify where the bug likely originates.',
        requireConfirmation: false,
      },
      {
        id: stepId(),
        name: 'Root cause analysis',
        prompt: 'Based on what you found, identify the root cause of the bug. Explain the exact code path that leads to the incorrect behavior. Show the specific lines of code involved.',
        requireConfirmation: true,
      },
      {
        id: stepId(),
        name: 'Implement fix',
        prompt: 'Implement the minimal fix for this bug. Change only what is necessary to correct the behavior. Do not refactor surrounding code.',
        requireConfirmation: true,
      },
      {
        id: stepId(),
        name: 'Verify fix',
        prompt: 'Run any existing tests related to the fix. If tests fail, fix them. If no tests cover this area, write a targeted test that would have caught this bug.',
        requireConfirmation: false,
      },
    ],
    execution: DEFAULT_EXECUTION,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-code-review',
    type: 'built-in',
    name: 'Code Review',
    description: 'Comprehensive code review: security, correctness, performance, and style.',
    icon: '\u{1F50D}',
    category: 'Quality',
    keywords: ['review', 'audit', 'quality', 'security', 'style', 'lint'],
    variables: [
      { name: 'target', label: 'Files/Directories to Review', type: 'text', required: true, placeholder: 'src/api/ or specific file path' },
      { name: 'focus', label: 'Review Focus', type: 'select', required: true, default: 'all', options: ['all', 'security', 'performance', 'correctness', 'style'] },
    ],
    steps: [
      {
        id: stepId(),
        name: 'Read and understand',
        prompt: 'Read through all the code in {{target}}. Understand its purpose, dependencies, and how it fits into the larger codebase.',
        requireConfirmation: false,
      },
      {
        id: stepId(),
        name: 'Analyze issues',
        prompt: 'Review the code in {{target}} with focus on: {{focus}}. Produce a structured review with categories: Critical (must fix), Important (should fix), Minor (nice to fix). For each issue, cite the exact file and line.',
        requireConfirmation: true,
      },
      {
        id: stepId(),
        name: 'Fix critical issues',
        prompt: 'Fix all Critical issues from your review. Make the minimal changes needed. Do not fix Important or Minor issues in this step.',
        requireConfirmation: true,
      },
      {
        id: stepId(),
        name: 'Verify fixes',
        prompt: 'Run tests to verify your fixes did not break anything. Summarize what was changed and what remains as Important/Minor issues for future work.',
        requireConfirmation: false,
      },
    ],
    execution: DEFAULT_EXECUTION,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-new-component',
    type: 'built-in',
    name: 'New Component',
    description: 'Create a new UI component with props, styling, and tests following project patterns.',
    icon: '\u{1F9E9}',
    category: 'Frontend',
    keywords: ['component', 'ui', 'react', 'frontend', 'widget', 'create'],
    variables: [
      { name: 'component_name', label: 'Component Name', type: 'text', required: true, placeholder: 'UserProfileCard' },
      { name: 'purpose', label: 'Component Purpose', type: 'text', required: true, placeholder: 'Display user profile with avatar and bio' },
      { name: 'location', label: 'Directory', type: 'text', required: false, default: 'src/components', placeholder: 'src/components' },
    ],
    steps: [
      {
        id: stepId(),
        name: 'Analyze existing components',
        prompt: 'Look at the existing components in {{location}} and nearby directories. Identify the patterns used for: component structure, props typing, styling approach, and file organization.',
        requireConfirmation: false,
      },
      {
        id: stepId(),
        name: 'Create component',
        prompt: 'Create a new {{component_name}} component in {{location}}. Purpose: {{purpose}}. Follow the existing component patterns. Include: TypeScript props interface, proper styling, and appropriate state management.',
        requireConfirmation: true,
      },
      {
        id: stepId(),
        name: 'Add tests',
        prompt: 'Write tests for the {{component_name}} component. Test: rendering with different props, user interactions, edge cases (empty data, long strings, etc.). Follow existing test patterns.',
        requireConfirmation: false,
      },
      {
        id: stepId(),
        name: 'Export and integrate',
        prompt: 'Add {{component_name}} to the appropriate barrel export file (index.ts) if one exists. Show an example of how to use the component.',
        requireConfirmation: false,
      },
    ],
    execution: DEFAULT_EXECUTION,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-refactor-pattern',
    type: 'built-in',
    name: 'Refactor Pattern',
    description: 'Systematically refactor a code pattern across the codebase.',
    icon: '\u{1F504}',
    category: 'Refactoring',
    keywords: ['refactor', 'rename', 'pattern', 'cleanup', 'migrate', 'modernize'],
    variables: [
      { name: 'current_pattern', label: 'Current Pattern', type: 'multiline', required: true, placeholder: 'Describe the pattern to replace...' },
      { name: 'new_pattern', label: 'New Pattern', type: 'multiline', required: true, placeholder: 'Describe the replacement pattern...' },
      { name: 'scope', label: 'Scope', type: 'text', required: false, default: '.', placeholder: 'Directory or file glob to scope the refactor' },
    ],
    steps: [
      {
        id: stepId(),
        name: 'Find all occurrences',
        prompt: 'Search the codebase within {{scope}} for all occurrences of this pattern:\n\n{{current_pattern}}\n\nList every file and line where this pattern appears. Count total occurrences.',
        requireConfirmation: false,
      },
      {
        id: stepId(),
        name: 'Plan refactor',
        prompt: 'For each occurrence found, plan the transformation to:\n\n{{new_pattern}}\n\nIdentify any edge cases where the transformation needs special handling. List the files that will be changed.',
        requireConfirmation: true,
      },
      {
        id: stepId(),
        name: 'Apply refactor',
        prompt: 'Apply the refactoring to all identified locations. Transform each occurrence of the current pattern to the new pattern. Handle edge cases as planned.',
        requireConfirmation: true,
      },
      {
        id: stepId(),
        name: 'Verify refactor',
        prompt: 'Run all tests. Search for any remaining occurrences of the old pattern to ensure nothing was missed. Fix any test failures caused by the refactor.',
        requireConfirmation: false,
      },
    ],
    execution: DEFAULT_EXECUTION,
    createdAt: 0,
    updatedAt: 0,
  },
];
