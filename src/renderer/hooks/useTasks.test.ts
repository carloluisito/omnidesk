import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTasks } from './useTasks';

const REPO = '/tmp/repo';

beforeEach(() => {
  let listeners: Array<(payload: any) => void> = [];
  (window as any).electronAPI = {
    listTasks: vi.fn(async () => [
      { id: 't_1', title: 'one', done: false, createdAt: 1 },
    ]),
    addTask: vi.fn(async ({ title }) => ({
      id: 't_2', title, done: false, createdAt: 2,
    })),
    toggleTask: vi.fn(async (_p: string, id: string) => ({
      id, title: 'one', done: true, createdAt: 1,
    })),
    editTask: vi.fn(async (req: any) => ({
      id: req.id, title: req.title ?? 'one', done: false, createdAt: 1,
    })),
    deleteTask: vi.fn(async () => true),
    onTasksChanged: vi.fn((fn: any) => {
      listeners.push(fn);
      return () => { listeners = listeners.filter(f => f !== fn); };
    }),
    __fire: (payload: any) => listeners.forEach(f => f(payload)),
  };
});

describe('useTasks', () => {
  it('loads tasks on mount', async () => {
    const { result } = renderHook(() => useTasks(REPO));
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    expect(window.electronAPI.listTasks).toHaveBeenCalledWith(REPO);
  });

  it('adds a task', async () => {
    const { result } = renderHook(() => useTasks(REPO));
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    await act(async () => { await result.current.add('two'); });
    expect(window.electronAPI.addTask).toHaveBeenCalledWith({ repoPath: REPO, title: 'two' });
  });

  it('reacts to onTasksChanged events for the same repo', async () => {
    const { result } = renderHook(() => useTasks(REPO));
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    act(() => {
      (window as any).electronAPI.__fire({
        repoPath: REPO,
        tasks: [
          { id: 't_1', title: 'one', done: false, createdAt: 1 },
          { id: 't_2', title: 'from-AI', done: false, createdAt: 3 },
        ],
      });
    });
    await waitFor(() => expect(result.current.tasks).toHaveLength(2));
  });

  it('ignores onTasksChanged for other repos', async () => {
    const { result } = renderHook(() => useTasks(REPO));
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    act(() => {
      (window as any).electronAPI.__fire({
        repoPath: '/other',
        tasks: [],
      });
    });
    expect(result.current.tasks).toHaveLength(1);
  });
});
