import React from 'react';
import { Loader2 } from 'lucide-react';
import { type Message } from '../services/gemini';
import MessageItem from './MessageItem';

interface MessageListProps {
  messages: Message[];
  visibleMessagesCount: number;
  isLoading: boolean;
  editingMsgId: string | null;
  editingMsgText: string;
  copiedId: string | null;
  expandedSourcesMsgId: string | null;
  imagenModel: string;
  chatWindowRef: React.RefObject<HTMLElement>;
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
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  visibleMessagesCount,
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
  onToggleSources
}) => {
  const visibleMessages = messages.slice(-visibleMessagesCount);

  return (
    <section 
      ref={chatWindowRef} 
      onScroll={onScroll}
      className="flex-1 overflow-y-auto py-6 space-y-6 custom-scrollbar"
      style={{ 
        paddingLeft: `calc(${margin}% + 1rem)`, 
        paddingRight: `calc(${margin}% + 1rem)` 
      }}
    >
      {messages.length === 0 && !isLoading ? (
        <div className="h-full flex flex-col justify-center items-center text-center mt-20">
          <h2 className="text-5xl font-medium mb-6 gemini-gradient">Olá, Conselheiro</h2>
          <p className="text-[var(--text-placeholder)] text-xl font-light">Como posso ajudar você hoje?</p>
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
              />
            );
          })}
        </>
      )}
    </section>
  );
};

export default MessageList;
