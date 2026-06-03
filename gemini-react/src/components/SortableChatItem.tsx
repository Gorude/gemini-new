import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pin, Edit2, Archive, Trash2, MoreVertical, GripVertical } from 'lucide-react';
import { type ChatSession } from '../types';

interface SortableChatItemProps {
  chat: ChatSession;
  activeChatId: string;
  editingChatId: string | null;
  editTitle: string;
  menuOpenId: string | null;
  isLocked: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onEditTitleChange: (val: string) => void;
  onRenameConfirm: (id: string) => void;
  onToggleMenu: (id: string) => void;
  onTogglePin: (e: React.MouseEvent, id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onSetEditingId: (id: string, title: string) => void;
}

const SortableChatItem: React.FC<SortableChatItemProps> = ({
  chat,
  activeChatId,
  editingChatId,
  editTitle,
  menuOpenId,
  isLocked,
  onSelect,
  onEditTitleChange,
  onRenameConfirm,
  onToggleMenu,
  onTogglePin,
  onArchive,
  onDelete,
  onSetEditingId
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ 
    id: chat.id,
    disabled: isLocked 
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`relative group ${isDragging ? 'cursor-grabbing' : ''}`}
    >
      <div 
        onClick={() => onSelect(chat.id)} 
        className={`group/item flex items-center gap-2 py-1.5 px-3 mx-1 rounded-full cursor-pointer transition relative ${activeChatId === chat.id ? 'bg-[var(--bg-chat-active)] text-[var(--text-nav-active)]' : 'hover:bg-white/5 text-[var(--text-primary)]'}`}
      >
        {!isLocked && (
          <div 
            {...attributes} 
            {...listeners}
            className="p-1 opacity-0 group-hover/item:opacity-40 hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity shrink-0 flex items-center justify-center touch-none"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
        )}

        {editingChatId === chat.id ? (
          <input 
            autoFocus 
            className="bg-transparent border-none outline-none text-white w-full text-[14px]" 
            value={editTitle} 
            onChange={(e) => onEditTitleChange(e.target.value)} 
            onBlur={() => onRenameConfirm(chat.id)} 
            onKeyDown={(e) => e.key === 'Enter' && onRenameConfirm(chat.id)} 
          />
        ) : (
          <span className="truncate text-[14px] flex-1 font-normal">{chat.title}</span>
        )}

        {chat.pinned && <Pin className="w-3.5 h-3.5 opacity-60 ml-1" />}
        
        <button 
          onClick={(e) => { e.stopPropagation(); onToggleMenu(chat.id); }}
          onMouseDown={(e) => e.stopPropagation()}
          className={`p-1 hover:bg-white/10 rounded-full transition shrink-0 ${activeChatId === chat.id || menuOpenId === chat.id ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'}`}
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      {menuOpenId === chat.id && (
        <div 
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-4 top-full mt-1 bg-[#1e1f20] border border-[var(--border-light)] rounded-xl py-2 w-48 shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-200"
        >
          <button 
            onClick={(e) => { e.stopPropagation(); onSetEditingId(chat.id, chat.title); onToggleMenu(''); }} 
            className="w-full text-left px-4 py-2 hover:bg-white/5 transition text-sm flex items-center gap-2"
          >
            <Edit2 className="w-4 h-4 opacity-60" /> Renomear
          </button>
          <button 
            onClick={(e) => { onTogglePin(e, chat.id); onToggleMenu(''); }} 
            className="w-full text-left px-4 py-2 hover:bg-white/5 transition text-sm flex items-center gap-2"
          >
            <Pin className="w-4 h-4 opacity-60" /> {chat.pinned ? 'Desafixar' : 'Fixar'}
          </button>
          <button 
            onClick={() => { onArchive(chat.id); onToggleMenu(''); }} 
            className="w-full text-left px-4 py-2 hover:bg-white/5 transition text-sm flex items-center gap-2"
          >
            <Archive className="w-4 h-4 opacity-60" /> Arquivar
          </button>
          <button 
            onClick={(e) => { onDelete(e, chat.id); onToggleMenu(''); }} 
            className="w-full text-left px-4 py-2 hover:bg-white/5 transition text-sm flex items-center gap-2 text-red-400"
          >
            <Trash2 className="w-4 h-4" /> Excluir
          </button>
        </div>
      )}
    </div>
  );
};

export default SortableChatItem;
