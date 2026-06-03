import React from 'react';
import { Headphones, Sparkles, User, Loader2 } from 'lucide-react';

interface LiveSetupModalProps {
  onClose: () => void;
  onConfirm: (useMemory: boolean) => void;
  isConnecting: boolean;
}

const LiveSetupModal: React.FC<LiveSetupModalProps> = ({ onClose, onConfirm, isConnecting }) => {
  const [useMemory, setUseMemory] = React.useState(true);

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[120] p-4 backdrop-blur-xl animate-in fade-in duration-500">
      <div className="bg-[#111111] w-full max-w-[380px] rounded-2xl overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] flex flex-col relative animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-10 pb-6 text-center">
          <div className="w-24 h-24 rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-400 mx-auto mb-8 shadow-inner">
            <Headphones className="w-12 h-12" />
          </div>
          <h3 className="text-2xl font-semibold text-white mb-2">Modo Live</h3>
          <p className="text-[13px] text-white/50 leading-relaxed max-w-[240px] mx-auto">
            Converse naturalmente por voz e compartilhe sua visão em tempo real.
          </p>
        </div>

        {/* Content */}
        <div className="px-10 pb-10 space-y-8">
          <div 
            onClick={() => setUseMemory(!useMemory)}
            className={`p-5 rounded-xl transition-all cursor-pointer flex items-center gap-5 ${useMemory ? 'bg-zinc-800/80 border border-zinc-700/50' : 'bg-white/5 hover:bg-white/10'}`}
          >
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center transition-all ${useMemory ? 'bg-zinc-700 text-white shadow-lg shadow-black/30' : 'bg-white/10 text-white/30'}`}>
              <User className="w-6 h-6" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-[15px] font-medium text-white flex justify-between items-center">
                Lembrar de mim
                <div className={`w-9 h-5 rounded-full relative transition-colors duration-300 ${useMemory ? 'bg-zinc-600' : 'bg-white/20'}`}>
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300 ${useMemory ? 'left-5' : 'left-1'}`}></div>
                </div>
              </div>
              <p className="text-[12px] text-white/40 mt-1 leading-snug">
                Usa suas preferências e fatos salvos para uma conversa pessoal.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              disabled={isConnecting}
              onClick={() => onConfirm(useMemory)}
              className="w-full py-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2 shadow-xl shadow-black/40 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Conectando...
                </>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Começar agora
                </span>
              )}
            </button>
            <button 
              disabled={isConnecting}
              onClick={onClose}
              className="w-full py-3 text-[13px] font-medium text-white/30 hover:text-white/60 transition-colors disabled:opacity-20"
            >
              Agora não
            </button>
          </div>
        </div>

        {isConnecting && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
            <div className="h-full bg-[var(--accent)] animate-[loading-bar_2s_ease-in-out_infinite] shadow-[0_0_10px_var(--accent-glow)]"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveSetupModal;
