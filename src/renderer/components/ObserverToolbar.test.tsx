/**
 * Tests for ObserverToolbar
 *
 * Covers:
 *   - Renders with data-testid="observer-toolbar"
 *   - Shows session name
 *   - Shows "Request Control" button in read-only state
 *   - Shows "Requesting..." (disabled) in requesting state
 *   - Shows "Release Control" in has-control state
 *   - Shows "You have control" indicator in has-control state
 *   - Leave button calls onLeave
 *   - Request Control button calls onRequestControl
 *   - Release Control button calls onReleaseControl
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ObserverToolbar } from './ObserverToolbar';

const defaultProps = {
  sessionName:      'Test Session',
  shareCode:        'ABC123',
  controlState:     'read-only' as const,
  onRequestControl: vi.fn(),
  onReleaseControl: vi.fn(),
  onLeave:          vi.fn(),
};

describe('ObserverToolbar', () => {
  it('renders with data-testid="observer-toolbar"', () => {
    render(<ObserverToolbar {...defaultProps} />);
    expect(screen.getByTestId('observer-toolbar')).toBeInTheDocument();
  });

  it('shows session name', () => {
    render(<ObserverToolbar {...defaultProps} />);
    expect(screen.getByText('Test Session')).toBeInTheDocument();
  });

  it('shows "Request Control" in read-only state', () => {
    render(<ObserverToolbar {...defaultProps} controlState="read-only" />);
    expect(screen.getByTestId('request-control-btn')).toHaveTextContent('Request Control');
  });

  it('shows "Requesting..." (disabled) in requesting state', () => {
    render(<ObserverToolbar {...defaultProps} controlState="requesting" />);
    const btn = screen.getByTestId('request-control-btn');
    expect(btn).toHaveTextContent('Requesting...');
    expect(btn).toBeDisabled();
  });

  it('shows "Release Control" in has-control state', () => {
    render(<ObserverToolbar {...defaultProps} controlState="has-control" />);
    expect(screen.getByTestId('request-control-btn')).toHaveTextContent('Release Control');
  });

  it('shows "You have control" indicator in has-control state', () => {
    render(<ObserverToolbar {...defaultProps} controlState="has-control" />);
    expect(screen.getByText('You have control')).toBeInTheDocument();
  });

  it('calls onRequestControl when "Request Control" clicked', () => {
    render(<ObserverToolbar {...defaultProps} controlState="read-only" />);
    fireEvent.click(screen.getByTestId('request-control-btn'));
    expect(defaultProps.onRequestControl).toHaveBeenCalled();
  });

  it('calls onReleaseControl when "Release Control" clicked', () => {
    render(<ObserverToolbar {...defaultProps} controlState="has-control" />);
    fireEvent.click(screen.getByTestId('request-control-btn'));
    expect(defaultProps.onReleaseControl).toHaveBeenCalled();
  });

  it('Leave button exists with data-testid="leave-session-btn"', () => {
    render(<ObserverToolbar {...defaultProps} />);
    expect(screen.getByTestId('leave-session-btn')).toBeInTheDocument();
  });

  it('Leave button calls onLeave', () => {
    render(<ObserverToolbar {...defaultProps} />);
    fireEvent.click(screen.getByTestId('leave-session-btn'));
    expect(defaultProps.onLeave).toHaveBeenCalled();
  });

  it('renders overflow menu in narrow mode', () => {
    render(<ObserverToolbar {...defaultProps} isNarrow={true} />);
    expect(screen.getByTestId('observer-toolbar')).toBeInTheDocument();
    // Overflow button should be present
    expect(screen.getByLabelText('Observer options')).toBeInTheDocument();
  });
});
