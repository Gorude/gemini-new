import React, { useState } from 'react';
import { X, Trash2, Edit2, List, Share2, Plus, Search, Layers, Sparkles, Loader2 } from 'lucide-react';
import { type MemoryFact } from '../types';
import DnaGraph from './DnaGraph';

interface DnaModalProps {
  memoryFacts: MemoryFact[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onSave: (fact: MemoryFact) => void;
  onAutoCategorize: () => void;
  isCategorizing: boolean;
}

const DnaModal: React.FC<DnaModalProps> = ({ memoryFacts, onClose, onDelete, onSave, onAutoCategorize, isCategorizing }) => {
  const [activeTab, setActiveTab] = useState<'lista' | 'grafo'>('lista');
  const [searchTerm, setSearchTerm] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  const [editingFact, setEditingFact] = useState<MemoryFact | null>(null);

  // Agrupar por categoria
  const groupedFacts = memoryFacts.reduce((acc, fact) => {
    // Robustez: se o fato for string (ainda não migrado), usar 'Diversos'
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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110] p-0 md:p-4 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-[var(--bg-sidebar)] w-full max-w-4xl h-screen md:h-[85vh] rounded-none md:rounded-[32px] border-none md:border border-white/10 overflow-hidden shadow-2xl flex flex-col relative">
        
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-indigo-600/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
              <Share2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">DNA de Memória 2.0</h3>
              <p className="text-xs text-white/40 uppercase tracking-widest font-medium">Inteligência Coletiva Persistente</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-black/30 p-1 rounded-xl border border-white/5">
              <button 
                onClick={() => setActiveTab('lista')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${activeTab === 'lista' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
              >
                <List className="w-4 h-4" /> LISTA
              </button>
              <button 
                onClick={() => setActiveTab('grafo')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${activeTab === 'grafo' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
              >
                <Layers className="w-4 h-4" /> GRAFO
              </button>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition text-white/40 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-4 bg-black/10 border-b border-white/10 flex justify-between items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <input 
              type="text" 
              placeholder="Buscar no DNA..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
          
          <div className="flex items-center gap-3">
            {activeTab === 'grafo' && (
              <label className="flex items-center gap-3 cursor-pointer group">
                <span className="text-xs font-bold text-white/40 group-hover:text-indigo-400 transition uppercase tracking-tighter">Modo Foco</span>
                <div 
                  onClick={() => setFocusMode(!focusMode)}
                  className={`w-10 h-5 rounded-full transition relative ${focusMode ? 'bg-indigo-600' : 'bg-white/10'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${focusMode ? 'left-6' : 'left-1'}`}></div>
                </div>
              </label>
            )}
            <button 
              onClick={onAutoCategorize}
              disabled={isCategorizing || memoryFacts.length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-lg ${isCategorizing ? 'bg-indigo-900/50 text-white/50 cursor-not-allowed' : 'bg-white/5 border border-white/10 text-indigo-400 hover:bg-white/10 hover:border-indigo-500/30'}`}
              title="Auto-organizar memórias com IA"
            >
              {isCategorizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isCategorizing ? 'ORGANIZANDO...' : 'ORGANIZAR COM IA'}
            </button>
            <button 
              onClick={() => setEditingFact({ id: '', text: '', category: 'Diversos', connections: [], timestamp: Date.now() })}
              className="flex items-center gap-2 px-3 md:px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/10 shrink-0"
            >
              <Plus className="w-4 h-4" /> <span className="hidden xs:inline">ADICIONAR</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden relative">
          {activeTab === 'lista' ? (
            <div className="h-full overflow-y-auto p-6 space-y-8 custom-scrollbar">
              {Object.keys(filteredGroups).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/20 italic text-sm">
                   Nenhum fato encontrado na memória.
                </div>
              ) : (
                Object.keys(filteredGroups).map(cat => (
                  <div key={cat} className="space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 flex items-center gap-2">
                       <div className="w-1 h-3 bg-indigo-500 rounded-full"></div>
                       {cat}
                       <span className="text-white/20 ml-2 font-normal">({filteredGroups[cat].length})</span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {filteredGroups[cat].map((fact, idx) => {
                        const isString = typeof fact === 'string';
                        const factText = isString ? fact : fact.text;
                        const factId = isString ? `legacy-${idx}` : fact.id;

                        return (
                          <div key={isString ? idx : fact.id} className="group p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-all flex flex-col gap-3">
                            <p className="text-sm leading-relaxed text-white/80 flex-1">{factText}</p>
                            <div className="flex justify-between items-center mt-2 pt-3 border-t border-white/5">
                              <span className="text-[9px] text-white/20 uppercase font-mono">ID: {factId.substring(0, 8)}</span>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                {!isString && (
                                  <>
                                    <button onClick={() => setEditingFact(fact)} className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-indigo-400 transition">
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => onDelete(fact.id)} className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-red-400 transition">
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
            <DnaGraph 
              facts={memoryFacts} 
              focusMode={focusMode} 
              onNodeClick={(fact) => setEditingFact(fact)} 
            />
          )}
        </div>

        {/* Edit/Add Modal Overlay */}
        {editingFact && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[120] p-6 animate-in zoom-in-95 duration-200">
            <div className="bg-[#1e1f20] w-full max-w-lg rounded-[24px] border border-white/10 overflow-hidden shadow-2xl flex flex-col">
              <div className="p-6 border-b border-white/5 flex justify-between items-center">
                <h4 className="text-lg font-bold text-white">{editingFact.id ? 'Editar Fato' : 'Novo Fato'}</h4>
                <button onClick={() => setEditingFact(null)} className="p-2 hover:bg-white/5 rounded-full text-white/40"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Conteúdo do Fato</label>
                  <textarea 
                    value={editingFact.text}
                    onChange={(e) => setEditingFact({...editingFact, text: e.target.value})}
                    className="w-full h-32 bg-black/20 border border-white/5 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-indigo-500 transition resize-none"
                    placeholder="O que o sistema deve lembrar?"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Categoria</label>
                    <input 
                      type="text"
                      value={editingFact.category}
                      onChange={(e) => setEditingFact({...editingFact, category: e.target.value})}
                      className="w-full bg-black/20 border border-white/5 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                      placeholder="Ex: Pessoal"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Conexões (IDs)</label>
                    <input 
                      type="text"
                      value={(editingFact.connections || []).join(', ')}
                      onChange={(e) => setEditingFact({...editingFact, connections: e.target.value.split(',').map(s => s.trim()).filter(s => s)})}
                      className="w-full bg-black/20 border border-white/5 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition font-mono"
                      placeholder="id1, id2..."
                    />
                  </div>
                </div>
              </div>
              <div className="p-6 bg-black/20 flex justify-end gap-3 mt-auto">
                <button onClick={() => setEditingFact(null)} className="px-6 py-2.5 rounded-xl text-xs font-bold text-white/40 hover:text-white transition">CANCELAR</button>
                <button 
                  onClick={() => { onSave(editingFact); setEditingFact(null); }}
                  className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg"
                >
                  SALVAR MEMÓRIA
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DnaModal;
