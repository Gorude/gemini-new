import { useState, useRef, useEffect, useMemo } from 'react';
import { X, Send, Check, Loader2, Columns2, Eye, Code2, MessageSquare, RotateCcw, ExternalLink, Maximize2, Clock, Gauge } from 'lucide-react';
import { streamGeminiContent, safeMarkdown } from '../services/gemini';
import { StreamSmoother } from '../services/streamSmoother';
import { extractPreviewableCode, buildPreviewSrcDoc } from '../utils/extractCode';

interface ModelOpt { id: string; name: string }

interface ModelCompareModalProps {
  models: ModelOpt[];
  defaultA: string;
  defaultB: string;
  onClose: () => void;
  onKeep: (modelId: string, prompt: string, response: string) => void;
}

interface ColState {
  text: string;    // texto COMPLETO recebido (para extração de código / "manter no chat")
  shown: string;   // texto REVELADO pelo suavizador (o que é renderizado na resposta)
  tokens: number;  // total de tokens (prompt + saída), quando o provedor informa
  outTokens: number; // tokens de SAÍDA (candidates/completion) — base da velocidade
  ttftMs: number;  // tempo até o 1º token (time to first token)
  ms: number;      // tempo total de geração
  running: boolean;
  error?: string;
}

type ViewMode = 'answer' | 'preview' | 'code';

const emptyCol = (): ColState => ({ text: '', shown: '', tokens: 0, outTokens: 0, ttftMs: 0, ms: 0, running: false });

const STORE_KEY = 'model-compare-session-v1';

interface StoredSession {
  prompt: string;
  modelA: string;
  modelB: string;
  colA: ColState;
  colB: ColState;
}

// Restaura a sessão persistida. `running` nunca volta como true, e `shown` é
// forçado ao texto completo (não há stream para revelar — mostramos tudo).
function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if (!s || typeof s.prompt !== 'string') return null;
    const hydrate = (c?: ColState): ColState => {
      const col = { ...emptyCol(), ...c, running: false };
      col.shown = col.text;
      return col;
    };
    return { prompt: s.prompt, modelA: s.modelA, modelB: s.modelB, colA: hydrate(s.colA), colB: hydrate(s.colB) };
  } catch {
    return null;
  }
}

export default function ModelCompareModal({ models, defaultA, defaultB, onClose, onKeep }: ModelCompareModalProps) {
  const saved = useMemo(loadSession, []);
  const has = (id: string) => models.some(m => m.id === id);

  const [prompt, setPrompt] = useState(saved?.prompt ?? '');
  const [modelA, setModelA] = useState(saved && has(saved.modelA) ? saved.modelA : defaultA);
  const [modelB, setModelB] = useState(saved && has(saved.modelB) ? saved.modelB : (defaultB || defaultA));
  const [colA, setColA] = useState<ColState>(saved?.colA ?? emptyCol());
  const [colB, setColB] = useState<ColState>(saved?.colB ?? emptyCol());
  const [viewA, setViewA] = useState<ViewMode>('answer');
  const [viewB, setViewB] = useState<ViewMode>('answer');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<'A' | 'B' | null>(null); // preview em tela cheia

  const abortRef = useRef<AbortController | null>(null);
  const fullARef = useRef(saved?.colA.text ?? ''); // texto completo acumulado (alvo do suavizador)
  const fullBRef = useRef(saved?.colB.text ?? '');
  const smootherRef = useRef<StreamSmoother | null>(null);
  const answerRefA = useRef<HTMLDivElement | null>(null); // container rolável da resposta A
  const answerRefB = useRef<HTMLDivElement | null>(null);

  // Um único suavizador dirige as DUAS colunas (foi feito com alvos A/B). Ele
  // revela caractere a caractere no mesmo ritmo do chat comum, desacoplando a
  // exibição da chegada pela rede.
  useEffect(() => {
    const sm = new StreamSmoother((a, b) => {
      setColA(c => (c.shown === a ? c : { ...c, shown: a }));
      setColB(c => (c.shown === b ? c : { ...c, shown: b }));
    });
    smootherRef.current = sm;
    return () => sm.cancel();
  }, []);

  // Uma coluna está "assentada" quando o stream terminou E o suavizador já
  // revelou tudo. SÓ então rodamos o markdown+highlight — que é caro (highlight.js
  // reprocessa o bloco de código INTEIRO). Durante o streaming, renderizamos texto
  // simples (barato), evitando as travadas fortes com respostas grandes.
  const settledA = !colA.running && colA.text.length > 0 && colA.shown.length >= colA.text.length;
  const settledB = !colB.running && colB.text.length > 0 && colB.shown.length >= colB.text.length;
  const htmlA = useMemo(() => (settledA ? safeMarkdown(colA.text) : ''), [settledA, colA.text]);
  const htmlB = useMemo(() => (settledB ? safeMarkdown(colB.text) : ''), [settledB, colB.text]);

  // Código pré-visualizável extraído do texto COMPLETO (não do revelado).
  const codeA = useMemo(() => extractPreviewableCode(colA.text), [colA.text]);
  const codeB = useMemo(() => extractPreviewableCode(colB.text), [colB.text]);

  // "Grudar no final" enquanto gera: a cada texto revelado, se o usuário está
  // perto do fim, acompanhamos a rolagem; se ele rolou para cima, respeitamos e
  // paramos de grudar (mesma lógica do chat comum, com folga de 120px).
  const stick = (el: HTMLDivElement | null) => {
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  };
  useEffect(() => { stick(answerRefA.current); }, [colA.shown]);
  useEffect(() => { stick(answerRefB.current); }, [colB.shown]);

  // Persistência com debounce: grava 400ms após a última mudança, então NÃO
  // escreve no localStorage a cada frame durante o streaming (escrita síncrona
  // que travaria a rolagem). Salva o texto completo, não o revelado.
  const persist = () => {
    try {
      const payload: StoredSession = { prompt, modelA, modelB, colA, colB };
      localStorage.setItem(STORE_KEY, JSON.stringify(payload));
    } catch { /* quota/serialização — ignora */ }
  };
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => {
    const t = setTimeout(() => persistRef.current(), 400);
    return () => clearTimeout(t);
  }, [prompt, modelA, modelB, colA.text, colB.text, colA.tokens, colB.tokens, colA.running, colB.running]);

  const runOne = async (modelId: string, text: string, signal: AbortSignal, which: 'A' | 'B') => {
    const start = performance.now();
    const setCol = which === 'A' ? setColA : setColB;
    const fullRef = which === 'A' ? fullARef : fullBRef;
    fullRef.current = '';
    setCol({ ...emptyCol(), running: true });
    try {
      const stream = streamGeminiContent(text, modelId, [], undefined, [], false, signal, false);
      let tokens = 0;
      let outTokens = 0;
      let ttftMs = 0; // marcado no 1º pedaço de texto recebido
      for await (const chunk of stream) {
        if (chunk.text) {
          if (!ttftMs) ttftMs = performance.now() - start;
          fullRef.current += chunk.text;
        }
        if (chunk.usage?.totalTokenCount) tokens = chunk.usage.totalTokenCount;
        if (chunk.usage?.candidatesTokenCount) outTokens = chunk.usage.candidatesTokenCount;
        const ms = performance.now() - start;
        setCol(c => ({ ...c, text: fullRef.current, tokens, outTokens, ttftMs, ms, running: true }));
        smootherRef.current?.setTargets(fullARef.current, fullBRef.current);
      }
      setCol(c => ({ ...c, text: fullRef.current, tokens, outTokens, ttftMs, ms: performance.now() - start, running: false }));
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setCol({ ...emptyCol(), ms: performance.now() - start, error: e instanceof Error ? e.message : 'Erro' });
    }
  };

  const run = async () => {
    if (!prompt.trim() || busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setViewA('answer');
    setViewB('answer');
    await Promise.all([
      runOne(modelA, prompt, controller.signal, 'A'),
      runOne(modelB, prompt, controller.signal, 'B'),
    ]);
    await smootherRef.current?.finish(); // drena o restante rápido ao terminar
    setBusy(false);
  };

  const reset = () => {
    abortRef.current?.abort();
    fullARef.current = '';
    fullBRef.current = '';
    setColA(emptyCol());
    setColB(emptyCol());
    setViewA('answer');
    setViewB('answer');
    setBusy(false);
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignora */ }
  };

  // Fechar NÃO descarta a sessão: gravamos o estado atual antes de sair e ele é
  // restaurado ao reabrir. Só abortamos o stream em andamento.
  const close = () => { abortRef.current?.abort(); persistRef.current(); onClose(); };

  const bothHaveCode = !!codeA && !!codeB;
  const bothPreview = viewA === 'preview' && viewB === 'preview';
  const togglePreviews = () => {
    const next: ViewMode = bothPreview ? 'answer' : 'preview';
    setViewA(next);
    setViewB(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (expanded) setExpanded(null); else close(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const openInNewTab = (code: string, lang: string) => {
    const blob = new Blob([buildPreviewSrcDoc(code, lang)], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const viewToggle = (view: ViewMode, setView: (v: ViewMode) => void, hasCode: boolean) => (
    <div className="flex items-center gap-0.5 bg-(--bg-sidebar) rounded-lg p-0.5 shrink-0">
      {([
        { id: 'answer' as const, icon: MessageSquare, title: 'Resposta', enabled: true },
        { id: 'preview' as const, icon: Eye, title: 'Preview', enabled: hasCode },
        { id: 'code' as const, icon: Code2, title: 'Código', enabled: hasCode },
      ]).map(({ id, icon: Icon, title, enabled }) => (
        <button
          key={id}
          onClick={() => enabled && setView(id)}
          disabled={!enabled}
          title={enabled ? title : 'Sem código pré-visualizável'}
          className={`p-1.5 rounded-md transition-colors disabled:opacity-25 ${view === id ? 'text-white' : 'text-(--text-secondary) hover:text-(--text-primary)'}`}
          style={view === id ? { background: 'var(--accent)' } : {}}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );

  const column = (
    which: 'A' | 'B',
    modelId: string,
    setModel: (v: string) => void,
    col: ColState,
    html: string,
    settled: boolean,
    view: ViewMode,
    setView: (v: ViewMode) => void,
    code: ReturnType<typeof extractPreviewableCode>,
  ) => {
    // Velocidade média em tokens de SAÍDA por segundo, descontando o tempo até o
    // 1º token (TTFT) — assim mede só o ritmo de geração, não a latência inicial.
    const genSec = Math.max(0, col.ms - col.ttftMs) / 1000;
    const speed = col.outTokens > 0 && genSec > 0 ? Math.round(col.outTokens / genSec) : 0;
    const tokLabel = col.outTokens || col.tokens;
    return (
    <div className="flex-1 min-w-0 flex flex-col border border-(--border-light) rounded-2xl overflow-hidden bg-(--bg-main)">
      <div className="flex items-center gap-2 p-2 border-b border-(--border-light) bg-(--bg-sidebar)/40">
        <select
          value={modelId}
          onChange={e => setModel(e.target.value)}
          disabled={busy}
          className="flex-1 min-w-0 appearance-none bg-(--bg-sidebar) border border-(--border-light) rounded-lg py-1.5 px-2 text-xs font-bold text-(--text-primary) outline-none cursor-pointer"
        >
          {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {col.running && <Loader2 className="w-3.5 h-3.5 animate-spin text-(--text-placeholder) shrink-0" />}
        {viewToggle(view, setView, !!code)}
      </div>

      <div className="flex-1 flex flex-col min-h-64 max-h-[52vh]">
        {col.error ? (
          <div className="p-3 text-xs text-red-400">{col.error}</div>
        ) : view === 'preview' && code ? (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between px-2 py-1 border-b border-(--border-light) bg-(--bg-sidebar)/30">
              <span className="text-[10px] font-mono uppercase tracking-widest text-(--text-placeholder)">{code.lang} · preview</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setExpanded(which)} title="Tela cheia" className="p-1 rounded text-(--text-placeholder) hover:text-(--text-primary) transition-colors">
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => openInNewTab(code.code, code.lang)} title="Abrir em nova aba" className="p-1 rounded text-(--text-placeholder) hover:text-(--text-primary) transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <iframe
              title="Pré-visualização de código"
              sandbox="allow-scripts"
              srcDoc={buildPreviewSrcDoc(code.code, code.lang)}
              className="w-full flex-1 bg-white border-0"
            />
          </div>
        ) : view === 'code' && code ? (
          <pre className="flex-1 overflow-auto p-3 text-xs leading-relaxed text-(--text-primary) whitespace-pre-wrap break-words">
            <code>{code.code}</code>
          </pre>
        ) : col.shown ? (
          <div ref={which === 'A' ? answerRefA : answerRefB} className="flex-1 overflow-y-auto p-3">
            {settled
              ? <div className="response-body text-sm text-(--text-primary)" dangerouslySetInnerHTML={{ __html: html }} />
              : <div className="text-sm text-(--text-primary) whitespace-pre-wrap break-words leading-relaxed">{col.shown}</div>}
          </div>
        ) : (
          <div className="p-3 text-xs text-(--text-placeholder)">{col.running ? 'Gerando…' : 'Aguardando…'}</div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 p-2 border-t border-(--border-light) text-[10px] text-(--text-placeholder)">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 min-w-0">
          <span title="Tokens de saída (total entre parênteses)">
            {tokLabel ? `${tokLabel.toLocaleString('pt-BR')} tok` : '—'}
            {col.outTokens > 0 && col.tokens > col.outTokens ? ` (${col.tokens.toLocaleString('pt-BR')})` : ''}
          </span>
          {col.ttftMs > 0 && (
            <span className="flex items-center gap-0.5" title="Tempo até o 1º token">
              <Clock className="w-3 h-3" />{(col.ttftMs / 1000).toFixed(2)}s
            </span>
          )}
          {speed > 0 && (
            <span className="flex items-center gap-0.5" title="Velocidade média de geração (tokens de saída/s)">
              <Gauge className="w-3 h-3" />{speed} tok/s
            </span>
          )}
          {col.ms > 0 && <span title="Tempo total">{(col.ms / 1000).toFixed(1)}s total</span>}
          {code && <span>· código</span>}
        </div>
        <button
          onClick={() => onKeep(modelId, prompt, col.text)}
          disabled={!col.text || col.running}
          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-white disabled:opacity-30 transition"
          style={{ background: 'var(--accent)' }}
        >
          <Check className="w-3 h-3" /> Manter no chat
        </button>
      </div>
    </div>
    );
  };

  const hasSession = !!(prompt.trim() || colA.text || colB.text);

  // Preview em tela cheia de uma coluna, sobreposto ao modal (z acima).
  const expandedCode = expanded === 'A' ? codeA : expanded === 'B' ? codeB : null;
  const expandedModelId = expanded === 'A' ? modelA : modelB;
  const expandedName = models.find(m => m.id === expandedModelId)?.name || expandedModelId;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={close}></div>
      <div className="relative w-full max-w-6xl glass-modal rounded-3xl shadow-2xl flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-300">
        <header className="flex items-center gap-2 p-4 border-b border-(--border-light)">
          <Columns2 className="w-5 h-5" style={{ color: 'var(--accent-text)' }} />
          <h2 className="text-sm font-bold text-(--text-primary)">Comparar modelos</h2>
          {bothHaveCode && (
            <button
              onClick={togglePreviews}
              className={`ml-2 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${bothPreview ? 'text-white' : 'text-(--text-secondary) hover:text-(--text-primary) bg-(--bg-sidebar)'}`}
              style={bothPreview ? { background: 'var(--accent)' } : {}}
              title="Ver a pré-visualização dos dois lados"
            >
              <Eye className="w-3.5 h-3.5" /> Comparar previews
            </button>
          )}
          {hasSession && (
            <button
              onClick={reset}
              disabled={busy}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-(--text-secondary) hover:text-(--text-primary) bg-(--bg-sidebar) disabled:opacity-40 transition-colors"
              title="Limpar comparação"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Limpar
            </button>
          )}
          <button onClick={close} className="ml-auto p-2 rounded-lg text-(--text-placeholder) hover:bg-(--bg-chat-hover) transition"><X className="w-5 h-5" /></button>
        </header>

        <div className="p-4 flex flex-col gap-3 overflow-hidden">
          <div className="flex items-end gap-2">
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } }}
              rows={2}
              placeholder="Digite um prompt para enviar aos dois modelos…"
              className="flex-1 bg-(--bg-sidebar) border border-(--border-light) rounded-xl py-2.5 px-3 text-sm text-(--text-primary) outline-none resize-none"
            />
            <button
              onClick={run}
              disabled={!prompt.trim() || busy}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition"
              style={{ background: 'var(--accent)' }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Comparar
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {column('A', modelA, setModelA, colA, htmlA, settledA, viewA, setViewA, codeA)}
            {column('B', modelB, setModelB, colB, htmlB, settledB, viewB, setViewB, codeB)}
          </div>
          <p className="text-[10px] text-(--text-placeholder)">A comparação fica salva neste navegador — pode fechar e reabrir sem perder o resultado. Use "Limpar" para começar de novo ou "Manter no chat" para inserir uma resposta na conversa.</p>
        </div>
      </div>

      {expanded && expandedCode && (
        <div className="fixed inset-0 z-[140] flex flex-col bg-(--bg-main) animate-in fade-in duration-200">
          <header className="flex items-center gap-2 p-3 border-b border-(--border-light) bg-(--bg-sidebar)/30">
            <Eye className="w-4 h-4" style={{ color: 'var(--accent-text)' }} />
            <span className="text-sm font-bold text-(--text-primary) truncate">{expandedName}</span>
            <span className="text-[10px] font-mono uppercase tracking-widest text-(--text-placeholder)">{expandedCode.lang} · preview</span>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => openInNewTab(expandedCode.code, expandedCode.lang)} title="Abrir em nova aba" className="p-2 rounded-lg text-(--text-placeholder) hover:bg-(--bg-chat-hover) hover:text-(--text-primary) transition-colors">
                <ExternalLink className="w-4 h-4" />
              </button>
              <button onClick={() => setExpanded(null)} title="Fechar tela cheia (Esc)" className="p-2 rounded-lg text-(--text-placeholder) hover:bg-(--bg-chat-hover) hover:text-(--text-primary) transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>
          <iframe
            title="Pré-visualização em tela cheia"
            sandbox="allow-scripts"
            srcDoc={buildPreviewSrcDoc(expandedCode.code, expandedCode.lang)}
            className="w-full flex-1 bg-white border-0"
          />
        </div>
      )}
    </div>
  );
}
