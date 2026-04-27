import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskQuickCapture } from './TaskQuickCapture';

beforeEach(() => {
  (window as any).electronAPI = {
    listTasks: vi.fn(async () => []),
    addTask: vi.fn(async ({ title }) => ({ id: 't', title, done: false, createdAt: 0 })),
    onTasksChanged: vi.fn(() => () => {}),
  };
});

describe('TaskQuickCapture', () => {
  it('renders when open', () => {
    render(<TaskQuickCapture isOpen repoPath="/r" onClose={() => {}} />);
    expect(screen.getByPlaceholderText(/Add a task/i)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<TaskQuickCapture isOpen={false} repoPath="/r" onClose={() => {}} />);
    expect(screen.queryByPlaceholderText(/Add a task/i)).toBeNull();
  });

  it('saves on Enter and closes', async () => {
    const onClose = vi.fn();
    render(<TaskQuickCapture isOpen repoPath="/r" onClose={onClose} />);
    const input = screen.getByPlaceholderText(/Add a task/i);
    fireEvent.change(input, { target: { value: 'quick task' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(window.electronAPI.addTask).toHaveBeenCalledWith({ repoPath: '/r', title: 'quick task' }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('Esc closes without saving', () => {
    const onClose = vi.fn();
    render(<TaskQuickCapture isOpen repoPath="/r" onClose={onClose} />);
    fireEvent.keyDown(screen.getByPlaceholderText(/Add a task/i), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(window.electronAPI.addTask).not.toHaveBeenCalled();
  });

  it('shows no-repo state when repoPath is null', () => {
    render(<TaskQuickCapture isOpen repoPath={null} onClose={() => {}} />);
    expect(screen.getByText(/no repo/i)).toBeInTheDocument();
  });
});
