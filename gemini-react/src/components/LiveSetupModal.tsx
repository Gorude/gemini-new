import React from 'react';
import { Headphones, Zap, Brain, Rocket, Loader2 } from 'lucide-react';

interface LiveSetupModalProps {
  onClose: () => void;
  onConfirm: (useMemory: boolean) => void;
  isConnecting: boolean;
}

const LiveSetupModal: React.FC<LiveSetupModalProps> = ({ onClose, onConfirm, isConnecting }) => {
  const [useMemory, setUseMemory] = React.useState(true);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[120] p-4 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-[#1e1f20] w-full max-w-md rounded-[32px] border border-white/10 overflow-hidden shadow-2xl flex flex-col relative animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-8 pb-4 text-center">
          <div className="w-20 h-20 rounded-3xl bg-blue-600/20 flex items-center justify-center text-blue-400 mx-auto mb-6 shadow-xl shadow-blue-500/10">
            <Headphones className="w-10 h-10" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">Iniciar Modo LIVE</h3>
          <p className="text-sm text-white/40">Prepare sua sessão Multimodal de voz e visão</p>
        </div>

        {/* Content */}
        <div className="p-8 pt-4 space-y-6">
          <div className="space-y-4">
            <div 
              onClick={() => setUseMemory(!useMemory)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 ${useMemory ? 'bg-blue-600/10 border-blue-500/50' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${useMemory ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/40'}`}>
                <Brain className="w-6 h-6" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-bold text-white flex justify-between items-center">
                  Habilitar Memória DNA
                  <div className={`w-10 h-5 rounded-full relative transition-colors ${useMemory ? 'bg-blue-600' : 'bg-white/20'}`}>
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${useMemory ? 'left-6' : 'left-1'}`}></div>
                  </div>
                </div>
                <p className="text-[11px] text-white/40 mt-1">O Gemoro usará seus fatos salvos para personificar a conversa.</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-start gap-4 italic">
              <Zap className="w-5 h-5 text-amber-400 mt-1 shrink-0" />
              <p className="text-[11px] text-white/60 leading-relaxed">
                As tags de memória XML serão processadas silenciosamente. O Gemoro não lerá os comandos de sistema em voz alta.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <button 
              disabled={isConnecting}
              onClick={() => onConfirm(useMemory)}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  CONECTANDO...
                </>
              ) : (
                <>
                  <Rocket className="w-5 h-5" />
                  INICIAR AGORA
                </>
              )}
            </button>
            <button 
              disabled={isConnecting}
              onClick={onClose}
              className="w-full py-4 text-xs font-bold text-white/40 hover:text-white transition disabled:opacity-20"
            >
              CANCELAR
            </button>
          </div>
        </div>

        {isConnecting && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/5">
            <div className="h-full bg-blue-500 animate-loading-bar shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveSetupModal;
