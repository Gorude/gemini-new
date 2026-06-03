import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  Globe, 
  Lightbulb, 
  Image, 
  ChevronDown, 
  Send, 
  X, 
  FileText,
  Headphones,
  Square
} from 'lucide-react';
import { MODEL_OPTIONS, IMAGEN_OPTIONS } from '../constants';
import { type PendingFile } from '../types';

interface ChatInputProps {
  isLoading: boolean;
  webSearchEnabled: boolean;
  thinkingEnabled: boolean;
  imageGenEnabled: boolean;
  isLiveSpeaking: boolean;
  model: string;
  imagenModel: string;
  aspectRatio: '1:1' | '9:16' | '16:9';
  canSearch: boolean;
  showScrollButton: boolean;
  margin: number;
  personalityName: string;
  onSend: (text: string, files: PendingFile[]) => void;
  onStartLive: () => void;
  isLiveActive: boolean;
  onToggleWebSearch: () => void;
  onToggleThinking: () => void;
  onToggleImageGen: () => void;
  onStop: () => void;
  onInterrupt: () => void;
  onSetModel: (id: string) => void;
  onSetImagenModel: (id: string) => void;
  onSetAspectRatio: (ratio: '1:1' | '9:16' | '16:9') => void;
  onScrollToBottom: () => void;
  enabledModelIds: string[];
}

const ChatInput: React.FC<ChatInputProps> = ({
  isLoading,
  webSearchEnabled,
  thinkingEnabled,
  imageGenEnabled,
  isLiveSpeaking,
  model,
  imagenModel,
  aspectRatio,
  canSearch,
  showScrollButton,
  margin,
  personalityName,
  onSend,
  onStartLive,
  isLiveActive,
  onToggleWebSearch,
  onToggleThinking,
  onToggleImageGen,
  onStop,
  onInterrupt,
  onSetModel,
  onSetImagenModel,
  onSetAspectRatio,
  onScrollToBottom,
  enabledModelIds
}) => {
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [showImagenSettings, setShowImagenSettings] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // Click/touch outside to close model selector menu
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      if (
        isModelMenuOpen &&
        modelMenuRef.current &&
        !modelMenuRef.current.contains(event.target as Node)
      ) {
        setIsModelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isModelMenuOpen]);


  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleInternalSend();
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      setPendingFiles(prev => [...prev, { name: file.name, data: base64, mimeType: file.type }]);
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;
    Array.from(selectedFiles).forEach(processFile);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
          processFile(file);
        }
      }
    }
  };

  const handleInternalSend = () => {
    if ((!input.trim() && pendingFiles.length === 0) || isLoading) return;
    onSend(input, pendingFiles);
    setInput('');
    setPendingFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  return (
    <footer 
      className="p-4 bg-[var(--bg-main)] relative chat-container-responsive"
      style={{ 
        paddingLeft: `calc(${margin}% + 1rem)`, 
        paddingRight: `calc(${margin}% + 1rem)` 
      }}
    >
      <div className="w-full">
        {pendingFiles.length > 0 && (
          <div className="flex gap-2 mb-2 px-2 flex-wrap">
            {pendingFiles.map((f, i) => (
              <div key={i} className="relative w-16 h-16 rounded-xl bg-[var(--bg-chat-active)] overflow-hidden border border-[var(--border-light)] shadow-lg group">
                {f.mimeType.startsWith('image/') ? (
                  <img src={`data:${f.mimeType};base64,${f.data}`} className="object-cover w-full h-full" alt="pendente" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-[9px] p-1 text-center bg-[var(--bg-sidebar)] text-[var(--text-secondary)]">
                    <FileText className="w-4 h-4 mb-1" style={{ color: 'var(--accent-text)' }} />
                    <span className="truncate w-full">{f.name}</span>
                  </div>
                )}
                <button onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-black/60 rounded-bl-lg w-5 h-5 flex items-center justify-center hover:bg-black transition text-[var(--text-primary)]">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className={`input-wrapper p-3 shadow-2xl relative bg-[var(--bg-input)] rounded-[24px] border transition-all duration-500 ${isLoading ? 'generating-glow' : isLiveActive ? 'border-zinc-500 shadow-[0_0_20px_rgba(255,255,255,0.15)]' : 'border-[var(--border-light)]'}`} style={isLoading ? { borderColor: 'color-mix(in srgb, var(--accent) 50%, transparent)', boxShadow: '0 0 15px var(--accent-glow)' } : {}}>
          {showScrollButton && (
            <button 
              onClick={onScrollToBottom}
              className="absolute -top-14 left-1/2 -translate-x-1/2 bg-[var(--bg-sidebar)] hover:bg-[var(--bg-chat-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)] shadow-xl rounded-full px-5 py-1.5 text-xs font-semibold flex items-center gap-2 hover-glow scroll-to-bottom-btn animate-scroll-button whitespace-nowrap"
            >
               <ChevronDown className="w-4 h-4 animate-bounce" />
              Ir para o final
            </button>
          )}
          
          <textarea 
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1} 
            placeholder={`Pergunte ao Nemon${personalityName !== 'Normal' ? ` - ${personalityName}` : ''}...`} 
            className="w-full bg-transparent border-none px-4 pt-2 pb-1 focus:outline-none resize-none text-[16px] text-[var(--text-primary)] placeholder-gray-500/70 overflow-hidden"
          />
          
          <div className="flex flex-wrap justify-between items-center px-1 sm:px-2 mt-2 gap-2">
            <div className="flex gap-0.5 sm:gap-1 text-[var(--text-secondary)] items-center">
              <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,application/pdf" onChange={handleFileUpload} />
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)] rounded-full transition-all hover:scale-110 active:scale-95 duration-200"
                title="Anexar arquivo"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <button 
                onClick={onToggleWebSearch} 
                disabled={!canSearch}
                className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95 duration-200 relative ${webSearchEnabled ? 'border' : 'hover:bg-[var(--bg-chat-hover)] text-[var(--text-placeholder)]'} disabled:opacity-20 disabled:grayscale`}
                style={webSearchEnabled ? { background: 'var(--accent-bg)', color: 'var(--accent-text)', borderColor: 'var(--accent-border)' } : {}}
                title={canSearch ? "Pesquisa na Web" : "Modelo não suporta pesquisa"}
              >
                <Globe className="w-4 h-4 sm:w-5 sm:h-5" />
                {webSearchEnabled && <span className="absolute top-1 right-1 sm:top-2 sm:right-2 w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full animate-pulse" style={{ background: 'var(--accent-text)', boxShadow: '0 0 8px var(--accent-glow)' }}></span>}
              </button>

              <button 
                onClick={onToggleThinking} 
                className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95 duration-200 relative ${thinkingEnabled ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'hover:bg-[var(--bg-chat-hover)] text-[var(--text-placeholder)]'}`}
                title="Pensamento (a IA raciocina antes de responder)"
              >
                <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5" />
                {thinkingEnabled && <span className="absolute top-1 right-1 sm:top-2 sm:right-2 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-amber-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]"></span>}
              </button>

              <button 
                onClick={onStartLive}
                className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95 duration-200 relative ${isLiveActive ? 'bg-zinc-700/20 text-zinc-300 animate-pulse border border-zinc-600/30' : 'hover:bg-[var(--bg-chat-hover)] text-[var(--text-placeholder)]'}`}
                title={isLiveActive ? "Modo LIVE Ativo" : "Iniciar Modo LIVE"}
              >
                <Headphones className="w-4 h-4 sm:w-5 sm:h-5" />
                {isLiveActive && <span className="absolute top-1 right-1 sm:top-2 sm:right-2 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-zinc-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.4)]"></span>}
              </button>

              <div className="relative">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleImageGen();
                    if (!imageGenEnabled) setShowImagenSettings(true);
                  }} 
                  className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95 duration-200 relative ${imageGenEnabled ? 'bg-zinc-700/20 text-zinc-300 border border-zinc-600/30' : 'hover:bg-[var(--bg-chat-hover)] text-[var(--text-placeholder)]'}`}
                  title="Geração de Imagem (Imagen 4)"
                >
                  <Image className="w-4 h-4 sm:w-5 sm:h-5" />
                  {imageGenEnabled && <span className="absolute top-1 right-1 sm:top-2 sm:right-2 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-zinc-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.4)]"></span>}
                </button>

                {imageGenEnabled && showImagenSettings && (
                  <div onClick={(e) => e.stopPropagation()} className="absolute bottom-full mb-3 left-0 bg-[var(--bg-sidebar)]/95 backdrop-blur-2xl shadow-2xl rounded-3xl p-4 min-w-[280px] z-50 border border-[var(--border-light)] animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Imagen 4 Config</h4>
                      <button onClick={() => setShowImagenSettings(false)} className="text-[var(--text-placeholder)] hover:text-white"><X className="w-4 h-4" /></button>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-[var(--text-placeholder)] mb-2 block">Modelo</label>
                        <div className="grid gap-2">
                          {IMAGEN_OPTIONS.map(opt => (
                            <button key={opt.id} onClick={() => onSetImagenModel(opt.id)} className={`text-left p-3 rounded-2xl border transition-all text-sm ${imagenModel === opt.id ? 'bg-zinc-700/20 border-zinc-600 text-zinc-200 shadow-[0_0_12px_rgba(255,255,255,0.08)] font-bold' : 'bg-black/20 border-transparent hover:border-white/10 hover:bg-black/35'}`}>
                              <div className="font-semibold text-xs">{opt.name}</div>
                              <div className="text-[10px] opacity-60 truncate">{opt.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-[var(--text-placeholder)] mb-2 block">Proporção (Aspect Ratio)</label>
                        <div className="flex gap-2">
                          {(['1:1', '9:16', '16:9'] as const).map(ratio => (
                            <button key={ratio} onClick={() => onSetAspectRatio(ratio)} className={`flex-1 py-2.5 rounded-xl border text-[10px] font-bold transition-all ${aspectRatio === ratio ? 'bg-zinc-700/20 border-zinc-500 text-zinc-200 shadow-[0_0_10px_rgba(255,255,255,0.05)]' : 'bg-black/20 border-transparent hover:border-white/10'}`}>
                              {ratio === '1:1' ? 'QUADRADO' : ratio === '9:16' ? 'RETRATO' : 'PAISAGEM'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative flex items-center">
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsModelMenuOpen(!isModelMenuOpen); }}
                  className="flex items-center gap-1 sm:gap-1.5 bg-[var(--bg-chat-hover)] hover:bg-[var(--bg-user-bubble)] hover:scale-105 active:scale-95 text-[10px] sm:text-xs text-[var(--text-primary)] transition-all rounded-xl px-2.5 py-2 sm:px-4 sm:py-2.5 font-medium border border-[var(--border-light)] shadow-sm whitespace-nowrap"
                >
                  <span className="truncate max-w-[65px] xs:max-w-[100px] sm:max-w-none">
                    {MODEL_OPTIONS.find(o => o.id === model)?.name || 'Padrão'} 
                  </span>
                  <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 ml-0.5 opacity-60 shrink-0" />
                </button>
                
                {isModelMenuOpen && (
                  <div 
                    ref={modelMenuRef}
                    className="absolute bottom-[115%] right-0 bg-[var(--bg-sidebar-solid)] border border-[var(--border-light)] shadow-2xl rounded-2xl py-2 min-w-64 z-50 overflow-hidden flex flex-col items-start origin-bottom-right animate-in fade-in zoom-in-95 duration-200 max-sm:fixed max-sm:bottom-28 max-sm:left-4 max-sm:right-4 max-sm:w-[calc(100vw-32px)] max-sm:min-w-0"
                  >
                    {MODEL_OPTIONS.filter(opt => enabledModelIds.includes(opt.id)).map(opt => (
                      <button key={opt.id} onClick={() => { onSetModel(opt.id); setIsModelMenuOpen(false); }} className={`w-full flex flex-col px-5 py-3 hover:bg-white/5 transition text-left ${model === opt.id ? 'font-bold' : ''}`} style={model === opt.id ? { background: 'var(--accent-bg)', color: 'var(--accent-text)' } : {}}>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{opt.name}</span>
                          {opt.hasSearch && <Globe className="w-3.5 h-3.5 opacity-40" style={{ color: 'var(--accent-text)' }} />}
                        </div>
                        <span className="text-[11px] text-[var(--text-placeholder)]">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button 
                onClick={isLoading ? onStop : isLiveSpeaking ? onInterrupt : handleInternalSend} 
                disabled={!isLoading && !isLiveSpeaking && !input.trim() && pendingFiles.length === 0} 
                className={`p-2 sm:p-2.5 rounded-xl transition-all hover:scale-110 active:scale-95 shadow-lg ${
                  !isLoading && !isLiveSpeaking && !input.trim() && pendingFiles.length === 0 
                    ? 'bg-[var(--bg-chat-hover)] text-[var(--text-placeholder)] cursor-not-allowed' 
                    : (isLoading || isLiveSpeaking)
                      ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-500/20' 
                      : 'text-white shadow-lg'
                }`}
                style={!isLoading && !isLiveSpeaking && (input.trim() || pendingFiles.length > 0) ? { background: 'var(--accent)', boxShadow: '0 10px 15px -3px var(--accent-glow)' } : {}}
              >
                {isLoading || isLiveSpeaking ? <Square className="w-4 h-4 sm:w-5 sm:h-5 fill-current" /> : <Send className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default ChatInput;
