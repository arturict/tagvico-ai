'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export type ToastOptions = {
  message: string;
  /** Label of the one optional button, for example "Undo". */
  actionLabel?: string;
  onAction?: () => void;
  /** Milliseconds until the toast leaves on its own; default 5000. */
  durationMs?: number;
};

type ToastItem = ToastOptions & { id: number };

const DEFAULT_DURATION_MS = 5_000;
const MAX_TOASTS = 3;

const ToastContext = createContext<((toast: ToastOptions) => void) | null>(null);

/** Shows a short message with an optional action. Outside a provider it does nothing, so callers need no guard. */
export function useToast() {
  const show = useContext(ToastContext);
  return useMemo(() => ({ show: show ?? (() => {}), available: show !== null }), [show]);
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const timer = useRef<number | undefined>(undefined);
  const duration = toast.durationMs ?? DEFAULT_DURATION_MS;
  // The countdown stops while the pointer or keyboard focus is on the toast, so there is time to press Undo.
  const start = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onDismiss(toast.id), duration);
  }, [duration, onDismiss, toast.id]);
  const pause = () => window.clearTimeout(timer.current);
  useEffect(() => {
    start();
    return pause;
  }, [start]);

  return <div
    className="toast"
    role="status"
    onMouseEnter={pause}
    onMouseLeave={start}
    onFocus={pause}
    onBlur={start}
  >
    <span className="toast-message">{toast.message}</span>
    {toast.actionLabel ? <button
      type="button"
      className="toast-action"
      onClick={() => {
        toast.onAction?.();
        onDismiss(toast.id);
      }}
    >{toast.actionLabel}</button> : null}
    <button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
      <X aria-hidden="true" />
    </button>
  </div>;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const show = useCallback((toast: ToastOptions) => {
    nextId.current += 1;
    const item = { ...toast, id: nextId.current };
    setToasts((current) => [...current, item].slice(-MAX_TOASTS));
  }, []);
  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  return <ToastContext.Provider value={show}>
    {children}
    <div className="toast-region" role="region" aria-label="Notifications">
      {toasts.map((toast) => <ToastView key={toast.id} toast={toast} onDismiss={dismiss} />)}
    </div>
  </ToastContext.Provider>;
}
