/**
 * Tests for ObserverMetadataSidebar
 *
 * Covers:
 *   - Renders with data-testid="observer-metadata-sidebar"
 *   - Shows "Waiting for session data..." when no metadata
 *   - Shows tool, file, status, changes, model from metadata
 *   - Collapses to 24px strip when forceCollapsed=true
 *   - Clicking collapsed strip expands sidebar
 *   - Collapse button folds it back to icon strip
 *   - Displays shareCode in footer
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ObserverMetadataSidebar } from './ObserverMetadataSidebar';
import type { SessionMetadataFrame } from '../../shared/types/sharing-types';

const mockMetadata: SessionMetadataFrame = {
  type:        'metadata',
  timestamp:   Date.now(),
  tool:        'Edit',
  filePath:    '/src/main/index.ts',
  agentStatus: 'writing',
  fileChanges: 3,
  model:       'claude-sonnet',
  providerId:  'claude',
};

const defaultProps = {
  shareCode: 'ABC123',
  metadata:  null,
};

describe('ObserverMetadataSidebar', () => {
  it('renders with data-testid="observer-metadata-sidebar"', () => {
    render(<ObserverMetadataSidebar {...defaultProps} />);
    expect(screen.getByTestId('observer-metadata-sidebar')).toBeInTheDocument();
  });

  it('shows "Waiting for session data..." when no metadata', () => {
    render(<ObserverMetadataSidebar {...defaultProps} metadata={null} />);
    expect(screen.getByText(/Waiting for session data/i)).toBeInTheDocument();
  });

  it('shows active tool from metadata', () => {
    render(<ObserverMetadataSidebar {...defaultProps} metadata={mockMetadata} />);
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('shows truncated file path from metadata', () => {
    render(<ObserverMetadataSidebar {...defaultProps} metadata={mockMetadata} />);
    // Truncated path ends with index.ts
    expect(screen.getByText(/index\.ts/)).toBeInTheDocument();
  });

  it('shows agent status "Writing" (capitalized)', () => {
    render(<ObserverMetadataSidebar {...defaultProps} metadata={mockMetadata} />);
    expect(screen.getByText('Writing')).toBeInTheDocument();
  });

  it('shows file changes count', () => {
    render(<ObserverMetadataSidebar {...defaultProps} metadata={mockMetadata} />);
    expect(screen.getByText('3 files')).toBeInTheDocument();
  });

  it('shows model name', () => {
    render(<ObserverMetadataSidebar {...defaultProps} metadata={mockMetadata} />);
    expect(screen.getByText('claude-sonnet')).toBeInTheDocument();
  });

  it('shows shareCode in footer', () => {
    render(<ObserverMetadataSidebar {...defaultProps} />);
    expect(screen.getByText('ABC123')).toBeInTheDocument();
  });

  it('renders in collapsed mode when forceCollapsed=true', () => {
    render(<ObserverMetadataSidebar {...defaultProps} forceCollapsed={true} />);
    const sidebar = screen.getByTestId('observer-metadata-sidebar');
    expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  });

  it('expanding a collapsed sidebar changes data-collapsed to false', () => {
    render(<ObserverMetadataSidebar {...defaultProps} forceCollapsed={true} />);
    const sidebar = screen.getByTestId('observer-metadata-sidebar');
    fireEvent.click(sidebar);
    expect(screen.getByTestId('observer-metadata-sidebar')).toHaveAttribute('data-collapsed', 'false');
  });

  it('collapse button folds sidebar back to icon strip', () => {
    render(<ObserverMetadataSidebar {...defaultProps} />);
    // Initially expanded
    expect(screen.getByTestId('observer-metadata-sidebar')).toHaveAttribute('data-collapsed', 'false');
    // Click collapse button
    fireEvent.click(screen.getByLabelText('Collapse metadata sidebar'));
    expect(screen.getByTestId('observer-metadata-sidebar')).toHaveAttribute('data-collapsed', 'true');
  });
});
