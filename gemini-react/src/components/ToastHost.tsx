import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useToastContext, type ToastKind } from '../hooks/useToast';

const ICONS: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const ACCENTS: Record<ToastKind, string> = {
  success: '#22c55e',
  error: '#ef4444',
  info: 'var(--accent)',
};

/**
 * Renderiza a pilha de toasts. Deve ficar dentro de <ToastProvider>. Empilha no
 * canto inferior direito (acima da barra de input no mobile), acessível via aria-live.
 */
export default function ToastHost() {
  const { toasts, dismiss } = useToastContext();
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[300] flex flex-col gap-2 max-w-[calc(100vw-2rem)] w-80 pointer-events-none"
      aria-live="polite"
      role="status"
    >
      {toasts.map(t => {
        const Icon = ICONS[t.kind];
        const accent = ACCENTS[t.kind];
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 p-3 rounded-2xl shadow-2xl border animate-in slide-in-from-bottom-2 fade-in duration-300"
            style={{ background: 'var(--bg-sidebar-solid, var(--bg-sidebar))', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
          >
            <Icon size={18} className="shrink-0 mt-0.5" style={{ color: accent }} />
            <div className="flex-1 min-w-0 text-sm break-words">{t.message}</div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 p-1 rounded-lg text-(--text-placeholder) hover:bg-(--bg-chat-hover) transition-colors"
              aria-label="Fechar notificação"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
