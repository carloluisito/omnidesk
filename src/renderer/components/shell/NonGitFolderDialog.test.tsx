import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NonGitFolderDialog } from './NonGitFolderDialog';

const defaultProps = {
  name: 'neldevsrc',
  onInitGit: vi.fn(),
  onOpenPlain: vi.fn(),
  onCancel: vi.fn(),
};

describe('NonGitFolderDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title and the folder name', () => {
    render(<NonGitFolderDialog {...defaultProps} />);
    expect(screen.getByText('Not a git repository')).toBeInTheDocument();
    expect(screen.getByText('neldevsrc')).toBeInTheDocument();
  });

  it('fires onInitGit when the initialize-git option is clicked', () => {
    render(<NonGitFolderDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /initialize git/i }));
    expect(defaultProps.onInitGit).toHaveBeenCalledTimes(1);
  });

  it('fires onOpenPlain when the plain-folder option is clicked', () => {
    render(<NonGitFolderDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /open as plain folder/i }));
    expect(defaultProps.onOpenPlain).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel when the footer Cancel button is clicked', () => {
    render(<NonGitFolderDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });
});
