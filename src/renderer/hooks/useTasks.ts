import { useEffect, useState, useCallback, useRef } from 'react';
import type { Task } from '../../shared/types/task-types';

export function useTasks(repoPath: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const repoRef = useRef(repoPath);
  repoRef.current = repoPath;

  const reload = useCallback(async () => {
    if (!repoPath) { setTasks([]); return; }
    setIsLoading(true);
    setError(null);
    try {
      const list = await window.electronAPI.listTasks(repoPath);
      if (repoRef.current === repoPath) setTasks(list);
    } catch (e) {
      console.error('useTasks: list failed', e);
      setError('Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  }, [repoPath]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!repoPath) return;
    const off = window.electronAPI.onTasksChanged((evt) => {
      if (evt.repoPath !== repoRef.current) return;
      setTasks(evt.tasks);
    });
    return off;
  }, [repoPath]);

  const add = useCallback(async (title: string) => {
    if (!repoPath || !title.trim()) return;
    await window.electronAPI.addTask({ repoPath, title });
    await reload();
  }, [repoPath, reload]);

  const toggle = useCallback(async (id: string) => {
    if (!repoPath) return;
    await window.electronAPI.toggleTask(repoPath, id);
    await reload();
  }, [repoPath, reload]);

  const edit = useCallback(async (id: string, changes: { title?: string; notes?: string }) => {
    if (!repoPath) return;
    await window.electronAPI.editTask({ repoPath, id, ...changes });
    await reload();
  }, [repoPath, reload]);

  const remove = useCallback(async (id: string) => {
    if (!repoPath) return;
    await window.electronAPI.deleteTask(repoPath, id);
    await reload();
  }, [repoPath, reload]);

  return { tasks, isLoading, error, add, toggle, edit, remove, reload };
}
