import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import type { Message } from '../services/gemini';

interface InChatFindProps {
  messages: Message[];
  onJump: (id: string) => void;
  onClose: () => void;
}

// Remove o realce de busca de todas as mensagens.
function clearHighlights() {
  document.querySelectorAll('.msg-search-highlight').forEach(el => el.classList.remove('msg-search-highlight'));
}

/**
 * Barra flutuante "localizar nesta conversa": busca por termo nas mensagens do
 * chat ativo, navega entre ocorrências (◀/▶ ou Enter/Shift+Enter) e realça a
 * mensagem atual. Realce em nível de mensagem (via DOM, como o resto do app).
 */
export default function InChatFind({ messages, onJump, onClose }: InChatFindProps) {
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as string[];
    return messages
      .filter(m => `${m.text || ''}\n${m.continuationText || ''}`.toLowerCase().includes(q))
      .map(m => m.id);
  }, [query, messages]);

  // Rola até a ocorrência atual e a realça.
  useEffect(() => {
    clearHighlights();
    if (matches.length === 0) return;
    const id = matches[Math.min(current, matches.length - 1)];
    onJump(id);
    // Pequeno atraso: o jump pode expandir a lista (lazy) antes do elemento existir.
    const t = setTimeout(() => {
      const el = document.getElementById(`msg-${id}`);
      if (el) el.classList.add('msg-search-highlight');
    }, 120);
    return () => clearTimeout(t);
  }, [matches, current, onJump]);

  // Limpa o realce ao fechar.
  useEffect(() => () => clearHighlights(), []);

  const go = (dir: number) => {
    if (matches.length === 0) return;
    setCurrent(c => (c + dir + matches.length) % matches.length);
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-1.5 bg-(--bg-sidebar-solid) border border-(--border-light) rounded-full shadow-2xl pl-3 pr-2 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
      <Search className="w-4 h-4 text-(--text-placeholder) shrink-0" />
      <input
        ref={inputRef}
        value={query}
        onChange={e => { setQuery(e.target.value); setCurrent(0); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
          else if (e.key === 'Escape') onClose();
        }}
        placeholder="Buscar nesta conversa…"
        className="bg-transparent outline-none text-sm text-(--text-primary) w-40 sm:w-56"
      />
      <span className="text-[11px] text-(--text-placeholder) tabular-nums shrink-0 min-w-14 text-center">
        {matches.length ? `${current + 1} de ${matches.length}` : (query.trim() ? 'nenhum' : '')}
      </span>
      <button onClick={() => go(-1)} disabled={!matches.length} title="Anterior" className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-30 text-(--text-secondary)"><ChevronUp className="w-4 h-4" /></button>
      <button onClick={() => go(1)} disabled={!matches.length} title="Próxima" className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-30 text-(--text-secondary)"><ChevronDown className="w-4 h-4" /></button>
      <button onClick={onClose} title="Fechar (Esc)" className="p-1.5 rounded-full hover:bg-white/10 text-(--text-secondary)"><X className="w-4 h-4" /></button>
    </div>
  );
}
