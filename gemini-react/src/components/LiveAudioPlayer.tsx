import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { audioBufferToWav } from '../services/audioUtils';

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
  // Regiões (em segundos) de trechos que falharam: exibidas em vermelho na barra
  // e puladas automaticamente durante a reprodução.
  failedRegions?: { start: number; end: number }[];
}

// Player para reouvir áudio (mensagens do LIVE ou narração do ditado): play/pause,
// slider de posição e controle de velocidade. O volume é o mesmo do LIVE (compartilha
// o GainNode via outputNode).
//
// A reprodução é feita por um elemento <audio> roteado no grafo de áudio via
// MediaElementSource. Isso permite `preservesPitch`: ao mudar a velocidade, o TOM
// da voz é mantido (diferente do AudioBufferSourceNode, que altera pitch junto).
// O elemento é criado sob demanda (no 1º play) para não pesar em transcrições longas.
const LiveAudioPlayer: React.FC<Props> = ({ buffer, context, outputNode, onActivate, failedRegions }) => {
  const duration = buffer.duration;
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const srcNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const urlRef = useRef<string | null>(null);
  const rafRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef(1);
  const posRef = useRef(0); // posição desejada (s), p/ honrar seek feito antes do 1º play
  const playTokenRef = useRef(0); // identifica cada play; o "stop" antigo só age se ainda for o atual
  const regionsRef = useRef<{ start: number; end: number }[]>(failedRegions || []);
  useEffect(() => { regionsRef.current = failedRegions || []; }, [failedRegions]);

  const setPlaying = (v: boolean) => { playingRef.current = v; setIsPlaying(v); };

  const stopTick = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  };

  // Cria (uma vez) o <audio> + nó do grafo a partir do buffer, convertido em WAV.
  const ensureAudio = (): HTMLAudioElement | null => {
    if (audioRef.current) return audioRef.current;
    const url = URL.createObjectURL(audioBufferToWav(buffer));
    urlRef.current = url;

    const el = new Audio();
    el.src = url;
    el.playbackRate = speedRef.current;
    // Mantém o tom ao acelerar/desacelerar (padrão dos navegadores; setado por garantia).
    const anyEl = el as any;
    anyEl.preservesPitch = true;
    anyEl.mozPreservesPitch = true;
    anyEl.webkitPreservesPitch = true;

    el.onended = () => {
      stopTick();
      setPlaying(false);
      setCurrentTime(0);
      posRef.current = 0;
      el.currentTime = 0;
    };

    try {
      const node = context.createMediaElementSource(el);
      node.connect(outputNode);
      srcNodeRef.current = node;
    } catch { /* ignore */ }

    audioRef.current = el;
    return el;
  };

  const teardown = () => {
    stopTick();
    const el = audioRef.current;
    if (el) { try { el.pause(); } catch { /* ignore */ } el.onended = null; }
    try { srcNodeRef.current?.disconnect(); } catch { /* ignore */ }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    audioRef.current = null;
    srcNodeRef.current = null;
    urlRef.current = null;
  };

  // Recria do zero quando o buffer muda (ex.: "ditar novamente"); limpa ao desmontar.
  useEffect(() => {
    return () => {
      teardown();
      setPlaying(false);
      setCurrentTime(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer, context, outputNode]);

  // Se `t` cai dentro de uma região falha, devolve o fim dela (para onde pular); senão null.
  const skipTargetFor = (t: number): number | null => {
    for (const r of regionsRef.current) {
      if (t >= r.start && t < r.end - 0.03) return r.end;
    }
    return null;
  };

  const tick = () => {
    const el = audioRef.current;
    if (!el || !playingRef.current) return;
    let t = el.currentTime;
    // Pula trechos falhos (silêncio) durante a reprodução.
    const skip = skipTargetFor(t);
    if (skip != null) {
      if (skip >= duration - 0.03) {
        try { el.pause(); } catch { /* ignore */ }
        stopTick();
        setPlaying(false);
        setCurrentTime(0);
        posRef.current = 0;
        el.currentTime = 0;
        return;
      }
      el.currentTime = skip;
      t = skip;
    }
    posRef.current = t;
    setCurrentTime(Math.min(t, duration));
    rafRef.current = requestAnimationFrame(tick);
  };

  const play = () => {
    const existed = !!audioRef.current;
    const el = ensureAudio();
    if (!el) return;
    if (context.state === 'suspended') context.resume();
    // Elemento recém-criado → aplica a posição escolhida antes do 1º play.
    if (!existed && posRef.current > 0 && posRef.current < duration) {
      el.currentTime = posRef.current;
    }
    el.playbackRate = speedRef.current;
    const token = ++playTokenRef.current;
    el.play().then(() => {
      setPlaying(true);
      stopTick();
      rafRef.current = requestAnimationFrame(tick);
      // Registra o "stop" para o app parar os demais players (só um toca por vez).
      // O token evita que um stop antigo pause um play mais novo do MESMO player
      // (o app chama o stop anterior ao registrar um novo).
      onActivate(() => {
        if (playTokenRef.current !== token) return;
        try { el.pause(); } catch { /* ignore */ }
        stopTick();
        setPlaying(false);
      });
    }).catch(() => { /* autoplay bloqueado / interrompido */ });
  };

  const pause = () => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    stopTick();
    setPlaying(false);
    posRef.current = el.currentTime;
    setCurrentTime(el.currentTime);
  };

  const toggle = () => { if (playingRef.current) pause(); else play(); };

  const onSeek = (v: number) => {
    posRef.current = v;
    setCurrentTime(v);
    const el = audioRef.current;
    if (el) el.currentTime = v;
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speedRef.current);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    speedRef.current = next;
    setSpeed(next);
    // Troca de velocidade em tempo real, mantendo o tom (preservesPitch).
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

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
      <div className="relative flex-1 min-w-[60px] flex items-center">
        <input
          type="range"
          min={0}
          max={duration}
          step={0.02}
          value={Math.min(currentTime, duration)}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          style={{ accentColor: 'var(--accent-text)' }}
          title="Posição"
          className="w-full h-1 cursor-pointer"
        />
        {/* Marcas vermelhas dos trechos que falharam (sobrepostas à trilha). */}
        {duration > 0 && (failedRegions?.length ?? 0) > 0 && (
          <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1">
            {failedRegions!.map((r, i) => (
              <div
                key={i}
                className="absolute top-0 h-1 rounded-sm bg-red-500"
                style={{
                  left: `${Math.max(0, (r.start / duration) * 100)}%`,
                  width: `${Math.max(1.5, ((r.end - r.start) / duration) * 100)}%`,
                }}
                title="Trecho não gerado (será pulado)"
              />
            ))}
          </div>
        )}
      </div>
      <span className="shrink-0 text-[9px] tabular-nums text-(--text-secondary) w-7">{fmt(duration)}</span>
      <button
        onClick={cycleSpeed}
        title="Velocidade de reprodução (tom preservado)"
        className="shrink-0 text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-(--text-secondary) hover:text-white transition"
      >
        {speed}x
      </button>
    </div>
  );
};

export default LiveAudioPlayer;
