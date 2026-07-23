import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { getElectronAPI } from '../../../test/helpers/electron-api-mock';
import { useCheckpoints } from './useCheckpoints';
import type { Checkpoint } from '../../shared/types/checkpoint-types';

const checkpoint: Checkpoint = {
  id: 'c1',
  sessionId: 's1',
  name: 'Checkpoint One',
  description: '',
  tags: [],
  isTemplate: false,
  createdAt: 1,
  historyPosition: 0,
  historySegment: 0,
};

describe('useCheckpoints', () => {
  it('loads checkpoints on mount and clears loading', async () => {
    const api = getElectronAPI();
    api.listCheckpoints = vi.fn().mockResolvedValue([checkpoint]);
    const { result } = renderHook(() => useCheckpoints());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.checkpoints).toEqual([checkpoint]);
    expect(result.current.error).toBeNull();
  });

  it('passes sessionId through to listCheckpoints on mount', async () => {
    const api = getElectronAPI();
    api.listCheckpoints = vi.fn().mockResolvedValue([]);
    renderHook(() => useCheckpoints('s1'));
    await waitFor(() => expect(api.listCheckpoints).toHaveBeenCalledWith('s1'));
  });

  it('sets error and keeps checkpoints empty when listCheckpoints rejects', async () => {
    const api = getElectronAPI();
    api.listCheckpoints = vi.fn().mockRejectedValue(new Error('disk error'));
    const { result } = renderHook(() => useCheckpoints());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('disk error');
    expect(result.current.checkpoints).toEqual([]);
  });

  it('refresh(forSessionId) overrides the hook-level sessionId for that call', async () => {
    const api = getElectronAPI();
    api.listCheckpoints = vi.fn().mockResolvedValue([]);
    const { result } = renderHook(() => useCheckpoints('s1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refresh('s2');
    });
    expect(api.listCheckpoints).toHaveBeenCalledWith('s2');
  });

  it('create passes through the created checkpoint and returns null on rejection', async () => {
    const api = getElectronAPI();
    api.listCheckpoints = vi.fn().mockResolvedValue([]);
    api.createCheckpoint = vi.fn().mockResolvedValue(checkpoint);
    const { result } = renderHook(() => useCheckpoints());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const request = { sessionId: 's1', name: 'Checkpoint One' } as any;
    await expect(result.current.create(request)).resolves.toEqual(checkpoint);
    expect(api.createCheckpoint).toHaveBeenCalledWith(request);

    api.createCheckpoint = vi.fn().mockRejectedValue(new Error('write failed'));
    await expect(result.current.create(request)).resolves.toBeNull();
    await waitFor(() => expect(result.current.error).toBe('write failed'));
  });

  it('get passes through the result and returns null on rejection', async () => {
    const api = getElectronAPI();
    api.listCheckpoints = vi.fn().mockResolvedValue([]);
    api.getCheckpoint = vi.fn().mockResolvedValue(checkpoint);
    const { result } = renderHook(() => useCheckpoints());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.get('c1')).resolves.toEqual(checkpoint);
    expect(api.getCheckpoint).toHaveBeenCalledWith('c1');

    api.getCheckpoint = vi.fn().mockRejectedValue(new Error('missing'));
    await expect(result.current.get('c1')).resolves.toBeNull();
    await waitFor(() => expect(result.current.error).toBe('missing'));
  });

  it('remove passes through the result and returns false on rejection', async () => {
    const api = getElectronAPI();
    api.listCheckpoints = vi.fn().mockResolvedValue([]);
    api.deleteCheckpoint = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useCheckpoints());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.remove('c1')).resolves.toBe(true);
    expect(api.deleteCheckpoint).toHaveBeenCalledWith('c1');

    api.deleteCheckpoint = vi.fn().mockRejectedValue(new Error('locked'));
    await expect(result.current.remove('c1')).resolves.toBe(false);
    await waitFor(() => expect(result.current.error).toBe('locked'));
  });

  it('update patches the matching checkpoint in local state on success, and returns null on rejection', async () => {
    const api = getElectronAPI();
    api.listCheckpoints = vi.fn().mockResolvedValue([checkpoint]);
    const updated = { ...checkpoint, name: 'Renamed' };
    api.updateCheckpoint = vi.fn().mockResolvedValue(updated);
    const { result } = renderHook(() => useCheckpoints());
    await waitFor(() => expect(result.current.checkpoints).toEqual([checkpoint]));

    await act(async () => {
      const r = await result.current.update('c1', { name: 'Renamed' });
      expect(r).toEqual(updated);
    });
    expect(api.updateCheckpoint).toHaveBeenCalledWith('c1', { name: 'Renamed' });
    expect(result.current.checkpoints).toEqual([updated]);

    api.updateCheckpoint = vi.fn().mockRejectedValue(new Error('conflict'));
    await expect(result.current.update('c1', { name: 'X' })).resolves.toBeNull();
    await waitFor(() => expect(result.current.error).toBe('conflict'));
    // Local state must be unchanged by the failed update.
    expect(result.current.checkpoints).toEqual([updated]);
  });

  it('exportCheckpoint passes through the content and returns null on rejection', async () => {
    const api = getElectronAPI();
    api.listCheckpoints = vi.fn().mockResolvedValue([]);
    api.exportCheckpoint = vi.fn().mockResolvedValue('exported content');
    const { result } = renderHook(() => useCheckpoints());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.exportCheckpoint('c1', 'markdown' as any)).resolves.toBe(
      'exported content',
    );
    expect(api.exportCheckpoint).toHaveBeenCalledWith('c1', 'markdown');

    api.exportCheckpoint = vi.fn().mockRejectedValue(new Error('io error'));
    await expect(result.current.exportCheckpoint('c1', 'markdown' as any)).resolves.toBeNull();
    await waitFor(() => expect(result.current.error).toBe('io error'));
  });

  it('count passes through the result and falls back to 0 on rejection', async () => {
    const api = getElectronAPI();
    api.listCheckpoints = vi.fn().mockResolvedValue([]);
    api.getCheckpointCount = vi.fn().mockResolvedValue(4);
    const { result } = renderHook(() => useCheckpoints());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.count('s1')).resolves.toBe(4);
    expect(api.getCheckpointCount).toHaveBeenCalledWith('s1');

    api.getCheckpointCount = vi.fn().mockRejectedValue(new Error('nope'));
    await expect(result.current.count('s1')).resolves.toBe(0);
    await waitFor(() => expect(result.current.error).toBe('nope'));
  });

  it('appends a checkpoint from onCheckpointCreated when no sessionId scope is set', async () => {
    const api = getElectronAPI();
    api.listCheckpoints = vi.fn().mockResolvedValue([]);
    let push: ((c: Checkpoint) => void) | null = null;
    api.onCheckpointCreated = vi.fn().mockImplementation((cb: (c: Checkpoint) => void) => {
      push = cb;
      return () => {
        push = null;
      };
    });
    const { result, unmount } = renderHook(() => useCheckpoints());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      push?.(checkpoint);
    });
    expect(result.current.checkpoints).toEqual([checkpoint]);

    unmount();
    expect(push).toBeNull();
  });

  it('ignores onCheckpointCreated events for a different session when scoped by sessionId', async () => {
    const api = getElectronAPI();
    api.listCheckpoints = vi.fn().mockResolvedValue([]);
    let push: ((c: Checkpoint) => void) | null = null;
    api.onCheckpointCreated = vi.fn().mockImplementation((cb: (c: Checkpoint) => void) => {
      push = cb;
      return () => {
        push = null;
      };
    });
    const { result } = renderHook(() => useCheckpoints('s1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      push?.({ ...checkpoint, sessionId: 's2' });
    });
    expect(result.current.checkpoints).toEqual([]);

    act(() => {
      push?.({ ...checkpoint, sessionId: 's1' });
    });
    expect(result.current.checkpoints).toEqual([{ ...checkpoint, sessionId: 's1' }]);
  });

  it('removes a checkpoint from local state on onCheckpointDeleted, and unsubscribes on unmount', async () => {
    const api = getElectronAPI();
    api.listCheckpoints = vi.fn().mockResolvedValue([checkpoint]);
    let push: ((id: string) => void) | null = null;
    api.onCheckpointDeleted = vi.fn().mockImplementation((cb: (id: string) => void) => {
      push = cb;
      return () => {
        push = null;
      };
    });
    const { result, unmount } = renderHook(() => useCheckpoints());
    await waitFor(() => expect(result.current.checkpoints).toEqual([checkpoint]));

    act(() => {
      push?.('c1');
    });
    expect(result.current.checkpoints).toEqual([]);

    unmount();
    expect(push).toBeNull();
  });
});
