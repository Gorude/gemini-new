import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, MessageSquare, X, Bot, User, Archive } from 'lucide-react';
import { type ChatSession } from '../types';

interface GlobalSearchModalProps {
  chats: ChatSession[];
  onClose: () => void;
  onSelectChat: (chatId: string, msgId?: string) => void;
}

interface SearchResult {
  chatId: string;
  chatTitle: string;
  isArchived: boolean;
  msgId?: string;
  msgText?: string;
  msgRole?: 'user' | 'ai';
  matchType: 'title' | 'message';
}

const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ chats, onClose, onSelectChat }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when opened
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Filter chats & messages based on query
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const lowerQuery = query.toLowerCase();
    const matches: SearchResult[] = [];

    chats.forEach(chat => {
      // 1. Check title match
      if (chat.title.toLowerCase().includes(lowerQuery)) {
        matches.push({
          chatId: chat.id,
          chatTitle: chat.title,
          isArchived: !!chat.archived,
          matchType: 'title'
        });
      }

      // 2. Check message content match
      chat.messages.forEach(msg => {
        if (msg.text && msg.text.toLowerCase().includes(lowerQuery)) {
          matches.push({
            chatId: chat.id,
            chatTitle: chat.title,
            isArchived: !!chat.archived,
            msgId: msg.id,
            msgText: msg.text,
            msgRole: msg.role,
            matchType: 'message'
          });
        }
      });
    });

    return matches.slice(0, 15); // Limit results for clean UI & performance
  }, [query, chats]);

  // Handle keyboard events (Setas e Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % Math.max(1, results.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + results.length) % Math.max(1, results.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          const sel = results[selectedIndex];
          onSelectChat(sel.chatId, sel.msgId);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, selectedIndex, onSelectChat, onClose]);

  // Click outside detection
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Helper to extract a snippet around matching text
  const getSnippet = (text: string, searchStr: string) => {
    const index = text.toLowerCase().indexOf(searchStr.toLowerCase());
    if (index === -1) return text.substring(0, 80) + '...';
    
    const start = Math.max(0, index - 40);
    const end = Math.min(text.length, index + searchStr.length + 60);
    let snippet = text.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    return snippet;
  };

  // Helper to highlight matching text
  const highlightText = (text: string, searchStr: string) => {
    if (!searchStr.trim()) return <span>{text}</span>;
    const escapedSearch = searchStr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${escapedSearch})`, 'gi');
    const parts = text.split(regex);
    
    return (
      <span>
        {parts.map((part, i) => 
          regex.test(part) 
            ? <mark key={i} className="bg-blue-500/20 text-blue-400 font-semibold px-0.5 rounded-sm">{part}</mark> 
            : part
        )}
      </span>
    );
  };

  return (
    <div 
      className="fixed inset-0 z-[1000] flex items-start justify-center pt-24 px-4 backdrop-blur-[2px] bg-transparent"
      onClick={onClose}
    >
      <div 
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[var(--bg-modal)] backdrop-blur-3xl rounded-3xl border border-[var(--border-main)] shadow-[0_25px_60px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300"
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-5 py-4 border-b border-[var(--border-light)] gap-3 bg-[var(--bg-sidebar)]/10">
          <Search className="w-5 h-5 text-[var(--text-placeholder)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Pesquisar títulos ou conteúdos nas conversas..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent border-none text-[var(--text-primary)] outline-none text-sm placeholder-[var(--text-placeholder)]"
          />
          <button 
            onClick={onClose}
            className="p-1 hover:bg-[var(--bg-chat-hover)] rounded-lg text-[var(--text-placeholder)] hover:text-[var(--text-primary)] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results Body */}
        <div className="max-h-[350px] overflow-y-auto custom-scrollbar p-2">
          {!query.trim() ? (
            <div className="py-12 text-center text-xs text-[var(--text-placeholder)] font-medium">
              Digite algo para buscar em suas conversas ativas ou arquivadas.
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--text-placeholder)] font-medium">
              Nenhum resultado encontrado para "{query}".
            </div>
          ) : (
            <div className="space-y-1">
              {results.map((res, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={`${res.chatId}-${res.msgId || idx}`}
                    onClick={() => onSelectChat(res.chatId, res.msgId)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-start gap-3 p-3 rounded-2xl cursor-pointer transition-all duration-200 select-none ${
                      isSelected 
                        ? 'bg-[var(--bg-chat-active)] text-[var(--text-nav-active)] scale-[1.01]' 
                        : 'hover:bg-[var(--bg-chat-hover)] text-[var(--text-primary)]'
                    }`}
                  >
                    {/* Icon Column */}
                    <div className="shrink-0 mt-0.5">
                      {res.matchType === 'title' ? (
                        <MessageSquare className="w-4 h-4 text-blue-400" />
                      ) : res.msgRole === 'ai' ? (
                        <Bot className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <User className="w-4 h-4 text-purple-400" />
                      )}
                    </div>

                    {/* Content Column */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold truncate">
                          {res.matchType === 'title' 
                            ? highlightText(res.chatTitle, query) 
                            : res.chatTitle
                          }
                        </span>
                        {res.isArchived && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase bg-[var(--accent-bg)] text-[var(--accent-text)] border border-[var(--accent-border)] tracking-widest">
                            <Archive className="w-2 h-2" /> Arquivada
                          </span>
                        )}
                      </div>

                      {res.matchType === 'message' && res.msgText && (
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1 line-clamp-2 leading-relaxed">
                          {highlightText(getSnippet(res.msgText, query), query)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="px-5 py-2.5 border-t border-[var(--border-light)] bg-[var(--bg-sidebar)]/20 text-[9px] text-[var(--text-placeholder)] flex justify-between font-medium">
          <span>Use ↑ ↓ para navegar e Enter para abrir</span>
          <span>Esc para fechar</span>
        </div>
      </div>
    </div>
  );
};

export default GlobalSearchModal;
