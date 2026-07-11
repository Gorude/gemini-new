import React, { useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

// Slider de volume (0–10) com botão de mudo. Usado no modo LIVE (tela cheia e
// minimizada) e no painel de ditado. Reaproveita o accentColor do tema.
const VolumeSlider: React.FC<{ value: number; onChange: (v: number) => void; variant?: 'full' | 'mini' }> = ({ value, onChange, variant = 'mini' }) => {
  const lastNonZero = useRef(value > 0 ? value : 7);
  if (value > 0) lastNonZero.current = value;
  const isFull = variant === 'full';
  const toggleMute = () => onChange(value > 0 ? 0 : lastNonZero.current);
  return (
    <div className={`flex items-center flex-1 ${isFull ? 'gap-2.5' : 'gap-2'}`}>
      <button
        onClick={toggleMute}
        title={value > 0 ? 'Silenciar' : 'Reativar som'}
        className="shrink-0 text-(--text-secondary) hover:text-white transition"
      >
        {value > 0
          ? <Volume2 className={isFull ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
          : <VolumeX className={`text-red-400 ${isFull ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />}
      </button>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        style={{ accentColor: 'var(--accent-text)' }}
        title={`Volume: ${value}/10`}
        className="flex-1 h-1 cursor-pointer"
      />
      <span className={`shrink-0 tabular-nums text-(--text-secondary) font-semibold text-right ${isFull ? 'text-[11px] w-5' : 'text-[10px] w-4'}`}>{value}</span>
    </div>
  );
};

export default VolumeSlider;
