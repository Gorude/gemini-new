import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Save, ArrowLeft, Wand2, Wrench } from 'lucide-react';
import { type Skill } from '../types';

interface SkillsPanelProps {
  skills: Skill[];
  onSave: (skill: Skill) => void;
  onDelete: (id: string) => void;
  // Ferramentas embutidas (tool calling) e seu estado de habilitação.
  chatTools: { id: string; label: string }[];
  enabledChatToolIds: string[];
  onToggleChatTool: (id: string) => void;
}

/**
 * Gerencia as skills de template de prompt (kind='prompt'): textos reutilizáveis
 * inseridos no chat pelo atalho "/". Suporta {{input}} (substituído pelo texto
 * já digitado). Ferramentas (kind='tool') são gerenciadas à parte no tool calling.
 */
const SkillsPanel: React.FC<SkillsPanelProps> = ({ skills, onSave, onDelete, chatTools, enabledChatToolIds, onToggleChatTool }) => {
  const promptSkills = skills.filter(s => s.kind === 'prompt');
  const [isEditing, setIsEditing] = useState(false);
  const [current, setCurrent] = useState<Skill | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');

  const startNew = () => {
    setCurrent(null); setName(''); setDescription(''); setPrompt(''); setIsEditing(true);
  };
  const startEdit = (s: Skill) => {
    setCurrent(s); setName(s.name); setDescription(s.description || ''); setPrompt(s.prompt || ''); setIsEditing(true);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) return;
    onSave({
      id: current?.id || `skill-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || undefined,
      kind: 'prompt',
      prompt: prompt.trim(),
    });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <form onSubmit={submit} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <button type="button" onClick={() => setIsEditing(false)} className="flex items-center gap-2 text-xs text-(--text-secondary) hover:text-(--text-primary) transition">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-widest">Nome</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Resumir ata" className="w-full bg-(--bg-sidebar) border border-(--border-light) rounded-xl py-2.5 px-3 text-sm text-(--text-primary) outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-widest">Descrição (opcional)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Breve descrição" className="w-full bg-(--bg-sidebar) border border-(--border-light) rounded-xl py-2.5 px-3 text-sm text-(--text-primary) outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-widest">Template do prompt</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={6} placeholder="Escreva o prompt reutilizável. Use {{input}} para inserir o texto que você já digitou." className="w-full bg-(--bg-sidebar) border border-(--border-light) rounded-xl py-2.5 px-3 text-sm text-(--text-primary) outline-none resize-y" />
          <p className="text-[10px] text-(--text-placeholder)">Dica: <code>{'{{input}}'}</code> é substituído pelo texto atual do campo de mensagem.</p>
        </div>
        <button type="submit" disabled={!name.trim() || !prompt.trim()} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition" style={{ background: 'var(--accent)' }}>
          <Save className="w-4 h-4" /> Salvar skill
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Ferramentas embutidas (tool calling) — habilitação global. */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Wrench className="w-4 h-4" style={{ color: 'var(--accent-text)' }} />
          <h4 className="text-sm font-bold text-(--text-primary)">Ferramentas</h4>
        </div>
        <p className="text-[11px] text-(--text-placeholder) px-1">
          Quando ativas, o modelo pode chamá-las durante o chat (tool calling). Disponível em modelos Gemini.
        </p>
        {chatTools.map(t => {
          const on = enabledChatToolIds.includes(t.id);
          return (
            <div key={t.id} className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${on ? '' : 'bg-(--bg-main)/30 border-(--border-light)'}`} style={on ? { background: 'var(--accent-bg)', borderColor: 'var(--accent-border)' } : {}}>
              <span className="text-sm font-medium text-(--text-primary)">{t.label}</span>
              <button
                onClick={() => onToggleChatTool(t.id)}
                className={`relative w-12 h-6 rounded-full transition-all duration-300 flex items-center shrink-0 ${on ? '' : 'bg-gray-600'}`}
                style={on ? { background: 'var(--accent-hover)' } : {}}
                aria-label={`${on ? 'Desativar' : 'Ativar'} ${t.label}`}
              >
                <div className={`absolute w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${on ? 'left-7' : 'left-1'}`}></div>
              </button>
            </div>
          );
        })}
      </div>

      <div className="h-px bg-(--border-light) my-2 opacity-50"></div>

      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] text-(--text-placeholder)">Templates de prompt reutilizáveis. No chat, digite <code>/</code> para inserir.</p>
        <button onClick={startNew} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white transition" style={{ background: 'var(--accent)' }}>
          <Plus className="w-3.5 h-3.5" /> Nova
        </button>
      </div>

      {promptSkills.length === 0 ? (
        <div className="text-center py-10 text-(--text-placeholder)">
          <Wand2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-xs">Nenhum template ainda. Crie o primeiro para agilizar tarefas repetitivas.</p>
        </div>
      ) : (
        promptSkills.map(s => (
          <div key={s.id} className="flex items-start justify-between gap-3 bg-(--bg-main) border border-(--border-light) rounded-2xl p-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-(--text-primary) truncate">{s.name}</div>
              {s.description && <div className="text-[11px] text-(--text-secondary) truncate">{s.description}</div>}
              <div className="text-[10px] text-(--text-placeholder) mt-1 line-clamp-2">{s.prompt}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => startEdit(s)} title="Editar" className="p-1.5 rounded-lg text-(--text-placeholder) hover:text-(--text-primary) hover:bg-(--bg-chat-hover) transition"><Edit2 className="w-3.5 h-3.5" /></button>
              <button onClick={() => onDelete(s.id)} title="Excluir" className="p-1.5 rounded-lg text-(--text-placeholder) hover:text-red-400 hover:bg-red-500/10 transition"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default SkillsPanel;
