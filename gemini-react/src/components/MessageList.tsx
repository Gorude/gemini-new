import React, { useRef, useLayoutEffect } from 'react';
import { Loader2, Zap, ExternalLink, Key } from 'lucide-react';
import { type Message } from '../services/gemini';
import MessageItem from './MessageItem';

interface MessageListProps {
  messages: Message[];
  visibleMessagesCount: number;
  isInitialLoading: boolean;
  isLoading: boolean;
  editingMsgId: string | null;
  editingMsgText: string;
  copiedId: string | null;
  expandedSourcesMsgId: string | null;
  activeChatId?: string | null;
  imagenModel: string;
  chatWindowRef: React.RefObject<HTMLElement | null>;
  margin: number;
  onScroll: () => void;
  // Handlers for MessageItem
  onEditPrompt: (id: string, text: string) => void;
  onSaveEdit: (id: string) => void;
  onSetEditingMsgText: (text: string) => void;
  onCancelEdit: () => void;
  onRegenerate: (id: string) => void;
  onDelete: (id: string) => void;
  onCopy: (text: string, id: string) => void;
  onToggleSources: (id: string | null) => void;
  onFactCheck: (id: string) => void;
  onCancelFactCheck?: (id: string) => void;
  onSelectionChange?: (text: string, pos: { x: number, y: number }, messageId: string) => void;
  onResolveMemoryUpdate?: (messageId: string, updateId: string, action: 'accepted' | 'ignored') => void;
  hasFreeApiKey: boolean;
  onOpenSettings: (tab: 'geral' | 'modelos' | 'api' | 'personalidades' | 'dna') => void;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  visibleMessagesCount,
  isInitialLoading,
  isLoading,
  editingMsgId,
  editingMsgText,
  copiedId,
  expandedSourcesMsgId,
  imagenModel,
  chatWindowRef,
  margin,
  onScroll,
  onEditPrompt,
  onSaveEdit,
  onSetEditingMsgText,
  onCancelEdit,
  onRegenerate,
  onDelete,
  onCopy,
  onToggleSources,
  activeChatId,
  onFactCheck,
  onCancelFactCheck,
  onSelectionChange,
  onResolveMemoryUpdate,
  hasFreeApiKey,
  onOpenSettings
}) => {
  const visibleMessages = messages.slice(-visibleMessagesCount);
  const bottomRef = useRef<HTMLDivElement>(null);

  const getGeneratingMessageId = () => {
    if (!isLoading) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'ai') {
        return messages[i].id;
      }
    }
    return null;
  };
  const generatingMessageId = getGeneratingMessageId();

  useLayoutEffect(() => {
    // Forçar o scroll para o fundo imediatamente quando as mensagens, o chat ou o estado de carregamento mudarem
    if (chatWindowRef.current && !isInitialLoading) {
      chatWindowRef.current.scrollTop = 999999 + chatWindowRef.current.scrollHeight;
    }
  }, [messages.length, activeChatId, isInitialLoading, isLoading]);

  // Enquanto estiver carregando o histórico inicial, não mostramos nada (ou um loader)
  if (isInitialLoading) {
    return (
      <section 
        ref={chatWindowRef} 
        className="flex-1 flex items-center justify-center chat-container-responsive"
        style={{ paddingLeft: `calc(${margin}% + 1rem)`, paddingRight: `calc(${margin}% + 1rem)` }}
      >
        <div className="flex flex-col items-center gap-4 opacity-20">
          <div className="w-12 h-12 rounded-full border-4 border-t-white border-white/10 animate-spin"></div>
          <span className="text-xs font-bold uppercase tracking-widest text-white">Carregando histórico...</span>
        </div>
      </section>
    );
  }

  return (
    <section 
      ref={chatWindowRef} 
      onScroll={onScroll}
      className="flex-1 overflow-y-auto py-6 space-y-6 custom-scrollbar chat-container-responsive"
      style={{ 
        paddingLeft: `calc(${margin}% + 1rem)`, 
        paddingRight: `calc(${margin}% + 1rem)` 
      }}
    >
      {messages.length === 0 && !isLoading ? (
        !hasFreeApiKey ? (
          <div className="max-w-2xl mx-auto bg-white/5 backdrop-blur-md border border-white/10 rounded-[32px] p-8 md:p-10 shadow-2xl text-left space-y-6 my-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-4 border-b border-white/10 pb-5">
              <div className="p-3 bg-[var(--accent)] rounded-2xl text-white shadow-lg shadow-[var(--accent-glow)]">
                <Zap size={28} className="animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
                  Configure sua Chave de API Grátis
                </h1>
                <p className="text-xs text-[var(--text-secondary)] mt-1 uppercase tracking-wider font-semibold">
                  Google AI Studio &amp; Gemini
                </p>
              </div>
            </div>

            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Para começar a conversar com o <strong>Nemon</strong> e utilizar todos os recursos inteligentes (incluindo o modo LIVE por voz), você precisa de uma chave de API gratuita do Google AI Studio. Siga o tutorial rápido abaixo para obter a sua:
            </p>

            <div className="space-y-4">
              {/* Passo 1 */}
              <div className="flex gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent-bg)] border border-[var(--accent-border)] flex items-center justify-center font-bold text-sm text-[var(--accent-text)]">
                  1
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">Acesse o Google AI Studio</h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Entre no site oficial do <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-text)] hover:underline font-bold inline-flex items-center gap-1">Google AI Studio <ExternalLink size={12} /></a> e faça login usando qualquer conta Google gratuita.
                  </p>
                </div>
              </div>

              {/* Passo 2 */}
              <div className="flex gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent-bg)] border border-[var(--accent-border)] flex items-center justify-center font-bold text-sm text-[var(--accent-text)]">
                  2
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">Obtenha sua Chave de API</h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    No painel do Google AI Studio, clique no botão azul <strong>"Get API Key"</strong> no canto superior esquerdo da tela.
                  </p>
                </div>
              </div>

              {/* Passo 3 */}
              <div className="flex gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent-bg)] border border-[var(--accent-border)] flex items-center justify-center font-bold text-sm text-[var(--accent-text)]">
                  3
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">Gere e Copie o Token</h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Selecione ou crie um projeto e clique em <strong>"Create API Key"</strong>. Uma vez gerada a chave, copie o código completo (ele começa com <code>AIzaSy...</code>).
                  </p>
                </div>
              </div>

              {/* Passo 4 */}
              <div className="flex gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent-bg)] border border-[var(--accent-border)] flex items-center justify-center font-bold text-sm text-[var(--accent-text)]">
                  4
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">Cole no Nemon e Salve</h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Clique no botão abaixo para abrir as configurações na aba de API, cole sua chave no campo <strong>"Chave de API Padrão (AI Studio)"</strong> e clique em <strong>"SALVAR"</strong>.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-center">
              <button
                onClick={() => onOpenSettings('api')}
                className="px-6 py-3 font-bold text-xs text-white uppercase tracking-widest rounded-2xl transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-2 shadow-lg"
                style={{ background: 'linear-gradient(to right, var(--accent), var(--accent-hover))', boxShadow: '0 10px 20px -5px var(--accent-glow)' }}
              >
                <Key size={14} /> Configurar Chave de API
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center animate-in fade-in duration-500">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-[#0052d4] via-[#4364f7] to-[#6fb1fc]">
              Olá, Conselheiro
            </h1>
            <p className="text-lg text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed opacity-80">
              Como posso ajudar você a construir algo incrível hoje?
            </p>
          </div>
        )
      ) : (
        <>
          {visibleMessagesCount < messages.length && (
            <div className="flex justify-center py-4 opacity-50 mb-4 transition-opacity">
              <Loader2 className="w-5 h-5 text-[var(--text-secondary)] animate-spin" />
            </div>
          )}
          {visibleMessages.map((msg) => {
            const originalIdx = messages.findIndex(m => m.id === msg.id);
            const generatingIdx = messages.findIndex(m => m.role === 'ai' && !m.text && isLoading);
            const isContext = generatingIdx === -1 ? true : originalIdx < generatingIdx;

            const isGenerating = msg.id === generatingMessageId;

            return (
              <MessageItem 
                key={msg.id}
                msg={msg}
                isLoading={isLoading}
                isGenerating={isGenerating}
                editingMsgId={editingMsgId}
                editingMsgText={editingMsgText}
                copiedId={copiedId}
                expandedSourcesMsgId={expandedSourcesMsgId}
                imagenModel={imagenModel}
                isContext={isContext}
                onEditPrompt={onEditPrompt}
                onSaveEdit={onSaveEdit}
                onSetEditingMsgText={onSetEditingMsgText}
                onCancelEdit={onCancelEdit}
                onRegenerate={onRegenerate}
                onDelete={onDelete}
                onCopy={onCopy}
                onToggleSources={onToggleSources}
                onFactCheck={onFactCheck}
                onCancelFactCheck={onCancelFactCheck}
                onSelectionChange={onSelectionChange}
                onResolveMemoryUpdate={onResolveMemoryUpdate}
              />
            );
          })}
          <div ref={bottomRef} style={{ height: '1px', marginTop: '-1px', overflowAnchor: 'auto' }} />
        </>
      )}
    </section>
  );
};

export default MessageList;
