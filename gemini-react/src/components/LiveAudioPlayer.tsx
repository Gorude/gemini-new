import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';

// Velocidades disponíveis (0,5x a 2x), cicladas pelo botão de velocidade.
const SPEEDS = [0.5, 0.75, 1, 1.5, 2];

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

interface Props {
  buffer: AudioBuffer;
  context: AudioContext;
  // Nó de saída ao qual conectar (o GainNode do LIVE, para o volume ser o mesmo).
  outputNode: AudioNode;
  // Registra a função de parada deste player para que o app pare os demais (só um toca por vez).
  onActivate: (stop: () => void) => void;
}

// Player para reouvir uma mensagem da IA no modo LIVE: play/pause, slider de
// posição e controle de velocidade. O volume é o mesmo do LIVE (compartilha o
// GainNode via outputNode). O AudioBufferSourceNode não tem pause/seek nativos,
// então rastreamos offset + tempo de início e recriamos a fonte a cada play/seek.
const LiveAudioPlayer: React.FC<Props> = ({ buffer, context, outputNode, onActivate }) => {
  const duration = buffer.duration;
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);

  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);   // context.currentTime quando a fonte atual iniciou
  const offsetRef = useRef(0);      // posição (s) no buffer no início da fonte atual
  const speedRef = useRef(1);
  const rafRef = useRef(0);
  const playingRef = useRef(false);

  const stopSource = () => {
    const src = sourceRef.current;
    if (src) {
      try { src.onended = null; src.stop(); } catch { /* já parado */ }
      try { src.disconnect(); } catch { /* ignore */ }
      sourceRef.current = null;
    }
  };

  const stopTick = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  };

  const setPlaying = (v: boolean) => { playingRef.current = v; setIsPlaying(v); };

  const finishToStart = () => {
    stopSource();
    stopTick();
    offsetRef.current = 0;
    setPlaying(false);
    setCurrentTime(0);
  };

  const tick = () => {
    if (!playingRef.current) return;
    const elapsed = (context.currentTime - startedAtRef.current) * speedRef.current;
    const t = offsetRef.current + elapsed;
    if (t >= duration) { finishToStart(); return; }
    setCurrentTime(t);
    rafRef.current = requestAnimationFrame(tick);
  };

  const play = (fromOffset?: number) => {
    if (context.state === 'suspended') context.resume();
    stopSource();
    const startOffset = fromOffset != null ? fromOffset : offsetRef.current;
    offsetRef.current = startOffset >= duration ? 0 : Math.max(0, startOffset);

    const src = context.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = speedRef.current;
    src.connect(outputNode);
    startedAtRef.current = context.currentTime;
    src.start(0, offsetRef.current);
    sourceRef.current = src;
    setPlaying(true);

    // Fecha sobre a fonte específica (mySrc) para não parar uma reprodução futura
    // por aliasing do sourceRef quando o app manda parar players anteriores.
    const mySrc = src;
    onActivate(() => {
      try { mySrc.onended = null; mySrc.stop(); mySrc.disconnect(); } catch { /* ignore */ }
      if (sourceRef.current === mySrc) {
        sourceRef.current = null;
        stopTick();
        setPlaying(false);
      }
    });

    stopTick();
    rafRef.current = requestAnimationFrame(tick);
  };

  const pause = () => {
    const elapsed = (context.currentTime - startedAtRef.current) * speedRef.current;
    offsetRef.current = Math.min(duration, offsetRef.current + elapsed);
    stopSource();
    stopTick();
    setPlaying(false);
    setCurrentTime(offsetRef.current);
  };

  const toggle = () => { if (playingRef.current) pause(); else play(); };

  const onSeek = (v: number) => {
    offsetRef.current = v;
    setCurrentTime(v);
    if (playingRef.current) play(v);
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speedRef.current);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    if (playingRef.current) {
      // Rebaseia o offset com a velocidade antiga e reinicia com a nova.
      const elapsed = (context.currentTime - startedAtRef.current) * speedRef.current;
      offsetRef.current = Math.min(duration, offsetRef.current + elapsed);
      speedRef.current = next;
      setSpeed(next);
      play(offsetRef.current);
    } else {
      speedRef.current = next;
      setSpeed(next);
    }
  };

  // Limpeza ao desmontar (ex.: sessão encerrada / transcrição limpa).
  useEffect(() => () => { stopSource(); stopTick(); }, []);

  return (
    <div className="mt-2 flex items-center gap-2 bg-black/20 rounded-lg px-2 py-1.5 border border-white/5">
      <button
        onClick={toggle}
        title={isPlaying ? 'Pausar' : 'Reouvir'}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-(--accent) text-white hover:scale-105 transition"
      >
        {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
      </button>
      <span className="shrink-0 text-[9px] tabular-nums text-(--text-secondary) w-7 text-right">{fmt(currentTime)}</span>
      <input
        type="range"
        min={0}
        max={duration}
        step={0.02}
        value={Math.min(currentTime, duration)}
        onChange={(e) => onSeek(parseFloat(e.target.value))}
        style={{ accentColor: 'var(--accent-text)' }}
        title="Posição"
        className="flex-1 h-1 cursor-pointer min-w-[60px]"
      />
      <span className="shrink-0 text-[9px] tabular-nums text-(--text-secondary) w-7">{fmt(duration)}</span>
      <button
        onClick={cycleSpeed}
        title="Velocidade de reprodução"
        className="shrink-0 text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-(--text-secondary) hover:text-white transition"
      >
        {speed}x
      </button>
    </div>
  );
};

export default LiveAudioPlayer;
