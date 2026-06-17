import React, { useState, useEffect, useRef } from 'react';
import { X, Volume2, Settings, Camera, Monitor, Zap, Minimize2, Maximize2, Send, ChevronDown, Mic, MicOff } from 'lucide-react';
import { LIVE_MODEL_OPTIONS } from '../constants';

interface LiveViewProps {
  status: 'connecting' | 'connected' | 'error' | 'disconnected';
  transcript: { role: 'user' | 'ai'; text: string }[];
  currentVoice: string;
  analyser: AnalyserNode | null;
  visionType: 'camera' | 'screen' | null;
  videoStream: MediaStream | null;
  onVoiceChange: (voice: string) => void;
  onToggleCamera: () => void;
  onToggleScreen: () => void;
  onInterrupt: () => void;
  isProactiveEnabled: boolean;
  onToggleProactive: () => void;
  onClose: () => void;
  isDetached: boolean;
  onToggleDetach: () => void;
  onSendText: (text: string) => void;
  liveModel: string;
  onSetLiveModel: (model: string) => void;
  isMicEnabled: boolean;
  onToggleMic: () => void;
}

const VOICES = ["Puck", "Charon", "Kore", "Fenrir", "Aoede"];

const BarVisualizer: React.FC<{ analyser: AnalyserNode | null }> = ({ analyser }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !analyser) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    // Usaremos as primeiras 32 bandas para as barras (frequências audíveis mais baixas/médias)
    const dataArray = new Uint8Array(bufferLength);
    let animationId: number;

    const render = () => {
      animationId = requestAnimationFrame(render);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const barCount = 24;
      const barWidth = 12;
      const barSpacing = 8;
      const totalWidth = barCount * (barWidth + barSpacing) - barSpacing;
      const startX = (canvas.width - totalWidth) / 2;
      const centerY = canvas.height / 2;

      for (let i = 0; i < barCount; i++) {
        // Efeito Espelhado: Índice mapeia do centro para as pontas
        const distFromCenter = Math.abs(i - (barCount - 1) / 2);
        const dataIndex = Math.floor(distFromCenter * 3); // Mapear para frequências
        
        const value = dataArray[dataIndex] || 0;
        const percent = value / 255;
        // Altura mínima para a barra não sumir, altura máxima baseada no som
        const barHeight = 10 + (percent * 140); 
        
        const x = startX + i * (barWidth + barSpacing);
        const y = centerY - barHeight / 2;

        // Desenhar cápsula arredondada
        ctx.save();
        ctx.globalAlpha = 0.4 + percent * 0.6;
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent-text').trim() || '#a1a1aa';
        ctx.beginPath();
        // Usando roundRect para cantos arredondados estilo cápsula
        (ctx as any).roundRect(x, y, barWidth, barHeight, barWidth / 2);
        ctx.fill();
        ctx.restore();

        // Brilho opcional para barras intensas
        if (percent > 0.5) {
          ctx.save();
          ctx.shadowBlur = 15;
          ctx.shadowColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-glow').trim() || 'rgba(161, 161, 170, 0.5)';
          ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent-text').trim() || '#a1a1aa';
          ctx.fill();
          ctx.restore();
        }
      }
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [analyser]);

  return (
    <canvas 
      ref={canvasRef} 
      width={800} 
      height={300} 
      className="w-full h-full max-h-[300px]"
    />
  );
};

const MiniVisualizer: React.FC<{ analyser: AnalyserNode | null }> = ({ analyser }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !analyser) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let animationId: number;

    const render = () => {
      animationId = requestAnimationFrame(render);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const barCount = 12;
      const barWidth = 6;
      const barSpacing = 4;
      const totalWidth = barCount * (barWidth + barSpacing) - barSpacing;
      const startX = (canvas.width - totalWidth) / 2;
      const centerY = canvas.height / 2;

      for (let i = 0; i < barCount; i++) {
        const distFromCenter = Math.abs(i - (barCount - 1) / 2);
        const dataIndex = Math.floor(distFromCenter * 3);
        const value = dataArray[dataIndex] || 0;
        const percent = value / 255;
        const barHeight = 6 + (percent * 50); 
        
        const x = startX + i * (barWidth + barSpacing);
        const y = centerY - barHeight / 2;

        ctx.save();
        ctx.globalAlpha = 0.5 + percent * 0.5;
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent-text').trim() || '#a1a1aa';
        ctx.beginPath();
        (ctx as any).roundRect(x, y, barWidth, barHeight, barWidth / 2);
        ctx.fill();
        ctx.restore();
      }
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [analyser]);

  return (
    <canvas 
      ref={canvasRef} 
      width={120} 
      height={80} 
      className="w-full h-full max-w-[120px] max-h-[80px]"
    />
  );
};

const LiveView: React.FC<LiveViewProps> = ({ 
  status, 
  transcript, 
  currentVoice, 
  analyser,
  visionType,
  videoStream,
  onVoiceChange,
  onToggleCamera,
  onToggleScreen,
  isProactiveEnabled,
  onToggleProactive,
  onClose,
  isDetached,
  onToggleDetach,
  onSendText,
  liveModel,
  onSetLiveModel,
  isMicEnabled,
  onToggleMic
}) => {
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [inputText, setInputText] = useState('');
  const positionRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest('button') || 
      (e.target as HTMLElement).closest('input')
    ) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX - positionRef.current.x, y: e.clientY - positionRef.current.y };
    document.body.style.userSelect = 'none';
    if (dragRef.current) {
      dragRef.current.style.setProperty('transition', 'none', 'important');
      dragRef.current.style.setProperty('animation', 'none', 'important');
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newX = e.clientX - dragStart.current.x;
      const newY = e.clientY - dragStart.current.y;
      positionRef.current = { x: newX, y: newY };
      if (dragRef.current) {
        dragRef.current.style.transform = `translate(${newX}px, ${newY}px)`;
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.userSelect = '';
        if (dragRef.current) {
          dragRef.current.style.removeProperty('transition');
          dragRef.current.style.removeProperty('animation');
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      if (dragRef.current) {
        dragRef.current.style.removeProperty('transition');
        dragRef.current.style.removeProperty('animation');
      }
    };
  }, []);

  const handleToggleVoiceMenu = () => {
    setShowVoiceMenu(!showVoiceMenu);
    setShowModelMenu(false);
  };

  const handleToggleModelMenu = () => {
    setShowModelMenu(!showModelMenu);
    setShowVoiceMenu(false);
  };

  const handleSendText = () => {
    if (inputText.trim()) {
      onSendText(inputText.trim());
      setInputText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSendText();
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  if (isDetached) {
    return (
      <div 
        ref={dragRef}
        style={{ 
          position: 'fixed', 
          bottom: '100px', 
          right: '24px', 
          transform: `translate(${positionRef.current.x}px, ${positionRef.current.y}px)`,
          zIndex: 100 
        }}
        className="w-[320px] rounded-[24px] bg-[#111111]/90 backdrop-blur-xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col animate-in slide-in-from-bottom-5 duration-300 select-none"
      >
        {/* Header (Drag Handle) */}
        <div 
          onMouseDown={handleMouseDown}
          className="px-4 py-3 bg-white/5 border-b border-white/5 flex justify-between items-center cursor-move"
        >
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`}></div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-primary)]">Modo LIVE</span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={onToggleDetach}
              className="p-1.5 hover:bg-white/5 rounded-lg text-[var(--text-secondary)] hover:text-white transition"
              title="Expandir tela"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-white/5 rounded-lg text-[var(--text-secondary)] hover:text-red-400 transition"
              title="Encerrar LIVE"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Visualizer / Video Preview */}
        <div className="p-4 pb-2">
          <div className="h-24 bg-black/40 rounded-2xl overflow-hidden flex items-center justify-center relative border border-white/5">
            {visionType && videoStream ? (
              <>
                <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/50 backdrop-blur-md rounded text-[8px] font-bold text-white uppercase tracking-widest z-10 flex items-center gap-1">
                  <div className="w-1 h-1 bg-red-500 rounded-full animate-pulse"></div>
                  {visionType === 'camera' ? 'Webcam' : 'Monitor'}
                </div>
                <video 
                  autoPlay 
                  muted 
                  playsInline 
                  ref={(el) => {
                    if (el && videoStream) {
                      el.srcObject = videoStream;
                    }
                  }}
                  className="w-full h-full object-cover"
                />
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center p-2">
                {status === 'connected' ? (
                  <MiniVisualizer analyser={analyser} />
                ) : (
                  <Volume2 className="w-6 h-6 text-white/20 animate-pulse" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Controls and Input */}
        <div className="p-4 pt-0 flex flex-col gap-3">
          {/* Controls Bar */}
          <div className="flex justify-between items-center bg-white/5 p-1 rounded-xl border border-white/5">
            <div className="flex gap-0.5">
              <button 
                onClick={onToggleMic}
                className={`p-2 rounded-lg transition ${isMicEnabled ? 'bg-[var(--accent)] text-white shadow-md' : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-white'}`}
                title={isMicEnabled ? "Desativar Microfone" : "Ativar Microfone"}
              >
                {isMicEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-red-400" />}
              </button>
              <button 
                onClick={onToggleCamera}
                className={`p-2 rounded-lg transition ${visionType === 'camera' ? 'bg-green-600/90 text-white shadow-md' : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-white'}`}
                title="Câmera"
              >
                <Camera className="w-4 h-4" />
              </button>
              <button 
                onClick={onToggleScreen}
                className={`p-2 rounded-lg transition ${visionType === 'screen' ? 'bg-green-600/90 text-white shadow-md' : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-white'}`}
                title="Compartilhar Tela"
              >
                <Monitor className="w-4 h-4" />
              </button>
              <button 
                onClick={onToggleProactive}
                className={`p-2 rounded-lg transition ${isProactiveEnabled ? 'bg-[var(--accent)] text-white shadow-md' : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-white'}`}
                title="Proatividade"
              >
                <Zap className="w-4 h-4" />
              </button>
            </div>

            {/* Model selection between proactivity (Zap) and settings (Settings) */}
            <div className="relative model-menu-container">
              <button 
                onClick={handleToggleModelMenu}
                className={`px-2 py-1 text-[10px] font-semibold rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] hover:text-white transition flex items-center gap-1`}
                title="Modelo LIVE"
              >
                <span>{liveModel === 'gemini-2.5-flash-live' ? '2.5 Live' : '3.1 Live'}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
              {showModelMenu && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-[var(--bg-sidebar-solid)] border border-[var(--border-light)] rounded-xl p-1 min-w-[150px] shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  {LIVE_MODEL_OPTIONS.map(opt => (
                    <button 
                      key={opt.id}
                      onClick={() => { 
                        onSetLiveModel(opt.id); 
                        setShowModelMenu(false); 
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded-lg transition ${liveModel === opt.id ? 'bg-[var(--accent-bg)] text-[var(--accent-text)] font-bold' : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'}`}
                    >
                      <div className="text-[10px] font-semibold text-[var(--text-primary)]">{opt.name === 'Gemini 2.5 Flash Live' ? '2.5 Live' : '3.1 Live'}</div>
                      <div className="text-[8px] text-[var(--text-placeholder)] mt-0.5 leading-tight">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button 
                onClick={handleToggleVoiceMenu}
                className={`p-2 rounded-lg transition ${showVoiceMenu ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-white'}`}
                title="Voz"
              >
                <Settings className="w-4 h-4" />
              </button>
              {showVoiceMenu && (
                <div className="absolute right-0 bottom-full mb-2 bg-[var(--bg-sidebar-solid)] border border-[var(--border-light)] rounded-xl p-1 min-w-[120px] shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  {VOICES.map(v => (
                    <button 
                      key={v}
                      onClick={() => { onVoiceChange(v); setShowVoiceMenu(false); }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] transition ${currentVoice === v ? 'bg-[var(--accent-bg)] text-[var(--accent-text)] font-bold' : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Text input to speak to the Live session */}
          <div className="relative flex items-center">
            <input 
              type="text"
              placeholder="Fale por texto com o Nemon..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-4 pr-10 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-border)] transition"
            />
            <button 
              onClick={handleSendText}
              disabled={!inputText.trim()}
              className={`absolute right-1.5 p-1.5 rounded-lg transition ${inputText.trim() ? 'bg-[var(--accent)] text-white hover:scale-105' : 'text-[var(--text-placeholder)] cursor-not-allowed'}`}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden animate-in fade-in zoom-in-95 duration-700">
      
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full blur-[120px] animate-pulse" style={{ backgroundColor: 'var(--accent)' }}></div>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full blur-[120px] animate-pulse delay-1000" style={{ backgroundColor: 'var(--glow-active)' }}></div>
      </div>

      {/* Live Controls (Floating) */}
      <div className="absolute top-6 right-6 z-20 flex gap-2">
        <div className="relative">
          <button 
            onClick={handleToggleVoiceMenu}
            className={`p-3 rounded-2xl transition shadow-xl border ${showVoiceMenu ? 'bg-[var(--accent)] border-[var(--accent-border)] text-white' : 'bg-[var(--bg-sidebar)] border-[var(--border-light)] text-[var(--text-secondary)] hover:text-white'}`}
          >
            <Settings className="w-5 h-5" />
          </button>
          
          {showVoiceMenu && (
            <div className="absolute right-0 top-full mt-3 bg-[var(--bg-sidebar)] border border-[var(--border-light)] rounded-2xl p-2 min-w-[160px] shadow-2xl z-30 animate-in fade-in slide-in-from-top-2 duration-200">
              <p className="text-[10px] font-bold text-[var(--text-placeholder)] px-3 py-2 uppercase tracking-widest">Selecionar Voz</p>
              {VOICES.map(v => (
                <button 
                  key={v}
                  onClick={() => { onVoiceChange(v); setShowVoiceMenu(false); }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition ${currentVoice === v ? 'bg-[var(--accent-bg)] text-[var(--accent-text)] font-bold' : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
        
        <button 
          onClick={onToggleMic}
          className={`p-3 rounded-2xl transition shadow-xl border ${isMicEnabled ? 'bg-[var(--accent)] border-[var(--accent-border)] text-white shadow-[var(--accent-glow)]' : 'bg-[var(--bg-sidebar)] border-[var(--border-light)] text-[var(--text-secondary)] hover:text-white'}`}
          title={isMicEnabled ? "Desativar Microfone" : "Ativar Microfone"}
        >
          {isMicEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5 text-red-400" />}
        </button>
        
        <button 
          onClick={onToggleCamera}
          className={`p-3 rounded-2xl transition shadow-xl border ${visionType === 'camera' ? 'bg-green-600 border-green-400 text-white shadow-green-500/20' : 'bg-[var(--bg-sidebar)] border-[var(--border-light)] text-[var(--text-secondary)] hover:text-white'}`}
          title="Ativar Câmera"
        >
          <Camera className="w-5 h-5" />
        </button>
 
        <button 
          onClick={onToggleScreen}
          className={`p-3 rounded-2xl transition shadow-xl border ${visionType === 'screen' ? 'bg-green-600 border-green-400 text-white shadow-green-500/20' : 'bg-[var(--bg-sidebar)] border-[var(--border-light)] text-[var(--text-secondary)] hover:text-white'}`}
          title="Compartilhar Tela"
        >
          <Monitor className="w-5 h-5" />
        </button>

        <button 
          onClick={onToggleProactive}
          className={`p-3 rounded-2xl transition shadow-xl border ${isProactiveEnabled ? 'bg-[var(--accent)] border-[var(--accent-border)] text-white shadow-[var(--accent-glow)]' : 'bg-[var(--bg-sidebar)] border-[var(--border-light)] text-[var(--text-secondary)] hover:text-white'}`}
          title={isProactiveEnabled ? "Desativar Proatividade" : "Ativar Proatividade"}
        >
          <Zap className={`w-5 h-5 ${isProactiveEnabled ? 'animate-pulse' : ''}`} />
        </button>

        <button 
          onClick={onToggleDetach}
          className="p-3 bg-[var(--bg-sidebar)] border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-white rounded-2xl transition shadow-xl"
          title="Destacar para popup (PIP)"
        >
          <Minimize2 className="w-5 h-5" />
        </button>

        <button 
          onClick={onClose}
          className="p-3 bg-[var(--bg-sidebar)] border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-red-400 hover:border-red-500/30 rounded-2xl transition shadow-xl"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="absolute top-6 left-6 z-20 flex items-center gap-3 bg-[var(--bg-sidebar)]/50 backdrop-blur-md px-4 py-2 rounded-2xl border border-[var(--border-light)]">
        <div className={`w-2.5 h-2.5 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]'}`}></div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-primary)]">
          Modo LIVE Conectado
        </span>
      </div>

      {/* Central Visualizer */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl relative z-10">
        {status === 'connecting' ? (
          <div className="flex flex-col items-center gap-8 w-full max-w-sm">
            <div className="w-24 h-24 rounded-full bg-[var(--accent-bg)] flex items-center justify-center text-[var(--accent-text)] animate-pulse relative">
                <div className="absolute inset-0 rounded-full border-4 border-[var(--accent-border)] animate-spin" style={{ borderTopColor: 'var(--accent-text)' }}></div>
                <Volume2 className="w-8 h-8" />
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                <div className="absolute inset-y-0 bg-[var(--accent)] animate-loading-bar shadow-[0_0_15px_var(--accent-glow)]"></div>
            </div>
            <div className="flex flex-col items-center gap-2">
                <p className="text-xl font-bold text-white tracking-tight">Sincronizando com DNA</p>
                <p className="text-sm text-white/40 animate-pulse">Estabelecendo conexão neural segura...</p>
            </div>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center justify-between h-full py-12">
            
            <div className="flex-1 flex items-center justify-center relative w-full overflow-hidden">
              {status === 'connected' ? (
                <BarVisualizer analyser={analyser} />
              ) : (
                <div className="w-48 h-48 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <Volume2 className="w-12 h-12 text-white/20" />
                </div>
              )}

              {/* Picture-in-Picture Preview */}
              {visionType && (
                <div className="absolute bottom-4 right-4 w-48 h-auto aspect-video bg-black rounded-xl border-2 border-green-500/50 overflow-hidden shadow-2xl animate-in slide-in-from-right-4 duration-300">
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/50 backdrop-blur-md rounded text-[8px] font-bold text-white uppercase tracking-widest z-10 flex items-center gap-1">
                    <div className="w-1 h-1 bg-red-500 rounded-full animate-pulse"></div>
                    {visionType === 'camera' ? 'Webcam' : 'Monitor'}
                  </div>
                  <video 
                    autoPlay 
                    muted 
                    playsInline 
                    ref={(el) => {
                      if (el && videoStream) {
                        el.srcObject = videoStream;
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                  {/* Nota: O preview real requer acesso ao stream. 
                      Para fins de demonstração imediata, o GeminiLiveSession já está enviando os dados. */}
                </div>
              )}
            </div>

            {/* Subtitles Area */}
            <div 
              ref={scrollRef}
              className="w-full max-w-2xl h-48 overflow-y-auto custom-scrollbar space-y-4 p-6 bg-white/5 rounded-[32px] border border-white/10 backdrop-blur-sm self-center mt-8"
            >
              {transcript.length === 0 && (
                <div className="h-full flex items-center justify-center">
                  <p className="text-[var(--text-placeholder)] italic text-sm text-center">Inicie uma conversa por voz ou texto...</p>
                </div>
              )}
              {transcript.map((line, i) => (
                <div key={i} className={`flex ${line.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                  <div className={`max-w-[85%] px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-lg ${line.role === 'user' ? 'bg-[var(--bg-user-bubble)] text-white font-medium' : 'bg-white/10 text-[var(--text-primary)] border border-white/5'}`}>
                    {line.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveView;
