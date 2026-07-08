import { useEffect, useReducer, useState } from 'react';
import { KEY_BYTES, ctrlByte, stickyCtrlReducer } from '../../../terminal/mobile-keys';
import './MobileKeyBar.css';

interface KeyDef { label: string; aria: string; bytes?: string; }

// Primary row: the keys a CLI session genuinely needs on a phone.
const PRIMARY: KeyDef[] = [
  { label: 'Esc', aria: 'Escape', bytes: KEY_BYTES.esc },
  { label: 'Tab', aria: 'Tab', bytes: KEY_BYTES.tab },
  { label: 'Ctrl', aria: 'Control' }, // sticky modifier, handled specially
  { label: '↑', aria: 'Up', bytes: KEY_BYTES.up },
  { label: '↓', aria: 'Down', bytes: KEY_BYTES.down },
  { label: '←', aria: 'Left', bytes: KEY_BYTES.left },
  { label: '→', aria: 'Right', bytes: KEY_BYTES.right },
  { label: '⏎', aria: 'Newline', bytes: KEY_BYTES.newline },
];
// Secondary (expandable) row: common shell symbols hard to reach on mobile.
const SYMBOLS = ['|', '~', '/', '-'];
// Ctrl-armed letters exposed for one-tap combos (e.g. Ctrl+C).
const CTRL_LETTERS = ['c', 'd', 'z', 'l'];

export function MobileKeyBar({ onKey }: { onKey: (bytes: string) => void }) {
  const [ctrl, dispatch] = useReducer(stickyCtrlReducer, { armed: false });
  const [showSymbols, setShowSymbols] = useState(false);
  const [bottom, setBottom] = useState(0);

  // Sit directly above the soft keyboard: on iOS the layout viewport does not
  // shrink, so translate up by the keyboard's occluded height from visualViewport.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const reposition = () => setBottom(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    reposition();
    vv.addEventListener('resize', reposition);
    vv.addEventListener('scroll', reposition);
    return () => { vv.removeEventListener('resize', reposition); vv.removeEventListener('scroll', reposition); };
  }, []);

  const emit = (bytes: string) => { onKey(bytes); if (ctrl.armed) dispatch({ type: 'consume' }); };

  const pressLetter = (letter: string) => {
    if (ctrl.armed) {
      const b = ctrlByte(letter);
      onKey(b ?? letter);
      dispatch({ type: 'consume' });
    } else {
      onKey(letter);
    }
  };

  // Paste: reads the system clipboard into the session. Unavailable in a
  // non-secure context (plain-http LAN), where navigator.clipboard is absent.
  const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;
  const doPaste = () => {
    navigator.clipboard?.readText?.().then(t => { if (t) onKey(t); }).catch(() => { /* denied — ignore */ });
  };

  return (
    <div className="mkb" style={{ bottom }} role="toolbar" aria-label="Terminal keys">
      {showSymbols && (
        <div className="mkb-row mkb-symbols">
          {SYMBOLS.map(s => (
            <button key={s} className="mkb-key" aria-label={s} onClick={() => emit(s)}>{s}</button>
          ))}
          {CTRL_LETTERS.map(l => (
            <button key={l} className="mkb-key" aria-label={l} onClick={() => pressLetter(l)}>{l}</button>
          ))}
        </div>
      )}
      <div className="mkb-row">
        {PRIMARY.map(k => (
          <button
            key={k.aria}
            className={'mkb-key' + (k.aria === 'Control' && ctrl.armed ? ' mkb-armed' : '')}
            aria-label={k.aria}
            aria-pressed={k.aria === 'Control' ? ctrl.armed : undefined}
            onClick={() => (k.aria === 'Control' ? dispatch({ type: 'toggle' }) : emit(k.bytes!))}
          >
            {k.label}
          </button>
        ))}
        <button
          className="mkb-key"
          aria-label="Paste"
          disabled={!canPaste}
          title={canPaste ? undefined : 'Paste unavailable over http'}
          onClick={doPaste}
        >
          Paste
        </button>
        <button className="mkb-key mkb-more" aria-label="More keys" onClick={() => setShowSymbols(v => !v)}>
          {showSymbols ? '×' : '···'}
        </button>
      </div>
    </div>
  );
}
