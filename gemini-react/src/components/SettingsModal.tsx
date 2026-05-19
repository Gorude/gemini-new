import React, { useState } from 'react';
import { 
  X, 
  Settings, 
  Bot, 
  Layout, 
  Palette, 
  Check, 
  Globe,
  Monitor,
  User,
  Zap,
  Shield,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { MODEL_OPTIONS } from '../constants';

interface SettingsModalProps {
  onClose: () => void;
  theme: string;
  onSetTheme: (theme: string) => void;
  chatMargin: number;
  onSetChatMargin: (margin: number) => void;
  enabledModelIds: string[];
  onSetEnabledModelIds: (ids: string[]) => void;
  onOpenPersonalities: () => void;
  onOpenDna: () => void;
  paidApiKey: string;
  onUpdatePaidApiKey: (key: string) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  theme,
  onSetTheme,
  chatMargin,
  onSetChatMargin,
  enabledModelIds,
  onSetEnabledModelIds,
  onOpenPersonalities,
  onOpenDna,
  paidApiKey,
  onUpdatePaidApiKey
}) => {
  const [activeTab, setActiveTab] = useState<'geral' | 'modelos' | 'avancado'>('geral');
  const [valStatus, setValStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [tempKey, setTempKey] = useState(paidApiKey);

  const validateKey = async (key: string) => {
    if (!key) {
      setValStatus('idle');
      return;
    }
    setValStatus('loading');
    try {
      // Test the key with a simple models list fetch (low cost, official way to test)
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (res.ok) {
        setValStatus('success');
        onUpdatePaidApiKey(key);
      } else {
        setValStatus('error');
      }
    } catch (e) {
      setValStatus('error');
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}></div>
      
      <div className="relative w-full max-w-2xl bg-[var(--bg-sidebar)] border border-[var(--border-light)] rounded-[2rem] shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in zoom-in-95 duration-300 h-[600px]">
        
        {/* Sidebar Tabs */}
        <div className="w-full md:w-64 bg-[var(--bg-main)]/50 border-r border-[var(--border-light)] p-8 flex flex-col gap-8">
          <div className="flex items-center gap-3 px-2">
            <div className="p-2 bg-indigo-500 rounded-xl text-white shadow-lg shadow-indigo-500/20">
              <Settings size={20} />
            </div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Configurações</h2>
          </div>

          <nav className="flex flex-col gap-2">
            <button 
              onClick={() => setActiveTab('geral')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${activeTab === 'geral' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 font-bold' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)]'}`}
            >
              <Layout size={18} /> Geral
            </button>
            <button 
              onClick={() => setActiveTab('modelos')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${activeTab === 'modelos' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 font-bold' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)]'}`}
            >
              <Bot size={18} /> Modelos
            </button>
            <button 
              onClick={() => setActiveTab('avancado')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${activeTab === 'avancado' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 font-bold' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)]'}`}
            >
              <Shield size={18} /> Avançado
            </button>

            <div className="h-px bg-[var(--border-light)] my-2 opacity-50"></div>

            <button 
              onClick={() => { onClose(); onOpenPersonalities(); }}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-[var(--text-secondary)] hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)] group"
            >
              <User size={18} className="text-blue-400 group-hover:scale-110 transition-transform" /> Personalidades
            </button>
            <button 
              onClick={() => { onClose(); onOpenDna(); }}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-[var(--text-secondary)] hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)] group"
            >
              <Zap size={18} className="text-emerald-400 group-hover:scale-110 transition-transform" /> DNA de Memória
            </button>
          </nav>

          <div className="mt-auto px-4 py-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
            <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest mb-1">Dica</p>
            <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed italic">
              Desative modelos que você não usa para simplificar sua interface.
            </p>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="p-8 flex justify-between items-center bg-[var(--bg-sidebar)]/50 border-b border-[var(--border-light)]">
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-indigo-500">
                {activeTab === 'geral' ? 'Preferências de Interface' : activeTab === 'modelos' ? 'Gerenciamento de IA' : 'Configurações Avançadas'}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {activeTab === 'geral' ? 'Ajuste o visual e o layout do sistema.' : activeTab === 'modelos' ? 'Escolha quais modelos estarão disponíveis no chat.' : 'Configurações de API e Chaves de Acesso.'}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-[var(--bg-chat-hover)] rounded-xl text-[var(--text-placeholder)] transition-colors">
              <X size={20} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[var(--bg-sidebar)]/30">
            {activeTab === 'geral' && (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                
                {/* Theme Selector */}
                <section className="space-y-4">
                  <div className="flex items-center gap-3 text-[var(--text-primary)]">
                    <Palette size={18} className="text-amber-400" />
                    <h4 className="text-sm font-bold">Tema Visual</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {themes.map(t => (
                      <button 
                        key={t.id}
                        onClick={() => onSetTheme(t.id)}
                        className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${theme === t.id ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400' : 'bg-[var(--bg-main)] border-[var(--border-light)] text-[var(--text-secondary)] hover:border-[var(--border-main)]'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: t.color }}></div>
                          <span className="text-xs font-bold uppercase tracking-widest">{t.name}</span>
                        </div>
                        {theme === t.id && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                </section>

                <div className="h-px bg-[var(--border-light)]"></div>

                <section className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-[var(--text-primary)]">
                      <Monitor size={18} className="text-blue-400" />
                      <h4 className="text-sm font-bold">Margens Laterais (Desktop)</h4>
                    </div>
                    <span className="text-xs font-mono bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-lg">{chatMargin.toFixed(1)}%</span>
                  </div>
                  <div className="bg-[var(--bg-main)] p-6 rounded-2xl border border-[var(--border-light)]">
                    <input 
                      type="range" 
                      min="1" 
                      max="20" 
                      step="0.1" 
                      value={chatMargin} 
                      onChange={(e) => onSetChatMargin(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-[var(--border-light)] rounded-full appearance-none cursor-pointer accent-indigo-500"
                    />
                    <div className="flex justify-between mt-3 text-[10px] text-[var(--text-placeholder)] font-bold uppercase tracking-widest">
                      <span>Expandido</span>
                      <span>Focado</span>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'modelos' && (
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-4 px-2">Motores de Inteligência Ativos</div>
                {MODEL_OPTIONS.map(opt => (
                  <div 
                    key={opt.id}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${enabledModelIds.includes(opt.id) ? 'bg-indigo-500/5 border-indigo-500/30' : 'bg-[var(--bg-main)]/30 border-[var(--border-light)] opacity-60 grayscale-[0.5]'}`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`p-3 rounded-xl transition-colors ${enabledModelIds.includes(opt.id) ? 'bg-indigo-500 text-white' : 'bg-[var(--bg-chat-hover)] text-[var(--text-placeholder)]'}`}>
                        <Bot size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[var(--text-primary)] truncate">{opt.name}</span>
                          {opt.hasSearch && <Globe size={12} className="text-blue-400 shrink-0" />}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] truncate">{opt.desc}</p>
                      </div>
                    </div>

                    <button 
                      onClick={() => toggleModel(opt.id)}
                      className={`relative w-12 h-6 rounded-full transition-all duration-300 flex items-center shrink-0 ${enabledModelIds.includes(opt.id) ? 'bg-indigo-600' : 'bg-gray-600'}`}
                    >
                      <div className={`absolute w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${enabledModelIds.includes(opt.id) ? 'left-7' : 'left-1'}`}></div>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'avancado' && (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <section className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-[var(--text-primary)]">
                      <Zap size={18} className="text-indigo-400" />
                      <h4 className="text-sm font-bold">Configuração de APIs</h4>
                    </div>
                  </div>

                  <div className="bg-[var(--bg-main)] p-6 rounded-2xl border border-[var(--border-light)] space-y-6">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Chave de API Imagen (Paga)</label>
                        <div className="flex items-center gap-2">
                          {valStatus === 'loading' && <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />}
                          {valStatus === 'success' && <div className="flex items-center gap-1 text-[10px] text-green-500 font-bold bg-green-500/10 px-2 py-0.5 rounded-md"><Check className="w-3 h-3" /> TRABALHANDO</div>}
                          {valStatus === 'error' && <div className="flex items-center gap-1 text-[10px] text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded-md"><AlertCircle className="w-3 h-3" /> ERRO</div>}
                          {valStatus === 'idle' && <div className="flex items-center gap-1 text-[10px] text-[var(--text-placeholder)] font-bold bg-[var(--bg-sidebar)] px-2 py-0.5 rounded-md">IDLE</div>}
                        </div>
                      </div>
                      <div className="relative">
                        <input 
                          type="password"
                          placeholder="Cole sua chave Imagen paga aqui..."
                          className="w-full bg-[var(--bg-sidebar)] border border-[var(--border-light)] rounded-xl py-3 px-4 text-sm text-[var(--text-primary)] focus:border-indigo-500 outline-none transition-all pr-24"
                          value={tempKey}
                          onChange={(e) => setTempKey(e.target.value)}
                        />
                        <button 
                          onClick={() => validateKey(tempKey)}
                          disabled={valStatus === 'loading' || !tempKey}
                          className="absolute right-2 top-2 bottom-2 px-4 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-600 text-white text-[10px] font-bold rounded-lg transition-all"
                        >
                          VALIDAR
                        </button>
                      </div>
                      <p className="text-[10px] text-[var(--text-placeholder)] mt-2">
                         Esta chave será usada exclusivamente para serviços premium (Imagen 3). Os demais serviços continuam usando a chave do arquivo .env.
                      </p>
                    </div>
                  </div>
                </section>

                <div className="mt-8 p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10 space-y-2">
                  <h5 className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Armazenamento Seguro</h5>
                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed italic">
                    Sua chave é salva localmente no arquivo app-config.json e nunca é compartilhada ou enviada para outros servidores além da Google AI.
                  </p>
                </div>
              </div>
            )}
          </div>

          <footer className="p-6 bg-[var(--bg-sidebar)] border-t border-[var(--border-light)] text-center">
            <p className="text-[10px] font-bold text-[var(--text-placeholder)] uppercase tracking-widest">
              Gemoro 4.0 © 2026 | Advanced Intelligence Platform
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
