import React, { useState, lazy, Suspense } from 'react';
import { X, Trash2, Edit2, List, Plus, Search, Layers, Sparkles, Loader2 } from 'lucide-react';
import { type MemoryFact } from '../types';
import ErrorBoundary from './ErrorBoundary';

// react-force-graph-2d é pesado e só é usado na visão de grafo do DNA — carregado sob demanda.
const DnaGraph = lazy(() => import('./DnaGraph'));

interface DnaPanelProps {
  memoryFacts: MemoryFact[];
  onDelete: (id: string) => void;
  onSave: (fact: MemoryFact) => void;
  onAutoCategorize: () => void;
  isCategorizing: boolean;
  progress?: { current: number, total: number };
}

const DnaPanel: React.FC<DnaPanelProps> = ({ 
  memoryFacts, 
  onDelete, 
  onSave, 
  onAutoCategorize, 
  isCategorizing, 
  progress 
}) => {
  const [activeTab, setActiveTab] = useState<'lista' | 'grafo'>('lista');
  const [searchTerm, setSearchTerm] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  const [editingFact, setEditingFact] = useState<MemoryFact | null>(null);

  // Agrupar por categoria
  const groupedFacts = memoryFacts.reduce((acc, fact) => {
    const category = (typeof fact === 'string' ? 'Diversos' : (fact.category || 'Diversos'));
    if (!acc[category]) acc[category] = [];
    acc[category].push(fact);
    return acc;
  }, {} as Record<string, any[]>);

  const filteredGroups = Object.keys(groupedFacts).reduce((acc, cat) => {
    const matches = groupedFacts[cat].filter(f => {
      const text = typeof f === 'string' ? f : (f.text || '');
      return text.toLowerCase().includes(searchTerm.toLowerCase()) || 
             cat.toLowerCase().includes(searchTerm.toLowerCase());
    });
    if (matches.length > 0) acc[cat] = matches;
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="w-full h-full flex flex-col relative text-(--text-primary) overflow-hidden min-h-[500px]">
      {/* Progress Bar (Batched Organization) */}
      {isCategorizing && progress && progress.total > 0 && (
        <div className="absolute top-0 left-0 w-full h-1 bg-(--border-light) z-[120]">
          <div 
            className="h-full bg-(--accent) transition-all duration-500 shadow-[0_0_10px_var(--accent-glow)]"
            style={{ width: `${(progress.current / progress.total) * 100}%` }}
          ></div>
        </div>
      )}

      {/* Control Bar */}
      <div className="p-3 sm:p-3 md:p-4 bg-(--bg-main)/30 border-b border-(--border-light) flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 sm:gap-4 shrink-0">
        
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-placeholder)" />
          <input 
            type="text" 
            placeholder="Buscar no DNA..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-(--bg-sidebar) border border-(--border-light) rounded-xl py-1.5 sm:py-2 pl-10 pr-3 text-xs sm:text-sm focus:outline-none focus:border-(--accent-border) transition text-(--text-primary)"
          />
        </div>

        {/* View Switcher and Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex bg-(--bg-main) p-0.5 sm:p-1 rounded-xl border border-(--border-light) shrink-0">
            <button 
              onClick={() => setActiveTab('lista')}
              className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition flex items-center gap-1.5 sm:gap-2 ${activeTab === 'lista' ? 'bg-(--accent) text-white shadow-lg shadow-(--accent-glow)' : 'text-white/40 hover:text-white'}`}
            >
              <List className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> LISTA
            </button>
            <button 
              onClick={() => setActiveTab('grafo')}
              className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition flex items-center gap-1.5 sm:gap-2 ${activeTab === 'grafo' ? 'bg-(--accent) text-white shadow-lg shadow-(--accent-glow)' : 'text-(--text-secondary) hover:text-(--text-primary)'}`}
            >
              <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> GRAFO
            </button>
          </div>

          {activeTab === 'grafo' && (
            <label className="flex items-center gap-1.5 sm:gap-3 cursor-pointer group shrink-0">
              <span className="text-[9px] sm:text-[10px] font-bold text-(--text-secondary) group-hover:text-(--text-primary) transition uppercase tracking-tighter">Modo Foco</span>
              <div 
                onClick={() => setFocusMode(!focusMode)}
                className={`w-8 h-4.5 sm:w-10 sm:h-5 rounded-full transition relative ${focusMode ? 'bg-(--accent)' : 'bg-(--border-light)'}`}
              >
                <div className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all ${focusMode ? 'left-4 sm:left-6' : 'left-0.5'}`}></div>
              </div>
            </label>
          )}

          <button 
            onClick={onAutoCategorize}
            disabled={isCategorizing || memoryFacts.length === 0}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-3 sm:py-2 rounded-xl text-[10px] sm:text-xs font-bold transition shadow-lg shrink-0 ${isCategorizing ? 'bg-zinc-800 text-white/50 cursor-not-allowed' : 'bg-(--bg-sidebar) border border-(--border-light) text-(--text-primary) hover:bg-(--bg-chat-hover) hover:border-(--border-main)'}`}
            title="Auto-organizar memórias com IA"
          >
            {isCategorizing ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            {isCategorizing ? (
              <>
                ORG {progress && progress.total > 0 ? `(${progress.current}/${progress.total})` : '...'}
              </>
            ) : 'IA'}
          </button>

          <button 
            onClick={() => setEditingFact({ id: '', text: '', category: 'Diversos', connections: [], timestamp: Date.now() })}
            className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-3 sm:py-2 bg-(--accent) hover:bg-(--accent-hover) text-white rounded-xl text-[10px] sm:text-xs font-bold transition shadow-lg shadow-(--accent-glow) shrink-0"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> ADICIONAR
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'lista' ? (
          <div className="h-full overflow-y-auto p-4 space-y-8 custom-scrollbar">
            {Object.keys(filteredGroups).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-(--text-secondary) italic text-sm py-16">
                 Nenhum fato encontrado na memória.
              </div>
            ) : (
              Object.keys(filteredGroups).map(cat => (
                <div key={cat} className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-secondary) flex items-center gap-2">
                     <div className="w-1 h-3 bg-zinc-500 rounded-full"></div>
                     {cat}
                     <span className="text-(--text-secondary) ml-2 font-normal">({filteredGroups[cat].length})</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredGroups[cat].map((fact, idx) => {
                      const isString = typeof fact === 'string';
                      const factText = isString ? fact : fact.text;
                      const factId = isString ? `legacy-${idx}` : fact.id;

                      return (
                        <div key={isString ? idx : fact.id} className="group p-3 bg-(--bg-main)/35 rounded-2xl border border-(--border-light) hover:border-(--accent-border) hover:bg-(--bg-chat-active) transition duration-200 flex flex-col gap-3 shadow-sm">
                          <p className="text-sm leading-relaxed text-(--text-primary) flex-1">{factText}</p>
                          <div className="flex justify-between items-center mt-2 pt-3 border-t border-(--border-light)">
                            <span className="text-[9px] text-(--text-secondary) uppercase font-mono">ID: {factId.substring(0, 8)}</span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition duration-200">
                              {!isString && (
                                <>
                                  <button onClick={() => setEditingFact(fact)} className="p-1.5 hover:bg-(--bg-chat-hover) rounded-lg text-(--text-secondary) hover:text-(--text-primary) transition">
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => onDelete(fact.id)} className="p-1.5 hover:bg-(--bg-chat-hover) rounded-lg text-(--text-secondary) hover:text-red-500 transition">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <ErrorBoundary compact label="Gráfico de memória">
            <Suspense fallback={<div className="flex items-center justify-center h-full text-(--text-placeholder)"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
              <DnaGraph
                facts={memoryFacts}
                focusMode={focusMode}
                onNodeClick={(fact) => setEditingFact(fact)}
              />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>

      {/* Edit/Add Modal Overlay */}
      {editingFact && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[120] p-4 animate-in zoom-in-95 duration-200">
          <div className="bg-(--bg-modal) w-full max-w-lg rounded-[12px] border border-(--border-main) overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b border-(--border-light) flex justify-between items-center">
              <h4 className="text-lg font-bold text-(--text-bold)">{editingFact.id ? 'Editar Fato' : 'Novo Fato'}</h4>
              <button onClick={() => setEditingFact(null)} className="p-2 hover:bg-(--bg-chat-hover) rounded-full text-(--text-secondary)"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-(--text-secondary) uppercase tracking-widest">Conteúdo do Fato</label>
                <textarea 
                  value={editingFact.text}
                  onChange={(e) => setEditingFact({...editingFact, text: e.target.value})}
                  className="w-full h-32 bg-(--bg-input) border border-(--border-light) rounded-xl p-3 text-sm text-(--text-primary) focus:outline-none focus:border-(--accent-border) transition resize-none"
                  placeholder="O que o sistema deve lembrar?"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-(--text-secondary) uppercase tracking-widest">Categoria</label>
                  <input 
                    type="text"
                    value={editingFact.category}
                    onChange={(e) => setEditingFact({...editingFact, category: e.target.value})}
                    className="w-full bg-(--bg-input) border border-(--border-light) rounded-xl p-3 text-sm text-(--text-primary) focus:outline-none focus:border-(--accent-border) transition"
                    placeholder="Ex: Pessoal"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-(--text-secondary) uppercase tracking-widest">Conexões (IDs)</label>
                  <input 
                    type="text"
                    value={(editingFact.connections || []).join(', ')}
                    onChange={(e) => setEditingFact({...editingFact, connections: e.target.value.split(',').map(s => s.trim()).filter(s => s)})}
                    className="w-full bg-(--bg-input) border border-(--border-light) rounded-xl p-3 text-sm text-(--text-primary) focus:outline-none focus:border-(--accent-border) transition font-mono"
                    placeholder="id1, id2..."
                  />
                </div>
              </div>
            </div>
            <div className="p-4 bg-(--bg-main)/50 flex justify-end gap-3 mt-auto">
              <button onClick={() => setEditingFact(null)} className="px-4 py-2.5 rounded-xl text-xs font-bold text-(--text-secondary) hover:text-(--text-primary) transition">CANCELAR</button>
              <button 
                onClick={() => { onSave(editingFact); setEditingFact(null); }}
                className="px-5 py-2.5 bg-(--accent) hover:bg-(--accent-hover) text-white rounded-xl text-xs font-bold transition shadow-lg shadow-(--accent-glow)"
              >
                SALVAR MEMÓRIA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DnaPanel;
