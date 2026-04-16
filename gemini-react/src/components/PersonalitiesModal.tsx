import React, { useState } from 'react';
import { X, User, Plus, Trash2, Edit2, Save, ArrowLeft } from 'lucide-react';
import { type Personality } from '../types';

interface PersonalitiesModalProps {
  personalities: Personality[];
  onClose: () => void;
  onSave: (personality: Personality) => void;
  onDelete: (id: string) => void;
}

const PersonalitiesModal: React.FC<PersonalitiesModalProps> = ({ 
  personalities, 
  onClose, 
  onSave, 
  onDelete 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentPersonality, setCurrentPersonality] = useState<Personality | null>(null);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');

  const handleAddNew = () => {
    setCurrentPersonality(null);
    setName('');
    setPrompt('');
    setIsEditing(true);
  };

  const handleEdit = (p: Personality) => {
    setCurrentPersonality(p);
    setName(p.name);
    setPrompt(p.prompt);
    setIsEditing(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      id: currentPersonality?.id || Date.now().toString(),
      name: name.trim(),
      prompt: prompt.trim()
    });
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110] p-0 md:p-4 backdrop-blur-sm">
      <div className="bg-[var(--bg-sidebar)] w-full max-w-2xl h-screen md:h-auto md:max-h-[85vh] rounded-none md:rounded-3xl border-none md:border border-[var(--border-light)] overflow-hidden shadow-2xl flex flex-col">
        
        {/* Header */}
        <div className="p-6 border-b border-[var(--border-light)] flex justify-between items-center bg-blue-600/5">
          <div className="flex items-center gap-3">
            {isEditing ? (
              <button 
                onClick={() => setIsEditing(false)} 
                className="p-2 hover:bg-[var(--bg-chat-hover)] rounded-xl transition mr-1"
              >
                <ArrowLeft className="w-5 h-5 text-blue-400" />
              </button>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg">
                <User className="w-6 h-6" />
              </div>
            )}
            <div>
              <h3 className="text-xl font-bold">
                {isEditing ? (currentPersonality ? 'Editar Personalidade' : 'Nova Personalidade') : 'Personalidades'}
              </h3>
              {!isEditing && <p className="text-xs text-[var(--text-placeholder)] mt-0.5">Defina como a IA deve se comportar</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition"><X className="w-5 h-5" /></button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {isEditing ? (
            <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-[var(--text-placeholder)]">Nome da Personalidade</label>
                <input 
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Desenvolvedor Sênior"
                  className="w-full bg-[var(--bg-chat-hover)] border border-[var(--border-light)] rounded-xl px-4 py-3 outline-none focus:border-blue-500/50 transition"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-[var(--text-placeholder)]">Instrução do Sistema (Prompt)</label>
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ex: Você é um programador experiente que preza pela simplicidade e clareza no código..."
                  className="w-full bg-[var(--bg-chat-hover)] border border-[var(--border-light)] rounded-xl px-4 py-3 outline-none focus:border-blue-500/50 transition h-48 resize-none text-sm leading-relaxed"
                  required
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition shadow-lg flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" /> Salvar Personalidade
              </button>
            </form>
          ) : (
            <div className="space-y-3 animate-in fade-in duration-300">
              {personalities.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-[var(--bg-chat-hover)] rounded-full flex items-center justify-center mx-auto mb-4">
                    <User className="w-8 h-8 opacity-20" />
                  </div>
                  <p className="opacity-40 italic text-sm">Você ainda não criou personalidades personalizadas.</p>
                </div>
              ) : (
                personalities.map((p) => (
                  <div key={p.id} className="group flex items-center gap-4 p-4 bg-[var(--bg-chat-hover)] rounded-2xl border border-transparent hover:border-blue-500/30 hover:bg-[var(--bg-chat-active)] transition">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-blue-400 opacity-60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-[var(--text-primary)]">{p.name}</h4>
                      <p className="text-xs text-[var(--text-placeholder)] truncate mt-0.5">{p.prompt}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button 
                        onClick={() => handleEdit(p)}
                        className="p-2 hover:bg-blue-500/20 rounded-lg text-blue-400 transition"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => onDelete(p.id)}
                        className="p-2 hover:bg-red-500/20 rounded-lg text-red-400 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
              
              <button 
                onClick={handleAddNew}
                className="w-full mt-4 flex items-center justify-center gap-2 py-4 border-2 border-dashed border-[var(--border-light)] rounded-2xl text-[var(--text-placeholder)] hover:text-white hover:border-blue-500 transition-all font-medium"
              >
                <Plus className="w-5 h-5" /> Adicionar Nova Personalidade
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PersonalitiesModal;
