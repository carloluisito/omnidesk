import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';
import type { ConfirmDialogProps, ConfirmSeverity } from './ConfirmDialog';

// Mirrors the module-level Mod-key detection in ConfirmDialog.tsx so the test
// exercises whatever key the component actually resolves to (Cmd on macOS,
// Ctrl elsewhere) instead of hardcoding one platform.
const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
const MOD_KEY: 'metaKey' | 'ctrlKey' = IS_MAC ? 'metaKey' : 'ctrlKey';

function baseProps(overrides: Partial<ConfirmDialogProps> = {}): ConfirmDialogProps {
  return {
    isOpen: true,
    title: 'Delete file',
    body: 'This cannot be undone.',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

function pressEnter(init: KeyboardEventInit = {}) {
  fireEvent.keyDown(document, { key: 'Enter', ...init });
}

function pressEscape() {
  fireEvent.keyDown(document, { key: 'Escape' });
}

describe('ConfirmDialog', () => {
  describe('destructive / final-destructive keyboard-confirm safety', () => {
    (['destructive', 'final-destructive'] as ConfirmSeverity[]).forEach((severity) => {
      it(`${severity}: plain Enter shakes the dialog and does not confirm`, () => {
        const props = baseProps({ severity });
        render(<ConfirmDialog {...props} />);

        pressEnter();

        expect(props.onConfirm).not.toHaveBeenCalled();
        expect(screen.getByRole('alertdialog').className).toContain('anim-shake');
      });

      it(`${severity}: Mod+Enter confirms`, () => {
        const props = baseProps({ severity });
        render(<ConfirmDialog {...props} />);

        pressEnter({ [MOD_KEY]: true });

        expect(props.onConfirm).toHaveBeenCalledTimes(1);
      });

      it(`${severity}: clicking the primary button (mousedown) confirms even though onClick is unset`, () => {
        const props = baseProps({ severity });
        render(<ConfirmDialog {...props} />);
        const confirmButton = screen.getByRole('button', { name: new RegExp(`^${props.confirmLabel ?? 'Confirm'}`) });

        fireEvent.mouseDown(confirmButton);
        expect(props.onConfirm).toHaveBeenCalledTimes(1);

        // A plain click event (no mousedown) must not double-confirm or act as a
        // fallback path — the destructive primary button intentionally has no
        // onClick handler.
        fireEvent.click(confirmButton);
        expect(props.onConfirm).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('info / warning keyboard-confirm', () => {
    (['info', 'warning'] as ConfirmSeverity[]).forEach((severity) => {
      it(`${severity}: plain Enter confirms`, () => {
        const props = baseProps({ severity });
        render(<ConfirmDialog {...props} />);

        pressEnter();

        expect(props.onConfirm).toHaveBeenCalledTimes(1);
      });

      (['shiftKey', 'ctrlKey', 'metaKey'] as const).forEach((modifier) => {
        it(`${severity}: Enter with ${modifier} held does not confirm`, () => {
          const props = baseProps({ severity });
          render(<ConfirmDialog {...props} />);

          pressEnter({ [modifier]: true });

          expect(props.onConfirm).not.toHaveBeenCalled();
        });
      });

      it(`${severity}: does not render the hold-to-confirm hint`, () => {
        render(<ConfirmDialog {...baseProps({ severity })} />);
        expect(screen.queryByText(/hold/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Escape', () => {
    (['info', 'warning', 'destructive', 'final-destructive'] as ConfirmSeverity[]).forEach((severity) => {
      it(`${severity}: Escape cancels`, () => {
        const props = baseProps({ severity });
        render(<ConfirmDialog {...props} />);

        pressEscape();

        expect(props.onCancel).toHaveBeenCalledTimes(1);
        expect(props.onConfirm).not.toHaveBeenCalled();
      });
    });
  });

  describe('isOpen=false', () => {
    it('renders nothing and the keydown listener is a no-op', () => {
      const props = baseProps({ isOpen: false });
      const { container } = render(<ConfirmDialog {...props} />);

      expect(container.firstChild).toBeNull();

      pressEnter({ [MOD_KEY]: true });
      pressEscape();

      expect(props.onConfirm).not.toHaveBeenCalled();
      expect(props.onCancel).not.toHaveBeenCalled();
    });
  });

  describe('severity resolution', () => {
    it('defaults to info when neither severity nor isDangerous is set', () => {
      render(<ConfirmDialog {...baseProps()} />);
      expect(screen.queryByText(/hold/i)).not.toBeInTheDocument();
    });

    it('isDangerous=true resolves to destructive when severity is unset', () => {
      const props = baseProps({ isDangerous: true });
      render(<ConfirmDialog {...props} />);

      expect(screen.getByText(/hold/i)).toBeInTheDocument();
      pressEnter();
      expect(props.onConfirm).not.toHaveBeenCalled();
      pressEnter({ [MOD_KEY]: true });
      expect(props.onConfirm).toHaveBeenCalledTimes(1);
    });

    it('an explicit severity prop overrides isDangerous', () => {
      const props = baseProps({ isDangerous: true, severity: 'info' });
      render(<ConfirmDialog {...props} />);

      // isDangerous would have made this destructive (Enter shakes, not confirms);
      // the explicit severity='info' must win instead (Enter confirms directly).
      expect(screen.queryByText(/hold/i)).not.toBeInTheDocument();
      pressEnter();
      expect(props.onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('backdrop vs inner click', () => {
    it('clicking the backdrop cancels', () => {
      const props = baseProps();
      render(<ConfirmDialog {...props} />);

      fireEvent.click(screen.getByRole('presentation'));

      expect(props.onCancel).toHaveBeenCalledTimes(1);
    });

    it('clicking inside the dialog does not cancel', () => {
      const props = baseProps();
      render(<ConfirmDialog {...props} />);

      fireEvent.click(screen.getByRole('alertdialog'));

      expect(props.onCancel).not.toHaveBeenCalled();
    });
  });
});
