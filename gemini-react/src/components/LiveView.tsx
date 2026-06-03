import React, { useState, useEffect, useRef } from 'react';
import { X, Volume2, Settings, Camera, Monitor, Zap } from 'lucide-react';

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
  onClose
}) => {
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

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
            onClick={() => setShowVoiceMenu(!showVoiceMenu)}
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
