import React, { useRef, useLayoutEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { type Message } from '../services/gemini';
import MessageItem from './MessageItem';
import NemonIcon from './NemonIcon';

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
  onSelectionChange
}) => {
  const visibleMessages = messages.slice(-visibleMessagesCount);
  const bottomRef = useRef<HTMLDivElement>(null);

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
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
          <div className="w-16 h-16 mb-8 relative">
            <div className="nemon-spinner absolute inset-0 opacity-40" />
            <NemonIcon size={64} className="relative z-10" />
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-[#0052d4] via-[#4364f7] to-[#6fb1fc]">
            Olá, Conselheiro
          </h1>
          <p className="text-lg text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed opacity-80">
            Como posso ajudar você a construir algo incrível hoje?
          </p>
        </div>
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

            return (
              <MessageItem 
                key={msg.id}
                msg={msg}
                isLoading={isLoading}
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
