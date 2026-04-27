import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPanel } from './TaskPanel';

beforeEach(() => {
  (window as any).electronAPI = {
    listTasks: vi.fn(async () => [
      { id: 't_1', title: 'open task', done: false, createdAt: 1 },
      { id: 't_2', title: 'done task', done: true, createdAt: 2 },
    ]),
    addTask: vi.fn(async ({ title }) => ({ id: 't_3', title, done: false, createdAt: 3 })),
    toggleTask: vi.fn(async (_p, id) => ({ id, title: 'open task', done: true, createdAt: 1 })),
    editTask: vi.fn(),
    deleteTask: vi.fn(async () => true),
    onTasksChanged: vi.fn(() => () => {}),
  };
});

describe('TaskPanel', () => {
  it('renders empty state when no repo path', () => {
    render(<TaskPanel repoPath={null} />);
    expect(screen.getByText(/Open a repo/i)).toBeInTheDocument();
  });

  it('renders open + done tasks', async () => {
    render(<TaskPanel repoPath="/r" />);
    await waitFor(() => expect(screen.getByText('open task')).toBeInTheDocument());
    expect(screen.getByText('done task')).toBeInTheDocument();
  });

  it('shows count "1 open / 2 total"', async () => {
    render(<TaskPanel repoPath="/r" />);
    await waitFor(() => expect(screen.getByText(/1 open \/ 2 total/i)).toBeInTheDocument());
  });

  it('adds a task via the inline input', async () => {
    render(<TaskPanel repoPath="/r" />);
    const input = await screen.findByPlaceholderText(/Add a task/i);
    fireEvent.change(input, { target: { value: 'new one' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(window.electronAPI.addTask).toHaveBeenCalledWith({ repoPath: '/r', title: 'new one' }),
    );
  });

  it('toggles a task on checkbox click', async () => {
    render(<TaskPanel repoPath="/r" />);
    await waitFor(() => screen.getByText('open task'));
    const cb = screen.getAllByRole('checkbox')[0];
    fireEvent.click(cb);
    await waitFor(() =>
      expect(window.electronAPI.toggleTask).toHaveBeenCalledWith('/r', 't_1'),
    );
  });
});
