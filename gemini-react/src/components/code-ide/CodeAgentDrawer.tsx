import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Square,
  Bot,
  User,
  Sparkles,
  ChevronDown,
  Trash2,
  FileCode,
  FileEdit,
  FilePlus,
  ListFilter,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronRight,
  Maximize2,
  Minimize2,
  X
} from 'lucide-react';
import type { AgentChatMessage, HarnessAction } from '../../types/codeIde';
import { MODEL_OPTIONS, type CustomModel } from '../../constants';

interface CodeAgentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: AgentChatMessage[];
  onSendMessage: (prompt: string) => void;
  isLoading: boolean;
  onStop: () => void;
  onClearHistory: () => void;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  customModels: CustomModel[];
  activeFile: string;
  width?: number;
  isDragging?: boolean;
}

export const CodeAgentDrawer: React.FC<CodeAgentDrawerProps> = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  isLoading,
  onStop,
  onClearHistory,
  selectedModel,
  onSelectModel,
  customModels,
  activeFile,
  width = 380,
  isDragging = false,
}) => {
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const currentModelName =
    MODEL_OPTIONS.find(m => m.id === selectedModel)?.name ||
    customModels.find(m => m.id === selectedModel)?.name ||
    selectedModel;

  const renderActionIcon = (action: HarnessAction) => {
    switch (action.type) {
      case 'read_file':
        return <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
      case 'write_file':
        return <FilePlus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'edit_file':
        return <FileEdit className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case 'list_files':
        return <ListFilter className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
      default:
        return <Bot className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
    }
  };

  const renderActionStatus = (action: HarnessAction) => {
    if (action.status === 'pending') {
      return <Clock className="w-3 h-3 text-amber-400 animate-spin shrink-0" />;
    }
    if (action.status === 'error') {
      return <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />;
    }
    return <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />;
  };

  if (!isOpen) return null;

  return (
    <aside
      style={{ width: isExpanded ? 580 : width }}
      className={`h-full border-l border-white/10 bg-[#0d1117] flex flex-col z-30 shadow-2xl relative shrink-0 ${
        isDragging ? '' : 'transition-[width] duration-150'
      }`}
    >
      {/* Header do Drawer */}
      <div className="h-12 px-3 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#161b22]/70 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-[#FF5500] to-amber-500 flex items-center justify-center text-white shadow-sm">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-xs tracking-wide text-zinc-200">
            Harness Agent
          </span>
          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
            PI CLI
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Largura padrão' : 'Expandir drawer'}
            className="p-1.5 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-200 transition"
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClearHistory}
            title="Limpar histórico do chat"
            className="p-1.5 rounded-md hover:bg-white/5 text-zinc-400 hover:text-red-400 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            title="Fechar chat"
            className="p-1.5 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Seletor de Modelo */}
      <div className="px-3 py-2 border-b border-white/5 bg-[#12161f] flex items-center justify-between text-xs relative" ref={dropdownRef}>
        <span className="text-[11px] text-zinc-400 font-medium">Modelo do Agente:</span>
        <button
          onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-medium border border-white/10 transition"
        >
          <span className="truncate max-w-[180px]">{currentModelName}</span>
          <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {isModelDropdownOpen && (
          <div className="absolute top-full right-3 mt-1 bg-[#1c2128] border border-white/15 rounded-xl shadow-2xl py-1.5 z-50 min-w-[220px] max-h-60 overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
              Modelos Recomendados
            </div>
            {MODEL_OPTIONS.filter(m => !m.id.includes('imagen')).map(m => (
              <button
                key={m.id}
                onClick={() => {
                  onSelectModel(m.id);
                  setIsModelDropdownOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs transition flex items-center justify-between ${
                  selectedModel === m.id ? 'bg-[#ff5500]/15 text-[#ff5500] font-bold' : 'text-zinc-300 hover:bg-white/5'
                }`}
              >
                <span>{m.name}</span>
                {selectedModel === m.id && <span className="w-1.5 h-1.5 rounded-full bg-[#ff5500]"></span>}
              </button>
            ))}

            {customModels.length > 0 && (
              <>
                <div className="h-px bg-white/10 my-1"></div>
                <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                  Modelos Customizados
                </div>
                {customModels.map(m => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onSelectModel(m.id);
                      setIsModelDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition flex items-center justify-between ${
                      selectedModel === m.id ? 'bg-[#ff5500]/15 text-[#ff5500] font-bold' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="truncate">{m.name}</span>
                    {selectedModel === m.id && <span className="w-1.5 h-1.5 rounded-full bg-[#ff5500]"></span>}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Área de Mensagens */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs font-sans">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-400 space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-[#ff5500]">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-zinc-200 text-xs">Harness de Código</h4>
              <p className="text-[11px] text-zinc-500 mt-1 max-w-[220px] leading-relaxed">
                Instrua o agente a inspecionar, criar ou refatorar arquivos no projeto.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col gap-1.5 ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                {msg.role === 'user' ? (
                  <>
                    <span>Você</span>
                    <User className="w-3 h-3 text-zinc-400" />
                  </>
                ) : (
                  <>
                    <Bot className="w-3 h-3 text-[#ff5500]" />
                    <span>Nemon Harness</span>
                  </>
                )}
              </div>

              {/* Balão de conteúdo */}
              <div
                className={`p-3 rounded-2xl max-w-[92%] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#ff5500]/15 border border-[#ff5500]/30 text-zinc-100 rounded-tr-xs'
                    : 'bg-[#161b22] border border-white/10 text-zinc-200 rounded-tl-xs shadow-md'
                }`}
              >
                {/* Raciocínio (thoughts) */}
                {msg.thoughts && (
                  <details className="mb-2 bg-black/20 border border-white/5 rounded-lg overflow-hidden text-[11px]">
                    <summary className="px-2.5 py-1.5 cursor-pointer font-medium text-amber-400 flex items-center gap-1.5 hover:bg-white/5 select-none">
                      <ChevronRight className="w-3 h-3 transition-transform details-open:rotate-90" />
                      <span>Processo de Raciocínio</span>
                    </summary>
                    <div className="p-2.5 text-zinc-400 whitespace-pre-wrap font-mono text-[10px] border-t border-white/5 max-h-40 overflow-y-auto">
                      {msg.thoughts}
                    </div>
                  </details>
                )}

                {/* Ações do Harness */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="space-y-1.5 my-2">
                    <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider flex items-center gap-1">
                      <span>Execução de Ferramentas:</span>
                    </div>
                    {msg.actions.map(action => (
                      <div
                        key={action.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/5 font-mono text-[11px]"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {renderActionIcon(action)}
                          <span className="font-semibold text-zinc-300">
                            {action.type.replace('_', ' ')}
                          </span>
                          {action.path && (
                            <span className="text-zinc-400 truncate max-w-[140px]">
                              {action.path}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {renderActionStatus(action)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="whitespace-pre-wrap text-[12px]">{msg.content}</div>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-zinc-400 text-xs py-2">
            <Sparkles className="w-3.5 h-3.5 text-[#ff5500] animate-spin" />
            <span>Agente inspecionando e aplicando alterações...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input de Prompt */}
      <div className="p-3 border-t border-white/10 bg-[#161b22]/50">
        <form onSubmit={handleSend} className="relative flex flex-col gap-2">
          <div className="flex items-center justify-between text-[10px] text-zinc-400 px-1">
            <span>Arquivo focado: <strong className="text-zinc-200">{activeFile}</strong></span>
            <span>Enter para enviar</span>
          </div>

          <div className="relative flex items-center">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Instrua o agente a alterar ou criar código..."
              rows={2}
              className="w-full resize-none rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-hidden focus:border-[#ff5500] pr-10 leading-relaxed font-sans"
            />
            <div className="absolute right-2 bottom-2.5">
              {isLoading ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="p-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white transition shadow-sm"
                  title="Parar execução"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="p-1.5 rounded-lg bg-[#ff5500] hover:bg-[#ff6a1a] text-white disabled:opacity-30 disabled:cursor-not-allowed transition shadow-sm"
                  title="Enviar instrução"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </aside>
  );
};
