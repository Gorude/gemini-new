import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo, lazy, Suspense, type ComponentType, type ComponentProps, type ReactNode } from 'react';
import {
  Archive,
  Trash2,
  ChevronDown,
  X,
  Settings,
  Menu,
  Search,
  SquarePen,
  User,
  Files,
  MessageSquare,
  RotateCcw,
  Type,
  LogOut,
  ChevronRight,
  Edit2,
  Folder as FolderIcon,
  FolderPlus
} from 'lucide-react';
import { auth, db } from './services/firebase';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import LoginScreen from './components/LoginScreen';
import ChatRuler from './components/ChatRuler';
import MessageList, { type ChatTtsEntry } from './components/MessageList';
import ChatInput from './components/ChatInput';
import MessageTimeline from './components/MessageTimeline';
import SortableChatItem from './components/SortableChatItem';
import NemonIcon from './components/NemonIcon';
const GlobalSearchModal = lazyWithSuspense(() => import('./components/GlobalSearchModal'));

import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import {
  restrictToVerticalAxis
} from '@dnd-kit/modifiers';
import { Lock, Unlock, GripVertical, Code, Bell } from 'lucide-react';

import {
  generateGeminiContent,
  generateImagenContent,
  streamGeminiContent,
  performFactCheck,
  extractAndParseJson,
  setGlobalPaidApiKey,
  setGlobalDefaultApiKey,
  setGlobalOpenRouterApiKey,
  setGlobalCustomModels,
  resolveProvider,
  fetchOpenRouterModelMeta,
  listLiveModels,
  setGlobalLocalEndpoint,
  performWebSearch,
  runGeminiToolLoop,
  CHAT_TOOLS,
  type Message
} from './services/gemini';

import {
  type ChatSession,
  type DailyUsage,
  type PendingFile,
  type Personality,
  type MemoryFact,
  type PendingMemoryUpdate,
  type Folder,
  type Skill
} from './types';

import { v4 as uuidv4 } from 'uuid';

const DEFAULT_PERSONALITY: Personality = {
  id: 'default',
  name: 'Normal',
  prompt: ''
};

// Monta a instrução de sistema completa do modo LIVE (personalidade + contexto de
// memória DNA + regras de memória). Usada tanto ao iniciar a sessão quanto ao
// TROCAR de personalidade no meio dela (para manter a instrução sempre coerente
// com a personalidade ativa, inclusive após reconexões).
function buildLiveInstruction(personalityPrompt: string, memoryFacts: MemoryFact[], useMemory: boolean): string {
  let dnaContext = "";
  if (useMemory && memoryFacts.length > 0) {
    dnaContext = "\n\nSua MEMÓRIA DNA atual:\n" +
      memoryFacts.map(f => `- [ID: ${f.id}] [Categoria: ${f.category}] ${f.text}`).join("\n");
  }

  const memoryRules = useMemory ? `
REGRAS DE MEMÓRIA (MODO LIVE):
1. Cada memória DEVE conter apenas um fato atômico, simples e específico (ex: 'O usuário se chama José Gabriel', 'O usuário tem 19 anos', 'O usuário estuda ADS'). NUNCA agrupe múltiplos fatos no mesmo texto.
2. Use <MEMORY category='...'>texto</MEMORY> para novos fatos que NÃO contradizem memórias antigas. NÃO atualize memórias antigas para concatenar novas informações complementares (ex: se já sabe o nome, e o usuário disser o curso, crie um novo fato com <MEMORY>, NÃO atualize o fato do nome).
3. Use <UPDATE_MEMORY id='...' category='...'>texto</UPDATE_MEMORY> para atualizar um fato APENAS quando a informação antiga daquele ID específico for diretamente contradita/substituída por uma nova (ex: mudou de idade ou de cidade).
4. Use <DELETE_MEMORY id='...' /> para remover.
5. IMPORTANTE: NUNCA, SOB HIPÓTESE ALGUMA, PRONUNCIE AS TAGS XML EM VOZ ALTA. Elas devem ficar invisíveis no áudio.
` : "";

  return `${personalityPrompt}${dnaContext}${memoryRules}\n\nResponda sempre de forma natural e conversacional.`;
}

// Remove marcadores internos de pesquisa que modelos leves (ex.: Flash Lite) às vezes
// ecoam no início da resposta, como "WEB SEARCH ON" / "PESQUISA ATIVADA". Só limpa quando
// aparecem como um rótulo isolado no começo do texto — não afeta o conteúdo real.
function stripSearchMarkers(text: string): string {
  if (!text) return text;
  return text.replace(
    /^\s*(?:web\s*se?a?rch\s*(?:on|ativad[ao])?|pesquisa\s*(?:web\s*)?(?:on|ativad[ao]))\s*[:.\-–—]*\s*(?:\r?\n)+/i,
    ''
  );
}

// Avaliador matemático seguro (sem eval/globais): usado pela ferramenta 'calculate'.
// Aceita apenas números, operadores e um conjunto branco de funções/constantes.
const CALC_SCOPE: Record<string, number | ((...n: number[]) => number)> = {
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  ln: Math.log, log: Math.log10, log2: Math.log2, log10: Math.log10, exp: Math.exp,
  min: Math.min, max: Math.max, pow: Math.pow, pi: Math.PI, e: Math.E
};
function safeCalculate(expression: string): number {
  const cleaned = expression.trim()
    .replace(/,/g, '.')     // vírgula decimal
    .replace(/×/g, '*').replace(/÷/g, '/')
    .replace(/\^/g, '**');  // potência
  // Remove os nomes permitidos e verifica se o restante só tem caracteres seguros.
  const withoutNames = cleaned.replace(/\b(sqrt|abs|round|floor|ceil|sin|cos|tan|asin|acos|atan|ln|log2|log10|log|exp|min|max|pow|pi|e)\b/gi, '');
  if (/[^0-9+\-*/%.()\s,]/.test(withoutNames)) {
    throw new Error('Expressão contém caracteres não permitidos.');
  }
  const keys = Object.keys(CALC_SCOPE);
  const fn = new Function(...keys, `"use strict"; return (${cleaned});`);
  const result = fn(...keys.map(k => CALC_SCOPE[k]));
  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error('Resultado inválido.');
  }
  return result;
}

// Descrições (pt-BR) dos códigos WMO de tempo retornados pela Open-Meteo.
const WEATHER_CODES: Record<number, string> = {
  0: 'céu limpo', 1: 'predominantemente limpo', 2: 'parcialmente nublado', 3: 'nublado',
  45: 'névoa', 48: 'névoa com geada',
  51: 'garoa leve', 53: 'garoa moderada', 55: 'garoa intensa',
  56: 'garoa congelante leve', 57: 'garoa congelante intensa',
  61: 'chuva leve', 63: 'chuva moderada', 65: 'chuva forte',
  66: 'chuva congelante leve', 67: 'chuva congelante forte',
  71: 'neve leve', 73: 'neve moderada', 75: 'neve forte', 77: 'grãos de neve',
  80: 'pancadas de chuva leves', 81: 'pancadas de chuva moderadas', 82: 'pancadas de chuva violentas',
  85: 'pancadas de neve leves', 86: 'pancadas de neve fortes',
  95: 'trovoada', 96: 'trovoada com granizo leve', 99: 'trovoada com granizo forte'
};

// Normaliza texto para comparação (minúsculas, sem acentos).
const normalizeStr = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Encontra a personalidade mais próxima do termo pedido (não exige nome exato).
function bestPersonalityMatch(query: string, personas: Personality[]): Personality | null {
  const q = normalizeStr(query);
  if (!q) return null;
  let best: Personality | null = null;
  let bestScore = 0;
  for (const p of personas) {
    const n = normalizeStr(p.name);
    let score = 0;
    if (n === q) score = 1000;
    else if (n.includes(q) || q.includes(n)) score = 500 + Math.min(n.length, q.length);
    else {
      const qWords = new Set(q.split(/\s+/).filter(Boolean));
      const shared = n.split(/\s+/).filter(w => qWords.has(w)).length;
      score = shared * 100;
    }
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore > 0 ? best : null;
}

// Temas de cores disponíveis, com termos de match para a ferramenta set_theme.
const LIVE_THEMES: { id: string; label: string; match: string[] }[] = [
  { id: 'escuro', label: 'Escuro', match: ['escuro', 'dark', 'preto', 'noite'] },
  { id: 'claro', label: 'Claro', match: ['claro', 'light', 'branco', 'dia'] },
  { id: 'areia', label: 'Areia', match: ['areia', 'sand', 'bege', 'sepia', 'sépia'] },
  { id: 'galaxia', label: 'Galáxia', match: ['galaxia', 'galaxy', 'roxo', 'espaco', 'espaço', 'espacial'] },
  { id: 'claude', label: 'Claude', match: ['claude', 'terracota', 'anthropic'] },
];

// Rótulos amigáveis das ferramentas do modo LIVE, para o toast de notificação.
const LIVE_TOOL_LABELS: Record<string, string> = {
  google_search: 'Pesquisou no Google',
  calculate: 'Fez um cálculo',
  get_weather: 'Consultou o clima',
  fact_check: 'Checou um fato',
  set_theme: 'Trocou o tema',
  list_personalities: 'Listou personalidades',
  create_personality: 'Criou personalidade',
  delete_personality: 'Excluiu personalidade',
  get_current_time: 'Consultou a hora',
  save_memory: 'Salvou na memória',
  update_memory: 'Atualizou a memória',
  delete_memory: 'Removeu da memória',
  recall_memory: 'Consultou a memória',
  set_voice: 'Trocou a voz',
  list_voices: 'Listou as vozes',
  set_personality_voice: 'Definiu voz da personalidade',
  toggle_camera: 'Alternou a câmera',
  toggle_screen_share: 'Alternou a tela',
  toggle_proactivity: 'Alternou proatividade',
  open_settings: 'Abriu configurações',
  end_session: 'Encerrou a sessão',
  search_history: 'Buscou no histórico',
  create_new_chat: 'Criou nova conversa',
  switch_personality: 'Trocou de personalidade',
  set_timer: 'Iniciou um cronômetro',
  set_reminder: 'Agendou um lembrete',
  set_alarm: 'Definiu um alarme',
  list_alarms: 'Listou agendamentos',
  cancel_alarm: 'Cancelou um agendamento'
};

const LiveView = lazyWithSuspense(() => import('./components/LiveView'));
const LiveSetupModal = lazyWithSuspense(() => import('./components/LiveSetupModal'));
import ChatFileHub from './components/ChatFileHub';
import { GeminiLiveSession } from './services/geminiLive';
import { GeminiDictationSession } from './services/geminiDictation';
import { StreamSmoother } from './services/streamSmoother';
import DictationPanel, { type DictationStatus } from './components/DictationPanel';
import { audioBufferToWav, concatFloat32 } from './services/audioUtils';
import SelectionPopup from './components/SelectionPopup';
import { logger } from './services/logger';
import LogWindow from './components/LogWindow';

const SettingsModal = lazyWithSuspense(() => import('./components/SettingsModal'));
const CodePreviewPanel = lazyWithSuspense(() => import('./components/CodePreviewPanel'));
const ModelCompareModal = lazyWithSuspense(() => import('./components/ModelCompareModal'));
import {
  LIVE_MODEL_MAP,
  DEFAULT_LIVE_MODEL,
  FONT_OPTIONS,
  DEFAULT_FONT_ID,
  LIVE_VOICES,
  LIVE_VOICE_IDS,
  DEFAULT_LIVE_VOICE,
  DEFAULT_LOCAL_ENDPOINT,
  MODEL_OPTIONS,
  estimateTokens,
  type CustomModel
} from './constants';
import { useToast } from './hooks/useToast';
import InChatFind from './components/InChatFind';
import { exportChatAsMarkdown, exportChatAsJson } from './utils/exportChat';
import { extractPdfText } from './utils/extractPdfText';
import { extractMapMarkers, stripMapMarkers } from './utils/mapMarkers';

// Modelo inicial padrão de fábrica (quando nada foi configurado pelo usuário).
const FALLBACK_MODEL = 'gemma-4-31b-it';

// Carrega um componente sob demanda (code-splitting) já embrulhado em Suspense,
// mantendo o mesmo nome/props do componente original — os sites de render não mudam.
function lazyWithSuspense<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
  fallback: ReactNode = null,
) {
  const Lazy = lazy(loader);
  return (props: ComponentProps<T>) => (
    <Suspense fallback={fallback}>
      <Lazy {...(props as any)} />
    </Suspense>
  );
}

const getPacificDate = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
};

let isLoggerInitialized = false;

// Divide um texto grande em trechos para o ditado, respeitando parágrafos e frases,
// com um teto de caracteres por trecho (mantém cada turno de áudio curto e evita
// estourar o limite de output do modelo).
// Nº de trechos gerados em paralelo (conexões Live API simultâneas). 3 é o limite
// de sessões concorrentes da Live API para o modelo native-audio; acima disso a
// API rejeita as conexões extras.
const DICTATION_CONCURRENCY = 3;

function chunkTextForDictation(text: string, maxLen = 700): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let buf = '';
  const flush = () => { if (buf.trim()) chunks.push(buf.trim()); buf = ''; };
  const add = (s: string) => { buf = buf ? `${buf} ${s}` : s; };

  for (const para of clean.split(/\n{2,}/)) {
    const sentences = para.match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g) || [para];
    for (const raw of sentences) {
      const s = raw.trim();
      if (!s) continue;
      if (s.length > maxLen) {
        // Frase gigante: quebra por palavras.
        flush();
        let wbuf = '';
        for (const w of s.split(/\s+/)) {
          if ((wbuf ? wbuf.length + 1 + w.length : w.length) > maxLen) { if (wbuf) chunks.push(wbuf); wbuf = w; }
          else wbuf = wbuf ? `${wbuf} ${w}` : w;
        }
        if (wbuf) add(wbuf);
      } else if ((buf ? buf.length + 1 + s.length : s.length) > maxLen) {
        flush();
        add(s);
      } else {
        add(s);
      }
    }
    flush(); // fim de parágrafo → fecha o trecho para pausas naturais
  }
  flush();
  return chunks;
}

// Junta os trechos de áudio ordenados num único Float32Array. Entradas `null`
// (trechos que falharam) viram silêncio, dimensionado proporcionalmente ao texto
// que faltou; devolve também as regiões falhas em segundos (24kHz) para o player
// exibir em vermelho e pular. Compartilhado pelo ditado e pelo TTS do chat.
function assembleDictationAudio(
  results: (Float32Array | null)[],
  chunkLens: number[]
): { merged: Float32Array; failedRegions: { start: number; end: number }[] } {
  let okSamples = 0, okChars = 0;
  results.forEach((a, i) => {
    if (a && a.length > 0) { okSamples += a.length; okChars += (chunkLens[i] || 1); }
  });
  const samplesPerChar = okChars > 0 ? okSamples / okChars : Math.round(24000 * 0.09);
  const MIN_GAP = Math.round(24000 * 0.5); // lacuna mínima de 0,5s (visível no slider)

  const parts: Float32Array[] = [];
  const gaps: { start: number; end: number }[] = []; // em amostras
  let cursor = 0;
  results.forEach((a, i) => {
    if (a && a.length > 0) {
      parts.push(a);
      cursor += a.length;
    } else {
      const len = Math.max(MIN_GAP, Math.round(samplesPerChar * (chunkLens[i] || 0)));
      parts.push(new Float32Array(len)); // silêncio
      // Junta a lacuna anterior se forem contíguas (trechos falhos seguidos).
      const last = gaps[gaps.length - 1];
      if (last && last.end === cursor) last.end = cursor + len;
      else gaps.push({ start: cursor, end: cursor + len });
      cursor += len;
    }
  });

  const merged = concatFloat32(parts);
  return { merged, failedRegions: gaps.map((g) => ({ start: g.start / 24000, end: g.end / 24000 })) };
}

function App() {
  const toast = useToast();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>('');
  const [memoryFacts, setMemoryFacts] = useState<MemoryFact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  // Modelo padrão do usuário: fica pré-selecionado ao abrir um novo chat.
  const [defaultModelId, setDefaultModelId] = useState(() => localStorage.getItem('nemon_default_model') || FALLBACK_MODEL);
  const [model, setModel] = useState(() => localStorage.getItem('nemon_default_model') || FALLBACK_MODEL);
  // Modelo usado para organizar/categorizar as memórias (DNA). Configurável na aba "Modelos".
  const [memoryModelId, setMemoryModelId] = useState(() => localStorage.getItem('nemon_memory_model') || FALLBACK_MODEL);
  // Modelos das tarefas internas que exigem google_search (só modelos com hasSearch).
  const [searchModelId, setSearchModelId] = useState(() => localStorage.getItem('nemon_search_model') || FALLBACK_MODEL);
  const [factCheckModelId, setFactCheckModelId] = useState(() => localStorage.getItem('nemon_factcheck_model') || FALLBACK_MODEL);
  // Ferramentas de chat (tool calling) habilitadas globalmente (F3). Ex.: ['calculate','get_weather'].
  const [enabledChatToolIds, setEnabledChatToolIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('nemon_chat_tools') || '[]'); } catch { return []; }
  });
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [imageGenEnabled, setImageGenEnabled] = useState(false);
  const [imagenModel, setImagenModel] = useState('imagen-4.0-fast-generate-001');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '9:16' | '16:9'>('1:1');
  const [expandedSourcesMsgId, setExpandedSourcesMsgId] = useState<string | null>(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('nemon-theme') || 'escuro');
  const [enabledModelIds, setEnabledModelIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('nemon_enabled_models');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch { /* ignore */ }
    }
    return ['gemma-4-31b-it', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite-preview'];
  });
  const [isArchiveExpanded, setIsArchiveExpanded] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isOrderLocked, setIsOrderLocked] = useState(() => {
    const saved = localStorage.getItem('nemon_sidebar_locked');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [showLiveSetupModal, setShowLiveSetupModal] = useState(false);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>(() => {
    const today = getPacificDate();
    const saved = localStorage.getItem('gemini_advanced_usage_v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.date === today) return parsed;
      } catch { /* ignore */ }
    }
    return { date: today, models: {} };
  });

  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgText, setEditingMsgText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [visibleMessagesCount, setVisibleMessagesCount] = useState(15);
  const [chatMargin, setChatMargin] = useState(() => {
    const saved = localStorage.getItem('nemon_chat_margin');
    return saved ? parseFloat(saved) : 5;
  });
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [selectedPersonalityId, setSelectedPersonalityId] = useState(() => {
    return localStorage.getItem('nemon_selected_personality_id') || 'default';
  });
  // Personalidade do modo LIVE — separada da dos chats (que é por-chat).
  const [livePersonalityId, setLivePersonalityId] = useState(() => localStorage.getItem('nemon_live_personality_id') || 'default');
  // Volume da voz da IA no modo LIVE (escala 0–10). 10 = máximo, 0 = mudo.
  const [liveVolume, setLiveVolume] = useState<number>(() => {
    const saved = localStorage.getItem('nemon_live_volume');
    const n = saved !== null ? parseInt(saved, 10) : 10;
    return isNaN(n) ? 10 : Math.max(0, Math.min(10, n));
  });
  const [settingsTab, setSettingsTab] = useState<'geral' | 'modelos' | 'api' | 'personalidades' | 'skills' | 'dna'>('geral');
  const [showPersonalitySelector, setShowPersonalitySelector] = useState(false);
  const [chatFontSize, setChatFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('nemon_chat_font_size');
    if (saved === 'sm') return 13;
    if (saved === 'md') return 15.5;
    if (saved === 'lg') return 18;
    if (saved === 'xl') return 21;
    return saved ? parseFloat(saved) : 15.5;
  });
  const [showFontSizeSelector, setShowFontSizeSelector] = useState(false);
  const [appFont, setAppFont] = useState<string>(() => localStorage.getItem('nemon_app_font') || DEFAULT_FONT_ID);
  const [retroMode, setRetroMode] = useState<boolean>(() => localStorage.getItem('nemon_retro_mode') === 'true');
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'files' | 'settings'>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nemon_sidebar_open');
      if (saved !== null) return saved === 'true';
      return window.innerWidth > 1024;
    }
    return true;
  });
  const [isLiveProactive, setIsLiveProactive] = useState(() => localStorage.getItem('nemon_live_proactive') === 'true');
  const [proactiveIdleCount, setProactiveIdleCount] = useState(0); // 0: Idle, 1: Probed, 2: Retried (Stopped)
  const [paidApiKey, setPaidApiKey] = useState('');
  const [defaultApiKey, setDefaultApiKey] = useState('');
  const [openRouterApiKey, setOpenRouterApiKey] = useState('');
  const [localEndpoint, setLocalEndpoint] = useState(() => localStorage.getItem('nemon_local_endpoint') || DEFAULT_LOCAL_ENDPOINT);
  // Modelos de chat customizados (OpenRouter) cadastrados pelo usuário.
  // Persistidos localmente e no Firestore (settings.customModels).
  const [customModels, setCustomModels] = useState<CustomModel[]>(() => {
    const saved = localStorage.getItem('nemon_custom_models');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* ignore */ }
    }
    return [];
  });
  // Pastas para organizar conversas (F5). Persistidas no Firestore (users/{uid}.folders).
  const [folders, setFolders] = useState<Folder[]>([]);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  // Skills (habilidades): templates de prompt + ferramentas. Persistidas no Firestore.
  const [skills, setSkills] = useState<Skill[]>([]);
  const [liveModel, setLiveModel] = useState(() => {
    const saved = localStorage.getItem('nemon_live_model');
    // Migra a chave antiga (gemini-3.1-flash-live) para o rótulo atual (gemini-3-flash-live).
    if (saved === 'gemini-3.1-flash-live') return 'gemini-3-flash-live';
    return saved || DEFAULT_LIVE_MODEL;
  });
  const [useMemoryLive, setUseMemoryLive] = useState(true);
  const [isLiveDetached, setIsLiveDetached] = useState(false);
  const [isLiveMicEnabled, setIsLiveMicEnabled] = useState(() => {
    const saved = localStorage.getItem('nemon_live_mic_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [logsCount, setLogsCount] = useState(0);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [showInChatFind, setShowInChatFind] = useState(false);
  const [previewCode, setPreviewCode] = useState<{ code: string; lang: string } | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const saveMemoryFactsToFirestore = useCallback((facts: MemoryFact[]) => {
    if (auth.currentUser) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      updateDoc(userDocRef, { memoryFacts: facts }).catch(e => console.error("Erro ao salvar memórias:", e));
    }
  }, []);



  // INTERCEPTAR EVENTOS DO CONSOLE E EXCEÇÕES GLOBAIS
  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args: any[]) => {
      originalLog.apply(console, args);
      const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      logger.addLog('info', message);
    };

    console.warn = (...args: any[]) => {
      originalWarn.apply(console, args);
      const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      logger.addLog('warn', message);
    };

    console.error = (...args: any[]) => {
      originalError.apply(console, args);
      const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      logger.addLog('error', message);
    };

    const handleGlobalError = (event: ErrorEvent) => {
      logger.addLog('error', `Erro Global: ${event.message} em ${event.filename}:${event.lineno}`);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      logger.addLog('error', `Rejeição de Promise Não Tratada: ${message}`, { reason });
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    if (!isLoggerInitialized) {
      logger.addLog('info', 'Sistema de rastreamento de logs ativado.');
      isLoggerInitialized = true;
    }

    // Diagnóstico: rode listLiveModels() no console do navegador (F12) para ver
    // quais modelos a sua chave pode usar na Live API. O resultado aparece no log.
    (window as any).listLiveModels = () => listLiveModels()
      .catch(e => console.error('[MODELS] Erro:', e?.message || e));

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Subscrever ao logger para obter a contagem de logs no mobile
  useEffect(() => {
    const unsubscribe = logger.subscribe((newLogs) => {
      setLogsCount(newLogs.length);
    });
    return unsubscribe;
  }, []);

  const saveConfig = useCallback((config: { paidApiKey?: string; defaultApiKey?: string; openRouterApiKey?: string }) => {
    if (config.paidApiKey !== undefined) {
      setPaidApiKey(config.paidApiKey);
      setGlobalPaidApiKey(config.paidApiKey);
    }
    if (config.defaultApiKey !== undefined) {
      setDefaultApiKey(config.defaultApiKey);
      setGlobalDefaultApiKey(config.defaultApiKey);
    }
    if (config.openRouterApiKey !== undefined) {
      setOpenRouterApiKey(config.openRouterApiKey);
      setGlobalOpenRouterApiKey(config.openRouterApiKey);
    }
    if (auth.currentUser) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      updateDoc(userDocRef, config).catch(err => console.error("Erro ao salvar configuração:", err));
    }
  }, []);

  // Mantém os modelos customizados sincronizados com o serviço (para resolver o
  // provedor a partir do id do modelo) e com o localStorage.
  useEffect(() => {
    setGlobalCustomModels(customModels);
    localStorage.setItem('nemon_custom_models', JSON.stringify(customModels));
  }, [customModels]);

  // Persiste alterações nos modelos customizados também no Firestore do usuário.
  const saveCustomModels = useCallback((models: CustomModel[]) => {
    setCustomModels(models);
    if (auth.currentUser) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      updateDoc(userDocRef, { customModels: models }).catch(err => console.error("Erro ao salvar modelos customizados:", err));
    }
  }, []);

  // ── Pastas (F5) ────────────────────────────────────────────────────────────
  const saveFolders = useCallback((next: Folder[]) => {
    setFolders(next);
    if (auth.currentUser) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      updateDoc(userDocRef, { folders: next }).catch(err => console.error("Erro ao salvar pastas:", err));
    }
  }, []);

  const handleCreateFolder = useCallback((name: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    saveFolders([...folders, { id: `f-${Date.now()}`, name: trimmed }]);
  }, [folders, saveFolders]);

  const handleRenameFolder = useCallback((id: string, name: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    saveFolders(folders.map(f => f.id === id ? { ...f, name: trimmed } : f));
  }, [folders, saveFolders]);

  const handleDeleteFolder = useCallback((id: string) => {
    saveFolders(folders.filter(f => f.id !== id));
    // Conversas da pasta excluída voltam para "Sem pasta".
    setChats(prev => prev.map(c => c.folderId === id ? { ...c, folderId: undefined } : c));
  }, [folders, saveFolders]);

  const handleSetChatFolder = useCallback((chatId: string, folderId: string | null) => {
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, folderId: folderId || undefined } : c));
  }, []);

  const toggleFolderCollapsed = useCallback((id: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ── Skills (F6/F3) ──────────────────────────────────────────────────────────
  const saveSkills = useCallback((next: Skill[]) => {
    setSkills(next);
    if (auth.currentUser) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      updateDoc(userDocRef, { skills: next }).catch(err => console.error("Erro ao salvar skills:", err));
    }
  }, []);

  const handleSaveSkill = useCallback((skill: Skill) => {
    setSkills(prev => {
      const exists = prev.some(s => s.id === skill.id);
      const next = exists ? prev.map(s => s.id === skill.id ? skill : s) : [...prev, skill];
      if (auth.currentUser) {
        updateDoc(doc(db, 'users', auth.currentUser.uid), { skills: next }).catch(err => console.error("Erro ao salvar skills:", err));
      }
      return next;
    });
  }, []);

  const handleDeleteSkill = useCallback((id: string) => {
    saveSkills(skills.filter(s => s.id !== id));
  }, [skills, saveSkills]);

  // Templates de prompt (para o menu "/" do chat).
  const promptSkills = useMemo(() => skills.filter(s => s.kind === 'prompt'), [skills]);

  // Backfill: modelos OpenRouter cadastrados antes destes recursos podem não ter
  // `contextLength` e/ou `capabilities`. Busca os metadados no OpenRouter uma vez e
  // salva, para o indicador de contexto e os emojis de capacidade aparecerem.
  useEffect(() => {
    if (!openRouterApiKey) return;
    const missing = customModels.filter(m => m.provider === 'openrouter' && (!m.contextLength || !m.capabilities));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const resolved = await Promise.all(
        missing.map(async m => ({ id: m.id, meta: await fetchOpenRouterModelMeta(m.id) }))
      );
      if (cancelled) return;
      const metaById = new Map(resolved.filter(r => r.meta.contextLength || r.meta.capabilities).map(r => [r.id, r.meta]));
      if (metaById.size === 0) return; // nada resolvido: não re-dispara (customModels inalterado)
      saveCustomModels(customModels.map(m => {
        const meta = metaById.get(m.id);
        return meta ? { ...m, contextLength: m.contextLength ?? meta.contextLength, capabilities: m.capabilities ?? meta.capabilities } : m;
      }));
    })();
    return () => { cancelled = true; };
  }, [customModels, openRouterApiKey, saveCustomModels]);

  // Mantém o endpoint do modelo local (llama.cpp) sincronizado com o serviço e o localStorage.
  // É guardado localmente (não no Firestore) por ser específico do dispositivo.
  useEffect(() => {
    setGlobalLocalEndpoint(localEndpoint);
    localStorage.setItem('nemon_local_endpoint', localEndpoint);
  }, [localEndpoint]);

  useEffect(() => {
    localStorage.setItem('gemini_advanced_usage_v1', JSON.stringify(dailyUsage));
    if (auth.currentUser && dailyUsage.date) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      updateDoc(userDocRef, { dailyUsage }).catch(e => console.error("Erro ao salvar uso no Firestore:", e));
    }
  }, [dailyUsage]);

  // LIVE MODE STATE
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('disconnected');
  const [liveTranscript, setLiveTranscript] = useState<{ role: 'user' | 'ai'; text: string; audioId?: string }[]>([]);
  const [liveVoice, setLiveVoice] = useState(() => localStorage.getItem('nemon_live_voice') || DEFAULT_LIVE_VOICE);
  const [liveVisionType, setLiveVisionType] = useState<'camera' | 'screen' | null>(null);
  const [liveVideoStream, setLiveVideoStream] = useState<MediaStream | null>(null);
  const [isLiveSpeaking, setIsLiveSpeaking] = useState(false);
  const liveSessionRef = useRef<GeminiLiveSession | null>(null);
  // Espelho sempre atual da voz LIVE, usado pelo executor de ferramentas e helpers.
  const liveVoiceRef = useRef<string>(liveVoice);
  // Refs para o executor de ferramentas do LIVE, reusado no tool calling do chat
  // (F3) — evita TDZ/dep já que handleLiveToolCall é definido mais abaixo.
  const liveToolCallRef = useRef<((name: string, args: any) => Promise<{ result: string }>) | null>(null);
  const liveToolUsedRef = useRef<((name: string) => void) | null>(null);
  // Valor sempre atual do volume + nó de ganho do pipeline de áudio do LIVE.
  const liveVolumeRef = useRef<number>(liveVolume);
  const liveGainNodeRef = useRef<GainNode | null>(null);
  const lastLiveActivityRef = useRef<number>(Date.now());
  // Marca que o turno anterior da IA terminou: a próxima fala dela deve iniciar um
  // balão novo na transcrição (evita mesclar duas respostas distintas, como ao
  // trocar de personalidade). Consumida na primeira transcrição 'ai' seguinte.
  const aiTurnBoundaryRef = useRef<boolean>(false);

  // ---- Ditado de textos (TTS por chunks, sessões PARALELAS) ----
  const [showDictation, setShowDictation] = useState(false);
  const [dictationText, setDictationText] = useState('');
  const [dictationStatus, setDictationStatus] = useState<DictationStatus>('idle');
  const [dictationProgress, setDictationProgress] = useState({ current: 0, total: 0 });
  const [dictationError, setDictationError] = useState('');
  const [dictationBuffer, setDictationBuffer] = useState<AudioBuffer | null>(null);
  const [dictationVolume, setDictationVolume] = useState<number>(10);
  // Voz da narração do ditado, independente da voz do modo LIVE (persistida).
  const [dictationVoice, setDictationVoice] = useState(
    () => localStorage.getItem('nemon_dictation_voice') || DEFAULT_LIVE_VOICE
  );
  // Regiões (em segundos) de trechos que falharam — marcadas em vermelho e puladas no player.
  const [dictationFailedRegions, setDictationFailedRegions] = useState<{ start: number; end: number }[]>([]);
  const dictationSessionRef = useRef<GeminiDictationSession | null>(null);
  const dictationChunksRef = useRef<string[]>([]); // textos dos trechos (p/ dimensionar lacunas)
  const dictationCtxRef = useRef<AudioContext | null>(null);
  const dictationGainRef = useRef<GainNode | null>(null);

  // ---- Falar em voz alta as mensagens do chat (TTS por mensagem) ----
  // Áudio gerado por id de mensagem; a barra fica salva abaixo da mensagem (como no LIVE).
  const [chatTts, setChatTts] = useState<Record<string, ChatTtsEntry>>({});
  const chatTtsRef = useRef<Record<string, ChatTtsEntry>>({}); // espelho p/ manter onSpeak estável
  const chatTtsSessionRef = useRef<GeminiDictationSession | null>(null); // uma geração por vez
  const chatTtsActiveIdRef = useRef<string | null>(null);
  const chatTtsCtxRef = useRef<AudioContext | null>(null);
  const chatTtsGainRef = useRef<GainNode | null>(null);
  useEffect(() => { chatTtsRef.current = chatTts; }, [chatTts]);

  // Reouvir mensagens da IA: acumula os chunks de áudio do turno em andamento e,
  // ao fim do turno, guarda o AudioBuffer resultante indexado por um id. São
  // temporários (só durante a sessão): limpos ao encerrar o LIVE.
  const liveAudioTurnChunksRef = useRef<Float32Array[]>([]);
  const liveMessageAudioRef = useRef<Map<string, AudioBuffer>>(new Map());
  // Coordenador de reprodução: garante que só um player toque por vez.
  const activePlayerStopRef = useRef<null | (() => void)>(null);

  const resetProactivityState = useCallback((reason: string) => {
    console.log("[PROATIVIDADE] Resetando estado de proatividade. Motivo:", reason);
    // Apenas resetamos se estivermos ativos e com proatividade ligada
    setProactiveIdleCount(0);
    lastLiveActivityRef.current = Date.now();
  }, []);
  const liveAudioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextAudioTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  // Espelha o modelo LIVE selecionado para evitar closures desatualizadas em reinícios de sessão.
  const liveModelRef = useRef<string>(liveModel);
  // Espelhos de estado sempre atuais, usados pelo executor de ferramentas do modo LIVE.
  const memoryFactsRef = useRef<MemoryFact[]>([]);
  const chatsRef = useRef<ChatSession[]>([]);
  const personalitiesRef = useRef<Personality[]>([]);
  const livePersonalityIdRef = useRef<string>('default');
  // Executor de ferramentas do LIVE (definido após os handlers; acessado via ref para evitar TDZ).
  const liveToolExecutorRef = useRef<((name: string, args: any) => Promise<any>) | null>(null);
  // Registro de alarmes/cronômetros/lembretes agendados no modo LIVE.
  const scheduledAlarmsRef = useRef<Map<string, { id: string; kind: 'alarme' | 'cronômetro' | 'lembrete'; label: string; fireAtMs: number; timeoutId: number }>>(new Map());
  // Espelho do tipo de visão ativa (câmera/tela), usado pelo executor de ferramentas.
  const liveVisionTypeRef = useRef<'camera' | 'screen' | null>(null);
  // Toast de notificação quando o modelo usa uma ferramenta no modo LIVE.
  const [liveToolToast, setLiveToolToast] = useState<{ id: number; label: string } | null>(null);
  const toolToastTimeoutRef = useRef<number | null>(null);
  const [liveAnalyser, setLiveAnalyser] = useState<AnalyserNode | null>(null);
  const [selectionData, setSelectionData] = useState<{ text: string, pos: { x: number, y: number }, messageId: string } | null>(null);
  const [isCheckingSegment] = useState(false);
  const [categorizationProgress, setCategorizationProgress] = useState<{ current: number, total: number }>({ current: 0, total: 0 });

  useEffect(() => {
    localStorage.setItem('nemon_enabled_models', JSON.stringify(enabledModelIds));
  }, [enabledModelIds]);

  useEffect(() => {
    localStorage.setItem('nemon_default_model', defaultModelId);
  }, [defaultModelId]);

  useEffect(() => {
    localStorage.setItem('nemon_memory_model', memoryModelId);
  }, [memoryModelId]);

  useEffect(() => { localStorage.setItem('nemon_search_model', searchModelId); }, [searchModelId]);
  useEffect(() => { localStorage.setItem('nemon_factcheck_model', factCheckModelId); }, [factCheckModelId]);
  useEffect(() => { localStorage.setItem('nemon_chat_tools', JSON.stringify(enabledChatToolIds)); }, [enabledChatToolIds]);

  // Resolve o modelo com que um novo chat deve abrir: o padrão do usuário se ele
  // ainda existir (interno ou customizado); senão, cai no modelo de fábrica.
  const resolveStartModel = useCallback(() => {
    const exists = MODEL_OPTIONS.some(o => o.id === defaultModelId)
      || customModels.some(m => m.id === defaultModelId);
    return exists ? defaultModelId : FALLBACK_MODEL;
  }, [defaultModelId, customModels]);

  // Ao trocar de chat: restaura o modelo salvo naquela conversa; num chat novo
  // (sem id), pré-seleciona o modelo padrão. Usa chatsRef p/ não re-disparar a
  // cada atualização de `chats` (ex.: streaming) — só depende do id ativo.
  useEffect(() => {
    if (activeChatId === '') { setModel(resolveStartModel()); return; }
    const chat = chatsRef.current.find(c => c.id === activeChatId);
    setModel(chat?.model || resolveStartModel());
  }, [activeChatId, resolveStartModel]);

  // Troca de modelo pelo seletor do chat: atualiza a seleção atual e persiste no
  // chat ativo (para a conversa lembrar o modelo entre trocas e reloads).
  const handleSetModel = useCallback((id: string) => {
    setModel(id);
    if (activeChatId) {
      setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, model: id } : c));
    }
  }, [activeChatId]);

  useEffect(() => {
    localStorage.setItem('nemon_sidebar_open', isSidebarOpen.toString());
  }, [isSidebarOpen]);

  useEffect(() => {
    localStorage.setItem('nemon_live_proactive', isLiveProactive.toString());
  }, [isLiveProactive]);

  useEffect(() => {
    liveModelRef.current = liveModel;
  }, [liveModel]);

  useEffect(() => { memoryFactsRef.current = memoryFacts; }, [memoryFacts]);
  useEffect(() => { chatsRef.current = chats; }, [chats]);
  useEffect(() => { personalitiesRef.current = personalities; }, [personalities]);
  useEffect(() => {
    livePersonalityIdRef.current = livePersonalityId;
    localStorage.setItem('nemon_live_personality_id', livePersonalityId);
  }, [livePersonalityId]);
  useEffect(() => { liveVisionTypeRef.current = liveVisionType; }, [liveVisionType]);
  useEffect(() => { liveVoiceRef.current = liveVoice; }, [liveVoice]);

  // Aplica uma voz no modo LIVE: persiste a escolha (state + localStorage + ref) e,
  // se há sessão ativa, troca a voz na hora sem perder o contexto (reconexão com
  // retomada). Fonte única usada pelo usuário (UI) e pelo modelo (ferramentas).
  const applyLiveVoice = useCallback((voice: string) => {
    if (!voice) return;
    setLiveVoice(voice);
    liveVoiceRef.current = voice;
    localStorage.setItem('nemon_live_voice', voice);
    liveSessionRef.current?.setVoice(voice);
  }, []);

  useEffect(() => {
    liveVolumeRef.current = liveVolume;
    localStorage.setItem('nemon_live_volume', String(liveVolume));
  }, [liveVolume]);

  // Aplica o volume da voz da IA no modo LIVE (escala 0–10 → ganho 0.0–1.0).
  // Fonte única usada pelo usuário (slider) e pelo modelo (ferramenta set_ai_volume).
  // Uma rampa curta evita estalos ao mudar o ganho abruptamente.
  const applyLiveVolume = useCallback((level: number) => {
    const clamped = Math.max(0, Math.min(10, Math.round(Number(level))));
    setLiveVolume(clamped);
    liveVolumeRef.current = clamped;
    const gain = liveGainNodeRef.current;
    const ctx = liveAudioContextRef.current;
    if (gain && ctx) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(clamped / 10, now + 0.05);
    }
    return clamped;
  }, []);

  // Fecha o turno de áudio da IA: junta os chunks acumulados num AudioBuffer,
  // guarda-o por id e associa esse id ao último balão 'ai' ainda sem áudio, para
  // permitir reouvir aquela fala depois. Idempotente (sem chunks → no-op).
  const finalizeAiTurnAudio = useCallback(() => {
    const chunks = liveAudioTurnChunksRef.current;
    liveAudioTurnChunksRef.current = [];
    const ctx = liveAudioContextRef.current;
    if (!ctx || chunks.length === 0) return;
    let total = 0;
    for (const c of chunks) total += c.length;
    if (total === 0) return;
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.length; }
    const audioBuffer = ctx.createBuffer(1, merged.length, 24000);
    audioBuffer.copyToChannel(merged as unknown as Float32Array<ArrayBuffer>, 0);
    const audioId = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    liveMessageAudioRef.current.set(audioId, audioBuffer);
    setLiveTranscript(prev => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === 'ai' && !prev[i].audioId) {
          const copy = prev.slice();
          copy[i] = { ...copy[i], audioId };
          return copy;
        }
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--chat-font-size', `${chatFontSize}px`);
    localStorage.setItem('nemon_chat_font_size', chatFontSize.toString());
  }, [chatFontSize]);

  // Aplica a fonte de texto do sistema (variável CSS --app-font usada pelo body).
  useEffect(() => {
    const font = FONT_OPTIONS.find(f => f.id === appFont) || FONT_OPTIONS[0];
    document.documentElement.style.setProperty('--app-font', font.stack);
    localStorage.setItem('nemon_app_font', appFont);
  }, [appFont]);

  const previousScrollHeightRef = useRef<number>(0);
  const isLazyLoadingRef = useRef<boolean>(false);
  const chatWindowRef = useRef<HTMLElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentAiMsgIdRef = useRef<string | null>(null);
  const factCheckControllersRef = useRef<Record<string, AbortController>>({});
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs for closing popups when clicking outside
  const personalityRef = useRef<HTMLDivElement>(null);
  const fontSizeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        showPersonalitySelector &&
        personalityRef.current &&
        !personalityRef.current.contains(target)
      ) {
        setShowPersonalitySelector(false);
      }
      if (
        showFontSizeSelector &&
        fontSizeRef.current &&
        !fontSizeRef.current.contains(target)
      ) {
        setShowFontSizeSelector(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPersonalitySelector, showFontSizeSelector]);

  useEffect(() => {
    if (!isLiveActive || !isLiveProactive) {
      setProactiveIdleCount(0);
      return;
    }

    const interval = setInterval(() => {
      if (isLiveSpeaking) {
        lastLiveActivityRef.current = Date.now();
        return;
      }

      const elapsed = Date.now() - lastLiveActivityRef.current;

      // Monitoramento de Inatividade
      if (proactiveIdleCount === 0 && elapsed > 30000) {
        if (liveSessionRef.current) {
          console.log("[PROATIVIDADE] Inatividade detectada (30s). Estágio 1: Puxando assunto...");
          liveSessionRef.current.sendText("[SISTEMA: Modo Proativo. Analise o contexto e faça uma pergunta curta e pertinente agora.]");
          setProactiveIdleCount(1);
          lastLiveActivityRef.current = Date.now();
        }
      }
      else if (proactiveIdleCount === 1 && elapsed > 30000) {
        if (liveSessionRef.current) {
          console.log("[PROATIVIDADE] Inatividade continuada (60s). Estágio 2: Check-in...");
          liveSessionRef.current.sendText("[SISTEMA: O usuário não respondeu. Pergunte se ele ainda está aí de forma amigável.]");
          setProactiveIdleCount(2);
          lastLiveActivityRef.current = Date.now();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isLiveActive, isLiveProactive, proactiveIdleCount, isLiveSpeaking]);

  const handleAutoCategorize = useCallback(async () => {
    if (memoryFacts.length === 0) return;
    setIsCategorizing(true);
    setCategorizationProgress({ current: 0, total: 0 });

    console.log("Iniciando organização inteligente em lotes...");

    // Configurações de lote (batching) para garantir estabilidade JSON
    const CHUNK_SIZE = 15;
    const chunks: MemoryFact[][] = [];
    for (let i = 0; i < memoryFacts.length; i += CHUNK_SIZE) {
      chunks.push(memoryFacts.slice(i, i + CHUNK_SIZE));
    }

    setCategorizationProgress({ current: 0, total: chunks.length });
    let currentFacts = [...memoryFacts];

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`Processando lote ${i + 1}/${chunks.length}...`);

        const prompt = `Você é um especialista em organização de conhecimento. 
        Analise a seguinte lista de memórias e organize-as em categorias lógicas e interconectadas.
        
        RETORNE APENAS UM OBJETO JSON DE MAPEAMENTO no seguinte formato:
        { 
          "id_original": { "c": "Nova Categoria", "n": ["id_rel1", "id_rel2"] }
        }
        
        REGRAS:
        1. Use "c" para a categoria e "n" para o array de IDs de conexões (links).
        2. Categorize tudo de forma lógica (ex: Pessoal, Trabalho, Hardware, Hobbies).
        3. Identifique conexões reais entre os fatos.
        4. Responda APENAS o JSON. Não repita o texto dos fatos.
        
        LISTA DE FATOS DESTE LOTE (ID e Texto):\n${JSON.stringify(chunk.map(f => ({ id: f.id, t: f.text })))}`;

        try {
          // Modelo configurável (aba "Modelos"); JSON mode forçado.
          const res = await generateGeminiContent(prompt, memoryModelId, [], "Você é um organizador de dados JSON.", [], false, false, true);
          const mapping = extractAndParseJson(res.text);

          if (mapping && typeof mapping === 'object' && !Array.isArray(mapping)) {
            currentFacts = currentFacts.map(fact => {
              const update = mapping[fact.id];
              if (update) {
                return {
                  ...fact,
                  category: update.c || fact.category,
                  connections: Array.isArray(update.n) ? update.n.filter((id: string) => id !== fact.id) : fact.connections,
                  timestamp: Date.now()
                };
              }
              return fact;
            });

            // Atualização parcial do estado para feedback visual imediato
            setMemoryFacts([...currentFacts]);
            setCategorizationProgress(prev => ({ ...prev, current: i + 1 }));

            // Checkpoint no servidor
            saveMemoryFactsToFirestore(currentFacts);
          }
        } catch (batchError) {
          console.error(`Erro no lote ${i + 1}:`, batchError);
          // Continua para o próximo lote se um falhar
        }
      }
      console.log("Organização de DNA concluída com sucesso!");
    } catch (e) {
      console.error("Erro fatal na auto-categorização:", e);
      toast.error("Houve um problema ao organizar as memórias: " + (e instanceof Error ? e.message : "Erro desconhecido"));
    } finally {
      setIsCategorizing(false);
      setCategorizationProgress({ current: 0, total: 0 });
    }
  }, [memoryFacts, saveMemoryFactsToFirestore, memoryModelId, toast]);

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = useMemo(() => activeChat?.messages || [], [activeChat]);

  // Personalidade "atual" mostrada/editada no cabeçalho, conforme o contexto:
  // - Modo LIVE: a personalidade do Live (separada).
  // - Chat aberto: a personalidade salva NAQUELE chat (por-chat).
  // - Sem chat (tela nova): o padrão para novos chats.
  const currentPersonalityId = isLiveActive
    ? livePersonalityId
    : (activeChatId ? (activeChat?.personalityId ?? 'default') : selectedPersonalityId);

  // Seleciona a personalidade no contexto certo (Live vs chat vs padrão) e, no Live,
  // injeta a persona na sessão em andamento para afetar a fala imediatamente.
  const handleSelectPersonality = useCallback((id: string) => {
    if (isLiveActive) {
      setLivePersonalityId(id);
      livePersonalityIdRef.current = id;
      const p = [DEFAULT_PERSONALITY, ...personalitiesRef.current].find(pp => pp.id === id);
      const session = liveSessionRef.current;
      if (session && p) {
        resetProactivityState('Troca de personalidade (UI)');

        // 1) Atualiza a instrução de sistema da sessão para a nova personalidade,
        //    para que qualquer reconexão (voz/GoAway) já use a personalidade certa.
        session.setPersonalityPrompt(buildLiveInstruction(p.prompt, memoryFactsRef.current, useMemoryLive));

        // 2) Se a personalidade tem voz padrão, aplica-a (pode agendar reconexão).
        if (p.voice) applyLiveVoice(p.voice);

        // 3) Injeta a persona. Se há reconexão de voz pendente, a injeção é
        //    ENFILEIRADA para depois do novo setup (senão se perderia no
        //    fechamento da conexão atual). Caso contrário, envia agora.
        const persona = p.prompt?.trim() ? p.prompt.trim() : 'Estilo neutro, natural e direto.';
        const injection = `[SISTEMA: Troca de personalidade para "${p.name}". A partir de AGORA incorpore integralmente esta persona e responda SEMPRE neste estilo (tom, voz e vocabulário): ${persona} — Cumprimente brevemente já no novo personagem.]`;
        if (session.isVoiceReconnectPending()) {
          session.queuePersonaInjection(injection);
        } else {
          session.sendText(injection);
        }
      }
    } else if (activeChatId) {
      // Salva a personalidade NAQUELE chat.
      setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, personalityId: id } : c));
    } else {
      // Sem chat aberto: define o padrão para o próximo chat criado.
      setSelectedPersonalityId(id);
    }
  }, [isLiveActive, activeChatId, resetProactivityState, applyLiveVoice, useMemoryLive]);

  const previousChatsRef = useRef<ChatSession[]>([]);
  const isInitialLoadRef = useRef(true);
  // Timer de debounce para persistência no Firestore. Evita gravar o documento inteiro
  // do chat a cada chunk do streaming (o que estourava "maximum allowed queued writes").
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load Initial Data from Firestore on Auth State Change
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setIsInitialLoading(true);
        isInitialLoadRef.current = true;
        try {
          const uid = currentUser.uid;
          const userDocRef = doc(db, 'users', uid);
          const userDocSnap = await getDoc(userDocRef);

          let dbMemoryFacts: MemoryFact[] = [];
          let dbPersonalities: Personality[] = [];
          let dbDailyUsage: DailyUsage = { date: getPacificDate(), models: {} };
          let dbPaidApiKey = '';
          let dbDefaultApiKey = '';
          let dbOpenRouterApiKey = '';
          let dbCustomModels: CustomModel[] = [];
          let dbFolders: Folder[] = [];
          let dbSkills: Skill[] = [];
          let dbSidebarOrder: string[] = [];

          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            dbMemoryFacts = data.memoryFacts || [];
            dbPersonalities = data.personalities || [];
            if (data.dailyUsage && data.dailyUsage.date === getPacificDate()) {
              dbDailyUsage = data.dailyUsage;
            }
            dbPaidApiKey = data.paidApiKey || '';
            dbDefaultApiKey = data.defaultApiKey || '';
            dbOpenRouterApiKey = data.openRouterApiKey || '';
            dbCustomModels = Array.isArray(data.customModels) ? data.customModels : [];
            dbFolders = Array.isArray(data.folders) ? data.folders : [];
            dbSkills = Array.isArray(data.skills) ? data.skills : [];
            dbSidebarOrder = data.sidebarOrder || [];

            // Sync settings to states
            if (data.settings) {
              if (data.settings.theme) {
                setTheme(data.settings.theme);
                document.documentElement.setAttribute('data-theme', data.settings.theme);
              }
              if (data.settings.chatMargin !== undefined) setChatMargin(data.settings.chatMargin);
              if (data.settings.selectedPersonalityId) setSelectedPersonalityId(data.settings.selectedPersonalityId);
              if (data.settings.livePersonalityId) setLivePersonalityId(data.settings.livePersonalityId);
              if (data.settings.chatFontSize !== undefined) setChatFontSize(data.settings.chatFontSize);
              if (data.settings.appFont) setAppFont(data.settings.appFont);
              if (data.settings.retroMode !== undefined) setRetroMode(data.settings.retroMode);
              if (data.settings.isOrderLocked !== undefined) setIsOrderLocked(data.settings.isOrderLocked);
              if (data.settings.enabledModelIds) setEnabledModelIds(data.settings.enabledModelIds);
              if (data.settings.defaultModelId) {
                setDefaultModelId(data.settings.defaultModelId);
                // Na carga inicial, o novo chat abre com o modelo padrão do usuário.
                setModel(data.settings.defaultModelId);
              }
              if (data.settings.memoryModelId) setMemoryModelId(data.settings.memoryModelId);
              if (data.settings.searchModelId) setSearchModelId(data.settings.searchModelId);
              if (data.settings.factCheckModelId) setFactCheckModelId(data.settings.factCheckModelId);
              if (Array.isArray(data.settings.enabledChatToolIds)) setEnabledChatToolIds(data.settings.enabledChatToolIds);
              if (data.settings.isLiveProactive !== undefined) setIsLiveProactive(data.settings.isLiveProactive);
              if (data.settings.liveVoice) setLiveVoice(data.settings.liveVoice);
              if (data.settings.liveModel) setLiveModel(data.settings.liveModel);
            }
          } else {
            // First time: Create Firestore document
            const initialData = {
              email: currentUser.email,
              displayName: currentUser.displayName,
              memoryFacts: [],
              personalities: [],
              dailyUsage: { date: getPacificDate(), models: {} },
              paidApiKey: '',
              defaultApiKey: '',
              openRouterApiKey: '',
              customModels: [],
              folders: [],
              skills: [],
              sidebarOrder: [],
              settings: {
                theme,
                chatMargin,
                selectedPersonalityId,
                chatFontSize,
                appFont,
                isOrderLocked,
                enabledModelIds,
                defaultModelId,
                memoryModelId,
                searchModelId,
                factCheckModelId,
                enabledChatToolIds,
                isLiveProactive,
                liveVoice,
                liveModel
              }
            };
            await setDoc(userDocRef, initialData);
          }

          setMemoryFacts(dbMemoryFacts);
          setPersonalities(dbPersonalities);
          setDailyUsage(dbDailyUsage);
          setPaidApiKey(dbPaidApiKey);
          setGlobalPaidApiKey(dbPaidApiKey);
          setDefaultApiKey(dbDefaultApiKey);
          setGlobalDefaultApiKey(dbDefaultApiKey);
          setOpenRouterApiKey(dbOpenRouterApiKey);
          setGlobalOpenRouterApiKey(dbOpenRouterApiKey);
          setCustomModels(dbCustomModels);
          setGlobalCustomModels(dbCustomModels);
          setFolders(dbFolders);
          setSkills(dbSkills);

          // Load all chats
          const chatsColRef = collection(db, 'users', uid, 'chats');
          const chatsSnap = await getDocs(chatsColRef);
          const loadedChats: ChatSession[] = [];
          chatsSnap.forEach((d) => {
            loadedChats.push(d.data() as ChatSession);
          });

          const orderedChats = [...loadedChats];
          if (dbSidebarOrder.length > 0) {
            orderedChats.sort((a, b) => {
              const indexA = dbSidebarOrder.indexOf(a.id);
              const indexB = dbSidebarOrder.indexOf(b.id);
              if (indexA === -1 && indexB === -1) return 0;
              if (indexA === -1) return 1;
              if (indexB === -1) return -1;
              return indexA - indexB;
            });
          }

          setChats(orderedChats);
          if (orderedChats.length > 0) {
            setActiveChatId(orderedChats[0].id);
          } else {
            setActiveChatId('');
          }
        } catch (err) {
          console.error("Erro ao carregar dados do Firestore:", err);
        } finally {
          setIsInitialLoading(false);
        }
      } else {
        // Logged out
        setChats([]);
        setActiveChatId('');
        setMemoryFacts([]);
        setPersonalities([]);
        setPaidApiKey('');
        setGlobalPaidApiKey('');
        setDefaultApiKey('');
        setGlobalDefaultApiKey('');
        setOpenRouterApiKey('');
        setGlobalOpenRouterApiKey('');
        setCustomModels([]);
        setFolders([]);
        setSkills([]);
        setGlobalCustomModels([]);
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
    // Subscrição de auth deve rodar só na montagem; incluir os settings faria
    // re-subscrever a cada mudança de configuração.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save changes to chats subcollection & sidebarOrder in Firestore
  useEffect(() => {
    if (!auth.currentUser || isAuthLoading || isInitialLoading) return;
    const uid = auth.currentUser.uid;

    if (isInitialLoadRef.current) {
      previousChatsRef.current = chats;
      isInitialLoadRef.current = false;
      return;
    }

    // Captura o estado mais recente para gravar quando o debounce disparar.
    const snapshot = chats;

    const flush = () => {
      // 1. Detect deleted chats
      const deletedChats = previousChatsRef.current.filter(prevChat => !snapshot.some(c => c.id === prevChat.id));
      deletedChats.forEach(async (chat) => {
        const chatDocRef = doc(db, 'users', uid, 'chats', chat.id);
        await deleteDoc(chatDocRef).catch(e => console.error("Erro ao deletar chat no Firestore:", e));
      });

      // 2. Detect updated or new chats
      snapshot.forEach(async (chat) => {
        const prevChat = previousChatsRef.current.find(c => c.id === chat.id);
        if (!prevChat || JSON.stringify(prevChat) !== JSON.stringify(chat)) {
          const chatDocRef = doc(db, 'users', uid, 'chats', chat.id);
          await setDoc(chatDocRef, chat).catch(e => console.error("Erro ao salvar chat no Firestore:", e));
        }
      });

      // 3. Save sidebar order if changed
      const currentOrder = snapshot.map(c => c.id);
      const prevOrder = previousChatsRef.current.map(c => c.id);
      if (JSON.stringify(currentOrder) !== JSON.stringify(prevOrder)) {
        const userDocRef = doc(db, 'users', uid);
        updateDoc(userDocRef, { sidebarOrder: currentOrder }).catch(e => console.error("Erro ao salvar ordem no Firestore:", e));
      }

      previousChatsRef.current = snapshot;
    };

    // Debounce: durante o streaming o `chats` muda a cada chunk. Reagendamos a gravação
    // a cada mudança, então o Firestore só recebe UMA escrita ~800ms após a resposta
    // assentar — em vez de centenas de escritas do documento inteiro por resposta.
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(flush, 800);

    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [chats, isAuthLoading, isInitialLoading]);

  // Sync Preferences/Settings to Firestore
  useEffect(() => {
    if (auth.currentUser && !isAuthLoading && !isInitialLoading) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      updateDoc(userDocRef, {
        settings: {
          theme,
          chatMargin,
          selectedPersonalityId,
          livePersonalityId,
          chatFontSize,
          appFont,
          isOrderLocked,
          enabledModelIds,
          defaultModelId,
          memoryModelId,
          searchModelId,
          factCheckModelId,
          enabledChatToolIds,
          isLiveProactive,
          liveVoice,
          liveModel,
          retroMode
        }
      }).catch(e => console.error("Erro ao salvar configurações no Firestore:", e));
    }
  }, [theme, chatMargin, selectedPersonalityId, livePersonalityId, chatFontSize, appFont, isOrderLocked, enabledModelIds, defaultModelId, memoryModelId, searchModelId, factCheckModelId, enabledChatToolIds, isLiveProactive, liveVoice, liveModel, retroMode, isAuthLoading, isInitialLoading]);

  useEffect(() => {
    localStorage.setItem('nemon_sidebar_locked', JSON.stringify(isOrderLocked));
  }, [isOrderLocked]);

  // Auto-Save Margins
  useEffect(() => {
    localStorage.setItem('nemon_chat_margin', chatMargin.toString());
  }, [chatMargin]);

  // Auto-Save Personalities
  useEffect(() => {
    if (auth.currentUser && personalities.length > 0) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      updateDoc(userDocRef, { personalities }).catch(e => console.error("Erro ao salvar personalidades no Firestore:", e));
    }
    localStorage.setItem('nemon_selected_personality_id', selectedPersonalityId);
  }, [personalities, selectedPersonalityId]);

  // Close menus on click outside
  useEffect(() => {
    const handleGlobalClick = () => setMenuOpenId(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nemon-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-retro', retroMode ? 'on' : 'off');
    localStorage.setItem('nemon_retro_mode', String(retroMode));
  }, [retroMode]);

  // LIVE MODE LOGIC
  const handleLiveStop = useCallback(() => {
    liveSessionRef.current?.stop();
    liveSessionRef.current = null;
    liveAudioContextRef.current?.close();
    liveAudioContextRef.current = null;
    liveGainNodeRef.current = null;
    setLiveAnalyser(null);
    setLiveVisionType(null);
    setLiveVideoStream(null);
    setIsLiveSpeaking(false);
    setIsLiveActive(false);
    setIsLiveDetached(false);
    setLiveStatus('disconnected');
    setLiveTranscript([]);
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    nextAudioTimeRef.current = 0;
    // Descarta o áudio temporário das mensagens (só vale durante a sessão) e para
    // qualquer reprodução em andamento.
    activePlayerStopRef.current?.();
    activePlayerStopRef.current = null;
    liveAudioTurnChunksRef.current = [];
    liveMessageAudioRef.current.clear();
  }, []);

  // Handle Escape Key Global
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeTab === 'settings') {
          setActiveTab('chat');
          return;
        }
        if (isLiveActive) {
          handleLiveStop();
          return;
        }
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [activeTab, isLiveActive, handleLiveStop]);

  const scrollToBottom = useCallback((force = false, smooth = false) => {
    if (chatWindowRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatWindowRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 300;
      if (force || isNearBottom) {
        chatWindowRef.current.scrollTo({ top: scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
      }
    }
  }, []);

  const parseMemoryTags = useCallback((str: string, isFinal: boolean = false, onFindUpdates?: (updates: PendingMemoryUpdate[]) => void) => {
    const memoryTagRegex = /<MEMORY(?:\s+category=['"]([^'"]*)['"])?(?:\s+connections=['"]([^'"]*)['"])?>\s*([\s\S]*?)\s*<\/MEMORY>/g;
    const updateTagRegex = /<UPDATE_MEMORY\s+id=['"]([^'"]*)['"](?:\s+category=['"]([^'"]*)['"])?>\s*([\s\S]*?)\s*<\/UPDATE_MEMORY>/g;
    const deleteTagRegex = /<DELETE_MEMORY\s+id=['"]([^'"]*?)['"]\s*\/>/g;

    if (isFinal) {
      let newMemories = [...memoryFacts];
      let hasMemoryUpdates = false;
      let match;

      // Adicionar novos fatos automaticamente (não são contradições)
      while ((match = memoryTagRegex.exec(str)) !== null) {
        const categoryValue = match[1] || 'Diversos';
        const connectionsValue = match[2] ? match[2].split(',').map(s => s.trim()) : [];
        const textValue = match[3].trim();
        newMemories.push({ id: uuidv4(), text: textValue, category: categoryValue, connections: connectionsValue, timestamp: Date.now() });
        hasMemoryUpdates = true;
      }

      // Deletar fatos automaticamente
      while ((match = deleteTagRegex.exec(str)) !== null) {
        const idValue = match[1];
        newMemories = newMemories.filter((m: MemoryFact) => m.id !== idValue);
        hasMemoryUpdates = true;
      }

      // Interceptar atualizações de fatos (contradições/mudanças) para confirmação visual
      const updates: PendingMemoryUpdate[] = [];
      updateTagRegex.lastIndex = 0;
      while ((match = updateTagRegex.exec(str)) !== null) {
        const idValue = match[1];
        const categoryValue = match[2];
        const textValue = match[3].trim();
        const oldFact = memoryFacts.find(m => m.id === idValue);
        if (oldFact && oldFact.text !== textValue) {
          updates.push({
            id: idValue,
            category: categoryValue || oldFact.category,
            oldText: oldFact.text,
            newText: textValue
          });
        }
      }

      if (updates.length > 0 && onFindUpdates) {
        onFindUpdates(updates);
      }

      if (hasMemoryUpdates) {
        setMemoryFacts(newMemories);
        saveMemoryFactsToFirestore(newMemories);
      }
    }

    return str
      .replace(memoryTagRegex, '')
      .replace(updateTagRegex, '')
      .replace(deleteTagRegex, '')
      .trim();
  }, [memoryFacts, saveMemoryFactsToFirestore]);

  const executeAIRequest = useCallback(async (
    targetChatId: string,
    userText: string,
    filesToSend: PendingFile[],
    apiHistory: Array<{ role: string; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }>,
    isFirstMessage: boolean,
    replaceId?: string,
    isAppending: boolean = false,
    _originalText: string = '',
    originalThoughts: string = '',
    modelOverride?: string
  ) => {
    setIsLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    // Modelo efetivo da requisição: um override (ex.: "regenerar com outro modelo")
    // tem prioridade sobre o modelo atual da conversa.
    const activeModel = modelOverride || model;

    // Personalidade é POR CHAT: usa a salva no chat alvo (fallback para a padrão).
    const chatPersonalityId = chatsRef.current.find(c => c.id === targetChatId)?.personalityId ?? 'default';
    const selectedPersonality = personalities.find(p => p.id === chatPersonalityId) || DEFAULT_PERSONALITY;

    const systemInstruction = "Você é o Nemon, uma inteligência artificial avançada, empática e extremamente RÁPIDA. Sua tarefa secundária é manter sua memória persistente (DNA) precisa e atualizada.\n" +
      (selectedPersonality.prompt ? `INSTRUÇÃO DE PERSONALIDADE ATIVA: "${selectedPersonality.prompt}"\n\n` : "") +
      (memoryFacts.length > 0 ? "Fatos que você já sabe sobre o usuário:\n" + memoryFacts.map((f: MemoryFact) => `[ID: ${f.id}] [Categoria: ${f.category}] ${f.text}`).join("\n") + "\n\n" : "") +
      "Regras de Pesquisa e Memória:\n" +
      "1. Quando houver uma seção 'RESULTADOS DE PESQUISA WEB ATUAL' no contexto (ou a ferramenta google_search estiver disponível), baseie sua resposta nesses dados reais e atualizados, sem inventar. NUNCA escreva marcadores ou rótulos internos como 'WEB SEARCH ON', 'PESQUISA ATIVADA' ou similares na resposta — apenas responda naturalmente ao usuário.\n" +
      "2. Regras de DNA (Memória Persistente):\n" +
      "   - Cada memória DEVE conter apenas um fato atômico, simples e específico (ex: 'O usuário se chama José Gabriel', 'O usuário tem 19 anos', 'O usuário estuda ADS'). NUNCA agrupe múltiplos fatos diferentes ou informações complementares em um único texto.\n" +
      "   - NOVA INFORMAÇÃO vs CONTRADIÇÃO (MUITO IMPORTANTE):\n" +
      "     * Se o usuário disser algo NOVO que NÃO contradiz nenhuma memória existente (mesmo que seja da mesma categoria, como perfil, hobbies ou estudos), você DEVE criar uma NOVA memória usando <MEMORY category='...'>texto</MEMORY>. NÃO atualize uma memória antiga apenas para embutir/concatenar essa nova informação nela.\n" +
      "       Exemplo: Se já existe [ID: 123] 'O nome do usuário é José Gabriel' e o usuário diz 'Eu estudo ADS', isso NÃO contradiz o nome dele. Crie um novo fato: <MEMORY category='USER_PROFILE'>O usuário estuda ADS</MEMORY>. NÃO faça update da memória de ID 123!\n" +
      "     * Use <UPDATE_MEMORY id='ID'>novo texto</UPDATE_MEMORY> APENAS quando um fato salvo anteriormente tiver mudado de verdade (ex: mudou de idade, mudou de cidade, mudou de emprego) ou estiver comprovadamente errado/desatualizado. A atualização serve para substituir a informação desatualizada pela nova, mantendo o mesmo ID.\n" +
      "       Exemplo: Se já existe [ID: 456] 'O usuário tem 19 anos' e ele diz 'Fiz 20 anos hoje', use <UPDATE_MEMORY id='456'>O usuário tem 20 anos</UPDATE_MEMORY>.\n" +
      "   - NUNCA atualize uma memória se a nova informação for apenas complementar e puder ser armazenada em um fato separado.\n" +
      "3. Seja conciso e direto ao ponto quando possível.\n" +
      "4. LOCALIZAÇÃO/MAPA: Quando o usuário perguntar ONDE fica um lugar, endereço, ponto de referência ou estabelecimento, escreva sua resposta normalmente e inclua um marcador no formato [MAP: <local o mais específico possível, com cidade/estado se souber>]. O marcador vira um mapa interativo embutido — não descreva o marcador nem o mencione em voz alta, apenas inclua-o. Ex.: 'Fica no centro histórico. [MAP: Praça da Sé, São Paulo, SP]'. Use apenas quando fizer sentido geográfico.";

    // Suavizador do streaming (efeito máquina de escrever). Declarado fora do try
    // para o finally poder cancelá-lo em caso de erro/abort.
    let smoother: StreamSmoother | null = null;

    try {
      const startTime = performance.now();
      const currentAiMsgId = replaceId || (Date.now() + 1).toString() + '-ai';
      currentAiMsgIdRef.current = currentAiMsgId;

      // Iniciar Timer Real-time
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        const elapsed = (performance.now() - startTime) / 1000;
        setChats((prev: ChatSession[]) => prev.map((c: ChatSession) => c.id === targetChatId ? {
          ...c,
          messages: c.messages.map((m: Message) => m.id === currentAiMsgId ? { ...m, duration: elapsed } : m)
        } : c));
      }, 100);

      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          const freshMsg: Message = { id: currentAiMsgId, role: 'ai', text: '', thoughts: '', duration: 0, isSearching: webSearchEnabled };
          const updatedMsgs = replaceId
            ? c.messages.map(m => {
              if (m.id === replaceId) {
                return isAppending
                  ? { ...m, isSearching: webSearchEnabled, isVerifying: false }
                  : freshMsg;
              }
              return m;
            })
            : [...c.messages, freshMsg];
          return { ...c, messages: updatedMsgs };
        }
        return c;
      }));

      if (imageGenEnabled) {
        try {
          const res = await generateImagenContent(userText, imagenModel, aspectRatio, paidApiKey);
          const currentDuration = (performance.now() - startTime) / 1000;

          setChats((prev: ChatSession[]) => prev.map((c: ChatSession) => c.id === targetChatId ? {
            ...c,
            messages: c.messages.map((m: Message) => m.id === currentAiMsgId ? {
              ...m,
              text: `Gerei esta imagem para você usando **${imagenModel}**:`,
              files: [{ name: 'generated_image.png', mimeType: res.mimeType, data: res.data }],
              duration: currentDuration
            } : m)
          } : c));

          setIsLoading(false);
          return;
        } catch (imgError: unknown) {
          throw new Error(`Erro na geração de imagem: ${imgError instanceof Error ? imgError.message : String(imgError)}`);
        }
      }

      // Delegação de busca: se a busca está ligada e o modelo atual NÃO é o buscador
      // (Gemma 4 31B, o único que faz google_search de forma confiável), o 31B pesquisa
      // e injetamos o resumo + fontes no contexto do modelo escolhido.
      // EXCEÇÃO: modelos OpenRouter usam a busca web NATIVA do próprio OpenRouter
      // (plugin `web`), então não delegamos — passamos webSearch adiante.
      const SEARCH_MODEL = 'gemma-4-31b-it';
      const isOpenRouterModel = resolveProvider(activeModel) === 'openrouter';
      let effectiveWebSearch = webSearchEnabled;
      let effectiveSystemInstruction = systemInstruction;
      const preSources: { title: string; uri: string }[] = [];
      if (webSearchEnabled && activeModel !== SEARCH_MODEL && !isOpenRouterModel) {
        let searchFound = false;
        try {
          const searchRes = await performWebSearch(userText, controller.signal, undefined, searchModelId);
          // Consideramos a busca bem-sucedida se houver resumo OU ao menos uma fonte.
          if (searchRes.summary || searchRes.sources.length > 0) {
            searchFound = true;
            effectiveSystemInstruction = systemInstruction +
              `\n\nRESULTADOS DE PESQUISA WEB ATUAL (obtidos via Gemma 4 31B + google_search). Use estas informações atualizadas para responder com precisão e cite/mencione quando pertinente:\n${searchRes.summary}`;
          }
          preSources.push(...searchRes.sources);
        } catch (e) {
          console.warn('Falha na pesquisa delegada (Gemma 4 31B):', e);
        }
        // Busca vazia ou com falha: instruímos o modelo a NÃO inventar dados atuais e a
        // avisar o usuário. Evita respostas desatualizadas silenciosas (ex.: Grok-2 em vez
        // do Grok 4.5) quando o grounding não retorna nada.
        if (!searchFound) {
          effectiveSystemInstruction = systemInstruction +
            `\n\nAVISO: A pesquisa na web foi solicitada mas NÃO retornou resultados atuais. NÃO invente fatos recentes (datas, versões, números, nomes ou eventos). Responda apenas com o que você sabe com segurança e DEIXE CLARO ao usuário, de forma breve, que não foi possível obter informações atualizadas da web para esta pergunta.`;
        }
        effectiveWebSearch = false; // o modelo principal recebe o contexto já pesquisado
      }

      // PDFs: o Gemini processa nativamente (inlineData). Provedores compatíveis com
      // OpenAI (OpenRouter/local) não recebem PDF binário — extraímos o texto no
      // cliente (pdf.js) e injetamos no prompt, removendo o PDF dos anexos enviados.
      let requestText = userText;
      let requestFiles = filesToSend;
      if (resolveProvider(activeModel) !== 'gemini') {
        const pdfs = filesToSend.filter(f => f.mimeType === 'application/pdf');
        if (pdfs.length > 0) {
          const extracted = await Promise.all(pdfs.map(async f => {
            try {
              const t = await extractPdfText(f.data);
              return t ? `\n\n[Conteúdo do documento "${f.name}"]:\n${t}` : `\n\n[O documento "${f.name}" não contém texto extraível.]`;
            } catch {
              return `\n\n[Não foi possível extrair o texto do documento "${f.name}".]`;
            }
          }));
          requestText = userText + extracted.join('');
          requestFiles = filesToSend.filter(f => f.mimeType !== 'application/pdf');
        }
      }

      let fullText = "";
      let fullThoughts = "";
      const allSources: { title: string; uri: string }[] = [...preSources];
      let isSearching = effectiveWebSearch;
      let isGrounded = preSources.length > 0;
      let finalUsage = null;

      // Tool calling (F3): só para Gemini, com ferramentas habilitadas, fora do modo
      // "append" e quando não há busca web nativa/gemma em curso.
      const useChatTools = enabledChatToolIds.length > 0
        && resolveProvider(activeModel) === 'gemini'
        && !isAppending && !effectiveWebSearch;

      // Suavização caractere-a-caractere: o onFrame recebe o texto e o raciocínio
      // já "revelados" e monta a mensagem com os metadados atuais (fontes, grounding).
      smoother = new StreamSmoother((revealedText, revealedThoughts) => {
        const currentDuration = (performance.now() - startTime) / 1000;
        setChats((prev: ChatSession[]) => prev.map((c: ChatSession) => c.id === targetChatId ? {
          ...c,
          messages: c.messages.map((m: Message) => m.id === currentAiMsgId ? {
            ...m,
            text: isAppending ? m.text : revealedText,
            continuationText: isAppending ? revealedText : undefined,
            thoughts: isAppending ? (originalThoughts + (originalThoughts ? "\n\n" : "") + revealedThoughts) : revealedThoughts,
            isGrounded,
            isSearching,
            sources: [...allSources],
            duration: currentDuration
          } : m)
        } : c));
      });

      if (useChatTools) {
        // Loop agêntico (não-streaming): resolve as ferramentas e revela o texto final.
        isSearching = false;
        const toolRun = await runGeminiToolLoop(
          requestText, activeModel, apiHistory, effectiveSystemInstruction,
          enabledChatToolIds,
          (name, args) => liveToolCallRef.current
            ? liveToolCallRef.current(name, args)
            : Promise.resolve({ result: 'Ferramenta indisponível.' }),
          controller.signal,
        );
        toolRun.toolsUsed.forEach(n => { try { liveToolUsedRef.current?.(n); } catch { /* ignore */ } });
        fullText = toolRun.text;
        smoother.setTargets(stripMapMarkers(stripSearchMarkers(parseMemoryTags(fullText).trim())), '');
      } else {
        const stream = streamGeminiContent(requestText, activeModel, apiHistory, effectiveSystemInstruction, requestFiles, effectiveWebSearch, controller.signal, thinkingEnabled);
        for await (const chunk of stream) {
          if (chunk.text) fullText += chunk.text;
          if (chunk.thoughts && thinkingEnabled) fullThoughts += chunk.thoughts;
          if (chunk.isGrounded) isGrounded = true;
          if (chunk.isSearching) isSearching = true;
          if (allSources.length > 0) isSearching = false;
          if (chunk.usage) finalUsage = chunk.usage;
          if (chunk.sources) {
            chunk.sources.forEach(src => {
              if (!allSources.find(s => s.uri === src.uri || (s.title && s.title === src.title))) {
                allSources.push(src);
              }
            });
          }

          // Limpeza em tempo real para o streaming
          let streamingText = fullText;
          let streamingThoughts = fullThoughts;

          // 1. Extrair blocos completos de <thinking>
          const completeThinkingMatch = /<thinking>([\s\S]*?)<\/thinking>/g;
          let m;
          while ((m = completeThinkingMatch.exec(fullText)) !== null) {
            if (thinkingEnabled && !streamingThoughts.includes(m[1].trim())) {
              streamingThoughts += (streamingThoughts ? "\n" : "") + m[1].trim();
            }
            streamingText = streamingText.replace(m[0], '');
          }

          // 2. Ocultar blocos incompletos ou texto que parece ser raciocínio (fallback)
          if (streamingText.includes('<thinking>')) {
            streamingText = streamingText.split('<thinking>')[0];
          }

          const currentCleanText = stripMapMarkers(stripSearchMarkers(parseMemoryTags(streamingText).trim()));

          // Alimenta o suavizador; ele revela o texto/raciocínio caractere a caractere.
          smoother.setTargets(currentCleanText, streamingThoughts.trim());
        }
      }

      // Garante que toda a revelação termine antes de aplicar o texto final.
      await smoother.finish();

      if (finalUsage) {
        setDailyUsage((prev: DailyUsage) => {
          const today = getPacificDate();
          const state = prev.date === today ? prev : { date: today, models: {} };
          const modelData = state.models[activeModel] || { requests: 0, tokens: { prompt: 0, candidates: 0, total: 0 } };
          const newState: DailyUsage = {
            ...state,
            models: {
              ...state.models, [activeModel]: {
                requests: modelData.requests + 1,
                tokens: {
                  prompt: modelData.tokens.prompt + (finalUsage.promptTokenCount || 0),
                  candidates: modelData.tokens.candidates + (finalUsage.candidatesTokenCount || 0),
                  total: modelData.tokens.total + (finalUsage.totalTokenCount || 0),
                }
              }
            }
          };
          localStorage.setItem('gemini_advanced_usage_v1', JSON.stringify(newState));
          return newState;
        });

        // Base precisa do indicador de contexto: o total de tokens do último turno
        // (prompt + resposta) equivale ao "peso" atual da conversa enviado ao modelo.
        const turnTotal = finalUsage.totalTokenCount
          || ((finalUsage.promptTokenCount || 0) + (finalUsage.candidatesTokenCount || 0));
        if (turnTotal) {
          setChats((prev: ChatSession[]) => prev.map((c: ChatSession) =>
            c.id === targetChatId ? { ...c, contextTokens: turnTotal } : c));
        }
      }

      // 1. Limpeza e extração final
      let finalCleanedText = fullText;
      let finalThoughts = fullThoughts;
      const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/g;
      let mMatch;
      while ((mMatch = thinkingRegex.exec(fullText)) !== null) {
        if (thinkingEnabled && !finalThoughts.includes(mMatch[1])) {
          finalThoughts += (finalThoughts ? "\n" : "") + mMatch[1];
        }
        finalCleanedText = finalCleanedText.replace(mMatch[0], '');
      }
      finalCleanedText = finalCleanedText.replace(/<\/thinking>/g, '').replace(/<thinking>/g, '').trim();

      let updatesFound: PendingMemoryUpdate[] = [];
      let finalCleanText = stripSearchMarkers(parseMemoryTags(finalCleanedText, true, (upds) => {
        updatesFound = upds;
      }).trim());

      // F8: extrai marcadores [MAP: …] → locais embutidos + remove do texto exibido.
      const mapResult = extractMapMarkers(finalCleanText);
      finalCleanText = mapResult.text;
      const finalMaps = mapResult.maps;

      // 2. LÓGICA DE AUTO-RECUPERAÇÃO (Hidden Turn)
      if (!finalCleanText && finalThoughts && finalThoughts.length > 50) {
        // Mostrar estado temporário amigável
        setChats((prev: ChatSession[]) => prev.map((c: ChatSession) => c.id === targetChatId ? {
          ...c,
          messages: c.messages.map((m: Message) => m.id === currentAiMsgId ? { ...m, text: "_Finalizando resposta baseada no raciocínio..._", thoughts: finalThoughts.trim() } : m)
        } : c));

        try {
          const recoveryRes = await generateGeminiContent(
            `O modelo gerou apenas o raciocínio interno. Com base no raciocínio abaixo, escreva apenas a RESPOSTA FINAL amigável e direta para o usuário (em Português), ignorando a parte técnica do planejamento:\n\n${finalThoughts}`,
            activeModel,
            [],
            "Você é o Nemon. Resuma o raciocínio em uma resposta final útil."
          );
          if (recoveryRes.text) {
            finalCleanText = parseMemoryTags(recoveryRes.text, true, (upds) => {
              updatesFound = [...updatesFound, ...upds];
            }).trim();
          }
        } catch (e) {
          console.warn("Falha na auto-recuperação:", e);
          finalCleanText = finalThoughts;
        }
      } else if (!finalCleanText && finalThoughts) {
        finalCleanText = finalThoughts;
      }

      setChats((prev: ChatSession[]) => prev.map((c: ChatSession) => c.id === targetChatId ? {
        ...c,
        messages: c.messages.map((m: Message) => m.id === currentAiMsgId ? {
          ...m,
          text: isAppending ? m.text : finalCleanText,
          continuationText: isAppending ? finalCleanText : undefined,
          thoughts: isAppending ? (originalThoughts + (originalThoughts ? "\n\n" : "") + finalThoughts.trim()) : finalThoughts.trim(),
          isSearching: false,
          isGrounded,
          isVerifying: false,
          sources: [...allSources],
          maps: isAppending ? (m.maps || finalMaps) : (finalMaps.length > 0 ? finalMaps : undefined),
          pendingMemoryUpdates: updatesFound.length > 0
            ? [...(m.pendingMemoryUpdates || []), ...updatesFound]
            : m.pendingMemoryUpdates
        } : m)
      } : c));

      if (isFirstMessage) {
        generateGeminiContent(
          `Com base na mensagem a seguir, gere um nome de título estritamente curto (entre 1 a 4 palavras no máximo) para identificar a conversa. Responda APENAS com o texto cru do título, sem aspas, sem negrito, e sem conversa fiada:\n\nMensagem: "${userText}"`,
          model,
          [],
          ""
        ).then(res => {
          if (res.text) {
            const cleanTitle = res.text.replace(/["'*]/g, '').trim();
            setChats((prev: ChatSession[]) => prev.map((c: ChatSession) => c.id === targetChatId ? { ...c, title: cleanTitle, isNaming: false } : c));
          } else {
            setChats(prev => prev.map(c => c.id === targetChatId ? { ...c, title: 'Chat Sem Nome', isNaming: false } : c));
          }
        }).catch(err => {
          console.warn("Aviso: Falha na autogeração de título", err);
          setChats(prev => prev.map(c => c.id === targetChatId ? { ...c, title: userText.substring(0, 25) + '...', isNaming: false } : c));
        });
      }
    } catch (error: unknown) {
      // Interrompe a suavização e revela o que já havia chegado (abort/erro).
      smoother?.cancel();
      if (error instanceof Error && error.name === 'AbortError') return;
      const errorMsg: Message = { id: Date.now().toString(), role: 'ai', text: `**[Erro]:** ${error instanceof Error ? error.message : String(error)}` };
      setChats(prev => prev.map(c => c.id === targetChatId ? { ...c, messages: [...c.messages, errorMsg] } : c));
    } finally {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setIsLoading(false);
      abortControllerRef.current = null;
      currentAiMsgIdRef.current = null;
      setChats(prev => prev);
    }
  }, [model, webSearchEnabled, thinkingEnabled, imageGenEnabled, imagenModel, aspectRatio, paidApiKey, memoryFacts, personalities, parseMemoryTags, searchModelId, enabledChatToolIds]);

  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      // Capturamos os IDs antes de qualquer mutação ou aborto
      const msgIdToRemove = currentAiMsgIdRef.current;
      const targetChatId = activeChatId;

      abortControllerRef.current.abort();

      // Remover a mensagem apenas se ela ainda estiver vazia
      if (msgIdToRemove && targetChatId) {
        setChats(prev => prev.map(c => {
          if (c.id === targetChatId) {
            // Verificamos se a mensagem existe e se está vazia
            const msg = c.messages.find(m => m.id === msgIdToRemove);
            const isEmpty = !msg || (!msg.text && !msg.thoughts && (!msg.files || msg.files.length === 0));

            if (isEmpty) {
              return {
                ...c,
                messages: c.messages.filter(m => m.id !== msgIdToRemove)
              };
            }
          }
          return c;
        }));
      }

      setIsLoading(false);
      currentAiMsgIdRef.current = null;
      setChats(prev => prev);
    }
  }, [activeChatId]);



  const handleFactCheckSegment = useCallback(async (messageId: string, segmentText: string) => {
    // Ativar loading na mensagem específica
    setChats(prev => prev.map(chat => ({
      ...chat,
      messages: chat.messages.map(msg => msg.id === messageId ? { ...msg, isVerifying: true } : msg)
    })));

    try {
      const results = await performFactCheck(segmentText, undefined, factCheckModelId);
      setChats(prev => prev.map(chat => {
        if (chat.id === activeChatId) {
          return {
            ...chat,
            messages: chat.messages.map(msg => {
              if (msg.id === messageId) {
                // Filtrar resultados antigos que coincidem com os novos segmentos para evitar sobreposição
                const existingResults = msg.factCheckResults || [];
                const filteredOld = existingResults.filter(old =>
                  !results.some(newRes => newRes.segment === old.segment)
                );
                const newResults = [...filteredOld, ...results];
                return { ...msg, factCheckResults: newResults, isVerifying: false };
              }
              return msg;
            })
          };
        }
        return chat;
      }));
    } catch (e) {
      console.error("Erro na checagem parcial:", e);
      setChats(prev => prev.map(chat => ({
        ...chat,
        messages: chat.messages.map(msg => msg.id === messageId ? { ...msg, isVerifying: false } : msg)
      })));
    }
  }, [activeChatId, factCheckModelId]);

  const handleAskAboutSegment = useCallback((segmentText: string, questionText: string) => {
    const contextualPrompt = `Contexto selecionado: "${segmentText}"\n\nPergunta do usuário: ${questionText}`;

    // Obter histórico para manter o contexto do chat
    const activeChat = chats.find(c => c.id === activeChatId);
    if (!activeChat) return;

    const apiHistory = activeChat.messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }]
    }));

    executeAIRequest(activeChatId, contextualPrompt, [], apiHistory, false);
  }, [activeChatId, chats, executeAIRequest]);


  // ---- Fluxo de DITADO (TTS por chunks, sessão dedicada) ----
  const cleanupDictationSession = useCallback(() => {
    dictationSessionRef.current?.stop();
    dictationSessionRef.current = null;
  }, []);

  const applyDictationVolume = useCallback((level: number) => {
    const clamped = Math.max(0, Math.min(10, Math.round(Number(level))));
    setDictationVolume(clamped);
    const gain = dictationGainRef.current;
    const ctx = dictationCtxRef.current;
    if (gain && ctx) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(clamped / 10, now + 0.05);
    }
  }, []);

  const changeDictationVoice = useCallback((voice: string) => {
    setDictationVoice(voice);
    localStorage.setItem('nemon_dictation_voice', voice);
  }, []);

  // Ativa um player e pausa o anterior (só um áudio toca por vez em todo o app).
  const handlePlayerActivate = useCallback((stop: () => void) => {
    if (activePlayerStopRef.current) activePlayerStopRef.current();
    activePlayerStopRef.current = stop;
  }, []);

  // Falar em voz alta uma mensagem do chat (TTS), reusando a estrutura do ditado.
  // Alterna: se já existe/está gerando, remove; senão gera e salva a barra abaixo.
  const speakMessage = useCallback((msgId: string, text: string) => {
    const existing = chatTtsRef.current[msgId];
    if (existing) {
      // Toggle off: cancela geração em andamento e/ou remove a barra existente.
      if (chatTtsActiveIdRef.current === msgId) {
        chatTtsSessionRef.current?.stop();
        chatTtsSessionRef.current = null;
        chatTtsActiveIdRef.current = null;
      }
      setChatTts((prev) => {
        const next = { ...prev };
        delete next[msgId];
        return next;
      });
      return;
    }

    const clean = (text || '').trim();
    if (!clean) return;
    const chunks = chunkTextForDictation(clean);
    if (chunks.length === 0) return;

    // Só uma geração de TTS de chat por vez (respeita o limite de sessões da Live API).
    chatTtsSessionRef.current?.stop();

    // Contexto de áudio dedicado do TTS do chat (criado sob demanda).
    if (!chatTtsCtxRef.current) {
      const ctx = new AudioContext({ sampleRate: 24000 });
      const gain = ctx.createGain();
      gain.gain.value = 1;
      gain.connect(ctx.destination);
      chatTtsCtxRef.current = ctx;
      chatTtsGainRef.current = gain;
    }

    chatTtsActiveIdRef.current = msgId;
    setChatTts((prev) => ({ ...prev, [msgId]: { status: 'generating' } }));

    const model = LIVE_MODEL_MAP['gemini-2.5-flash-live'];
    const session = new GeminiDictationSession(
      chunks,
      {
        onProgress: () => {},
        onComplete: (results) => {
          if (chatTtsActiveIdRef.current === msgId) {
            chatTtsSessionRef.current = null;
            chatTtsActiveIdRef.current = null;
          }
          const ctx = chatTtsCtxRef.current;
          if (!ctx || !results.some((a) => a && a.length > 0)) {
            setChatTts((prev) => ({ ...prev, [msgId]: { status: 'error', error: 'Não foi possível gerar o áudio.' } }));
            return;
          }
          const { merged, failedRegions } = assembleDictationAudio(results, chunks.map((c) => c.length));
          const buffer = ctx.createBuffer(1, merged.length, 24000);
          buffer.copyToChannel(merged as unknown as Float32Array<ArrayBuffer>, 0);
          setChatTts((prev) => ({ ...prev, [msgId]: { status: 'done', buffer, failedRegions } }));
        },
        onError: (msg) => {
          if (chatTtsActiveIdRef.current === msgId) {
            chatTtsSessionRef.current = null;
            chatTtsActiveIdRef.current = null;
          }
          setChatTts((prev) => ({ ...prev, [msgId]: { status: 'error', error: msg } }));
        },
      },
      dictationVoice,
      paidApiKey || defaultApiKey,
      model,
      DICTATION_CONCURRENCY
    );
    chatTtsSessionRef.current = session;
    session.start();
  }, [dictationVoice, paidApiKey, defaultApiKey]);

  // Monta o AudioBuffer final a partir dos trechos ordenados. Entradas `null`
  // (trechos que falharam) viram lacunas de silêncio, marcadas como regiões
  // vermelhas para o player exibir e pular durante a reprodução.
  const buildDictationBuffer = useCallback((results: (Float32Array | null)[]) => {
    cleanupDictationSession();
    const chunks = dictationChunksRef.current;

    // Nenhum trecho deu certo → erro (não há o que reproduzir).
    if (!results.some((a) => a && a.length > 0)) {
      setDictationStatus('error');
      setDictationError('Nenhum áudio foi gerado. Tente novamente.');
      return;
    }

    const { merged, failedRegions } = assembleDictationAudio(results, chunks.map((c) => c.length));
    // Contexto próprio do ditado (independe do modo conversacional).
    if (!dictationCtxRef.current) {
      const ctx = new AudioContext({ sampleRate: 24000 });
      const gain = ctx.createGain();
      gain.gain.value = dictationVolume / 10;
      gain.connect(ctx.destination);
      dictationCtxRef.current = ctx;
      dictationGainRef.current = gain;
    }
    const ctx = dictationCtxRef.current;
    const buffer = ctx.createBuffer(1, merged.length, 24000);
    buffer.copyToChannel(merged as unknown as Float32Array<ArrayBuffer>, 0);
    setDictationFailedRegions(failedRegions);
    setDictationBuffer(buffer);
    setDictationStatus('done');
  }, [cleanupDictationSession, dictationVolume]);

  const startDictation = useCallback(() => {
    const chunks = chunkTextForDictation(dictationText);
    if (chunks.length === 0) return;

    cleanupDictationSession();
    if (dictationCtxRef.current) {
      dictationCtxRef.current.close();
      dictationCtxRef.current = null;
      dictationGainRef.current = null;
    }
    dictationChunksRef.current = chunks;
    setDictationBuffer(null);
    setDictationFailedRegions([]);
    setDictationError('');
    setDictationProgress({ current: 0, total: chunks.length });
    setDictationStatus('connecting');

    const model = LIVE_MODEL_MAP['gemini-2.5-flash-live'];
    // Cada trecho abre a própria conexão; todos disparam de uma vez (limitados
    // pelo pool de concorrência). O resultado volta ordenado no onComplete.
    const session = new GeminiDictationSession(
      chunks,
      {
        onProgress: (done, total) => {
          setDictationStatus('generating');
          setDictationProgress({ current: done, total });
        },
        onComplete: (results) => buildDictationBuffer(results),
        onError: (msg) => {
          setDictationError(msg);
          setDictationStatus('error');
          cleanupDictationSession();
        },
      },
      dictationVoice,
      paidApiKey || defaultApiKey,
      model,
      DICTATION_CONCURRENCY
    );

    dictationSessionRef.current = session;
    session.start();
  }, [dictationText, dictationVoice, cleanupDictationSession, buildDictationBuffer, paidApiKey, defaultApiKey]);

  const cancelDictation = useCallback(() => {
    cleanupDictationSession();
    setDictationStatus('idle');
    setDictationProgress({ current: 0, total: 0 });
  }, [cleanupDictationSession]);

  const resetDictation = useCallback(() => {
    // Volta para edição mantendo o texto; descarta o áudio anterior.
    activePlayerStopRef.current?.();
    activePlayerStopRef.current = null;
    setDictationBuffer(null);
    setDictationFailedRegions([]);
    if (dictationCtxRef.current) {
      dictationCtxRef.current.close();
      dictationCtxRef.current = null;
      dictationGainRef.current = null;
    }
    setDictationStatus('idle');
    setDictationProgress({ current: 0, total: 0 });
    setDictationError('');
  }, []);

  // Fechar apenas OCULTA o painel: o áudio, o texto e o estado são preservados
  // (e a geração continua em segundo plano se estiver em andamento).
  const closeDictation = useCallback(() => {
    activePlayerStopRef.current?.();
    activePlayerStopRef.current = null;
    setShowDictation(false);
  }, []);

  const downloadDictation = useCallback(() => {
    if (!dictationBuffer) return;
    const blob = audioBufferToWav(dictationBuffer);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ditado_${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [dictationBuffer]);

  // Prévia: em quantos trechos o texto atual será dividido (mostrada antes de gerar).
  const dictationChunkCount = useMemo(
    () => chunkTextForDictation(dictationText).length,
    [dictationText]
  );

  const handleLiveStart = useCallback(() => {
    if (isLiveActive && isLiveDetached) {
      setIsLiveDetached(false);
      return;
    }
    setShowLiveSetupModal(true);
  }, [isLiveActive, isLiveDetached]);

  const confirmLiveStart = useCallback(async (useMemory: boolean) => {
    setUseMemoryLive(useMemory);
    setShowLiveSetupModal(false);
    setIsLiveActive(true);
    setLiveStatus('connecting');
    setLiveTranscript([]);
    // Zera o áudio temporário de qualquer sessão anterior.
    liveAudioTurnChunksRef.current = [];
    liveMessageAudioRef.current.clear();
    activePlayerStopRef.current = null;

    if (liveAudioContextRef.current) {
      liveAudioContextRef.current.close();
    }
    // Zerar o cronograma de reprodução para não agendar áudio no "futuro" de um contexto novo.
    nextAudioTimeRef.current = 0;
    activeSourcesRef.current.clear();
    liveAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
    const analyserNode = liveAudioContextRef.current.createAnalyser();
    analyserNode.fftSize = 256;
    // Nó de ganho para o volume da voz da IA (0–10 → 0.0–1.0). Fica DEPOIS do
    // analyser para que o visualizador continue refletindo a fala independentemente
    // do volume escolhido. Cadeia: source → analyser → gain → destination.
    const gainNode = liveAudioContextRef.current.createGain();
    gainNode.gain.value = liveVolumeRef.current / 10;
    analyserNode.connect(gainNode);
    gainNode.connect(liveAudioContextRef.current.destination);
    liveGainNodeRef.current = gainNode;
    setLiveAnalyser(analyserNode);

    const selectedPersonalityProfile = personalities.find(p => p.id === livePersonalityIdRef.current) || DEFAULT_PERSONALITY;
    const fullInstructionStr = buildLiveInstruction(selectedPersonalityProfile.prompt, memoryFacts, useMemory);

    // Voz inicial: se a personalidade ativa tem uma voz padrão, ela tem prioridade
    // sobre a última voz usada. Sincroniza state/ref para a UI refletir a escolha.
    const initialVoice = (selectedPersonalityProfile.voice && LIVE_VOICE_IDS.includes(selectedPersonalityProfile.voice))
      ? selectedPersonalityProfile.voice
      : liveVoiceRef.current;
    if (initialVoice !== liveVoiceRef.current) {
      liveVoiceRef.current = initialVoice;
      setLiveVoice(initialVoice);
      localStorage.setItem('nemon_live_voice', initialVoice);
    }

    // Usa o ref (sempre atual) para evitar closure desatualizada ao reiniciar após troca de modelo.
    const activeLiveModel = liveModelRef.current;
    const liveModelString = LIVE_MODEL_MAP[activeLiveModel] || LIVE_MODEL_MAP[DEFAULT_LIVE_MODEL];

    const session = new GeminiLiveSession({
      onStatusChange: (status) => setLiveStatus(status),
      onStream: (stream) => setLiveVideoStream(stream),
      onError: (err) => {
        // Erro vai para os logs (não como popup bloqueante) e a aba LIVE
        // permanece aberta para o usuário trocar de modelo ou tentar de novo.
        logger.addLog('error', `[LIVE] ${err}`);
        setLiveStatus('error');
      },
      onInterrupt: () => handleInterruptLive(),
      onTurnComplete: () => {
        finalizeAiTurnAudio();
        aiTurnBoundaryRef.current = true;
      },
      onToolUsed: (name) => handleLiveToolUsed(name),
      onToolCall: (name, args) =>
        liveToolExecutorRef.current
          ? liveToolExecutorRef.current(name, args)
          : Promise.resolve({ result: 'Ferramenta indisponível no momento.' }),
      onTranscript: (role, text) => {
        // Captura/consome a fronteira de turno ANTES do setState para evitar corrida:
        // o updater lê o valor capturado no closure, não o ref (que já foi limpo).
        const isNewAiTurn = role === 'ai' && aiTurnBoundaryRef.current;
        if (role === 'ai') aiTurnBoundaryRef.current = false;
        setLiveTranscript(prev => {
          const last = prev[prev.length - 1];
          // Só mescla com o balão anterior se for do mesmo interlocutor E não for o
          // início de um novo turno da IA (aí vira balão separado).
          if (last && last.role === role && !isNewAiTurn) {
            return [
              ...prev.slice(0, -1),
              { role, text: last.text + text }
            ];
          } else {
            return [...prev, { role, text }];
          }
        });

        // Mantém o cronômetro de inatividade fresco enquanto há transmissão.
        lastLiveActivityRef.current = Date.now();

        // IMPORTANTE: só a fala do USUÁRIO reengaja a conversa e zera o estágio de
        // proatividade. A fala da IA — inclusive as próprias sondagens proativas —
        // NÃO reseta o estágio; caso contrário a sondagem do estágio 1 chega em vários
        // chunks e se auto-reseta, nunca avançando para o estágio 2. Enquanto a IA fala,
        // o intervalo de proatividade já congela o cronômetro via isLiveSpeaking.
        if (role === 'user') {
          resetProactivityState("Fala do usuário");
        }

        // Voice Commands for Proactivity
        if (role === 'user') {
          const lowerText = text.toLowerCase();
          if (lowerText.includes("ativar proatividade") || lowerText.includes("ligar proatividade") || lowerText.includes("modo proativo ligado")) {
            console.log("[LIVE] Comand de voz: Ativando Proatividade");
            setIsLiveProactive(true);
          } else if (lowerText.includes("desativar proatividade") || lowerText.includes("desligar proatividade") || lowerText.includes("parar proatividade") || lowerText.includes("modo proativo desligado")) {
            console.log("[LIVE] Comando de voz: Desativando Proatividade");
            setIsLiveProactive(false);
          }
        }
        // A conversa do modo LIVE fica apenas na transcrição da tela do Live,
        // NÃO é gravada como mensagens no chat em que o usuário estava antes.
        // Ainda processamos tags de memória (DNA) da fala da IA, se habilitado.
        if (role === 'ai' && useMemory) {
          parseMemoryTags(text, true);
        }
      },
      onAudioData: (chunk) => {
        if (!liveAudioContextRef.current || !analyserNode) return;
        const ctx = liveAudioContextRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        // Guarda o chunk para permitir reouvir este turno depois (áudio temporário da sessão).
        liveAudioTurnChunksRef.current.push(chunk);

        const buffer = ctx.createBuffer(1, chunk.length, 24000);
        buffer.copyToChannel(chunk as unknown as Float32Array<ArrayBuffer>, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(analyserNode);

        const now = ctx.currentTime;
        let startTime = nextAudioTimeRef.current;
        if (startTime < now) {
          startTime = now + 0.05;
        }

        source.onended = () => {
          activeSourcesRef.current.delete(source);
          setIsLiveSpeaking(activeSourcesRef.current.size > 0);
        };

        activeSourcesRef.current.add(source);
        setIsLiveSpeaking(true);

        // A IA está falando: apenas mantém o cronômetro de inatividade fresco.
        // NÃO resetamos o estágio de proatividade aqui (mesma razão do onTranscript).
        lastLiveActivityRef.current = Date.now();

        source.start(startTime);
        nextAudioTimeRef.current = startTime + buffer.duration;
      }
    }, fullInstructionStr, initialVoice, paidApiKey || defaultApiKey, liveModelString);

    liveSessionRef.current = session;
    session.setMicEnabled(isLiveMicEnabled);
    await session.start();
    // handleInterruptLive/handleLiveToolUsed são referenciados de forma lazy (definidos
    // depois deste callback); incluí-los nas deps causaria erro de TDZ na renderização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId, personalities, liveVoice, memoryFacts, handleLiveStop, parseMemoryTags, proactiveIdleCount, resetProactivityState, liveModel, paidApiKey, defaultApiKey, isLiveMicEnabled]);

  const handleSetLiveModel = useCallback((newModel: string) => {
    setLiveModel(newModel);
    // Atualização síncrona do ref para que um reinício imediato use o modelo correto,
    // sem depender do timing do re-render/effect.
    liveModelRef.current = newModel;
    localStorage.setItem('nemon_live_model', newModel);
    if (isLiveActive) {
      handleLiveStop();
      setTimeout(() => {
        confirmLiveStart(useMemoryLive);
      }, 300);
    }
  }, [isLiveActive, useMemoryLive, confirmLiveStart, handleLiveStop]);

  const handleToggleLiveMic = useCallback(() => {
    setIsLiveMicEnabled(prev => {
      const next = !prev;
      localStorage.setItem('nemon_live_mic_enabled', next.toString());
      if (liveSessionRef.current) {
        liveSessionRef.current.setMicEnabled(next);
      }
      return next;
    });
  }, []);

  const handleOpenSettings = useCallback((tab: 'geral' | 'modelos' | 'api' | 'personalidades' | 'dna' = 'geral') => {
    setActiveTab('settings');
    setSettingsTab(tab);
  }, []);

  const handleToggleCamera = useCallback(async () => {
    if (!liveSessionRef.current) return;
    try {
      if (liveVisionType === 'camera') {
        liveSessionRef.current.stopVideo();
        setLiveVisionType(null);
      } else {
        await liveSessionRef.current.startCamera();
        setLiveVisionType('camera');
      }
    } catch {
      toast.error("Não foi possível acessar a câmera.");
    }
  }, [liveVisionType, toast]);

  const handleToggleScreen = useCallback(async () => {
    if (!liveSessionRef.current) return;
    try {
      if (liveVisionType === 'screen') {
        liveSessionRef.current.stopVideo();
        setLiveVisionType(null);
      } else {
        await liveSessionRef.current.startScreen();
        setLiveVisionType('screen');
      }
    } catch {
      toast.error("Não foi possível compartilhar a tela.");
    }
  }, [liveVisionType, toast]);

  const handleInterruptLive = useCallback(() => {
    // Parar todos os nós de áudio ativos e agendados
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch { /* ignore */ }
    });
    activeSourcesRef.current.clear();
    setIsLiveSpeaking(false);

    // Resetar o cronograma de áudio para o tempo atual
    if (liveAudioContextRef.current) {
      nextAudioTimeRef.current = liveAudioContextRef.current.currentTime;
    }

    // Fecha o turno de áudio parcial (o que já foi dito antes da interrupção fica
    // disponível para reouvir) e marca fronteira para separar do próximo balão.
    finalizeAiTurnAudio();
    aiTurnBoundaryRef.current = true;

    resetProactivityState("Interrupção manual/VAD");
  }, [resetProactivityState, finalizeAiTurnAudio]);

  // Toca um sininho curto (chime de duas notas) reutilizando o contexto de áudio do LIVE.
  const playToolBell = useCallback(() => {
    const ctx = liveAudioContextRef.current;
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      // Duas notas (Lá5 → Mi6) com decaimento rápido — soa como um "ding" agradável.
      [{ f: 880, t: 0 }, { f: 1318.5, t: 0.08 }].forEach(({ f, t }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, now + t);
        gain.gain.exponentialRampToValueAtTime(0.15, now + t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.32);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + t);
        osc.stop(now + t + 0.36);
      });
    } catch { /* ignore */ }
  }, []);

  // Feedback quando o modelo usa uma ferramenta no LIVE: toca o sino e mostra um toast breve.
  const handleLiveToolUsed = useCallback((name: string) => {
    playToolBell();
    const label = LIVE_TOOL_LABELS[name] || name;
    setLiveToolToast({ id: Date.now(), label });
    if (toolToastTimeoutRef.current) clearTimeout(toolToastTimeoutRef.current);
    toolToastTimeoutRef.current = window.setTimeout(() => setLiveToolToast(null), 2600);
  }, [playToolBell]);

  // "Acorda" o modelo LIVE injetando uma mensagem de sistema para ele falar imediatamente.
  // Se não houver sessão ativa, cai para uma notificação do navegador.
  const wakeLiveModel = useCallback((systemText: string) => {
    if (liveSessionRef.current) {
      resetProactivityState("Agendamento disparado");
      liveSessionRef.current.sendText(systemText);
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('Nemon', { body: systemText.replace(/^\[SISTEMA:\s*/, '').replace(/\]$/, '') });
      } catch { /* ignore */ }
    }
  }, [resetProactivityState]);

  // Agenda um disparo (alarme/cronômetro/lembrete) que acorda o modelo na hora certa.
  const scheduleWake = useCallback((
    kind: 'alarme' | 'cronômetro' | 'lembrete',
    fireAtMs: number,
    label: string,
    message: string
  ): string => {
    const nowMs = Date.now();
    const delay = Math.max(0, fireAtMs - nowMs);
    const id = `${kind}-${nowMs}-${Math.random().toString(36).slice(2, 7)}`;
    const timeoutId = window.setTimeout(() => {
      scheduledAlarmsRef.current.delete(id);
      wakeLiveModel(`[SISTEMA: O ${kind} "${label}" chegou à hora AGORA. Avise o usuário em voz alta, de forma natural e imediata, sobre: ${message}]`);
    }, delay);
    scheduledAlarmsRef.current.set(id, { id, kind, label, fireAtMs, timeoutId });
    return id;
  }, [wakeLiveModel]);

  // Executor central das ferramentas do modo LIVE. Acessa estado sempre atual via refs.
  const handleLiveToolCall = useCallback(async (name: string, args: any): Promise<any> => {
    const a = args || {};
    switch (name) {
      // ---------- Memória / DNA ----------
      case 'save_memory': {
        const text = (a.text || '').trim();
        if (!text) return { result: 'Nenhum texto de memória informado.' };
        const fact: MemoryFact = {
          id: `${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
          text,
          category: (a.category || 'Geral').trim(),
          connections: [],
          timestamp: Date.now()
        };
        const next = [...memoryFactsRef.current, fact];
        memoryFactsRef.current = next;
        setMemoryFacts(next);
        saveMemoryFactsToFirestore(next);
        return { result: `Memória salva: "${text}".` };
      }
      case 'update_memory': {
        const id = String(a.id || '');
        const text = (a.text || '').trim();
        const exists = memoryFactsRef.current.some(f => f.id === id);
        if (!exists) return { result: `Não encontrei uma memória com ID ${id}.` };
        const next = memoryFactsRef.current.map(f => f.id === id ? { ...f, text: text || f.text, timestamp: Date.now() } : f);
        memoryFactsRef.current = next;
        setMemoryFacts(next);
        saveMemoryFactsToFirestore(next);
        return { result: `Memória ${id} atualizada.` };
      }
      case 'delete_memory': {
        const id = String(a.id || '');
        const exists = memoryFactsRef.current.some(f => f.id === id);
        if (!exists) return { result: `Não encontrei uma memória com ID ${id}.` };
        const next = memoryFactsRef.current.filter(f => f.id !== id);
        memoryFactsRef.current = next;
        setMemoryFacts(next);
        saveMemoryFactsToFirestore(next);
        return { result: `Memória ${id} removida.` };
      }
      case 'recall_memory': {
        const q = (a.query || '').toLowerCase().trim();
        const matches = memoryFactsRef.current.filter(f =>
          !q || f.text.toLowerCase().includes(q) || f.category.toLowerCase().includes(q));
        if (matches.length === 0) return { result: q ? `Nenhuma memória encontrada para "${a.query}".` : 'Nenhuma memória salva ainda.' };
        return { result: matches.map(f => `[ID:${f.id}] (${f.category}) ${f.text}`).join(' | ') };
      }

      // ---------- Controle do app por voz ----------
      case 'list_voices': {
        const current = liveSessionRef.current?.getVoice() || liveVoiceRef.current;
        const list = LIVE_VOICES.map(v => `${v.id} (${v.desc})${v.id === current ? ' — ativa' : ''}`).join('; ');
        return { result: `Vozes disponíveis: ${list}.` };
      }
      case 'set_voice': {
        const voice = LIVE_VOICE_IDS.find(v => v.toLowerCase() === String(a.voice || '').toLowerCase());
        if (!voice) return { result: `Voz inválida. Opções: ${LIVE_VOICE_IDS.join(', ')}.` };
        applyLiveVoice(voice);
        return { result: `Voz alterada para ${voice} imediatamente, mantendo o contexto da conversa.` };
      }
      case 'set_personality_voice': {
        const rawVoice = String(a.voice || '').trim();
        const clear = /^(nenhuma|remover|remove|limpar|padr[aã]o|none|default)$/i.test(rawVoice);
        const voice = clear ? undefined : LIVE_VOICE_IDS.find(v => v.toLowerCase() === rawVoice.toLowerCase());
        if (!clear && !voice) return { result: `Voz inválida. Opções: ${LIVE_VOICE_IDS.join(', ')} (ou 'nenhuma' para remover).` };

        // Descobre a personalidade alvo: informada por nome, ou a ativa no momento.
        const wanted = String(a.personality || '').trim();
        const all = [DEFAULT_PERSONALITY, ...personalitiesRef.current.filter(p => p.id !== DEFAULT_PERSONALITY.id)];
        const target = wanted
          ? bestPersonalityMatch(wanted, all)
          : all.find(p => p.id === livePersonalityIdRef.current) || DEFAULT_PERSONALITY;
        if (!target) return { result: `Não encontrei "${wanted}". Personalidades: ${all.map(p => p.name).join(', ')}.` };
        if (target.id === DEFAULT_PERSONALITY.id) {
          return { result: 'A personalidade padrão "Normal" não guarda voz própria. Crie/ative uma personalidade personalizada para definir uma voz padrão.' };
        }

        const updated: Personality = { ...target, voice };
        const next = personalitiesRef.current.map(p => p.id === target.id ? updated : p);
        personalitiesRef.current = next;
        setPersonalities(next); // auto-salva no Firestore via effect

        // Se a personalidade alterada é a ativa agora, aplica a voz na hora.
        if (target.id === livePersonalityIdRef.current && voice) applyLiveVoice(voice);

        return {
          result: clear
            ? `Voz padrão da personalidade "${target.name}" removida.`
            : `Voz padrão da personalidade "${target.name}" definida como ${voice}.${target.id === livePersonalityIdRef.current ? ' Aplicada agora, pois ela está ativa.' : ''}`
        };
      }
      case 'toggle_camera': {
        const isOn = liveVisionTypeRef.current === 'camera';
        const want = a.enable === undefined ? !isOn : !!a.enable;
        if (want !== isOn) await handleToggleCamera();
        return { result: want ? 'Câmera ligada.' : 'Câmera desligada.' };
      }
      case 'toggle_screen_share': {
        const isOn = liveVisionTypeRef.current === 'screen';
        const want = a.enable === undefined ? !isOn : !!a.enable;
        if (want !== isOn) await handleToggleScreen();
        return { result: want ? 'Compartilhamento de tela ligado.' : 'Compartilhamento de tela desligado.' };
      }
      case 'toggle_proactivity': {
        const enable = !!a.enable;
        setIsLiveProactive(enable);
        return { result: `Proatividade ${enable ? 'ativada' : 'desativada'}.` };
      }
      case 'set_ai_volume': {
        if (a.level === undefined || a.level === null || isNaN(Number(a.level))) {
          return { result: `Informe o volume em uma escala de 0 (mudo) a 10 (máximo). Atual: ${liveVolumeRef.current}/10.` };
        }
        const applied = applyLiveVolume(Number(a.level));
        return { result: applied === 0 ? 'Volume no mudo (0/10).' : `Volume da voz ajustado para ${applied}/10.` };
      }
      case 'open_settings': {
        const allowed = ['geral', 'modelos', 'api', 'personalidades', 'dna'] as const;
        const tab = (allowed as readonly string[]).includes(a.tab) ? a.tab : 'geral';
        handleOpenSettings(tab);
        return { result: `Configurações abertas na aba ${tab}.` };
      }
      case 'set_theme': {
        const wanted = normalizeStr(String(a.name || ''));
        if (!wanted) return { result: `Qual tema? Disponíveis: ${LIVE_THEMES.map(t => t.label).join(', ')}.` };
        const found = LIVE_THEMES.find(t => t.match.some(m => wanted.includes(m) || m.includes(wanted)));
        if (!found) return { result: `Tema "${a.name}" não encontrado. Disponíveis: ${LIVE_THEMES.map(t => t.label).join(', ')}.` };
        setTheme(found.id); // aplicação é imediata via effect (data-theme)
        return { result: `Tema alterado para ${found.label}.` };
      }
      case 'end_session': {
        // Dá tempo do modelo se despedir antes de encerrar de fato.
        window.setTimeout(() => handleLiveStop(), 1500);
        return { result: 'Encerrando a sessão LIVE. Despeça-se do usuário.' };
      }

      // ---------- Histórico / conversas ----------
      case 'search_history': {
        const q = (a.query || '').toLowerCase().trim();
        if (!q) return { result: 'Informe um termo de busca.' };
        const hits: string[] = [];
        for (const c of chatsRef.current) {
          const inTitle = (c.title || '').toLowerCase().includes(q);
          const msg = c.messages.find(m => (m.text || '').toLowerCase().includes(q));
          if (inTitle || msg) {
            const snippet = msg ? msg.text.slice(0, 120) : (c.messages[0]?.text || '').slice(0, 120);
            hits.push(`"${c.title}": ${snippet}`);
          }
          if (hits.length >= 5) break;
        }
        return { result: hits.length ? hits.join(' | ') : `Nenhuma conversa encontrada para "${a.query}".` };
      }
      case 'create_new_chat': {
        setActiveChatId('');
        setActiveTab('chat');
        return { result: 'Nova conversa criada.' };
      }
      case 'list_personalities': {
        const all = [DEFAULT_PERSONALITY, ...personalitiesRef.current.filter(p => p.id !== DEFAULT_PERSONALITY.id)];
        const activeName = all.find(p => p.id === livePersonalityIdRef.current)?.name || DEFAULT_PERSONALITY.name;
        return { result: `Personalidades disponíveis: ${all.map(p => p.name).join(', ')}. Ativa no momento: ${activeName}.` };
      }
      case 'switch_personality': {
        const all = [DEFAULT_PERSONALITY, ...personalitiesRef.current.filter(p => p.id !== DEFAULT_PERSONALITY.id)];
        const wanted = String(a.name || '').trim();
        if (!wanted) {
          return { result: `Para qual personalidade? Disponíveis: ${all.map(p => p.name).join(', ')}.` };
        }
        const match = bestPersonalityMatch(wanted, all);
        if (!match) {
          return { result: `Não encontrei "${wanted}". Personalidades disponíveis: ${all.map(p => p.name).join(', ')}. Qual delas você quer?` };
        }
        setLivePersonalityId(match.id);
        livePersonalityIdRef.current = match.id;
        // Força a saudação da nova persona a começar num balão separado da resposta
        // anterior — cobre também o caso de reconexão por troca de voz, em que o
        // turnComplete do turno antigo pode não chegar.
        aiTurnBoundaryRef.current = true;
        // Atualiza a instrução de sistema da sessão para a nova personalidade, de
        // modo que reconexões (voz/GoAway) não revertam para a personalidade antiga.
        liveSessionRef.current?.setPersonalityPrompt(buildLiveInstruction(match.prompt, memoryFactsRef.current, useMemoryLive));
        // Se a personalidade tem voz padrão, aplica-a (pode agendar reconexão).
        if (match.voice) applyLiveVoice(match.voice);
        const persona = match.prompt?.trim() ? match.prompt.trim() : 'Estilo neutro, natural e direto, sem exageros.';
        // A instrução da persona volta no RESULTADO da tool: o modelo lê e passa a
        // incorporá-la imediatamente. Se, porém, há reconexão de voz pendente, o
        // resultado se perderia — então enfileiramos a persona para o novo setup.
        if (liveSessionRef.current?.isVoiceReconnectPending()) {
          liveSessionRef.current.queuePersonaInjection(`[SISTEMA: Você agora é "${match.name}". Incorpore integralmente esta persona e responda SEMPRE neste estilo (tom, voz e vocabulário): ${persona} — Cumprimente brevemente já no novo personagem.]`);
        }
        return {
          result: `Personalidade alterada para "${match.name}"${match.voice ? ` (voz ${match.voice})` : ''}. A partir de AGORA, incorpore integralmente esta persona e responda SEMPRE neste estilo (tom, voz e vocabulário), até que o usuário peça outra: ${persona} — Cumprimente o usuário brevemente já no novo personagem.`
        };
      }
      case 'create_personality': {
        const pName = String(a.name || '').trim();
        const pPrompt = String(a.prompt || '').trim();
        if (!pName) return { result: 'Informe um nome para a personalidade.' };
        if (!pPrompt) return { result: 'Informe as instruções/estilo da personalidade.' };
        const all = [DEFAULT_PERSONALITY, ...personalitiesRef.current];
        if (all.some(p => normalizeStr(p.name) === normalizeStr(pName))) {
          return { result: `Já existe uma personalidade chamada "${pName}". Escolha outro nome ou use switch_personality para ativá-la.` };
        }
        const newPersonality: Personality = {
          id: `${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
          name: pName,
          prompt: pPrompt
        };
        const next = [...personalitiesRef.current, newPersonality];
        personalitiesRef.current = next;
        setPersonalities(next); // auto-salva no Firestore via effect
        return { result: `Personalidade "${pName}" criada e salva. Quer que eu ative ela agora?` };
      }
      case 'delete_personality': {
        const wanted = String(a.name || '').trim();
        if (!wanted) return { result: 'Qual personalidade devo excluir?' };
        if (normalizeStr(wanted) === normalizeStr(DEFAULT_PERSONALITY.name)) {
          return { result: 'A personalidade padrão "Normal" não pode ser excluída.' };
        }
        const custom = personalitiesRef.current; // não inclui a padrão
        if (custom.length === 0) return { result: 'Não há personalidades personalizadas para excluir.' };
        const match = bestPersonalityMatch(wanted, custom);
        if (!match) {
          return { result: `Não encontrei "${wanted}". Personalizadas: ${custom.map(p => p.name).join(', ')}.` };
        }
        const next = custom.filter(p => p.id !== match.id);
        personalitiesRef.current = next;
        setPersonalities(next); // auto-salva no Firestore via effect
        let extra = '';
        if (livePersonalityIdRef.current === match.id) {
          setLivePersonalityId('default');
          livePersonalityIdRef.current = 'default';
          extra = ' Ela estava ativa, então voltei para a personalidade Normal.';
        }
        return { result: `Personalidade "${match.name}" excluída.${extra}` };
      }

      // ---------- Verificação de fatos ----------
      case 'fact_check': {
        const claim = String(a.claim || '').trim();
        if (!claim) return { result: 'Informe a afirmação a verificar.' };
        try {
          const results = await performFactCheck(claim, undefined, factCheckModelId);
          if (!results || results.length === 0) {
            return { result: 'Não consegui verificar essa afirmação com fontes agora.' };
          }
          const verified = results.filter(r => r.isVerified).length;
          const failed = results.length - verified;
          const detail = results.map(r =>
            `"${r.segment}": ${r.isVerified
              ? 'VERIFICADO' + (r.sourceUrl ? ` (fonte: ${r.sourceUrl})` : '')
              : 'NÃO confirmado' + (r.explanation ? ` — ${r.explanation}` : '')}`
          ).join(' | ');
          return { result: `Checagem concluída (${verified} verificado(s), ${failed} não confirmado(s)): ${detail}. Resuma o veredito ao usuário em voz alta, de forma natural.` };
        } catch (err: any) {
          return { result: `Não consegui checar agora: ${err?.message || 'erro de rede'}.` };
        }
      }

      // ---------- Tempo estendido ----------
      case 'set_timer': {
        const seconds = Number(a.seconds);
        if (!seconds || seconds <= 0) return { result: 'Duração inválida.' };
        const label = (a.label || 'cronômetro').trim();
        scheduleWake('cronômetro', Date.now() + seconds * 1000, label, `o cronômetro de ${label} terminou`);
        return { result: `Cronômetro de ${seconds}s iniciado (${label}).` };
      }
      case 'set_reminder': {
        const minutes = Number(a.minutes);
        const message = (a.message || '').trim();
        if (!minutes || minutes <= 0) return { result: 'Tempo inválido.' };
        if (!message) return { result: 'Informe o que devo lembrar.' };
        scheduleWake('lembrete', Date.now() + minutes * 60000, message, message);
        return { result: `Lembrete agendado para daqui a ${minutes} min: "${message}".` };
      }

      // ---------- Alarme ----------
      case 'set_alarm': {
        const m = /^(\d{1,2}):(\d{2})$/.exec(String(a.time || '').trim());
        if (!m) return { result: 'Horário inválido. Use o formato HH:MM (24h).' };
        const h = Number(m[1]);
        const min = Number(m[2]);
        if (h > 23 || min > 59) return { result: 'Horário inválido.' };
        const message = (a.message || 'seu alarme').trim();
        const target = new Date();
        target.setHours(h, min, 0, 0);
        let amanha = false;
        if (target.getTime() <= Date.now()) { target.setDate(target.getDate() + 1); amanha = true; }
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => { });
        }
        scheduleWake('alarme', target.getTime(), message, message);
        const hhmm = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        return { result: `Alarme definido para ${hhmm}${amanha ? ' de amanhã' : ''}: "${message}".` };
      }
      case 'list_alarms': {
        const items = Array.from(scheduledAlarmsRef.current.values());
        if (items.length === 0) return { result: 'Nenhum alarme, cronômetro ou lembrete agendado.' };
        return {
          result: items.map(it => {
            const when = new Date(it.fireAtMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            return `[ID:${it.id}] ${it.kind} "${it.label}" às ${when}`;
          }).join(' | ')
        };
      }
      case 'cancel_alarm': {
        const id = String(a.id || '');
        const item = scheduledAlarmsRef.current.get(id);
        if (!item) return { result: `Não encontrei um agendamento com ID ${id}.` };
        clearTimeout(item.timeoutId);
        scheduledAlarmsRef.current.delete(id);
        return { result: `${item.kind} "${item.label}" cancelado.` };
      }

      // ---------- Cálculo ----------
      case 'calculate': {
        const expr = String(a.expression || '').trim();
        if (!expr) return { result: 'Nenhuma expressão informada.' };
        try {
          const value = safeCalculate(expr);
          // Formata com até 6 casas, sem zeros à direita.
          const formatted = Number.isInteger(value) ? String(value) : parseFloat(value.toFixed(6)).toString();
          return { result: `${expr} = ${formatted}` };
        } catch (err: any) {
          return { result: `Não consegui calcular "${expr}": ${err?.message || 'expressão inválida'}.` };
        }
      }

      // ---------- Clima (Open-Meteo) ----------
      case 'get_weather': {
        try {
          let lat: number;
          let lon: number;
          let place: string;
          const loc = String(a.location || '').trim();

          if (loc) {
            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(loc)}&count=1&language=pt&format=json`);
            const geo = await geoRes.json();
            if (!geo.results || geo.results.length === 0) {
              return { result: `Não encontrei a localização "${loc}".` };
            }
            const r = geo.results[0];
            lat = r.latitude;
            lon = r.longitude;
            place = [r.name, r.admin1, r.country_code].filter(Boolean).join(', ');
          } else {
            // Sem cidade: usa a geolocalização do dispositivo (pede permissão).
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
              if (!navigator.geolocation) { reject(new Error('Geolocalização indisponível.')); return; }
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
            });
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
            place = 'sua localização atual';
          }

          const wxRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`);
          const wx = await wxRes.json();
          const c = wx.current;
          const d = wx.daily;
          if (!c) return { result: 'Não consegui obter o clima agora.' };
          const desc = WEATHER_CODES[c.weather_code] ?? 'condição desconhecida';
          return {
            result: `Clima em ${place}: ${desc}, ${Math.round(c.temperature_2m)}°C (sensação ${Math.round(c.apparent_temperature)}°C), `
              + `umidade ${c.relative_humidity_2m}%, vento ${Math.round(c.wind_speed_10m)} km/h. `
              + `Hoje: máx ${Math.round(d.temperature_2m_max[0])}°C / mín ${Math.round(d.temperature_2m_min[0])}°C, `
              + `chance de chuva ${d.precipitation_probability_max[0]}%.`
          };
        } catch (err: any) {
          return { result: `Não consegui consultar o clima: ${err?.message || 'erro de rede'}.` };
        }
      }

      default:
        return { result: `Ferramenta desconhecida: ${name}.` };
    }
  }, [handleToggleCamera, handleToggleScreen, handleOpenSettings, handleLiveStop, saveMemoryFactsToFirestore, scheduleWake, applyLiveVoice, useMemoryLive, factCheckModelId]);

  // Mantém os refs do executor/feedback de ferramentas sempre atuais, para o tool
  // calling do chat (executeAIRequest) usá-los sem depender da ordem de declaração.
  useEffect(() => {
    liveToolCallRef.current = handleLiveToolCall;
    liveToolUsedRef.current = handleLiveToolUsed;
  }, [handleLiveToolCall, handleLiveToolUsed]);

  // Mantém o ref do executor sempre apontando para a versão mais recente.
  useEffect(() => {
    liveToolExecutorRef.current = handleLiveToolCall;
  }, [handleLiveToolCall]);

  const handleSend = useCallback((text: string, files: PendingFile[]) => {
    if (text.trim() === '' && files.length === 0) return;

    if (isLiveActive && liveSessionRef.current) {
      resetProactivityState("Chat manual (Live)");
      liveSessionRef.current.sendText(text);
      setLiveTranscript(prev => [...prev, { role: 'user', text }]);
      return;
    }

    let targetId = activeChatId;
    let isFirst = false;
    if (!activeChatId) {
      targetId = Date.now().toString();
      const newChat: ChatSession = { id: targetId, title: 'Nova Conversa', messages: [], isNaming: true, personalityId: selectedPersonalityId, model };
      setChats(prev => [newChat, ...prev]);
      setActiveChatId(targetId);
      isFirst = true;
    }
    const newUserMsg: Message = { id: Date.now().toString(), role: 'user', text, files };
    setChats(prev => prev.map(c => c.id === targetId ? { ...c, messages: [...c.messages, newUserMsg] } : c));

    // apiHistory construction
    const currentChat = targetId === activeChatId ? activeChat : { messages: [] };
    const apiHistory = (currentChat?.messages || []).map(m => ({
      role: m.role === 'ai' ? 'model' : 'user',
      parts: [...(m.files?.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.data } })) || []), { text: m.text }]
    }));

    executeAIRequest(targetId, text, files, apiHistory, isFirst);
  }, [activeChatId, activeChat, executeAIRequest, isLiveActive, resetProactivityState, selectedPersonalityId, model]);

  const handleResolveMemoryUpdate = useCallback((messageId: string, updateId: string, action: 'accepted' | 'ignored') => {
    let updateToApply: any = null;
    let originalText = '';
    let originalThoughts = '';
    const chat = chats.find(c => c.id === activeChatId);
    let msgIndex = -1;

    if (chat) {
      msgIndex = chat.messages.findIndex(m => m.id === messageId);
      const msg = msgIndex !== -1 ? chat.messages[msgIndex] : null;
      if (msg) {
        originalText = msg.text || '';
        originalThoughts = msg.thoughts || '';
        if (msg.pendingMemoryUpdates) {
          updateToApply = msg.pendingMemoryUpdates.find(upd => upd.id === updateId);
        }
      }
    }

    if (msgIndex === -1 || !chat) return;

    // 1. Mark as resolved in the state
    setChats((prev: ChatSession[]) => prev.map((c: ChatSession) => c.id === activeChatId ? {
      ...c,
      messages: c.messages.map((m: Message) => m.id === messageId ? {
        ...m,
        pendingMemoryUpdates: m.pendingMemoryUpdates?.map(upd =>
          upd.id === updateId ? { ...upd, resolved: action } : upd
        )
      } : m)
    } : c));

    // 2. Persist in Firestore if accepted
    if (action === 'accepted' && updateToApply) {
      const newMemories = memoryFacts.map((m: MemoryFact) =>
        m.id === updateId ? { ...m, text: updateToApply.newText, category: updateToApply.category, timestamp: Date.now() } : m
      );
      setMemoryFacts(newMemories);
      saveMemoryFactsToFirestore(newMemories);
    }

    // 3. Build API history up to the current AI message
    const historyBefore = chat.messages.slice(0, msgIndex + 1);
    const apiHistory = historyBefore.map(m => ({
      role: m.role === 'ai' ? 'model' : 'user',
      parts: [...(m.files?.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.data } })) || []), { text: m.text }]
    }));

    // 4. Construct virtual user response
    const virtualUserText = action === 'accepted'
      ? "[SISTEMA: O usuário confirmou a atualização do DNA de memória. Continue sua resposta anterior normalmente a partir desse ponto. NÃO tente atualizar, criar ou apagar qualquer memória, e NÃO gere nenhuma tag de memória (<MEMORY>, <UPDATE_MEMORY>, <DELETE_MEMORY>) para este turno de continuação.]"
      : "[SISTEMA: O usuário recusou a atualização de memória proposta. Mantenha a memória exatamente como estava antes (sem fazer alterações) e continue sua resposta anterior normalmente a partir desse ponto. NÃO registre fatos sobre esta recusa no DNA, e NÃO gere nenhuma tag de memória (<MEMORY>, <UPDATE_MEMORY>, <DELETE_MEMORY>) para este turno.]";

    // 5. Execute request behind the scenes, appending to the same AI message
    executeAIRequest(
      activeChatId,
      virtualUserText,
      [], // No files
      apiHistory,
      false, // isFirstMessage
      messageId, // replaceId
      true, // isAppending
      originalText,
      originalThoughts
    );
  }, [activeChatId, chats, memoryFacts, saveMemoryFactsToFirestore, executeAIRequest]);

  const handleScroll = useCallback(() => {
    if (chatWindowRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatWindowRef.current;
      setShowScrollButton(scrollHeight - scrollTop - clientHeight > 300);

      if (scrollTop < 50 && visibleMessagesCount < messages.length && !isLazyLoadingRef.current) {
        isLazyLoadingRef.current = true;
        previousScrollHeightRef.current = scrollHeight;
        // Delay para mostrar o spinner e evitar gatilhos múltiplos rápidos
        setTimeout(() => {
          setVisibleMessagesCount(prev => Math.min(prev + 15, messages.length));
        }, 400);
      }
    }
  }, [messages.length, visibleMessagesCount]);

  // Restauração de Scroll após carregar mensagens antigas (Lazy Loading)
  useLayoutEffect(() => {
    if (isLazyLoadingRef.current && chatWindowRef.current && previousScrollHeightRef.current > 0) {
      const scrollContainer = chatWindowRef.current;
      const heightDiff = scrollContainer.scrollHeight - previousScrollHeightRef.current;

      if (heightDiff > 0) {
        scrollContainer.scrollTop += heightDiff;
      }

      isLazyLoadingRef.current = false;
      previousScrollHeightRef.current = 0;
    }
  }, [visibleMessagesCount]);

  const handleCancelFactCheck = useCallback((msgId: string) => {
    if (factCheckControllersRef.current[msgId]) {
      factCheckControllersRef.current[msgId].abort();
      delete factCheckControllersRef.current[msgId];
    }
    setChats(prev => prev.map(chat => {
      if (chat.id === activeChatId) {
        return {
          ...chat,
          messages: chat.messages.map(m =>
            m.id === msgId ? { ...m, isVerifying: false } : m
          )
        };
      }
      return chat;
    }));
  }, [activeChatId]);

  const handleFactCheck = useCallback(async (msgId: string) => {
    if (!activeChat) return;

    // Abort existing fact check for this message if any
    if (factCheckControllersRef.current[msgId]) {
      factCheckControllersRef.current[msgId].abort();
    }

    const controller = new AbortController();
    factCheckControllersRef.current[msgId] = controller;

    // Set loading state for this message
    setChats(prev => prev.map(chat => {
      if (chat.id === activeChatId) {
        return {
          ...chat,
          messages: chat.messages.map(m =>
            m.id === msgId ? { ...m, isVerifying: true } : m
          )
        };
      }
      return chat;
    }));

    const msg = activeChat.messages.find(m => m.id === msgId);
    if (!msg) return;

    try {
      const results = await performFactCheck(msg.text, controller.signal, factCheckModelId);

      delete factCheckControllersRef.current[msgId];

      setChats(prev => prev.map(chat => {
        if (chat.id === activeChatId) {
          return {
            ...chat,
            messages: chat.messages.map(m =>
              m.id === msgId ? { ...m, factCheckResults: results, isVerifying: false } : m
            )
          };
        }
        return chat;
      }));
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.log(`Fact check aborted for message ${msgId}`);
      } else {
        console.error("Fact check failed:", e);
      }

      delete factCheckControllersRef.current[msgId];

      setChats(prev => prev.map(chat => {
        if (chat.id === activeChatId) {
          return {
            ...chat,
            messages: chat.messages.map(m =>
              m.id === msgId ? { ...m, isVerifying: false } : m
            )
          };
        }
        return chat;
      }));
    }
  }, [activeChat, activeChatId, factCheckModelId]);

  const handleDeleteChat = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Deseja excluir esta conversa para sempre?")) {
      setChats(p => p.filter(c => c.id !== id));
      if (activeChatId === id) setActiveChatId('');
    }
  }, [activeChatId]);

  const handleTogglePin = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setChats(p => p.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
  }, []);

  const handleRenameChat = useCallback((id: string) => {
    if (editTitle.trim()) {
      setChats(p => p.map(c => c.id === id ? { ...c, title: editTitle.trim() } : c));
    }
    setEditingChatId(null);
  }, [editTitle]);

  const handleArchiveChat = useCallback((chatId: string) => {
    setChats(prev => prev.map(chat => chat.id === chatId ? { ...chat, archived: !chat.archived } : chat));
    if (chatId === activeChatId) setActiveChatId('');
  }, [activeChatId]);

  const handleExportChat = useCallback((chat: ChatSession, format: 'md' | 'json') => {
    try {
      if (format === 'json') exportChatAsJson(chat);
      else exportChatAsMarkdown(chat);
      toast.success(`Conversa exportada em ${format === 'json' ? 'JSON' : 'Markdown'}.`);
    } catch (e) {
      toast.error('Falha ao exportar a conversa: ' + (e instanceof Error ? e.message : 'erro desconhecido'));
    }
  }, [toast]);

  const handleRestoreChat = useCallback((chatId: string) => {
    setChats(prev => prev.map(chat => chat.id === chatId ? { ...chat, archived: false } : chat));
    setActiveChatId(chatId);
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (over && active.id !== over.id) {
      setChats((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Renderiza um item de conversa na sidebar (reusado nos grupos de pastas).
  const renderChatItem = (chat: ChatSession) => (
    <SortableChatItem
      key={chat.id}
      chat={chat}
      activeChatId={activeChatId}
      editingChatId={editingChatId}
      editTitle={editTitle}
      menuOpenId={menuOpenId}
      isLocked={isOrderLocked}
      folders={folders}
      onSetFolder={handleSetChatFolder}
      onSelect={(id) => { setActiveChatId(id); if (window.innerWidth < 768) setIsSidebarOpen(false); setActiveTab('chat'); }}
      onRename={handleRenameChat}
      onEditTitleChange={setEditTitle}
      onRenameConfirm={handleRenameChat}
      onToggleMenu={(id) => setMenuOpenId(menuOpenId === id ? null : id)}
      onTogglePin={handleTogglePin}
      onArchive={handleArchiveChat}
      onDelete={handleDeleteChat}
      onSetEditingId={(id, title) => { setEditingChatId(id); setEditTitle(title); }}
      onExport={handleExportChat}
    />
  );

  const handleSaveEdit = useCallback((msgId: string) => {
    if (!activeChatId || !editingMsgText.trim() || isLoading) return;
    const chat = chats.find(c => c.id === activeChatId);
    if (!chat) return;
    const msgIndex = chat.messages.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;
    const newText = editingMsgText.trim();
    setEditingMsgId(null);
    setEditingMsgText('');
    setChats(prev => prev.map(c => {
      if (c.id === activeChatId) {
        const updatedMsgs = [...c.messages];
        updatedMsgs[msgIndex] = { ...updatedMsgs[msgIndex], text: newText };
        if (updatedMsgs[msgIndex + 1]?.role === 'ai') updatedMsgs[msgIndex + 1] = { ...updatedMsgs[msgIndex + 1], text: '', thoughts: '' };
        return { ...c, messages: updatedMsgs };
      }
      return c;
    }));
    const historyBefore = chat.messages.slice(0, msgIndex);
    const apiHistory = historyBefore.map(m => ({
      role: m.role === 'ai' ? 'model' : 'user',
      parts: [...(m.files?.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.data } })) || []), { text: m.text }]
    }));
    executeAIRequest(activeChatId, newText, chat.messages[msgIndex].files || [], apiHistory, false, chat.messages[msgIndex + 1]?.id);
  }, [activeChatId, chats, editingMsgText, isLoading, executeAIRequest]);

  // Regenera a resposta. Se `newModelId` for passado (menu "Regenerar com…"), a
  // conversa adota esse modelo e ele é usado na requisição.
  const handleRegenerate = useCallback((msgId: string, newModelId?: string) => {
    if (!activeChatId || isLoading) return;
    const chat = chats.find(c => c.id === activeChatId);
    if (!chat) return;
    const idx = chat.messages.findIndex(m => m.id === msgId);
    if (idx <= 0) return;
    const userMsg = chat.messages[idx - 1];
    if (newModelId) {
      setModel(newModelId);
      setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, model: newModelId, messages: c.messages.map(m => m.id === msgId ? { ...m, text: '', thoughts: '' } : m) } : c));
    } else {
      setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: c.messages.map(m => m.id === msgId ? { ...m, text: '', thoughts: '' } : m) } : c));
    }
    const historyBefore = chat.messages.slice(0, idx - 1);
    const apiHistory = historyBefore.map(m => ({
      role: m.role === 'ai' ? 'model' : 'user',
      parts: [...(m.files?.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.data } })) || []), { text: m.text }]
    }));
    executeAIRequest(activeChatId, userMsg.text, userMsg.files || [], apiHistory, false, msgId, false, '', '', newModelId);
  }, [activeChatId, chats, isLoading, executeAIRequest]);

  // Ramifica a conversa a partir de uma mensagem: cria um novo chat com o histórico
  // até (e incluindo) essa mensagem, e o ativa. A conversa original fica intacta.
  const handleBranchFromMessage = useCallback((msgId: string) => {
    const chat = chats.find(c => c.id === activeChatId);
    if (!chat) return;
    const idx = chat.messages.findIndex(m => m.id === msgId);
    if (idx < 0) return;
    const newId = Date.now().toString();
    const branched: ChatSession = {
      id: newId,
      title: `${chat.title} (ramificação)`,
      messages: chat.messages.slice(0, idx + 1).map(m => ({ ...m })),
      personalityId: chat.personalityId,
      model: chat.model,
    };
    setChats(prev => [branched, ...prev]);
    setActiveChatId(newId);
    setActiveTab('chat');
    toast.success('Conversa ramificada em um novo chat.');
  }, [activeChatId, chats, toast]);

  // F2: insere no chat ativo (ou cria um) o par prompt+resposta escolhido na comparação.
  const handleKeepComparison = useCallback((modelId: string, prompt: string, response: string) => {
    setCompareOpen(false);
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: prompt };
    const aiMsg: Message = { id: (Date.now() + 1).toString() + '-ai', role: 'ai', text: response };
    if (activeChatId) {
      setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, model: modelId, messages: [...c.messages, userMsg, aiMsg] } : c));
    } else {
      const newId = Date.now().toString();
      setChats(prev => [{ id: newId, title: prompt.slice(0, 40) || 'Comparação', messages: [userMsg, aiMsg], model: modelId }, ...prev]);
      setActiveChatId(newId);
    }
    setModel(modelId);
    setActiveTab('chat');
    toast.success('Resposta adicionada ao chat.');
  }, [activeChatId, toast]);

  // Modelos habilitados (internos + customizados) para o menu "Regenerar com…".
  const regenModels = useMemo(() => [
    ...MODEL_OPTIONS.filter(o => enabledModelIds.includes(o.id)).map(o => ({ id: o.id, name: o.name })),
    ...customModels.filter(m => enabledModelIds.includes(m.id)).map(m => ({ id: m.id, name: m.name })),
  ], [enabledModelIds, customModels]);

  const handleJumpToMessage = useCallback((id: string) => {
    const msgIndex = messages.findIndex(m => m.id === id);
    if (msgIndex === -1) return;

    // Verificar se a mensagem está fora do alcance da renderização (Lazy Loading)
    const itemsFromEnd = messages.length - msgIndex;

    if (itemsFromEnd > visibleMessagesCount) {
      // Expandir a contagem de mensagens visíveis para incluir o alvo
      setVisibleMessagesCount(itemsFromEnd + 10);

      // Pequeno delay para garantir que o React renderizou o novo elemento no DOM
      setTimeout(() => {
        const el = document.getElementById(`msg-${id}`);
        if (el && chatWindowRef.current) {
          const top = el.offsetTop - 20;
          chatWindowRef.current.scrollTo({ top, behavior: 'smooth' });
        }
      }, 100);
    } else {
      const el = document.getElementById(`msg-${id}`);
      if (el && chatWindowRef.current) {
        const top = el.offsetTop - 20;
        chatWindowRef.current.scrollTo({ top, behavior: 'smooth' });
      }
    }
  }, [messages, visibleMessagesCount]);

  // Atalho "localizar nesta conversa" (Ctrl/Cmd+F) — só no chat com conversa aberta.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        if (activeTab === 'chat' && activeChatId && !isLiveActive) {
          e.preventDefault();
          setShowInChatFind(true);
        }
      } else if (e.key === 'Escape') {
        setShowInChatFind(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, activeChatId, isLiveActive]);


  // Intersection Observer for Message Timeline sync
  useEffect(() => {
    if (!activeChatId || isLiveActive || !chatWindowRef.current) return;

    const options = {
      root: chatWindowRef.current,
      rootMargin: '-45% 0px -45% 0px',
      threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id.replace('msg-', '');
          setActiveMessageId(id);
        }
      });
    }, options);

    // Observar todas as mensagens que tenham o ID de âncora
    const elements = document.querySelectorAll('[id^="msg-"]');
    elements.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, [activeChatId, messages, visibleMessagesCount, isLiveActive, activeTab, isInitialLoading]);

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#09090b]">
        <div className="w-10 h-10 rounded-full border-4 border-zinc-700/30 border-t-zinc-500 animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="flex h-screen overflow-hidden text-(--text-primary) relative bg-(--bg-main)">
      <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'} flex flex-col glass-sidebar shadow-2xl`}>
        <div className="p-3 flex items-center justify-between text-(--text-secondary) mb-4 lg:hidden">
          <div className="flex items-center gap-2">
            <NemonIcon size={24} />
            <span className="font-bold text-(--text-bold) tracking-tighter">Nemon</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsGlobalSearchOpen(true)}
              className="p-2 hover:bg-(--bg-chat-hover) rounded-full transition text-(--text-secondary) hover:text-(--text-primary)"
              title="Pesquisar"
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 hover:bg-(--bg-chat-hover) rounded-full transition text-(--text-secondary) hover:text-(--text-primary)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-3 items-center justify-between text-(--text-secondary) mb-4 hidden lg:flex">
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-(--bg-chat-hover) rounded-full hover:rotate-90 transition-transform duration-300 text-(--text-secondary) hover:text-(--text-primary)"><Menu className="w-5 h-5" /></button>
          <button onClick={() => setIsGlobalSearchOpen(true)} className="p-2 hover:bg-(--bg-chat-hover) rounded-full transition ml-auto text-(--text-secondary) hover:text-(--text-primary)"><Search className="w-5 h-5" /></button>
        </div>

        <div className="px-3 mb-8">
          <button
            onClick={() => { setActiveChatId(''); setVisibleMessagesCount(15); setActiveTab('chat'); }}
            className="flex items-center gap-3 px-3 py-3 w-full rounded-full hover:bg-(--bg-chat-hover) transition text-(--text-primary) font-medium"
          >
            <SquarePen className="w-5 h-5 opacity-70" />
            <span>Nova conversa</span>
          </button>

          <button
            onClick={() => setIsArchiveExpanded(!isArchiveExpanded)}
            className={`flex items-center gap-3 px-3 py-2.5 mt-2 w-full rounded-full transition text-sm font-medium border border-transparent ${isArchiveExpanded ? 'bg-(--bg-chat-active) text-(--text-primary) border-(--border-light)' : 'hover:bg-(--bg-chat-hover) text-(--text-secondary) hover:text-(--text-primary)'}`}
          >
            <Archive className={`w-4 h-4 transition-transform duration-300 ${isArchiveExpanded ? '' : 'opacity-50'}`} style={isArchiveExpanded ? { color: 'var(--accent-text)' } : {}} />
            <span>Arquivadas</span>
            <div className="ml-auto flex items-center gap-2">
              {chats.filter(c => c.archived).length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold" style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}>
                  {chats.filter(c => c.archived).length}
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isArchiveExpanded ? 'rotate-180' : 'opacity-30'}`} />
            </div>
          </button>

          {/* Drawer de Arquivadas */}
          {isArchiveExpanded && (
            <div className="mt-1 ml-4 border-l border-(--border-light) pl-2 space-y-1 animate-in slide-in-from-top-2 duration-300">
              {chats.filter(c => c.archived).length === 0 ? (
                <div className="text-[10px] text-(--text-secondary) opacity-40 py-2 px-3 italic">Sem arquivados</div>
              ) : (
                chats.filter(c => c.archived).map(chat => (
                  <div
                    key={chat.id}
                    onClick={() => { setActiveChatId(chat.id); if (window.innerWidth < 768) setIsSidebarOpen(false); }}
                    className={`group/arch flex items-center gap-2 py-1.5 px-3 rounded-xl cursor-pointer hover:bg-(--bg-chat-hover) transition text-(--text-secondary) hover:text-(--text-primary) ${activeChatId === chat.id ? 'bg-(--bg-chat-active) text-(--text-nav-active)' : ''}`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 opacity-40 group-hover/arch:opacity-100 transition-opacity" />
                    <span className="text-xs truncate flex-1">{chat.title}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRestoreChat(chat.id); }}
                      className="opacity-0 group-hover/arch:opacity-100 p-1 rounded-md transition"
                      style={{ color: 'var(--accent-text)' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-bg)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = ''}
                      title="Restaurar"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm('Excluir permanentemente?')) handleDeleteChat(e, chat.id); }}
                      className="opacity-0 group-hover/arch:opacity-100 p-1 hover:bg-red-500/20 rounded-md transition text-red-400"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-2">
          <div className="flex items-center justify-between px-3 mb-4 mt-6">
            <div className="text-[14px] font-medium text-(--text-primary)">Conversas</div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { const n = window.prompt('Nome da nova pasta:'); if (n) handleCreateFolder(n); }}
                className="p-1.5 rounded-md text-(--text-secondary) opacity-40 hover:opacity-100 hover:bg-(--bg-chat-hover) transition-all"
                title="Nova pasta"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsOrderLocked(!isOrderLocked)}
                className={`p-1.5 rounded-md transition-all ${isOrderLocked ? 'text-(--text-secondary) opacity-40 hover:opacity-100 hover:bg-(--bg-chat-hover)' : ''}`}
                style={!isOrderLocked ? { color: 'var(--accent-text)', background: 'var(--accent-bg)' } : {}}
                title={isOrderLocked ? "Destravar reordenação" : "Travar reordenação"}
              >
                {isOrderLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              {(() => {
                const activeChats = chats.filter(c => !c.archived);
                if (folders.length === 0) {
                  return (
                    <SortableContext items={activeChats.map(c => c.id)} strategy={verticalListSortingStrategy}>
                      {activeChats.map(renderChatItem)}
                    </SortableContext>
                  );
                }
                const noFolder = activeChats.filter(c => !c.folderId || !folders.some(f => f.id === c.folderId));
                return (
                  <>
                    {folders.map(folder => {
                      const fchats = activeChats.filter(c => c.folderId === folder.id);
                      const collapsed = collapsedFolders.has(folder.id);
                      return (
                        <div key={folder.id} className="mb-1">
                          <div className="flex items-center gap-1 px-2 py-1 group/folder">
                            <button
                              onClick={() => toggleFolderCollapsed(folder.id)}
                              className="flex items-center gap-1.5 flex-1 min-w-0 text-[11px] font-bold uppercase tracking-wider text-(--text-placeholder) hover:text-(--text-primary) transition-colors"
                            >
                              <ChevronRight className={`w-3 h-3 shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
                              <FolderIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{folder.name}</span>
                              <span className="opacity-60 font-normal">{fchats.length}</span>
                            </button>
                            <button
                              onClick={() => { const n = window.prompt('Renomear pasta:', folder.name); if (n) handleRenameFolder(folder.id, n); }}
                              title="Renomear pasta"
                              className="opacity-0 group-hover/folder:opacity-100 p-1 rounded text-(--text-placeholder) hover:text-(--text-primary) transition"
                            ><Edit2 className="w-3 h-3" /></button>
                            <button
                              onClick={() => { if (window.confirm(`Excluir a pasta "${folder.name}"? As conversas voltam para "Sem pasta".`)) handleDeleteFolder(folder.id); }}
                              title="Excluir pasta"
                              className="opacity-0 group-hover/folder:opacity-100 p-1 rounded text-(--text-placeholder) hover:text-red-400 transition"
                            ><Trash2 className="w-3 h-3" /></button>
                          </div>
                          {!collapsed && (
                            <SortableContext items={fchats.map(c => c.id)} strategy={verticalListSortingStrategy}>
                              {fchats.map(renderChatItem)}
                            </SortableContext>
                          )}
                        </div>
                      );
                    })}
                    {noFolder.length > 0 && (
                      <div className="mb-1">
                        <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-(--text-placeholder)">Sem pasta</div>
                        <SortableContext items={noFolder.map(c => c.id)} strategy={verticalListSortingStrategy}>
                          {noFolder.map(renderChatItem)}
                        </SortableContext>
                      </div>
                    )}
                  </>
                );
              })()}

              <DragOverlay adjustScale={false}>
                {activeDragId ? (
                  <div className="bg-(--bg-chat-active) text-(--text-nav-active) py-2.5 px-3 rounded-full opacity-80 shadow-2xl border border-white/10 flex items-center gap-3">
                    <GripVertical className="w-4 h-4 opacity-50" />
                    <span className="text-sm font-medium truncate">
                      {chats.find(c => c.id === activeDragId)?.title}
                    </span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>

        <div className="mt-auto p-3 border-t border-(--border-light) relative flex flex-col gap-2">
          {user && (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-(--bg-chat-hover)/30 border border-(--border-light) group">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || "Avatar"} className="w-8 h-8 rounded-full border border-(--border-light)" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-(--accent-bg) text-(--accent-text) flex items-center justify-center font-bold text-xs">
                  {user.displayName?.charAt(0) || "U"}
                </div>
              )}
              <div className="flex-1 min-w-0 text-left">
                <div className="text-xs font-semibold text-(--text-bold) truncate">{user.displayName}</div>
                <div className="text-[10px] text-(--text-secondary) truncate">{user.email}</div>
              </div>
              <button
                onClick={() => signOut(auth)}
                className="p-1.5 hover:bg-red-500/10 hover:text-red-400 rounded-lg text-(--text-secondary) transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={() => {
              setActiveTab('settings');
              setSettingsTab('geral');
              if (window.innerWidth < 768) setIsSidebarOpen(false);
            }}
            className={`flex items-center gap-3 px-3 py-3 w-full rounded-full font-medium transition-all duration-300 ${activeTab === 'settings' ? 'bg-(--bg-chat-active) text-(--text-nav-active) shadow-lg shadow-black/10' : 'hover:bg-(--bg-chat-hover) text-(--text-primary)'}`}
          >
            <Settings className={`w-5 h-5 transition-transform duration-300 ${activeTab === 'settings' ? 'rotate-90 opacity-100' : 'opacity-70'}`} style={activeTab === 'settings' ? { color: 'var(--accent-text)' } : {}} />
            <span className="text-[14px]">Configurações</span>
          </button>
        </div>
      </aside>

      <main className="main-content flex flex-col h-full w-full bg-(--bg-main)">
        <header className="h-[46px] flex justify-between items-center px-3 md:px-5 border-b border-(--border-light) relative z-50 bg-(--bg-main)/80 backdrop-blur-md">
          <div className="flex-1 flex items-center gap-4">
            {!isSidebarOpen && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2.5 hover:bg-(--bg-chat-hover) rounded-xl transition-all hover:scale-110 active:scale-90"
              >
                <Menu className="w-6 h-6 text-(--text-secondary)" />
              </button>
            )}
          </div>

          {/* Centered Header Controls Wrapper */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[45] flex items-center gap-2 sm:gap-4">
            {/* Left Side: Files Button */}
            <div className="w-20 sm:w-24 flex justify-end">
              {activeChatId && (
                <button
                  onClick={() => setActiveTab(activeTab === 'chat' ? 'files' : 'chat')}
                  className={`flex items-center justify-center rounded-full border transition-all duration-200 hover:scale-105 active:scale-95 w-9 h-9 ${activeTab === 'files'
                    ? 'text-white shadow-lg'
                    : 'bg-(--bg-chat-hover) hover:bg-(--bg-chat-active) border-(--border-light) hover:border-(--glow-active)'
                    }`}
                  style={activeTab === 'files' ? { background: 'var(--accent)', borderColor: 'var(--accent)', boxShadow: '0 10px 15px -3px var(--accent-glow)' } : {}}
                  title={activeTab === 'chat' ? 'Ver Arquivos' : 'Voltar para o Chat'}
                >
                  <Files className={`w-4 h-4 ${activeTab === 'files' ? 'text-white' : ''}`} style={activeTab !== 'files' ? { color: 'var(--accent-text)' } : {}} />
                </button>
              )}
            </div>

            {/* Centered Personality Selector (the base) */}
            <div className="relative" ref={personalityRef}>
              <button
                onClick={() => setShowPersonalitySelector(!showPersonalitySelector)}
                className="flex items-center gap-1.5 sm:gap-2.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full bg-(--bg-chat-active) border border-(--border-light) shadow-sm group min-w-[120px] sm:min-w-[180px] justify-between transition-all duration-200 hover:scale-105 active:scale-95 hover:border-(--glow-active) hover:shadow-[0_0_15px_var(--glow-primary)]"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 overflow-hidden">
                  <User className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent-text)' }} />
                  <span className="text-xs font-bold tracking-tight text-(--text-primary) truncate max-w-[70px] sm:max-w-none">
                    {currentPersonalityId === 'default' ? 'Normal' : (personalities.find(p => p.id === currentPersonalityId)?.name || 'Normal')}
                  </span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 opacity-40 transition-transform ${showPersonalitySelector ? 'rotate-180' : ''}`} />
              </button>

              {showPersonalitySelector && (
                <div className="absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 bg-(--bg-main) border border-(--border-main) rounded-2xl py-2 min-w-[200px] shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                  <button
                    onClick={() => { handleSelectPersonality('default'); setShowPersonalitySelector(false); }}
                    className={`w-full text-left px-3.5 py-2.5 text-xs hover:bg-white/5 transition flex items-center gap-3 ${currentPersonalityId === 'default' ? 'font-bold' : 'text-(--text-secondary)'}`}
                    style={currentPersonalityId === 'default' ? { background: 'var(--accent-bg)', color: 'var(--accent-text)' } : {}}
                  >
                    <User className="w-3.5 h-3.5" /> Normal (Padrão)
                  </button>
                  {personalities.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { handleSelectPersonality(p.id); setShowPersonalitySelector(false); }}
                      className={`w-full text-left px-3.5 py-2.5 text-xs hover:bg-white/5 transition flex items-center gap-3 ${currentPersonalityId === p.id ? 'font-bold' : 'text-(--text-secondary)'}`}
                      style={currentPersonalityId === p.id ? { background: 'var(--accent-bg)', color: 'var(--accent-text)' } : {}}
                    >
                      <User className="w-3.5 h-3.5" /> {p.name}
                    </button>
                  ))}
                  <div className="h-px bg-(--border-light) my-2"></div>
                  <button
                    onClick={() => { setActiveTab('settings'); setSettingsTab('personalidades'); setShowPersonalitySelector(false); }}
                    className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-white/5 transition flex items-center gap-3 font-medium"
                    style={{ color: 'var(--accent-text)' }}
                  >
                    <Settings className="w-3.5 h-3.5" /> Gerenciar Personalidades
                  </button>
                </div>
              )}
            </div>

            {/* Right Side: Font Size Selector & Log Window Trigger */}
            <div className="w-20 sm:w-24 flex justify-start items-center gap-1.5 sm:gap-3" ref={fontSizeRef}>
              {/* Font Size Selector — oculto no modo LIVE em tela cheia (não tem efeito lá) */}
              {!(isLiveActive && !isLiveDetached) && (
                <div className="relative">
                  <button
                    onClick={() => setShowFontSizeSelector(!showFontSizeSelector)}
                    className="flex items-center justify-center rounded-full bg-(--bg-chat-active) border border-(--border-light) shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 hover:border-(--glow-active) hover:shadow-[0_0_15px_var(--glow-primary)] w-9 h-9"
                    title="Tamanho da Fonte"
                  >
                    <Type className="w-4 h-4" style={{ color: 'var(--accent-text)' }} />
                  </button>

                  {showFontSizeSelector && (
                    <div className="absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 bg-(--bg-main) border border-(--border-main) rounded-2xl p-3 min-w-[200px] shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col gap-3">
                      <div className="text-[9px] font-bold uppercase text-(--text-placeholder) tracking-widest border-b border-(--border-light) pb-1.5">
                        Fonte do Chat
                      </div>
                      <div className="flex justify-between items-center text-xs font-semibold text-(--text-secondary)">
                        <span>Tamanho</span>
                        <span className="px-2 py-0.5 rounded-md font-mono" style={{ color: 'var(--accent-text)', background: 'var(--accent-bg)' }}>{chatFontSize}px</span>
                      </div>
                      <input
                        type="range"
                        min="12"
                        max="24"
                        step="0.5"
                        value={chatFontSize}
                        onChange={(e) => setChatFontSize(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-(--border-light) rounded-lg appearance-none cursor-pointer focus:outline-none"
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      <div className="flex justify-between text-[10px] text-(--text-placeholder) font-medium">
                        <span>12px</span>
                        <span>24px</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Log Window Trigger - Mobile only */}
              <button
                onClick={() => setIsLogOpen(!isLogOpen)}
                className="flex items-center justify-center rounded-full bg-(--bg-chat-active) border border-(--border-light) shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 hover:border-(--glow-active) hover:shadow-[0_0_15px_var(--glow-primary)] w-9 h-9 relative sm:hidden"
                title="Logs & Diagnósticos"
              >
                <Code className="w-4 h-4" style={{ color: 'var(--accent-text)' }} />
                {logsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black rounded-full h-4 w-4 flex items-center justify-center border border-zinc-950 animate-pulse">
                    {logsCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="flex-1 flex justify-end items-center gap-2">
            {/* Vazio ou outros controles de topo */}
          </div>
        </header>

        {activeTab === 'chat' && <ChatRuler margin={chatMargin} onMarginChange={setChatMargin} />}

        {/* Removida a fita de LED do topo */}

        <div className="flex-1 overflow-hidden flex flex-col relative">
          {activeTab === 'files' && activeChatId ? (
            <ChatFileHub messages={messages} onClose={() => setActiveTab('chat')} />
          ) : activeTab === 'settings' ? (
            <SettingsModal
              inline={true}
              initialTab={settingsTab}
              onClose={() => setActiveTab('chat')}
              theme={theme}
              onSetTheme={setTheme}
              chatMargin={chatMargin}
              onSetChatMargin={(m) => {
                setChatMargin(m);
                localStorage.setItem('nemon_chat_margin', m.toString());
              }}
              enabledModelIds={enabledModelIds}
              onSetEnabledModelIds={setEnabledModelIds}
              defaultModelId={defaultModelId}
              onSetDefaultModelId={setDefaultModelId}
              memoryModelId={memoryModelId}
              onSetMemoryModelId={setMemoryModelId}
              searchModelId={searchModelId}
              onSetSearchModelId={setSearchModelId}
              factCheckModelId={factCheckModelId}
              onSetFactCheckModelId={setFactCheckModelId}
              appFont={appFont}
              onSetAppFont={setAppFont}
              retroMode={retroMode}
              onSetRetroMode={setRetroMode}
              paidApiKey={paidApiKey}
              onUpdatePaidApiKey={(key) => {
                saveConfig({ paidApiKey: key });
              }}
              defaultApiKey={defaultApiKey}
              onUpdateDefaultApiKey={(key) => {
                saveConfig({ defaultApiKey: key });
              }}
              openRouterApiKey={openRouterApiKey}
              onUpdateOpenRouterApiKey={(key) => {
                saveConfig({ openRouterApiKey: key });
              }}
              customModels={customModels}
              onSetCustomModels={saveCustomModels}
              localEndpoint={localEndpoint}
              onUpdateLocalEndpoint={setLocalEndpoint}
              liveModel={liveModel}
              onSetLiveModel={handleSetLiveModel}
              personalities={personalities}
              onSavePersonality={(p) => {
                const exists = personalities.find(item => item.id === p.id);
                if (exists) {
                  setPersonalities((prev: Personality[]) => prev.map((item: Personality) => item.id === p.id ? p : item));
                } else {
                  setPersonalities((prev: Personality[]) => [...prev, p]);
                }
              }}
              onDeletePersonality={(id) => {
                setPersonalities((prev: Personality[]) => prev.filter((p: Personality) => p.id !== id));
                if (selectedPersonalityId === id) setSelectedPersonalityId('default');
                if (livePersonalityId === id) setLivePersonalityId('default');
              }}
              skills={skills}
              onSaveSkill={handleSaveSkill}
              onDeleteSkill={handleDeleteSkill}
              chatTools={CHAT_TOOLS.map(t => ({ id: t.id, label: t.label }))}
              enabledChatToolIds={enabledChatToolIds}
              onToggleChatTool={(id) => setEnabledChatToolIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
              memoryFacts={memoryFacts}
              onDeleteMemoryFact={(id) => {
                const next = memoryFacts.filter((m) => m.id !== id);
                setMemoryFacts(next);
                saveMemoryFactsToFirestore(next);
              }}
              onSaveMemoryFact={(fact) => {
                let next;
                if (fact.id) {
                  next = memoryFacts.map(m => m.id === fact.id ? fact : m);
                } else {
                  next = [...memoryFacts, { ...fact, id: uuidv4(), timestamp: Date.now() }];
                }
                setMemoryFacts(next);
                saveMemoryFactsToFirestore(next);
              }}
              onAutoCategorizeMemory={handleAutoCategorize}
              isCategorizingMemory={isCategorizing}
              categorizationProgress={categorizationProgress}
            />
          ) : (
            <>
              <div className="flex-1 overflow-hidden flex flex-col relative">
                {isLiveActive && !isLiveDetached ? (
                  <LiveView
                    status={liveStatus}
                    transcript={liveTranscript}
                    currentVoice={liveVoice}
                    analyser={liveAnalyser}
                    visionType={liveVisionType}
                    videoStream={liveVideoStream}
                    onToggleCamera={handleToggleCamera}
                    onToggleScreen={handleToggleScreen}
                    onInterrupt={handleInterruptLive}
                    onVoiceChange={(v: string) => applyLiveVoice(v)}
                    isProactiveEnabled={isLiveProactive}
                    onToggleProactive={() => setIsLiveProactive(!isLiveProactive)}
                    onClose={handleLiveStop}
                    isDetached={false}
                    onToggleDetach={() => setIsLiveDetached(true)}
                    onSendText={(text) => {
                      if (liveSessionRef.current) {
                        liveSessionRef.current.sendText(text);
                        setLiveTranscript(prev => [...prev, { role: 'user', text }]);
                      }
                    }}
                    liveModel={liveModel}
                    onSetLiveModel={handleSetLiveModel}
                    isMicEnabled={isLiveMicEnabled}
                    onToggleMic={handleToggleLiveMic}
                    liveVolume={liveVolume}
                    onSetLiveVolume={applyLiveVolume}
                    getLiveAudio={(id: string) => liveMessageAudioRef.current.get(id)}
                    liveAudioContext={liveAudioContextRef.current}
                    liveOutputNode={liveGainNodeRef.current}
                    onPlayerActivate={(stop: () => void) => {
                      if (activePlayerStopRef.current) activePlayerStopRef.current();
                      activePlayerStopRef.current = stop;
                    }}
                    onOpenDictation={() => setShowDictation(true)}
                  />
                ) : (
                  <>
                    <MessageList
                      messages={messages}
                      margin={chatMargin}
                      visibleMessagesCount={visibleMessagesCount}
                      isInitialLoading={isInitialLoading}
                      activeChatId={activeChatId}
                      onScroll={handleScroll}
                      chatWindowRef={chatWindowRef}
                      isLoading={isLoading}
                      onFactCheck={handleFactCheck}
                      onCancelFactCheck={handleCancelFactCheck}
                      editingMsgId={editingMsgId}
                      editingMsgText={editingMsgText}
                      copiedId={copiedId}
                      expandedSourcesMsgId={expandedSourcesMsgId}
                      imagenModel={imagenModel}
                      onEditPrompt={(id, text) => { setEditingMsgId(id); setEditingMsgText(text); }}
                      onSaveEdit={handleSaveEdit}
                      onSetEditingMsgText={setEditingMsgText}
                      onCancelEdit={() => setEditingMsgId(null)}
                      onRegenerate={handleRegenerate}
                      onBranch={handleBranchFromMessage}
                      onPreviewCode={(code, lang) => setPreviewCode({ code, lang })}
                      regenModels={regenModels}
                      onDelete={(id: string) => setChats((p: ChatSession[]) => p.map((c: ChatSession) => c.id === activeChatId ? { ...c, messages: c.messages.filter((m: Message) => m.id !== id) } : c))}
                      onCopy={(text, id) => {
                        let finalOutput = text;
                        if (!id.endsWith('-md')) {
                          // Strip Markdown for plain text copy
                          finalOutput = text
                            .replace(/^#+\s+/gm, '') // Headings
                            .replace(/(\*\*|__)(.*?)\1/g, '$2') // Bold
                            .replace(/(\*|_)(.*?)\1/g, '$2') // Italic
                            .replace(/`{3,}/g, '') // Code blocks
                            .replace(/`(.+?)`/g, '$1') // Inline code
                            .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links
                            .replace(/^[*-]\s+/gm, ''); // List items
                        }
                        navigator.clipboard.writeText(finalOutput);
                        setCopiedId(id);
                        setTimeout(() => setCopiedId(null), 2000);
                      }}
                      onToggleSources={setExpandedSourcesMsgId}
                      onSelectionChange={(text, pos, msgId) => setSelectionData({ text, pos, messageId: msgId })}
                      onResolveMemoryUpdate={handleResolveMemoryUpdate}
                      hasFreeApiKey={!!defaultApiKey}
                      onOpenSettings={handleOpenSettings}
                      chatTts={chatTts}
                      ttsAudioContext={chatTtsCtxRef.current}
                      ttsOutputNode={chatTtsGainRef.current}
                      onSpeak={speakMessage}
                      onPlayerActivate={handlePlayerActivate}
                    />

                    {isLiveActive && isLiveDetached && (
                      <LiveView
                        status={liveStatus}
                        transcript={liveTranscript}
                        currentVoice={liveVoice}
                        analyser={liveAnalyser}
                        visionType={liveVisionType}
                        videoStream={liveVideoStream}
                        onToggleCamera={handleToggleCamera}
                        onToggleScreen={handleToggleScreen}
                        onInterrupt={handleInterruptLive}
                        onVoiceChange={(v: string) => applyLiveVoice(v)}
                        isProactiveEnabled={isLiveProactive}
                        onToggleProactive={() => setIsLiveProactive(!isLiveProactive)}
                        onClose={handleLiveStop}
                        isDetached={true}
                        onToggleDetach={() => setIsLiveDetached(false)}
                        onSendText={(text) => {
                          if (liveSessionRef.current) {
                            liveSessionRef.current.sendText(text);
                            setLiveTranscript(prev => [...prev, { role: 'user', text }]);
                          }
                        }}
                        liveModel={liveModel}
                        onSetLiveModel={handleSetLiveModel}
                        isMicEnabled={isLiveMicEnabled}
                        onToggleMic={handleToggleLiveMic}
                        liveVolume={liveVolume}
                        onSetLiveVolume={applyLiveVolume}
                        getLiveAudio={(id: string) => liveMessageAudioRef.current.get(id)}
                        liveAudioContext={liveAudioContextRef.current}
                        liveOutputNode={liveGainNodeRef.current}
                        onPlayerActivate={(stop: () => void) => {
                          if (activePlayerStopRef.current) activePlayerStopRef.current();
                          activePlayerStopRef.current = stop;
                        }}
                        onOpenDictation={() => setShowDictation(true)}
                      />
                    )}
                  </>
                )}

                {activeChat && messages.length > 0 && !isLiveActive && (
                  <MessageTimeline
                    messages={messages}
                    onJumpToMessage={handleJumpToMessage}
                    activeId={activeMessageId}
                  />
                )}
              </div>

              {selectionData && (
                <SelectionPopup
                  text={selectionData.text}
                  position={selectionData.pos}
                  theme={theme}
                  isChecking={isCheckingSegment}
                  onClose={() => setSelectionData(null)}
                  onFactCheck={(txt) => handleFactCheckSegment(selectionData.messageId, txt)}
                  onAsk={handleAskAboutSegment}
                />
              )}

              <ChatInput
                isLoading={isLoading}
                isLiveSpeaking={isLiveSpeaking}
                isLiveActive={isLiveActive && !isLiveDetached}
                liveModel={liveModel}
                onSetLiveModel={handleSetLiveModel}
                webSearchEnabled={webSearchEnabled}
                thinkingEnabled={thinkingEnabled}
                imageGenEnabled={imageGenEnabled}
                model={model}
                imagenModel={imagenModel}
                aspectRatio={aspectRatio}
                canSearch={true}
                showScrollButton={showScrollButton}
                margin={chatMargin}
                personalityName={currentPersonalityId === 'default' ? 'Normal' : (personalities.find(p => p.id === currentPersonalityId)?.name || 'Normal')}
                onSend={handleSend}
                onStartLive={handleLiveStart}
                onOpenFind={() => setShowInChatFind(true)}
                onOpenCompare={() => setCompareOpen(true)}
                promptSkills={promptSkills.map(s => ({ id: s.id, name: s.name, description: s.description, prompt: s.prompt || '' }))}
                onInterrupt={handleInterruptLive}
                onToggleWebSearch={() => setWebSearchEnabled(!webSearchEnabled)}
                onToggleThinking={() => setThinkingEnabled(!thinkingEnabled)}
                onToggleImageGen={() => setImageGenEnabled(!imageGenEnabled)}
                onSetModel={handleSetModel}
                onSetImagenModel={setImagenModel}
                onSetAspectRatio={setAspectRatio}
                onScrollToBottom={() => scrollToBottom(true, true)}
                onStop={handleStopGeneration}
                enabledModelIds={enabledModelIds}
                customModels={customModels}
                contextTokens={(() => {
                  const c = chats.find(ch => ch.id === activeChatId);
                  if (!c) return 0;
                  // Base exata (da API) quando disponível; senão, estimativa do histórico
                  // (chats antigos, anteriores à captura de uso, não ficam zerados).
                  if (c.contextTokens) return c.contextTokens;
                  return estimateTokens(c.messages.map(m => `${m.text || ''}\n${m.thoughts || ''}`).join('\n'));
                })()}
              />
            </>
          )}
        </div>

      </main>

      {showLiveSetupModal && (
        <LiveSetupModal
          onClose={() => setShowLiveSetupModal(false)}
          onConfirm={confirmLiveStart}
          isConnecting={liveStatus === 'connecting' && isLiveActive}
        />
      )}

      {/* Toast: modelo usou uma ferramenta no modo LIVE */}
      {isLiveActive && liveToolToast && (
        <div
          key={liveToolToast.id}
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[130] flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#111111]/90 backdrop-blur-xl border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.4)] animate-in fade-in slide-in-from-top-3 duration-300"
        >
          <div className="w-6 h-6 rounded-full bg-(--accent-bg) flex items-center justify-center text-(--accent-text)">
            <Bell className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] font-bold uppercase tracking-widest text-(--text-placeholder)">Ferramenta usada</span>
            <span className="text-[12px] font-semibold text-white">{liveToolToast.label}</span>
          </div>
        </div>
      )}


      {isGlobalSearchOpen && (
        <GlobalSearchModal
          chats={chats}
          onClose={() => setIsGlobalSearchOpen(false)}
          onSelectChat={(chatId, msgId) => {
            setActiveChatId(chatId);
            setActiveTab('chat');
            setIsGlobalSearchOpen(false);
            if (window.innerWidth < 768) setIsSidebarOpen(false);
            if (msgId) {
              setTimeout(() => {
                handleJumpToMessage(msgId);
              }, 150);
            }
          }}
        />
      )}

      {showInChatFind && activeChatId && !isLiveActive && activeTab === 'chat' && (
        <InChatFind
          messages={messages}
          onJump={handleJumpToMessage}
          onClose={() => setShowInChatFind(false)}
        />
      )}

      {previewCode && (
        <CodePreviewPanel
          code={previewCode.code}
          lang={previewCode.lang}
          onClose={() => setPreviewCode(null)}
        />
      )}

      {compareOpen && (
        <ModelCompareModal
          models={regenModels}
          defaultA={model}
          defaultB={regenModels.find(m => m.id !== model)?.id || model}
          onClose={() => setCompareOpen(false)}
          onKeep={handleKeepComparison}
        />
      )}


      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] md:hidden animate-in fade-in duration-300"
        ></div>
      )}
      <LogWindow dailyUsage={dailyUsage} isOpen={isLogOpen} setIsOpen={setIsLogOpen} />

      <DictationPanel
        isOpen={showDictation}
        onClose={closeDictation}
        text={dictationText}
        onTextChange={setDictationText}
        status={dictationStatus}
        progress={dictationProgress}
        error={dictationError}
        onStart={startDictation}
        onCancel={cancelDictation}
        onReset={resetDictation}
        onDownload={downloadDictation}
        audioBuffer={dictationBuffer}
        audioContext={dictationCtxRef.current}
        outputNode={dictationGainRef.current}
        onPlayerActivate={(stop: () => void) => {
          if (activePlayerStopRef.current) activePlayerStopRef.current();
          activePlayerStopRef.current = stop;
        }}
        volume={dictationVolume}
        onVolumeChange={applyDictationVolume}
        voice={dictationVoice}
        onVoiceChange={changeDictationVoice}
        voices={LIVE_VOICES}
        chunkCount={dictationChunkCount}
        failedRegions={dictationFailedRegions}
      />
    </div>
  );
}

export default App;
