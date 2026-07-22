/* eslint-disable react-refresh/only-export-components -- arquivo de contexto: provider + hooks juntos por design */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  duration: number;
}

interface ToastApi {
  success: (message: string, opts?: { duration?: number }) => void;
  error: (message: string, opts?: { duration?: number }) => void;
  info: (message: string, opts?: { duration?: number }) => void;
  dismiss: (id: string) => void;
}

interface ToastContextValue extends ToastApi {
  toasts: Toast[];
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;
const nextId = () => `toast-${Date.now()}-${counter++}`;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const push = useCallback((kind: ToastKind, message: string, duration: number) => {
    const id = nextId();
    setToasts(prev => [...prev, { id, kind, message, duration }]);
    if (duration > 0) {
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    }
  }, [dismiss]);

  const success = useCallback((m: string, o?: { duration?: number }) => push('success', m, o?.duration ?? 4500), [push]);
  const error = useCallback((m: string, o?: { duration?: number }) => push('error', m, o?.duration ?? 7000), [push]);
  const info = useCallback((m: string, o?: { duration?: number }) => push('info', m, o?.duration ?? 4500), [push]);

  return (
    <ToastContext.Provider value={{ toasts, success, error, info, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>.');
  const { success, error, info, dismiss } = ctx;
  // Objeto estável entre renders (os métodos já são memoizados no provider), para
  // poder entrar nas deps de useCallback/useEffect sem invalidá-las a cada render.
  return useMemo(() => ({ success, error, info, dismiss }), [success, error, info, dismiss]);
}

// Acesso interno ao contexto completo (inclui a lista) — usado pelo ToastHost.
export function useToastContext(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToastContext deve ser usado dentro de <ToastProvider>.');
  return ctx;
}
