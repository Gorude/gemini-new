import React, { useState, useRef, useEffect } from 'react';
import { type Message } from '../services/gemini';
import { User, Bot } from 'lucide-react';

interface MessageTimelineProps {
  messages: Message[];
  onJumpToMessage: (id: string) => void;
  activeId: string | null;
}

const MessageTimeline: React.FC<MessageTimelineProps> = ({ messages, onJumpToMessage, activeId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para manter o item ativo visível
  useEffect(() => {
    if (activeId && scrollContainerRef.current) {
      const activeEl = scrollContainerRef.current.querySelector(`[data-msg-id="${activeId}"]`) as HTMLElement;
      if (activeEl) {
        const container = scrollContainerRef.current;
        const targetScroll = activeEl.offsetTop - (container.clientHeight / 2) + (activeEl.clientHeight / 2);
        container.scrollTo({ top: targetScroll, behavior: 'smooth' });
      }
    }
  }, [activeId]);

  // Filtrar apenas mensagens com conteúdo
  const validMessages = messages.filter(m => m.text.trim().length > 0);

  const getPreviewText = (text: string, length: number) => {
    // Remover marcações markdown para o preview
    const clean = text.replace(/[#*`_~]/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').trim();
    return clean.length > length ? clean.substring(0, length) + '...' : clean;
  };

  const handleItemHover = (id: string) => {
    setHoveredId(id);
  };

  if (validMessages.length < 2) return null;

  return (
    <div 
      ref={containerRef}
      className="fixed right-2 top-1/2 -translate-y-1/2 z-[100] hidden lg:flex items-center"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => {
        setIsExpanded(false);
        setHoveredId(null);
      }}
    >
      {/* Nível 2: Popup Flutuante */}
      {hoveredId && (
        <div 
          className="absolute right-[calc(100%+16px)] w-64 p-4 bg-[rgba(30,31,32,0.8)] backdrop-blur-xl border border-[rgba(255,255,255,0.1)] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-right-4 duration-200 pointer-events-none"
          style={{ top: '50%', transform: 'translateY(-50%)' }}
        >
          <div className="text-xs text-[var(--text-primary)] leading-relaxed">
            {getPreviewText(validMessages.find(m => m.id === hoveredId)?.text || '', 250)}
          </div>
          <div className="mt-3 flex items-center gap-2 pt-2 border-t border-white/5">
             {validMessages.find(m => m.id === hoveredId)?.role === 'user' ? (
                <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest text-indigo-400">
                  <User size={10} /> Seu Prompt
                </div>
             ) : (
                <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest text-blue-400">
                  <Bot size={10} /> Resposta Gemoro
                </div>
             )}
          </div>
        </div>
      )}

      {/* Container Principal (Ticks + Sidebar) */}
      <div 
        className={`flex items-center transition-all duration-500 ease-out h-[50vh] max-h-[500px] py-2 rounded-2xl ${
          isExpanded 
            ? 'w-60 bg-[rgba(19,19,20,0.6)] backdrop-blur-xl px-2 pr-4 shadow-2xl' 
            : 'w-6 px-0'
        }`}
      >
        <div 
          ref={scrollContainerRef}
          className={`w-full flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden h-full py-2 ${isExpanded ? 'custom-scrollbar' : 'scrollbar-hidden'}`}
        >
          {validMessages.map((msg) => (
            <div 
              key={msg.id}
              data-msg-id={msg.id}
              className={`group flex items-center justify-end cursor-pointer transition-all duration-500 ease-out py-1 rounded-lg shrink-0 ${
                isExpanded ? 'gap-3' : 'gap-0'
              } ${hoveredId === msg.id || activeId === msg.id ? 'bg-white/5' : ''}`}
              onMouseEnter={() => handleItemHover(msg.id)}
              onClick={() => onJumpToMessage(msg.id)}
            >
              {/* Texto do Nível 1 */}
              <span className={`text-[10px] font-medium truncate transition-all duration-500 ease-out whitespace-nowrap overflow-hidden ${activeId === msg.id ? 'text-white' : 'text-[var(--text-secondary)]'} ${
                isExpanded 
                  ? 'max-w-[170px] opacity-100 translate-x-0 pointer-events-auto' 
                  : 'max-w-0 opacity-0 translate-x-2 pointer-events-none'
              }`}>
                {getPreviewText(msg.text, 40)}
              </span>

              {/* O Tick (Barra) */}
              <div 
                className={`transition-all duration-300 rounded-full ${activeId === msg.id ? 'h-[4px] opacity-100' : 'h-[3px] opacity-40 group-hover:opacity-100'} ${isExpanded ? 'w-10 group-hover:w-16' : (activeId === msg.id ? 'w-6' : 'w-4 group-hover:w-6')} ${msg.role === 'user' 
                  ? (activeId === msg.id ? 'bg-indigo-400 shadow-[0_0_15px_rgba(129,140,248,0.8)]' : 'bg-indigo-500/80 group-hover:bg-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.2)]') 
                  : (activeId === msg.id ? 'bg-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.8)]' : 'bg-blue-500/80 group-hover:bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]')
                }`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MessageTimeline;
