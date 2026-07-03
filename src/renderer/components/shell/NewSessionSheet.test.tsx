import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NewSessionSheet } from './NewSessionSheet';

const repo = { id: 'r1', name: 'demo', path: '/repos/demo', isGit: false } as any;

describe('NewSessionSheet — Terminal type', () => {
  it('submits a shell form with kind=shell and the repo path', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <NewSessionSheet repos={[repo]} sessions={[]} activeRepoId="r1" onClose={() => {}} onCreate={onCreate} />
    );
    fireEvent.click(screen.getByRole('button', { name: /terminal/i })); // Type toggle
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    // onCreate is async; flush microtasks
    await Promise.resolve();
    expect(onCreate).toHaveBeenCalledTimes(1);
    const form = onCreate.mock.calls[0][0];
    expect(form.kind).toBe('shell');
    expect(form.workingDirectory).toBe('/repos/demo');
  });
});
