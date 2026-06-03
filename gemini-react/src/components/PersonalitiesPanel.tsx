import React, { useState } from 'react';
import { User, Plus, Trash2, Edit2, Save, ArrowLeft } from 'lucide-react';
import { type Personality } from '../types';

interface PersonalitiesPanelProps {
  personalities: Personality[];
  onSave: (personality: Personality) => void;
  onDelete: (id: string) => void;
}

const PersonalitiesPanel: React.FC<PersonalitiesPanelProps> = ({ 
  personalities, 
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
    <div className="space-y-6">
      {/* Sub-Header / Back Button */}
      <div className="flex items-center gap-3 bg-[var(--bg-main)]/30 p-4 rounded-2xl border border-[var(--border-light)] justify-between">
        <div className="flex items-center gap-3">
          {isEditing && (
            <button 
              onClick={() => setIsEditing(false)} 
              className="p-2 hover:bg-[var(--bg-chat-hover)] rounded-xl transition mr-1"
              type="button"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--accent-text)]" />
            </button>
          )}
          <div>
            <h4 className="text-sm font-bold text-[var(--text-primary)]">
              {isEditing ? (currentPersonality ? 'Editar Personalidade' : 'Nova Personalidade') : 'Gerenciamento de Perfis'}
            </h4>
            <p className="text-[10px] text-[var(--text-placeholder)] mt-0.5">
              {isEditing ? 'Ajuste as diretrizes de instrução para este perfil' : 'Defina regras customizadas para o comportamento da IA'}
            </p>
          </div>
        </div>
        {!isEditing && (
          <button 
            onClick={handleAddNew}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl text-xs font-bold transition shadow-lg shadow-[var(--accent-glow)]"
          >
            <Plus className="w-4 h-4" /> Novo Perfil
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="min-h-0 flex-1">
        {isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300 bg-[var(--bg-main)]/20 border border-[var(--border-light)] p-6 rounded-2xl">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-placeholder)]">Nome da Personalidade</label>
              <input 
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Especialista em TypeScript"
                className="w-full bg-[var(--bg-sidebar)] border border-[var(--border-light)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-border)] transition"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-placeholder)]">Instrução do Sistema (Prompt)</label>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex: Você é um programador experiente que preza pela simplicidade e clareza no código..."
                className="w-full bg-[var(--bg-sidebar)] border border-[var(--border-light)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent-border)] transition h-48 resize-none text-sm leading-relaxed text-[var(--text-primary)]"
                required
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold py-3.5 rounded-xl transition shadow-lg flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" /> Salvar Personalidade
            </button>
          </form>
        ) : (
          <div className="space-y-3 animate-in fade-in duration-300">
            {personalities.length === 0 ? (
              <div className="text-center py-16 bg-[var(--bg-main)]/10 rounded-2xl border border-dashed border-[var(--border-light)]">
                <div className="w-16 h-16 bg-[var(--bg-chat-hover)] rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="w-8 h-8 opacity-20" />
                </div>
                <p className="opacity-40 italic text-sm text-[var(--text-secondary)]">Nenhuma personalidade personalizada criada ainda.</p>
              </div>
            ) : (
              personalities.map((p) => (
                <div key={p.id} className="group flex items-center gap-4 p-4 bg-[var(--bg-main)]/35 rounded-2xl border border-[var(--border-light)] hover:border-[var(--accent-border)] hover:bg-[var(--bg-chat-active)] transition duration-200">
                  <div className="w-10 h-10 rounded-xl bg-[var(--accent-bg)] flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-[var(--accent-text)] opacity-60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[var(--text-primary)] text-sm">{p.name}</h4>
                    <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{p.prompt}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition duration-200">
                    <button 
                      onClick={() => handleEdit(p)}
                      className="p-2 hover:bg-[var(--accent-bg-strong)] rounded-lg text-[var(--accent-text)] transition"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => onDelete(p.id)}
                      className="p-2 hover:bg-red-500/20 rounded-lg text-red-400 transition"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PersonalitiesPanel;
