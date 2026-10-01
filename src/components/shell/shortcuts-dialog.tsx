'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { SHORTCUT_LIST } from './shortcuts';

/** The "Keyboard shortcuts" list. Opened from the account menu, which owns `open`. */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  // The platform is read after mount so the server and the first client render agree.
  const [mod, setMod] = useState('Ctrl');
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setMod('⌘');
  }, []);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-backdrop" />
      <Dialog.Content className="dialog pg-dialog shortcuts-dialog" aria-describedby={undefined}>
        <header className="pg-dialog-head">
          <Dialog.Title className="pg-dialog-title">Keyboard shortcuts</Dialog.Title>
          <Dialog.Close className="btn btn-ghost btn-32 btn-icon" aria-label="Close"><X aria-hidden="true" /></Dialog.Close>
        </header>
        <dl className="shortcuts-list">
          {SHORTCUT_LIST.map(({ keys, label }) => <div className="shortcuts-row" key={`${label}-${keys.join('+')}`}>
            <dt>{label}</dt>
            <dd>{keys.map((key, index) => <span key={key}>
              {index > 0 ? <span className="shortcuts-plus" aria-hidden="true"> + </span> : null}
              <kbd className="shortcuts-key">{key === 'Mod' ? mod : key}</kbd>
            </span>)}</dd>
          </div>)}
        </dl>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
