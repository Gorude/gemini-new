import React from 'react';
import { X, Speech, Download, Loader2, Play } from 'lucide-react';
import LiveAudioPlayer from './LiveAudioPlayer';
import VolumeSlider from './VolumeSlider';

export type DictationStatus = 'idle' | 'connecting' | 'generating' | 'done' | 'error';

interface DictationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  text: string;
  onTextChange: (t: string) => void;
  status: DictationStatus;
  progress: { current: number; total: number };
  error: string;
  onStart: () => void;
  onCancel: () => void;
  onReset: () => void;
  onDownload: () => void;
  audioBuffer: AudioBuffer | null;
  audioContext: AudioContext | null;
  outputNode: AudioNode | null;
  onPlayerActivate: (stop: () => void) => void;
  volume: number;
  onVolumeChange: (v: number) => void;
}

const DictationPanel: React.FC<DictationPanelProps> = ({
  isOpen,
  onClose,
  text,
  onTextChange,
  status,
  progress,
  error,
  onStart,
  onCancel,
  onReset,
  onDownload,
  audioBuffer,
  audioContext,
  outputNode,
  onPlayerActivate,
  volume,
  onVolumeChange
}) => {
  if (!isOpen) return null;

  const busy = status === 'connecting' || status === 'generating';
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const canStart = text.trim().length > 0;

  return (
    <div className="fixed top-0 right-0 h-full w-full max-w-[420px] z-[120] bg-(--bg-sidebar-solid) border-l border-(--border-light) shadow-[-20px_0_50px_rgba(0,0,0,0.35)] flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-(--border-light) flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Speech className="w-4 h-4 text-(--accent-text)" />
          <span className="text-xs font-bold uppercase tracking-widest text-(--text-primary)">Ditar texto</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-white/5 rounded-lg text-(--text-secondary) hover:text-red-400 transition"
          title="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
        {/* Player pronto no topo */}
        {status === 'done' && audioBuffer && audioContext && outputNode && (
          <div className="flex flex-col gap-3 bg-white/5 border border-white/10 rounded-2xl p-3 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-(--accent-text)">Áudio pronto</span>
              <button
                onClick={onDownload}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-(--accent) text-white text-[11px] font-semibold hover:scale-[1.03] transition"
                title="Baixar áudio (WAV)"
              >
                <Download className="w-3.5 h-3.5" /> Baixar
              </button>
            </div>
            <LiveAudioPlayer
              buffer={audioBuffer}
              context={audioContext}
              outputNode={outputNode}
              onActivate={onPlayerActivate}
            />
            <div className="flex items-center bg-black/20 px-2.5 py-1.5 rounded-xl border border-white/5">
              <VolumeSlider value={volume} onChange={onVolumeChange} variant="mini" />
            </div>
          </div>
        )}

        {/* Progresso durante a geração */}
        {busy && (
          <div className="flex flex-col gap-3 bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-(--text-primary)">
              <Loader2 className="w-4 h-4 animate-spin text-(--accent-text)" />
              <span className="text-sm font-semibold">
                {status === 'connecting' ? 'Conectando…' : `Gerando narração… ${progress.current}/${progress.total}`}
              </span>
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
              <div
                className="h-full bg-(--accent) transition-all duration-300 shadow-[0_0_12px_var(--accent-glow)]"
                style={{ width: `${status === 'connecting' ? 4 : pct}%` }}
              />
            </div>
            <button
              onClick={onCancel}
              className="self-start text-[11px] px-3 py-1.5 rounded-lg border border-(--border-light) text-(--text-secondary) hover:text-red-400 hover:border-red-500/30 transition"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Erro */}
        {status === 'error' && error && (
          <div className="text-[12px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
            {error}
          </div>
        )}

        {/* Entrada de texto (idle / done / error) */}
        {!busy && (
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-[11px] font-semibold text-(--text-secondary) uppercase tracking-wide">
              {status === 'done' ? 'Texto ditado' : 'Cole o texto a narrar'}
            </label>
            <textarea
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="Cole aqui um texto grande para a IA narrar em voz alta…"
              className="flex-1 min-h-[180px] resize-none bg-white/5 border border-white/10 rounded-xl p-3 text-[13px] leading-relaxed text-(--text-primary) outline-none focus:border-(--accent-border) transition custom-scrollbar"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-(--text-placeholder) tabular-nums">
                {text.trim().length} caracteres
              </span>
              {status === 'done' ? (
                <button
                  onClick={onReset}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-(--accent) text-white text-[12px] font-semibold hover:scale-[1.03] transition"
                >
                  <Play className="w-3.5 h-3.5" /> Ditar novamente
                </button>
              ) : (
                <button
                  onClick={onStart}
                  disabled={!canStart}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition ${canStart ? 'bg-(--accent) text-white hover:scale-[1.03]' : 'bg-white/5 text-(--text-placeholder) cursor-not-allowed'}`}
                >
                  <Speech className="w-3.5 h-3.5" /> Ditar
                </button>
              )}
            </div>
            <p className="text-[10px] text-(--text-placeholder) leading-snug mt-1">
              O texto é dividido em trechos e narrado pelo Gemini 2.5 Flash Live. Textos muito longos podem levar um tempo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DictationPanel;
