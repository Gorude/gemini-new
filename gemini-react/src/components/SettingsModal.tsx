import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Bot,
  Layout,
  Palette,
  Check,
  Globe,
  User,
  Zap,
  Shield,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { MODEL_OPTIONS, LIVE_MODEL_OPTIONS } from '../constants';
import PersonalitiesPanel from './PersonalitiesPanel';
import DnaPanel from './DnaPanel';
import { type Personality, type MemoryFact } from '../types';

interface SettingsModalProps {
  onClose: () => void;
  theme: string;
  onSetTheme: (theme: string) => void;
  chatMargin: number;
  onSetChatMargin: (margin: number) => void;
  enabledModelIds: string[];
  onSetEnabledModelIds: (ids: string[]) => void;
  paidApiKey: string;
  onUpdatePaidApiKey: (key: string) => void;
  defaultApiKey: string;
  onUpdateDefaultApiKey: (key: string) => void;
  liveModel: string;
  onSetLiveModel: (model: string) => void;
  inline?: boolean;
  initialTab?: 'geral' | 'modelos' | 'api' | 'personalidades' | 'dna';
  personalities: Personality[];
  onSavePersonality: (p: Personality) => void;
  onDeletePersonality: (id: string) => void;
  memoryFacts: MemoryFact[];
  onDeleteMemoryFact: (id: string) => void;
  onSaveMemoryFact: (fact: MemoryFact) => void;
  onAutoCategorizeMemory: () => void;
  isCategorizingMemory: boolean;
  categorizationProgress?: { current: number, total: number };
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  theme,
  onSetTheme,
  enabledModelIds,
  onSetEnabledModelIds,
  paidApiKey,
  onUpdatePaidApiKey,
  defaultApiKey,
  onUpdateDefaultApiKey,
  liveModel,
  onSetLiveModel,
  inline = false,
  initialTab = 'geral',
  personalities,
  onSavePersonality,
  onDeletePersonality,
  memoryFacts,
  onDeleteMemoryFact,
  onSaveMemoryFact,
  onAutoCategorizeMemory,
  isCategorizingMemory,
  categorizationProgress
}) => {
  const [activeTab, setActiveTab] = useState<'geral' | 'modelos' | 'api' | 'personalidades' | 'dna'>(initialTab);
  const [valDefaultStatus, setValDefaultStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [valPaidStatus, setValPaidStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [tempDefaultKey, setTempDefaultKey] = useState(defaultApiKey);
  const [tempPaidKey, setTempPaidKey] = useState(paidApiKey);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setTempDefaultKey(defaultApiKey);
  }, [defaultApiKey]);

  useEffect(() => {
    setTempPaidKey(paidApiKey);
  }, [paidApiKey]);

  const validateDefaultKey = async (key: string) => {
    if (!key) {
      setValDefaultStatus('idle');
      return;
    }
    setValDefaultStatus('loading');
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (res.ok) {
        setValDefaultStatus('success');
        onUpdateDefaultApiKey(key);
      } else {
        setValDefaultStatus('error');
      }
    } catch (e) {
      setValDefaultStatus('error');
    }
  };

  const validatePaidKey = async (key: string) => {
    if (!key) {
      setValPaidStatus('idle');
      return;
    }
    setValPaidStatus('loading');
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (res.ok) {
        setValPaidStatus('success');
        onUpdatePaidApiKey(key);
      } else {
        setValPaidStatus('error');
      }
    } catch (e) {
      setValPaidStatus('error');
    }
  };

  const toggleModel = (id: string) => {
    if (enabledModelIds.includes(id)) {
      // Don't allow disabling if it's the last one
      if (enabledModelIds.length > 1) {
        onSetEnabledModelIds(enabledModelIds.filter(m => m !== id));
      }
    } else {
      onSetEnabledModelIds([...enabledModelIds, id]);
    }
  };

  const themes = [
    { id: 'escuro', name: 'Escuro', color: '#111111' },
    { id: 'claro', name: 'Claro', color: '#ffffff' },
    { id: 'areia', name: 'Areia', color: '#f5e6d3' },
    { id: 'galaxia', name: 'Galáxia', color: '#0f172a' }
  ];

  const renderContent = () => (
    <div className={`w-full h-full flex flex-col md:flex-row overflow-hidden ${inline ? 'bg-[var(--bg-main)]' : 'relative w-full max-w-2xl glass-modal rounded-[2rem] shadow-2xl h-[600px] animate-in zoom-in-95 duration-300'}`}>

      {/* Sidebar Tabs */}
      <div className="w-full md:w-64 bg-[var(--bg-sidebar)]/30 border-b md:border-b-0 md:border-r border-[var(--border-light)] p-4 md:p-8 flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible gap-2 md:gap-8 shrink-0 scrollbar-hidden">
        <div className="hidden md:flex items-center gap-3 px-2">
          <div className="p-2 rounded-xl text-white shadow-lg" style={{ background: 'var(--accent)', boxShadow: '0 10px 15px -3px var(--accent-glow)' }}>
            <Settings size={20} />
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Configurações</h2>
        </div>

        <nav className="flex flex-row md:flex-col gap-2 shrink-0 md:shrink">
          <button
            onClick={() => setActiveTab('geral')}
            className={`flex items-center gap-3 px-4 py-2.5 md:py-3 rounded-2xl transition-all duration-300 shrink-0 ${activeTab === 'geral' ? 'text-white shadow-lg font-bold scale-[1.03]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)] md:hover:translate-x-1'}`}
            style={activeTab === 'geral' ? { background: `linear-gradient(to right, var(--accent), var(--accent-hover))`, boxShadow: `0 10px 15px -3px var(--accent-glow)` } : {}}
          >
            <Layout size={18} /> Geral
          </button>
          <button
            onClick={() => setActiveTab('modelos')}
            className={`flex items-center gap-3 px-4 py-2.5 md:py-3 rounded-2xl transition-all duration-300 shrink-0 ${activeTab === 'modelos' ? 'text-white shadow-lg font-bold scale-[1.03]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)] md:hover:translate-x-1'}`}
            style={activeTab === 'modelos' ? { background: `linear-gradient(to right, var(--accent), var(--accent-hover))`, boxShadow: `0 10px 15px -3px var(--accent-glow)` } : {}}
          >
            <Bot size={18} /> Modelos
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`flex items-center gap-3 px-4 py-2.5 md:py-3 rounded-2xl transition-all duration-300 shrink-0 ${activeTab === 'api' ? 'text-white shadow-lg font-bold scale-[1.03]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)] md:hover:translate-x-1'}`}
            style={activeTab === 'api' ? { background: `linear-gradient(to right, var(--accent), var(--accent-hover))`, boxShadow: `0 10px 15px -3px var(--accent-glow)` } : {}}
          >
            <Shield size={18} /> API
          </button>

          <div className="hidden md:block h-px bg-[var(--border-light)] my-2 opacity-50"></div>

          <button
            onClick={() => setActiveTab('personalidades')}
            className={`flex items-center gap-3 px-4 py-2.5 md:py-3 rounded-2xl transition-all duration-300 shrink-0 ${activeTab === 'personalidades' ? 'text-white shadow-lg font-bold scale-[1.03]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)] md:hover:translate-x-1'}`}
            style={activeTab === 'personalidades' ? { background: `linear-gradient(to right, var(--accent), var(--accent-hover))`, boxShadow: `0 10px 15px -3px var(--accent-glow)` } : {}}
          >
            <User size={18} style={{ color: activeTab === 'personalidades' ? 'white' : 'var(--accent-text)' }} /> Personalidades
          </button>
          <button
            onClick={() => setActiveTab('dna')}
            className={`flex items-center gap-3 px-4 py-2.5 md:py-3 rounded-2xl transition-all duration-300 shrink-0 ${activeTab === 'dna' ? 'text-white shadow-lg font-bold scale-[1.03]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)] md:hover:translate-x-1'}`}
            style={activeTab === 'dna' ? { background: `linear-gradient(to right, var(--accent), var(--accent-hover))`, boxShadow: `0 10px 15px -3px var(--accent-glow)` } : {}}
          >
            <Zap size={18} className="text-emerald-400" /> DNA de Memória
          </button>
        </nav>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="p-6 md:p-8 flex justify-between items-center bg-[var(--bg-sidebar)]/30 border-b border-[var(--border-light)] backdrop-blur-md">
          <div>
            <h3 className="text-xs md:text-sm font-black uppercase tracking-[0.2em]" style={{ color: 'var(--accent-text)' }}>
              {activeTab === 'geral' ? 'Preferências de Interface' : activeTab === 'modelos' ? 'Gerenciamento de IA' : activeTab === 'api' ? 'Configurações de API' : activeTab === 'personalidades' ? 'Comportamento da IA' : 'Inteligência Coletiva Persistente'}
            </h3>
            <p className="text-[10px] md:text-xs text-[var(--text-secondary)] mt-1">
              {activeTab === 'geral' ? 'Ajuste o visual e o layout do sistema.' : activeTab === 'modelos' ? 'Escolha quais modelos estarão disponíveis no chat.' : activeTab === 'api' ? 'Configurações de API e Chaves de Acesso.' : activeTab === 'personalidades' ? 'Defina diretrizes de instrução e perfis do sistema.' : 'DNA de Memória - Visualização e Edição de Fatos.'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-chat-hover)] rounded-xl text-[var(--text-placeholder)] transition-colors hover:scale-105 active:scale-95 duration-200">
            <X size={20} />
          </button>
        </header>

        <div className={`flex-1 ${activeTab === 'dna' ? 'overflow-hidden flex flex-col bg-[var(--bg-sidebar)]/10' : 'overflow-y-auto p-6 md:p-8 custom-scrollbar bg-[var(--bg-sidebar)]/10'}`}>
          {activeTab === 'geral' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">

              {/* Theme Selector */}
              <section className="space-y-4">
                <div className="flex items-center gap-3 text-[var(--text-primary)]">
                  <Palette size={18} className="text-amber-400" />
                  <h4 className="text-sm font-bold">Tema Visual</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {themes.map(t => {
                    const isSelected = theme === t.id;

                    return (
                      <button
                        key={t.id}
                        onClick={() => onSetTheme(t.id)}
                        className={`flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 active:scale-95 ${isSelected ? '' : 'bg-[var(--bg-main)]/50 border-[var(--border-light)] text-[var(--text-secondary)] hover:border-[var(--border-main)] hover:scale-105'}`}
                        style={isSelected ? { boxShadow: `0 0 20px var(--accent-glow)`, borderColor: 'var(--accent)', background: 'var(--accent-bg)', color: 'var(--accent-text)' } : {}}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded-full border border-white/20 shadow-inner" style={{ backgroundColor: t.color }}></div>
                          <span className="text-xs font-bold uppercase tracking-widest">{t.name}</span>
                        </div>
                        {isSelected && <Check size={16} />}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'modelos' && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="text-[10px] font-bold uppercase tracking-widest mb-4 px-2" style={{ color: 'var(--accent-text)' }}>Motores de Inteligência Ativos</div>
              {MODEL_OPTIONS.map(opt => (
                <div
                  key={opt.id}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${enabledModelIds.includes(opt.id) ? '' : 'bg-[var(--bg-main)]/30 border-[var(--border-light)] opacity-60 grayscale-[0.5]'}`}
                  style={enabledModelIds.includes(opt.id) ? { background: 'var(--accent-bg)', borderColor: 'var(--accent-border)' } : {}}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`p-3 rounded-xl transition-colors ${enabledModelIds.includes(opt.id) ? 'text-white' : 'bg-[var(--bg-chat-hover)] text-[var(--text-placeholder)]'}`} style={enabledModelIds.includes(opt.id) ? { background: 'var(--accent)' } : {}}>
                      <Bot size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[var(--text-primary)] truncate">{opt.name}</span>
                        {opt.hasSearch && <Globe size={12} className="shrink-0 text-blue-400" />}
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] truncate">{opt.desc}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleModel(opt.id)}
                    className={`relative w-12 h-6 rounded-full transition-all duration-300 flex items-center shrink-0 ${enabledModelIds.includes(opt.id) ? '' : 'bg-gray-600'}`}
                    style={enabledModelIds.includes(opt.id) ? { background: 'var(--accent-hover)' } : {}}
                  >
                    <div className={`absolute w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${enabledModelIds.includes(opt.id) ? 'left-7' : 'left-1'}`}></div>
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-[var(--text-primary)]">
                    <Zap size={18} style={{ color: 'var(--accent-text)' }} />
                    <h4 className="text-sm font-bold">Configuração de APIs</h4>
                  </div>
                </div>

                <div className="bg-[var(--bg-main)] p-6 rounded-2xl border border-[var(--border-light)] space-y-8">
                  {/* Default API Key */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Chave de API Padrão (AI Studio)</label>
                      <div className="flex items-center gap-2">
                        {valDefaultStatus === 'loading' && <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />}
                        {valDefaultStatus === 'success' && <div className="flex items-center gap-1 text-[10px] text-green-500 font-bold bg-green-500/10 px-2 py-0.5 rounded-md"><Check className="w-3 h-3" /> ATIVA</div>}
                        {valDefaultStatus === 'error' && <div className="flex items-center gap-1 text-[10px] text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded-md"><AlertCircle className="w-3 h-3" /> ERRO</div>}
                        {valDefaultStatus === 'idle' && <div className="flex items-center gap-1 text-[10px] text-[var(--text-placeholder)] font-bold bg-[var(--bg-sidebar)] px-2 py-0.5 rounded-md">Padrão</div>}
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="password"
                        placeholder="Cole sua chave padrão do Google AI Studio..."
                        className="w-full bg-[var(--bg-sidebar)] border border-[var(--border-light)] rounded-xl py-3 px-4 text-sm text-[var(--text-primary)] outline-none transition-all pr-24"
                        style={{ '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
                        onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                        onBlur={(e) => e.currentTarget.style.borderColor = ''}
                        value={tempDefaultKey}
                        onChange={(e) => setTempDefaultKey(e.target.value)}
                      />
                      <button
                        onClick={() => validateDefaultKey(tempDefaultKey)}
                        disabled={valDefaultStatus === 'loading' || !tempDefaultKey}
                        className="absolute right-2 top-2 bottom-2 px-4 disabled:bg-gray-600 text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                        style={{ background: 'var(--accent)' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}
                      >
                        SALVAR
                      </button>
                    </div>
                    <p className="text-[10px] text-[var(--text-placeholder)] mt-2">
                      Esta chave padrão é usada para todos os modelos de texto, bate-papo, processamento de áudio e ferramentas da aplicação.
                    </p>
                  </div>

                  <div className="h-px bg-[var(--border-light)] opacity-35"></div>

                  {/* Premium / Imagen API Key */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Chave de API Imagen (Premium)</label>
                      <div className="flex items-center gap-2">
                        {valPaidStatus === 'loading' && <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />}
                        {valPaidStatus === 'success' && <div className="flex items-center gap-1 text-[10px] text-green-500 font-bold bg-green-500/10 px-2 py-0.5 rounded-md"><Check className="w-3 h-3" /> ATIVA</div>}
                        {valPaidStatus === 'error' && <div className="flex items-center gap-1 text-[10px] text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded-md"><AlertCircle className="w-3 h-3" /> ERRO</div>}
                        {valPaidStatus === 'idle' && <div className="flex items-center gap-1 text-[10px] text-[var(--text-placeholder)] font-bold bg-[var(--bg-sidebar)] px-2 py-0.5 rounded-md">Opcional</div>}
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="password"
                        placeholder="Cole sua chave Imagen paga aqui..."
                        className="w-full bg-[var(--bg-sidebar)] border border-[var(--border-light)] rounded-xl py-3 px-4 text-sm text-[var(--text-primary)] outline-none transition-all pr-24"
                        style={{ '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
                        onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                        onBlur={(e) => e.currentTarget.style.borderColor = ''}
                        value={tempPaidKey}
                        onChange={(e) => setTempPaidKey(e.target.value)}
                      />
                      <button
                        onClick={() => validatePaidKey(tempPaidKey)}
                        disabled={valPaidStatus === 'loading' || !tempPaidKey}
                        className="absolute right-2 top-2 bottom-2 px-4 disabled:bg-gray-600 text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                        style={{ background: 'var(--accent)' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}
                      >
                        SALVAR
                      </button>
                    </div>
                    <p className="text-[10px] text-[var(--text-placeholder)] mt-2">
                      Esta chave é usada exclusivamente para geração de imagens (modelo Imagen 3/4). Se não fornecida, a geração de imagens usará a chave padrão.
                    </p>
                  </div>

                  <div className="h-px bg-[var(--border-light)] opacity-35"></div>

                  {/* Seção de Modelos LIVE */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest block">Modelo LIVE Ativo</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {LIVE_MODEL_OPTIONS.map(opt => {
                        const isSelected = liveModel === opt.id;
                        return (
                          <button
                            key={opt.id}
                            onClick={() => onSetLiveModel(opt.id)}
                            className={`flex flex-col items-start p-4 rounded-2xl border text-left transition-all duration-300 active:scale-95 w-full ${isSelected ? '' : 'bg-[var(--bg-main)]/50 border-[var(--border-light)] text-[var(--text-secondary)] hover:border-[var(--border-main)] hover:scale-[1.02]'}`}
                            style={isSelected ? { boxShadow: `0 0 20px var(--accent-glow)`, borderColor: 'var(--accent)', background: 'var(--accent-bg)', color: 'var(--accent-text)' } : {}}
                          >
                            <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]">{opt.name}</span>
                            <span className="text-[10px] text-[var(--text-placeholder)] mt-1">{opt.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'personalidades' && (
            <PersonalitiesPanel
              personalities={personalities}
              onSave={onSavePersonality}
              onDelete={onDeletePersonality}
            />
          )}

          {activeTab === 'dna' && (
            <DnaPanel
              memoryFacts={memoryFacts}
              onDelete={onDeleteMemoryFact}
              onSave={onSaveMemoryFact}
              onAutoCategorize={onAutoCategorizeMemory}
              isCategorizing={isCategorizingMemory}
              progress={categorizationProgress}
            />
          )}
        </div>
      </div>
    </div>
  );

  if (inline) {
    return renderContent();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}></div>
      {renderContent()}
    </div>
  );
};

export default SettingsModal;
