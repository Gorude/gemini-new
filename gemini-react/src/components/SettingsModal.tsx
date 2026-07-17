import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Layout,
  Palette,
  Check,
  Globe,
  User,
  Zap,
  Shield,
  Loader2,
  AlertCircle,
  Server,
  Type,
  Gamepad2,
  Cpu,
  Trash2,
  Plus,
  Star,
  ChevronDown
} from 'lucide-react';
import { MODEL_OPTIONS, LIVE_MODEL_OPTIONS, FONT_OPTIONS, CUSTOM_MODEL_PROVIDERS, formatTokenCount, type CustomModel, type CustomModelProvider } from '../constants';
import { fetchOpenRouterContextLength } from '../services/gemini';
import NemonIcon from './NemonIcon';
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
  defaultModelId: string;
  onSetDefaultModelId: (id: string) => void;
  memoryModelId: string;
  onSetMemoryModelId: (id: string) => void;
  appFont: string;
  onSetAppFont: (id: string) => void;
  retroMode: boolean;
  onSetRetroMode: (v: boolean) => void;
  paidApiKey: string;
  onUpdatePaidApiKey: (key: string) => void;
  defaultApiKey: string;
  onUpdateDefaultApiKey: (key: string) => void;
  openRouterApiKey: string;
  onUpdateOpenRouterApiKey: (key: string) => void;
  customModels: CustomModel[];
  onSetCustomModels: (models: CustomModel[]) => void;
  localEndpoint: string;
  onUpdateLocalEndpoint: (url: string) => void;
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
  defaultModelId,
  onSetDefaultModelId,
  memoryModelId,
  onSetMemoryModelId,
  appFont,
  onSetAppFont,
  retroMode,
  onSetRetroMode,
  paidApiKey,
  onUpdatePaidApiKey,
  defaultApiKey,
  onUpdateDefaultApiKey,
  openRouterApiKey,
  onUpdateOpenRouterApiKey,
  customModels,
  onSetCustomModels,
  localEndpoint,
  onUpdateLocalEndpoint,
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
  const [tempLocalEndpoint, setTempLocalEndpoint] = useState(localEndpoint);
  const [valLocalStatus, setValLocalStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [tempOpenRouterKey, setTempOpenRouterKey] = useState(openRouterApiKey);
  const [valOpenRouterStatus, setValOpenRouterStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  // Rascunho do formulário "adicionar modelo" por provedor: { openrouter: {name,id} }.
  const [modelDrafts, setModelDrafts] = useState<Record<CustomModelProvider, { name: string; id: string }>>({
    openrouter: { name: '', id: '' },
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setTempLocalEndpoint(localEndpoint);
  }, [localEndpoint]);

  useEffect(() => {
    setTempDefaultKey(defaultApiKey);
  }, [defaultApiKey]);

  useEffect(() => {
    setTempPaidKey(paidApiKey);
  }, [paidApiKey]);

  useEffect(() => {
    setTempOpenRouterKey(openRouterApiKey);
  }, [openRouterApiKey]);

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

  const validateLocalEndpoint = async (rawUrl: string) => {
    const url = (rawUrl || '').trim().replace(/\/+$/, '');
    if (!url) {
      setValLocalStatus('idle');
      onUpdateLocalEndpoint('');
      return;
    }
    setValLocalStatus('loading');
    // Salva imediatamente para que o usuário possa usar mesmo se o teste falhar.
    onUpdateLocalEndpoint(url);
    try {
      const res = await fetch(`${url}/v1/models`);
      setValLocalStatus(res.ok ? 'success' : 'error');
    } catch {
      setValLocalStatus('error');
    }
  };

  // Salva e testa a chave do OpenRouter. Salva imediatamente (para não bloquear o uso
  // caso o teste falhe por CORS) e tenta um GET /models só para exibir o status.
  const validateOpenRouterKey = async (rawKey: string) => {
    const key = (rawKey || '').trim();
    onUpdateOpenRouterApiKey(key);
    if (!key) {
      setValOpenRouterStatus('idle');
      return;
    }
    setValOpenRouterStatus('loading');
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      setValOpenRouterStatus(res.ok ? 'success' : 'error');
    } catch {
      setValOpenRouterStatus('error');
    }
  };

  const [addingModel, setAddingModel] = useState<CustomModelProvider | null>(null);

  const addCustomModel = async (provider: CustomModelProvider) => {
    const draft = modelDrafts[provider];
    const id = (draft.id || '').trim();
    if (!id) return;
    const name = (draft.name || '').trim() || id;
    // Evita ids duplicados (o id é a chave de roteamento).
    if (customModels.some(m => m.id === id)) return;

    // Busca a janela de contexto real no OpenRouter (best-effort) para o indicador.
    setAddingModel(provider);
    let contextLength: number | undefined;
    try {
      if (provider === 'openrouter') {
        contextLength = await fetchOpenRouterContextLength(id);
      }
    } finally {
      setAddingModel(null);
    }

    onSetCustomModels([...customModels, { id, name, provider, contextLength }]);
    // Modelo recém-cadastrado já entra habilitado (aparece no seletor do chat).
    if (!enabledModelIds.includes(id)) onSetEnabledModelIds([...enabledModelIds, id]);
    setModelDrafts(prev => ({ ...prev, [provider]: { name: '', id: '' } }));
  };

  const removeCustomModel = (id: string) => {
    onSetCustomModels(customModels.filter(m => m.id !== id));
    // Limpa o id da lista de habilitados e reatribui o padrão se era este.
    if (enabledModelIds.includes(id)) {
      onSetEnabledModelIds(enabledModelIds.filter(m => m !== id));
    }
    if (defaultModelId === id) {
      const fallback = enabledModelIds.find(m => m !== id) || MODEL_OPTIONS[0]?.id || id;
      onSetDefaultModelId(fallback);
    }
  };

  const toggleModel = (id: string) => {
    if (enabledModelIds.includes(id)) {
      // Não permite desabilitar o último modelo restante.
      if (enabledModelIds.length > 1) {
        const next = enabledModelIds.filter(m => m !== id);
        onSetEnabledModelIds(next);
        // Se o modelo desabilitado era o padrão, escolhe outro habilitado.
        if (defaultModelId === id) onSetDefaultModelId(next[0]);
      }
    } else {
      onSetEnabledModelIds([...enabledModelIds, id]);
    }
  };

  // Define um modelo como padrão (o que abre pré-selecionado num novo chat).
  // Garante que ele esteja habilitado.
  const setAsDefault = (id: string) => {
    if (!enabledModelIds.includes(id)) onSetEnabledModelIds([...enabledModelIds, id]);
    onSetDefaultModelId(id);
  };

  const themes = [
    { id: 'escuro', name: 'Escuro', color: '#111111' },
    { id: 'claro', name: 'Claro', color: '#ffffff' },
    { id: 'areia', name: 'Areia', color: '#f5e6d3' },
    { id: 'galaxia', name: 'Galáxia', color: '#0f172a' },
    { id: 'claude', name: 'Claude', color: '#d97757' }
  ];

  // Linha de modelo na aba "Modelos": estrela (definir padrão) + toggle (ativar/desativar).
  // Usada tanto pelos modelos internos quanto pelos customizados (OpenRouter).
  const renderModelRow = (opt: { id: string; name: string; desc: string; hasSearch?: boolean }) => {
    const enabled = enabledModelIds.includes(opt.id);
    const isDefault = defaultModelId === opt.id;
    return (
      <div
        key={opt.id}
        className={`flex items-center justify-between gap-2 p-3 rounded-2xl border transition-all ${enabled ? '' : 'bg-(--bg-main)/30 border-(--border-light) opacity-60 grayscale-[0.5]'}`}
        style={enabled ? { background: 'var(--accent-bg)', borderColor: 'var(--accent-border)' } : {}}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className={`p-3 rounded-xl transition-colors ${enabled ? 'text-white' : 'bg-(--bg-chat-hover) text-(--text-placeholder)'}`} style={enabled ? { background: 'var(--accent)' } : {}}>
            <NemonIcon themed={false} size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-(--text-primary) truncate">{opt.name}</span>
              {opt.hasSearch && <Globe size={12} className="shrink-0 text-blue-400" />}
              {isDefault && <span className="shrink-0 text-[9px] font-bold text-white px-1.5 py-0.5 rounded-md" style={{ background: 'var(--accent)' }}>PADRÃO</span>}
            </div>
            <p className="text-xs text-(--text-secondary) truncate">{opt.desc}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Estrela: define como modelo padrão (pré-selecionado ao abrir um novo chat) */}
          <button
            onClick={() => setAsDefault(opt.id)}
            title={isDefault ? 'Modelo padrão' : 'Definir como padrão'}
            aria-label={isDefault ? 'Modelo padrão' : 'Definir como padrão'}
            className="p-1.5 rounded-lg transition-colors hover:bg-(--bg-chat-hover)"
            style={{ color: isDefault ? 'var(--accent-text)' : 'var(--text-placeholder)' }}
          >
            <Star size={16} fill={isDefault ? 'currentColor' : 'none'} />
          </button>
          {/* Toggle: ativa/desativa o modelo no seletor do chat */}
          <button
            onClick={() => toggleModel(opt.id)}
            className={`relative w-12 h-6 rounded-full transition-all duration-300 flex items-center ${enabled ? '' : 'bg-gray-600'}`}
            style={enabled ? { background: 'var(--accent-hover)' } : {}}
          >
            <div className={`absolute w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${enabled ? 'left-7' : 'left-1'}`}></div>
          </button>
        </div>
      </div>
    );
  };

  const renderContent = () => (
    <div className={`w-full h-full flex flex-col md:flex-row overflow-hidden ${inline ? 'bg-(--bg-main)' : 'relative w-full max-w-2xl glass-modal rounded-[1rem] shadow-2xl h-[600px] animate-in zoom-in-95 duration-300'}`}>

      {/* Sidebar Tabs */}
      <div className="w-full md:w-64 bg-(--bg-sidebar)/30 border-b md:border-b-0 md:border-r border-(--border-light) p-3 md:p-5 flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible gap-2 md:gap-8 shrink-0 scrollbar-hidden">
        <div className="hidden md:flex items-center gap-3 px-2">
          <div className="p-2 rounded-xl text-white shadow-lg" style={{ background: 'var(--accent)', boxShadow: '0 10px 15px -3px var(--accent-glow)' }}>
            <Settings size={20} />
          </div>
          <h2 className="text-lg font-bold text-(--text-primary)">Configurações</h2>
        </div>

        <nav className="flex flex-row md:flex-col gap-2 shrink-0 md:shrink">
          <button
            onClick={() => setActiveTab('geral')}
            className={`flex items-center gap-3 px-3 py-2.5 md:py-3 rounded-2xl transition-all duration-300 shrink-0 ${activeTab === 'geral' ? 'text-white shadow-lg font-bold scale-[1.03]' : 'text-(--text-secondary) hover:bg-(--bg-chat-hover) hover:text-(--text-primary) md:hover:translate-x-1'}`}
            style={activeTab === 'geral' ? { background: `linear-gradient(to right, var(--accent), var(--accent-hover))`, boxShadow: `0 10px 15px -3px var(--accent-glow)` } : {}}
          >
            <Layout size={15} /> Geral
          </button>
          <button
            onClick={() => setActiveTab('modelos')}
            className={`flex items-center gap-3 px-3 py-2.5 md:py-3 rounded-2xl transition-all duration-300 shrink-0 ${activeTab === 'modelos' ? 'text-white shadow-lg font-bold scale-[1.03]' : 'text-(--text-secondary) hover:bg-(--bg-chat-hover) hover:text-(--text-primary) md:hover:translate-x-1'}`}
            style={activeTab === 'modelos' ? { background: `linear-gradient(to right, var(--accent), var(--accent-hover))`, boxShadow: `0 10px 15px -3px var(--accent-glow)` } : {}}
          >
            <NemonIcon themed={false} size={15} /> Modelos
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`flex items-center gap-3 px-3 py-2.5 md:py-3 rounded-2xl transition-all duration-300 shrink-0 ${activeTab === 'api' ? 'text-white shadow-lg font-bold scale-[1.03]' : 'text-(--text-secondary) hover:bg-(--bg-chat-hover) hover:text-(--text-primary) md:hover:translate-x-1'}`}
            style={activeTab === 'api' ? { background: `linear-gradient(to right, var(--accent), var(--accent-hover))`, boxShadow: `0 10px 15px -3px var(--accent-glow)` } : {}}
          >
            <Shield size={15} /> API
          </button>

          <div className="hidden md:block h-px bg-(--border-light) my-2 opacity-50"></div>

          <button
            onClick={() => setActiveTab('personalidades')}
            className={`flex items-center gap-3 px-3 py-2.5 md:py-3 rounded-2xl transition-all duration-300 shrink-0 ${activeTab === 'personalidades' ? 'text-white shadow-lg font-bold scale-[1.03]' : 'text-(--text-secondary) hover:bg-(--bg-chat-hover) hover:text-(--text-primary) md:hover:translate-x-1'}`}
            style={activeTab === 'personalidades' ? { background: `linear-gradient(to right, var(--accent), var(--accent-hover))`, boxShadow: `0 10px 15px -3px var(--accent-glow)` } : {}}
          >
            <User size={15} style={{ color: activeTab === 'personalidades' ? 'white' : 'var(--accent-text)' }} /> Personalidades
          </button>
          <button
            onClick={() => setActiveTab('dna')}
            className={`flex items-center gap-3 px-3 py-2.5 md:py-3 rounded-2xl transition-all duration-300 shrink-0 ${activeTab === 'dna' ? 'text-white shadow-lg font-bold scale-[1.03]' : 'text-(--text-secondary) hover:bg-(--bg-chat-hover) hover:text-(--text-primary) md:hover:translate-x-1'}`}
            style={activeTab === 'dna' ? { background: `linear-gradient(to right, var(--accent), var(--accent-hover))`, boxShadow: `0 10px 15px -3px var(--accent-glow)` } : {}}
          >
            <Zap size={15} className="text-emerald-400" /> DNA de Memória
          </button>
        </nav>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="p-4 md:p-5 flex justify-between items-center bg-(--bg-sidebar)/30 border-b border-(--border-light) backdrop-blur-md">
          <div>
            <h3 className="text-xs md:text-sm font-black uppercase tracking-[0.2em]" style={{ color: 'var(--accent-text)' }}>
              {activeTab === 'geral' ? 'Preferências de Interface' : activeTab === 'modelos' ? 'Gerenciamento de IA' : activeTab === 'api' ? 'Configurações de API' : activeTab === 'personalidades' ? 'Comportamento da IA' : 'Inteligência Coletiva Persistente'}
            </h3>
            <p className="text-[10px] md:text-xs text-(--text-secondary) mt-1">
              {activeTab === 'geral' ? 'Ajuste o visual e o layout do sistema.' : activeTab === 'modelos' ? 'Escolha quais modelos estarão disponíveis no chat.' : activeTab === 'api' ? 'Configurações de API e Chaves de Acesso.' : activeTab === 'personalidades' ? 'Defina diretrizes de instrução e perfis do sistema.' : 'DNA de Memória - Visualização e Edição de Fatos.'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-(--bg-chat-hover) rounded-xl text-(--text-placeholder) transition-colors hover:scale-105 active:scale-95 duration-200">
            <X size={20} />
          </button>
        </header>

        <div className={`flex-1 min-w-0 ${activeTab === 'dna' ? 'overflow-hidden flex flex-col bg-(--bg-sidebar)/10' : 'overflow-y-auto overflow-x-hidden p-4 md:p-5 custom-scrollbar bg-(--bg-sidebar)/10'}`}>
          {activeTab === 'geral' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">

              {/* Theme Selector */}
              <section className="space-y-4">
                <div className="flex items-center gap-3 text-(--text-primary)">
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
                        className={`flex items-center justify-between p-3 rounded-2xl border transition-all duration-300 active:scale-95 ${isSelected ? '' : 'bg-(--bg-main)/50 border-(--border-light) text-(--text-secondary) hover:border-(--border-main) hover:scale-105'}`}
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

              {/* Font Selector */}
              <section className="space-y-4">
                <div className="flex items-center gap-3 text-(--text-primary)">
                  <Type size={18} className="text-sky-400" />
                  <h4 className="text-sm font-bold">Fonte do Sistema</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {FONT_OPTIONS.map(f => {
                    const isSelected = appFont === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => onSetAppFont(f.id)}
                        style={isSelected
                          ? { fontFamily: f.stack, boxShadow: `0 0 20px var(--accent-glow)`, borderColor: 'var(--accent)', background: 'var(--accent-bg)', color: 'var(--accent-text)' }
                          : { fontFamily: f.stack }}
                        className={`flex items-center justify-between gap-2 p-3 rounded-2xl border text-left transition-all duration-300 active:scale-95 ${isSelected ? '' : 'bg-(--bg-main)/50 border-(--border-light) text-(--text-secondary) hover:border-(--border-main) hover:scale-105'}`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate">{f.name}</div>
                          <div className="text-[10px] text-(--text-placeholder) truncate">{f.desc}</div>
                          <div className="text-xs mt-1 opacity-80">Ag 123</div>
                        </div>
                        {isSelected && <Check size={16} className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Modo Retrô */}
              <section className="space-y-4">
                <div className="flex items-center gap-3 text-(--text-primary)">
                  <Gamepad2 size={18} className="text-emerald-400" />
                  <h4 className="text-sm font-bold">Aparência</h4>
                </div>
                <button
                  onClick={() => onSetRetroMode(!retroMode)}
                  className={`w-full flex items-center justify-between gap-3 p-3 rounded-2xl border transition-all duration-300 active:scale-95 ${retroMode ? '' : 'bg-(--bg-main)/50 border-(--border-light) hover:border-(--border-main)'}`}
                  style={retroMode ? { borderColor: 'var(--accent)', background: 'var(--accent-bg)', color: 'var(--accent-text)' } : {}}
                >
                  <div className="flex items-center gap-3 text-left min-w-0">
                    <Gamepad2 size={18} className="shrink-0" style={{ color: retroMode ? 'var(--accent-text)' : 'var(--text-secondary)' }} />
                    <div className="min-w-0">
                      <div className="text-sm font-bold">Modo Retrô</div>
                      <div className="text-[10px] text-(--text-placeholder) truncate">Ícones pixelados, sem degradês, balões e cantos quadrados.</div>
                    </div>
                  </div>
                  <div className={`relative w-12 h-6 rounded-full transition-all duration-300 flex items-center shrink-0 ${retroMode ? '' : 'bg-gray-600'}`} style={retroMode ? { background: 'var(--accent-hover)' } : {}}>
                    <div className={`absolute w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${retroMode ? 'left-7' : 'left-1'}`}></div>
                  </div>
                </button>
              </section>
            </div>
          )}

          {activeTab === 'modelos' && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="px-2">
                <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent-text)' }}>Motores de Inteligência Ativos</div>
                <p className="text-[11px] text-(--text-placeholder) mt-1">Use o interruptor para ativar/desativar cada modelo no chat. A <Star size={11} className="inline align-[-1px]" /> define o modelo padrão, já selecionado ao abrir um novo chat.</p>
              </div>

              {MODEL_OPTIONS.map(opt => renderModelRow(opt))}

              {/* Modelos customizados por provedor (ex.: OpenRouter) */}
              {CUSTOM_MODEL_PROVIDERS.map(provider => {
                const models = customModels.filter(m => m.provider === provider.id);
                if (models.length === 0) return null;
                return (
                  <div key={provider.id} className="space-y-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest pt-3 px-2 text-(--text-placeholder)">{provider.name}</div>
                    {models.map(m => renderModelRow({ id: m.id, name: m.name, desc: m.id }))}
                  </div>
                );
              })}

              {/* Modelo usado para organizar as memórias (DNA) */}
              <div className="pt-4 mt-2 border-t border-(--border-light)">
                <div className="flex items-center gap-2 px-2 mb-2">
                  <Zap size={14} className="text-emerald-400" />
                  <h4 className="text-sm font-bold text-(--text-primary)">Organização de memórias (DNA)</h4>
                </div>
                <p className="text-[11px] text-(--text-placeholder) px-2 mb-3">
                  Modelo usado para categorizar e conectar os fatos da memória. Deve saber responder em JSON.
                </p>
                <div className="relative px-2">
                  <select
                    value={memoryModelId}
                    onChange={(e) => onSetMemoryModelId(e.target.value)}
                    className="w-full appearance-none bg-(--bg-sidebar) border border-(--border-light) rounded-xl py-3 pl-3 pr-9 text-sm text-(--text-primary) outline-none transition-all cursor-pointer"
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = ''}
                  >
                    <optgroup label="Google AI Studio">
                      {MODEL_OPTIONS.map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </optgroup>
                    {CUSTOM_MODEL_PROVIDERS.map(provider => {
                      const models = customModels.filter(m => m.provider === provider.id);
                      if (models.length === 0) return null;
                      return (
                        <optgroup key={provider.id} label={provider.name}>
                          {models.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                  <ChevronDown size={16} className="absolute right-5 top-1/2 -translate-y-1/2 text-(--text-placeholder) pointer-events-none" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-(--text-primary)">
                    <Zap size={15} style={{ color: 'var(--accent-text)' }} />
                    <h4 className="text-sm font-bold">Configuração de APIs</h4>
                  </div>
                </div>

                <div className="bg-(--bg-main) p-4 rounded-2xl border border-(--border-light) space-y-8">
                  {/* Default API Key */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-widest">Chave de API Padrão (AI Studio)</label>
                      <div className="flex items-center gap-2">
                        {valDefaultStatus === 'loading' && <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />}
                        {valDefaultStatus === 'success' && <div className="flex items-center gap-1 text-[10px] text-green-500 font-bold bg-green-500/10 px-2 py-0.5 rounded-md"><Check className="w-3 h-3" /> ATIVA</div>}
                        {valDefaultStatus === 'error' && <div className="flex items-center gap-1 text-[10px] text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded-md"><AlertCircle className="w-3 h-3" /> ERRO</div>}
                        {valDefaultStatus === 'idle' && <div className="flex items-center gap-1 text-[10px] text-(--text-placeholder) font-bold bg-(--bg-sidebar) px-2 py-0.5 rounded-md">Padrão</div>}
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="password"
                        placeholder="Cole sua chave padrão do Google AI Studio..."
                        className="w-full bg-(--bg-sidebar) border border-(--border-light) rounded-xl py-3 px-3 text-sm text-(--text-primary) outline-none transition-all pr-24"
                        style={{ '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
                        onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                        onBlur={(e) => e.currentTarget.style.borderColor = ''}
                        value={tempDefaultKey}
                        onChange={(e) => setTempDefaultKey(e.target.value)}
                      />
                      <button
                        onClick={() => validateDefaultKey(tempDefaultKey)}
                        disabled={valDefaultStatus === 'loading' || !tempDefaultKey}
                        className="absolute right-2 top-2 bottom-2 px-3 disabled:bg-gray-600 text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                        style={{ background: 'var(--accent)' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}
                      >
                        SALVAR
                      </button>
                    </div>
                    <p className="text-[10px] text-(--text-placeholder) mt-2">
                      Esta chave padrão é usada para todos os modelos de texto, bate-papo, processamento de áudio e ferramentas da aplicação.
                    </p>
                  </div>

                  <div className="h-px bg-(--border-light) opacity-35"></div>

                  {/* Premium / Imagen API Key */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-widest">Chave de API Imagen (Premium)</label>
                      <div className="flex items-center gap-2">
                        {valPaidStatus === 'loading' && <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />}
                        {valPaidStatus === 'success' && <div className="flex items-center gap-1 text-[10px] text-green-500 font-bold bg-green-500/10 px-2 py-0.5 rounded-md"><Check className="w-3 h-3" /> ATIVA</div>}
                        {valPaidStatus === 'error' && <div className="flex items-center gap-1 text-[10px] text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded-md"><AlertCircle className="w-3 h-3" /> ERRO</div>}
                        {valPaidStatus === 'idle' && <div className="flex items-center gap-1 text-[10px] text-(--text-placeholder) font-bold bg-(--bg-sidebar) px-2 py-0.5 rounded-md">Opcional</div>}
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="password"
                        placeholder="Cole sua chave Imagen paga aqui..."
                        className="w-full bg-(--bg-sidebar) border border-(--border-light) rounded-xl py-3 px-3 text-sm text-(--text-primary) outline-none transition-all pr-24"
                        style={{ '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
                        onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                        onBlur={(e) => e.currentTarget.style.borderColor = ''}
                        value={tempPaidKey}
                        onChange={(e) => setTempPaidKey(e.target.value)}
                      />
                      <button
                        onClick={() => validatePaidKey(tempPaidKey)}
                        disabled={valPaidStatus === 'loading' || !tempPaidKey}
                        className="absolute right-2 top-2 bottom-2 px-3 disabled:bg-gray-600 text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                        style={{ background: 'var(--accent)' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}
                      >
                        SALVAR
                      </button>
                    </div>
                    <p className="text-[10px] text-(--text-placeholder) mt-2">
                      Esta chave é usada exclusivamente para geração de imagens (modelo Imagen 3/4). Se não fornecida, a geração de imagens usará a chave padrão.
                    </p>
                  </div>

                  <div className="h-px bg-(--border-light) opacity-35"></div>

                  {/* Endpoint do Modelo Local (llama.cpp) */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="flex items-center gap-2 text-[10px] font-bold text-(--text-secondary) uppercase tracking-widest">
                        <Server className="w-3.5 h-3.5" style={{ color: 'var(--accent-text)' }} />
                        Modelo Local (llama.cpp)
                      </label>
                      <div className="flex items-center gap-2">
                        {valLocalStatus === 'loading' && <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />}
                        {valLocalStatus === 'success' && <div className="flex items-center gap-1 text-[10px] text-green-500 font-bold bg-green-500/10 px-2 py-0.5 rounded-md"><Check className="w-3 h-3" /> ONLINE</div>}
                        {valLocalStatus === 'error' && <div className="flex items-center gap-1 text-[10px] text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded-md"><AlertCircle className="w-3 h-3" /> SEM RESPOSTA</div>}
                        {valLocalStatus === 'idle' && <div className="flex items-center gap-1 text-[10px] text-(--text-placeholder) font-bold bg-(--bg-sidebar) px-2 py-0.5 rounded-md">Opcional</div>}
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                        placeholder="http://localhost:8080"
                        className="w-full bg-(--bg-sidebar) border border-(--border-light) rounded-xl py-3 px-3 text-sm text-(--text-primary) outline-none transition-all pr-24"
                        onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                        onBlur={(e) => e.currentTarget.style.borderColor = ''}
                        value={tempLocalEndpoint}
                        onChange={(e) => setTempLocalEndpoint(e.target.value)}
                      />
                      <button
                        onClick={() => validateLocalEndpoint(tempLocalEndpoint)}
                        disabled={valLocalStatus === 'loading'}
                        className="absolute right-2 top-2 bottom-2 px-3 disabled:bg-gray-600 text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                        style={{ background: 'var(--accent)' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}
                      >
                        SALVAR
                      </button>
                    </div>
                    <p className="text-[10px] text-(--text-placeholder) mt-2">
                      URL do servidor do llama.cpp (<code>llama-server</code>). O padrão é <code>http://localhost:8080</code>. O app usará o endpoint compatível com OpenAI <code>/v1/chat/completions</code>. Depois é só escolher "Modelo Local" no seletor de modelos do chat.
                    </p>
                  </div>

                  <div className="h-px bg-(--border-light) opacity-35"></div>

                  {/* Provedor externo compatível com OpenAI: OpenRouter.
                      Chave de API + modelos customizados (por id) que aparecem no seletor do chat. */}
                  {([
                    { id: 'openrouter' as CustomModelProvider, temp: tempOpenRouterKey, setTemp: setTempOpenRouterKey, status: valOpenRouterStatus, onSave: validateOpenRouterKey, placeholder: 'sk-or-v1-...' },
                  ]).map(p => {
                    const meta = CUSTOM_MODEL_PROVIDERS.find(m => m.id === p.id)!;
                    const models = customModels.filter(m => m.provider === p.id);
                    const draft = modelDrafts[p.id];
                    return (
                      <React.Fragment key={p.id}>
                        {/* Chave de API do provedor */}
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <label className="flex items-center gap-2 text-[10px] font-bold text-(--text-secondary) uppercase tracking-widest">
                              <Cpu className="w-3.5 h-3.5" style={{ color: 'var(--accent-text)' }} />
                              {meta.name} — Chave de API
                            </label>
                            <div className="flex items-center gap-2">
                              {p.status === 'loading' && <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />}
                              {p.status === 'success' && <div className="flex items-center gap-1 text-[10px] text-green-500 font-bold bg-green-500/10 px-2 py-0.5 rounded-md"><Check className="w-3 h-3" /> ATIVA</div>}
                              {p.status === 'error' && <div className="flex items-center gap-1 text-[10px] text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded-md"><AlertCircle className="w-3 h-3" /> ERRO</div>}
                              {p.status === 'idle' && <div className="flex items-center gap-1 text-[10px] text-(--text-placeholder) font-bold bg-(--bg-sidebar) px-2 py-0.5 rounded-md">Opcional</div>}
                            </div>
                          </div>
                          <div className="relative">
                            <input
                              type="password"
                              spellCheck={false}
                              autoCapitalize="off"
                              autoCorrect="off"
                              placeholder={`Cole sua chave do ${meta.name} (${p.placeholder})`}
                              className="w-full bg-(--bg-sidebar) border border-(--border-light) rounded-xl py-3 px-3 text-sm text-(--text-primary) outline-none transition-all pr-24"
                              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                              onBlur={(e) => e.currentTarget.style.borderColor = ''}
                              value={p.temp}
                              onChange={(e) => p.setTemp(e.target.value)}
                            />
                            <button
                              onClick={() => p.onSave(p.temp)}
                              disabled={p.status === 'loading'}
                              className="absolute right-2 top-2 bottom-2 px-3 disabled:bg-gray-600 text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                              style={{ background: 'var(--accent)' }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-hover)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}
                            >
                              SALVAR
                            </button>
                          </div>
                          <p className="text-[10px] text-(--text-placeholder) mt-2">
                            Chave usada para os modelos do {meta.name} no chat (API compatível com OpenAI). Gere a sua em <code>{meta.keysUrl}</code>.
                          </p>
                        </div>

                        {/* Modelos customizados deste provedor */}
                        <div className="space-y-3">
                          <label className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-widest block">Modelos {meta.name} no chat</label>

                          {models.length > 0 ? (
                            <div className="space-y-2">
                              {models.map(m => (
                                <div key={m.id} className="flex items-center justify-between gap-3 bg-(--bg-sidebar) border border-(--border-light) rounded-xl px-3 py-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-(--text-primary) truncate">{m.name}</span>
                                      {m.contextLength && (
                                        <span className="shrink-0 text-[9px] font-bold text-(--text-placeholder) bg-(--bg-main) border border-(--border-light) px-1.5 py-0.5 rounded-md">{formatTokenCount(m.contextLength)} ctx</span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-(--text-placeholder) truncate font-mono">{m.id}</div>
                                  </div>
                                  <button
                                    onClick={() => removeCustomModel(m.id)}
                                    className="shrink-0 p-1.5 rounded-lg text-(--text-placeholder) hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                    title="Remover modelo"
                                    aria-label="Remover modelo"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-(--text-placeholder)">Nenhum modelo cadastrado. Adicione um id de modelo abaixo para que ele apareça no seletor do chat.</p>
                          )}

                          {/* Formulário de adição */}
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              spellCheck={false}
                              placeholder="Nome (ex.: DeepSeek R1)"
                              className="flex-1 min-w-0 bg-(--bg-sidebar) border border-(--border-light) rounded-xl py-2.5 px-3 text-sm text-(--text-primary) outline-none transition-all"
                              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                              onBlur={(e) => e.currentTarget.style.borderColor = ''}
                              value={draft.name}
                              onChange={(e) => setModelDrafts(prev => ({ ...prev, [p.id]: { ...prev[p.id], name: e.target.value } }))}
                            />
                            <input
                              type="text"
                              spellCheck={false}
                              autoCapitalize="off"
                              autoCorrect="off"
                              placeholder={`Id do modelo (ex.: ${meta.example})`}
                              className="flex-1 min-w-0 bg-(--bg-sidebar) border border-(--border-light) rounded-xl py-2.5 px-3 text-sm text-(--text-primary) outline-none transition-all font-mono"
                              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                              onBlur={(e) => e.currentTarget.style.borderColor = ''}
                              value={draft.id}
                              onChange={(e) => setModelDrafts(prev => ({ ...prev, [p.id]: { ...prev[p.id], id: e.target.value } }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') addCustomModel(p.id); }}
                            />
                            <button
                              onClick={() => addCustomModel(p.id)}
                              disabled={!draft.id.trim() || addingModel === p.id}
                              className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                              style={{ background: 'var(--accent)' }}
                              onMouseEnter={(e) => { if (draft.id.trim()) e.currentTarget.style.background = 'var(--accent-hover)'; }}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}
                            >
                              {addingModel === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Adicionar
                            </button>
                          </div>
                        </div>

                        <div className="h-px bg-(--border-light) opacity-35"></div>
                      </React.Fragment>
                    );
                  })}

                  {/* Seção de Modelos LIVE */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-widest block">Modelo LIVE Ativo</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {LIVE_MODEL_OPTIONS.map(opt => {
                        const isSelected = liveModel === opt.id;
                        return (
                          <button
                            key={opt.id}
                            onClick={() => onSetLiveModel(opt.id)}
                            className={`flex flex-col items-start p-3 rounded-2xl border text-left transition-all duration-300 active:scale-95 w-full ${isSelected ? '' : 'bg-(--bg-main)/50 border-(--border-light) text-(--text-secondary) hover:border-(--border-main) hover:scale-[1.02]'}`}
                            style={isSelected ? { boxShadow: `0 0 20px var(--accent-glow)`, borderColor: 'var(--accent)', background: 'var(--accent-bg)', color: 'var(--accent-text)' } : {}}
                          >
                            <span className="text-xs font-bold uppercase tracking-widest text-(--text-primary)">{opt.name}</span>
                            <span className="text-[10px] text-(--text-placeholder) mt-1">{opt.desc}</span>
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}></div>
      {renderContent()}
    </div>
  );
};

export default SettingsModal;
