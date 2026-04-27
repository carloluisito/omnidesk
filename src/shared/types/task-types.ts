/**
 * Task Types - Tasks from a repo's .omnidesk/tasks.md
 */

/**
 * A task in a repo's .omnidesk/tasks.md.
 * The markdown file is the source of truth for title/done/notes.
 * createdAt comes from the sidecar (.omnidesk/tasks.meta.json).
 */
export interface Task {
  /** Stable id derived from (file index, title). Recomputed on every parse. */
  id: string;
  /** Task title */
  title: string;
  /** Whether the task is completed */
  done: boolean;
  /** Optional notes about the task */
  notes?: string;
  /** Unix ms. From sidecar; falls back to file mtime if missing. */
  createdAt: number;
}

/**
 * Request to add a new task
 */
export interface TaskAddRequest {
  /** Repository path containing .omnidesk/tasks.md */
  repoPath: string;
  /** Task title */
  title: string;
}

/**
 * Request to edit an existing task
 */
export interface TaskEditRequest {
  /** Repository path containing .omnidesk/tasks.md */
  repoPath: string;
  /** Task ID to edit */
  id: string;
  /** Updated task title (optional) */
  title?: string;
  /** Updated task notes (optional) */
  notes?: string;
}

/**
 * Event emitted when tasks change in a repository
 */
export interface TasksChangedEvent {
  /** Repository path that changed */
  repoPath: string;
  /** Current list of tasks */
  tasks: Task[];
}
