import { useState } from 'react';
import { X, ExternalLink, Copy, Check } from 'lucide-react';

interface CodePreviewPanelProps {
  code: string;
  lang: string;
  onClose: () => void;
}

/**
 * Painel lateral de pré-visualização de código (HTML/SVG). Renderiza o conteúdo
 * num iframe com sandbox restrito (allow-scripts, SEM allow-same-origin), então
 * scripts rodam isolados do app (sem acesso a cookies/DOM do pai).
 */
export default function CodePreviewPanel({ code, lang, onClose }: CodePreviewPanelProps) {
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);

  // SVG é embrulhado num HTML mínimo centralizado; HTML/XML vai direto.
  const srcDoc = lang === 'svg'
    ? `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff">${code}</body></html>`
    : code;

  const openNewTab = () => {
    const blob = new Blob([srcDoc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* ignora */ });
  };

  const tabBtn = (id: 'preview' | 'code', label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${tab === id ? 'text-white' : 'text-(--text-secondary) hover:text-(--text-primary)'}`}
      style={tab === id ? { background: 'var(--accent)' } : {}}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-y-0 right-0 z-[120] w-full sm:w-[480px] md:w-[560px] bg-(--bg-main) border-l border-(--border-light) shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
      <header className="flex items-center gap-2 p-3 border-b border-(--border-light) bg-(--bg-sidebar)/30">
        <div className="flex items-center gap-1 bg-(--bg-sidebar) rounded-xl p-1">
          {tabBtn('preview', 'Preview')}
          {tabBtn('code', 'Código')}
        </div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-(--text-placeholder) ml-1">{lang}</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={copy} title="Copiar código" className="p-2 rounded-lg text-(--text-placeholder) hover:bg-(--bg-chat-hover) hover:text-(--text-primary) transition-colors">
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
          <button onClick={openNewTab} title="Abrir em nova aba" className="p-2 rounded-lg text-(--text-placeholder) hover:bg-(--bg-chat-hover) hover:text-(--text-primary) transition-colors">
            <ExternalLink className="w-4 h-4" />
          </button>
          <button onClick={onClose} title="Fechar" className="p-2 rounded-lg text-(--text-placeholder) hover:bg-(--bg-chat-hover) hover:text-(--text-primary) transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        {tab === 'preview' ? (
          <iframe
            title="Pré-visualização de código"
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            className="w-full h-full bg-white border-0"
          />
        ) : (
          <pre className="w-full h-full overflow-auto p-4 text-xs leading-relaxed text-(--text-primary) whitespace-pre-wrap break-words">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
