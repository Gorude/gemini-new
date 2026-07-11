import React, { useState } from 'react';
import { User, Plus, Trash2, Edit2, Save, ArrowLeft, Volume2 } from 'lucide-react';
import { type Personality } from '../types';
import { LIVE_VOICES } from '../constants';

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
  // Voz padrão do modo LIVE desta personalidade ('' = manter a voz atual).
  const [voice, setVoice] = useState('');

  const handleAddNew = () => {
    setCurrentPersonality(null);
    setName('');
    setPrompt('');
    setVoice('');
    setIsEditing(true);
  };

  const handleEdit = (p: Personality) => {
    setCurrentPersonality(p);
    setName(p.name);
    setPrompt(p.prompt);
    setVoice(p.voice || '');
    setIsEditing(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      id: currentPersonality?.id || Date.now().toString(),
      name: name.trim(),
      prompt: prompt.trim(),
      voice: voice || undefined
    });
    setIsEditing(false);
  };

  return (
    <div className="space-y-6 min-w-0">
      {/* Sub-Header / Back Button */}
      <div className="flex items-center gap-3 bg-(--bg-main)/30 p-3 rounded-2xl border border-(--border-light) justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {isEditing && (
            <button
              onClick={() => setIsEditing(false)}
              className="p-2 hover:bg-(--bg-chat-hover) rounded-xl transition mr-1 shrink-0"
              type="button"
            >
              <ArrowLeft className="w-5 h-5 text-(--accent-text)" />
            </button>
          )}
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-(--text-primary) truncate">
              {isEditing ? (currentPersonality ? 'Editar Personalidade' : 'Nova Personalidade') : 'Gerenciamento de Perfis'}
            </h4>
            <p className="text-[10px] text-(--text-placeholder) mt-0.5 truncate">
              {isEditing ? 'Ajuste as diretrizes de instrução para este perfil' : 'Defina regras customizadas para o comportamento da IA'}
            </p>
          </div>
        </div>
        {!isEditing && (
          <button
            onClick={handleAddNew}
            className="flex items-center gap-2 px-3 py-2 bg-(--accent) hover:bg-(--accent-hover) text-white rounded-xl text-xs font-bold transition shadow-lg shadow-(--accent-glow) shrink-0"
          >
            <Plus className="w-4 h-4" /> Novo Perfil
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="min-h-0 flex-1">
        {isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300 bg-(--bg-main)/20 border border-(--border-light) p-4 rounded-2xl">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-(--text-placeholder)">Nome da Personalidade</label>
              <input 
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Especialista em TypeScript"
                className="w-full bg-(--bg-sidebar) border border-(--border-light) rounded-xl px-3 py-3 text-sm text-(--text-primary) outline-none focus:border-(--accent-border) transition"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-(--text-placeholder)">Instrução do Sistema (Prompt)</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex: Você é um programador experiente que preza pela simplicidade e clareza no código..."
                className="w-full bg-(--bg-sidebar) border border-(--border-light) rounded-xl px-3 py-3 outline-none focus:border-(--accent-border) transition h-48 resize-none text-sm leading-relaxed text-(--text-primary)"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-(--text-placeholder) flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5" /> Voz padrão no modo LIVE
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setVoice('')}
                  className={`px-3 py-2.5 rounded-xl text-xs border transition text-left ${voice === '' ? 'bg-(--accent-bg) border-(--accent-border) text-(--accent-text) font-bold' : 'bg-(--bg-sidebar) border-(--border-light) text-(--text-secondary) hover:border-(--accent-border)'}`}
                >
                  <div className="font-semibold">Automática</div>
                  <div className="text-[9px] text-(--text-placeholder) leading-tight mt-0.5">Mantém a voz atual</div>
                </button>
                {LIVE_VOICES.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVoice(v.id)}
                    className={`px-3 py-2.5 rounded-xl text-xs border transition text-left ${voice === v.id ? 'bg-(--accent-bg) border-(--accent-border) text-(--accent-text) font-bold' : 'bg-(--bg-sidebar) border-(--border-light) text-(--text-secondary) hover:border-(--accent-border)'}`}
                  >
                    <div className="font-semibold">{v.id}</div>
                    <div className="text-[9px] text-(--text-placeholder) leading-tight mt-0.5">{v.desc}</div>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-(--text-placeholder)">Ao ativar esta personalidade no LIVE, a voz escolhida é aplicada automaticamente.</p>
            </div>
            <button
              type="submit"
              className="w-full bg-(--accent) hover:bg-(--accent-hover) text-white font-bold py-3.5 rounded-xl transition shadow-lg flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" /> Salvar Personalidade
            </button>
          </form>
        ) : (
          <div className="space-y-3 animate-in fade-in duration-300">
            {personalities.length === 0 ? (
              <div className="text-center py-16 bg-(--bg-main)/10 rounded-2xl border border-dashed border-(--border-light)">
                <div className="w-16 h-16 bg-(--bg-chat-hover) rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="w-8 h-8 opacity-20" />
                </div>
                <p className="opacity-40 italic text-sm text-(--text-secondary)">Nenhuma personalidade personalizada criada ainda.</p>
              </div>
            ) : (
              personalities.map((p) => (
                <div key={p.id} className="group flex items-center gap-4 p-3 min-w-0 bg-(--bg-main)/35 rounded-2xl border border-(--border-light) hover:border-(--accent-border) hover:bg-(--bg-chat-active) transition duration-200">
                  <div className="w-10 h-10 rounded-xl bg-(--accent-bg) flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-(--accent-text) opacity-60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <h4 className="font-bold text-(--text-primary) text-sm truncate">{p.name}</h4>
                      {p.voice && (
                        <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-(--accent-bg) text-(--accent-text) text-[9px] font-bold uppercase tracking-wide">
                          <Volume2 className="w-2.5 h-2.5" /> {p.voice}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-(--text-secondary) mt-0.5 line-clamp-2 wrap-break-word">{p.prompt}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition duration-200">
                    <button 
                      onClick={() => handleEdit(p)}
                      className="p-2 hover:bg-(--accent-bg-strong) rounded-lg text-(--accent-text) transition"
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
