import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { 
  Pin, 
  Edit2, 
  Archive, 
  Trash2, 
  ChevronDown, 
  X, 
  Bot, 
  Settings, 
  Menu,
  Search,
  SquarePen,
  MoreVertical,
  Activity,
  Zap,
  BarChart2,
  User,
  Files,
  Palette,
  MessageSquare,
  RotateCcw
} from 'lucide-react';
import ChatRuler from './components/ChatRuler';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import MessageTimeline from './components/MessageTimeline';
import SortableChatItem from './components/SortableChatItem';

import {
  DndContext, 
  closestCenter,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { 
  restrictToVerticalAxis,
  restrictToParentElement 
} from '@dnd-kit/modifiers';
import { Lock, Unlock, GripVertical } from 'lucide-react';

import { 
  generateGeminiContent, 
  generateImagenContent,
  streamGeminiContent, 
  performFactCheck,
  extractAndParseJson,
  type Message 
} from './services/gemini';

import { 
  type ChatSession, 
  type DailyUsage,
  type PendingFile,
  type Personality,
  type MemoryFact
} from './types';

import { v4 as uuidv4 } from 'uuid';

const DEFAULT_PERSONALITY: Personality = {
  id: 'default',
  name: 'Normal',
  prompt: ''
};

import DnaModal from './components/DnaModal';
import LiveView from './components/LiveView';
import LiveSetupModal from './components/LiveSetupModal';
import PersonalitiesModal from './components/PersonalitiesModal';
import ChatFileHub from './components/ChatFileHub';
import { GeminiLiveSession } from './services/geminiLive';
import SelectionPopup from './components/SelectionPopup';

import SettingsModal from './components/SettingsModal';
import { 
  MODEL_LIMITS,
  MODEL_OPTIONS
} from './constants';

const getPacificDate = () => {
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'America/Los_Angeles', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  }).format(new Date());
};

function App() {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>('');
  const [memoryFacts, setMemoryFacts] = useState<MemoryFact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [model, setModel] = useState('gemma-4-31b-it');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [imageGenEnabled, setImageGenEnabled] = useState(false);
  const [imagenModel, setImagenModel] = useState('imagen-4.0-fast-generate-001');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '9:16' | '16:9'>('1:1');
  const [expandedSourcesMsgId, setExpandedSourcesMsgId] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('gemoro_theme') || 'escuro');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [enabledModelIds, setEnabledModelIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('gemoro_enabled_models');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return ['gemma-4-31b-it', 'gemini-3-flash-preview'];
  });
  const [showDnaModal, setShowDnaModal] = useState(false);
  const [isArchiveExpanded, setIsArchiveExpanded] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isOrderLocked, setIsOrderLocked] = useState(() => {
    const saved = localStorage.getItem('gemoro_sidebar_locked');
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
      } catch (e) {}
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
    const saved = localStorage.getItem('gemoro_chat_margin');
    return saved ? parseInt(saved, 10) : 5;
  });
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [selectedPersonalityId, setSelectedPersonalityId] = useState(() => {
    return localStorage.getItem('gemoro_selected_personality_id') || 'default';
  });
  const [showPersonalitiesModal, setShowPersonalitiesModal] = useState(false);
  const [showPersonalitySelector, setShowPersonalitySelector] = useState(false);
  const [showThemeSubMenu, setShowThemeSubMenu] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'files'>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('gemoro_sidebar_open');
      if (saved !== null) return saved === 'true';
      return window.innerWidth > 1024;
    }
    return true;
  });
  const [isLiveProactive, setIsLiveProactive] = useState(() => localStorage.getItem('gemoro_live_proactive') === 'true');
  const [proactiveIdleCount, setProactiveIdleCount] = useState(0); // 0: Idle, 1: Probed, 2: Retried (Stopped)
  const [paidApiKey, setPaidApiKey] = useState('');
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  
  // Sincronizar Uso Local com o Servidor
  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const res = await fetch('/api/usage');
        const data = await res.json();
        if (data && data.date === getPacificDate()) {
          setDailyUsage(data);
        }
      } catch (e) {
        console.error("Erro ao carregar uso do servidor:", e);
      }
    };
    fetchUsage();
  }, []);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data && data.paidApiKey) {
          setPaidApiKey(data.paidApiKey);
        }
      })
      .catch(err => console.error("Erro ao carregar chave de API:", err));
  }, []);

  const saveConfig = useCallback((config: { paidApiKey: string }) => {
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    }).catch(err => console.error("Erro ao salvar configuração:", err));
  }, []);

  useEffect(() => {
    localStorage.setItem('gemini_advanced_usage_v1', JSON.stringify(dailyUsage));
    fetch('/api/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dailyUsage)
    }).catch(e => console.error("Erro ao salvar uso no servidor:", e));
  }, [dailyUsage]);
  
  // LIVE MODE STATE
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('disconnected');
  const [liveTranscript, setLiveTranscript] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [liveVoice, setLiveVoice] = useState(() => localStorage.getItem('gemoro_live_voice') || 'Charon');
  const [liveVisionType, setLiveVisionType] = useState<'camera' | 'screen' | null>(null);
  const [liveVideoStream, setLiveVideoStream] = useState<MediaStream | null>(null);
  const [isLiveSpeaking, setIsLiveSpeaking] = useState(false);
  const liveSessionRef = useRef<GeminiLiveSession | null>(null);
  const proactiveTimerActiveRef = useRef<boolean>(false);
  const lastLiveActivityRef = useRef<number>(Date.now());

  const resetProactivityState = useCallback((reason: string) => {
    // Apenas resetamos se estivermos ativos e com proatividade ligada
    setProactiveIdleCount(0);
    lastLiveActivityRef.current = Date.now();
    proactiveTimerActiveRef.current = false;
  }, []);
  const liveAudioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextAudioTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const [liveAnalyser, setLiveAnalyser] = useState<AnalyserNode | null>(null);
  const [selectionData, setSelectionData] = useState<{ text: string, pos: { x: number, y: number }, messageId: string } | null>(null);
  const [isCheckingSegment] = useState(false);
  const [categorizationProgress, setCategorizationProgress] = useState<{ current: number, total: number }>({ current: 0, total: 0 });

  useEffect(() => {
    localStorage.setItem('gemoro_enabled_models', JSON.stringify(enabledModelIds));
  }, [enabledModelIds]);

  useEffect(() => {
    localStorage.setItem('gemoro_sidebar_open', isSidebarOpen.toString());
  }, [isSidebarOpen]);

  useEffect(() => {
    localStorage.setItem('gemoro_live_proactive', isLiveProactive.toString());
  }, [isLiveProactive]);

  const previousScrollHeightRef = useRef<number>(0);
  const isLazyLoadingRef = useRef<boolean>(false);
  const chatWindowRef = useRef<HTMLElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentAiMsgIdRef = useRef<string | null>(null);
  const timerIntervalRef = useRef<any>(null);

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
          proactiveTimerActiveRef.current = true;
          liveSessionRef.current.sendText("[SISTEMA: Modo Proativo. Analise o contexto e faça uma pergunta curta e pertinente agora.]");
          setProactiveIdleCount(1);
          lastLiveActivityRef.current = Date.now();
        }
      } 
      else if (proactiveIdleCount === 1 && elapsed > 30000) {
        if (liveSessionRef.current) {
          console.log("[PROATIVIDADE] Inatividade continuada (60s). Estágio 2: Check-in...");
          proactiveTimerActiveRef.current = true;
          liveSessionRef.current.sendText("[SISTEMA: O usuário não respondeu. Pergunte se ele ainda está aí de forma amigável.]");
          setProactiveIdleCount(2);
          lastLiveActivityRef.current = Date.now();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isLiveActive, isLiveProactive, proactiveIdleCount]);

  const handleAutoCategorize = useCallback(async () => {
    if (memoryFacts.length === 0) return;
    setIsCategorizing(true);
    setCategorizationProgress({ current: 0, total: 0 });
    
    console.log("Iniciando organização inteligente em lotes...");
    
    // Configurações de lote (batching) para garantir estabilidade JSON
    const CHUNK_SIZE = 15;
    const chunks: any[][] = [];
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
          // Native JSON mode forced
          const res = await generateGeminiContent(prompt, 'gemma-4-31b-it', [], "Você é um organizador de dados JSON.", [], false, false, true);
          const mapping = extractAndParseJson(res.text);

          if (mapping && typeof mapping === 'object' && !Array.isArray(mapping)) {
            currentFacts = currentFacts.map(fact => {
              const update = mapping[fact.id];
              if (update) {
                return {
                  ...fact,
                  category: update.c || fact.category,
                  connections: Array.isArray(update.n) ? update.n.filter(id => id !== fact.id) : fact.connections,
                  timestamp: Date.now()
                };
              }
              return fact;
            });

            // Atualização parcial do estado para feedback visual imediato
            setMemoryFacts([...currentFacts]);
            setCategorizationProgress(prev => ({ ...prev, current: i + 1 }));
            
            // Checkpoint no servidor
            fetch('/api/memory', { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify(currentFacts) 
            });
          }
        } catch (batchError) {
          console.error(`Erro no lote ${i + 1}:`, batchError);
          // Continua para o próximo lote se um falhar
        }
      }
      console.log("Organização de DNA concluída com sucesso!");
    } catch (e) {
      console.error("Erro fatal na auto-categorização:", e);
      alert("Houve um problema ao organizar: " + (e instanceof Error ? e.message : "Erro desconhecido"));
    } finally {
      setIsCategorizing(false);
      setCategorizationProgress({ current: 0, total: 0 });
    }
  }, [memoryFacts]);

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat?.messages || [];

  // Load Initial Data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [historyRes, memoryRes, personalitiesRes] = await Promise.all([
          fetch('/api/history'),
          fetch('/api/memory'),
          fetch('/api/personalities')
        ]);
        if (historyRes.ok) {
          const history = await historyRes.json();
          if (Array.isArray(history)) {
            setChats(history);
            if (history.length > 0) setActiveChatId(history[0].id);
          }
        }
        if (memoryRes.ok) {
          const memoryData: any = await memoryRes.json();
          if (Array.isArray(memoryData)) {
            if (memoryData.length > 0 && typeof memoryData[0] === 'string') {
              // Automatic Migration to DNA 2.0
              console.log("Iniciando migração para DNA 2.0... Total de fatos: ", memoryData.length);
              const migrationPrompt = `Você é um sistema de migração de dados. Converta a seguinte lista de fatos (strings) em um JSON estruturado com o formato: { id: string, text: string, category: string, connections: string[] (IDs de fatos relacionados), timestamp: number }.
              As categorias devem ser geradas dinamicamente (ex: Pessoal, Profissional, Hardware, Preferências). 
              LISTA DE FATOS:\n${memoryData.join('\n')}`;
              
              try {
                const res = await generateGeminiContent(migrationPrompt, 'gemma-4-31b-it', [], "Responda APENAS com o JSON cru contendo um array de objetos.");
                // Tentar extrair JSON do texto
                const jsonMatch = res.text.match(/\[\s*\{[\s\S]*\}\s*\]/);
                const migrated = JSON.parse(jsonMatch ? jsonMatch[0] : res.text);
                
                if (Array.isArray(migrated) && migrated.length > 0) {
                  setMemoryFacts(migrated);
                  fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(migrated) });
                  console.log("Migração inteligente concluída!");
                } else {
                  throw new Error("Resposta da IA inválida ou vazia");
                }
              } catch (e) {
                console.error("Falha na migração com IA, executando fallback local para restaurar visibilidade:", e);
                const fallback = memoryData.map((f: string) => ({ 
                  id: uuidv4(), 
                  text: f, 
                  category: 'Diversos', 
                  connections: [], 
                  timestamp: Date.now() 
                }));
                setMemoryFacts(fallback);
                fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fallback) });
                console.log("Memórias restauradas em modo de compatibilidade (Diversos).");
              }
            } else {
              setMemoryFacts(memoryData);
            }
          }
        }

        if (personalitiesRes.ok) {
          const persData = await personalitiesRes.json();
          if (Array.isArray(persData) && persData.length > 0) {
            setPersonalities(persData);
          } else {
            // Migration from localStorage
            const saved = localStorage.getItem('gemoro_personalities');
            if (saved) {
              try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  setPersonalities(parsed);
                  fetch('/api/personalities', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: saved 
                  });
                }
              } catch (e) {}
            }
          }
        }
      } catch (e) {
        console.error("Erro ao carregar dados iniciais:", e);
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    localStorage.setItem('gemoro_sidebar_locked', JSON.stringify(isOrderLocked));
  }, [isOrderLocked]);

  // Auto-Save Margins
  useEffect(() => {
    localStorage.setItem('gemoro_chat_margin', chatMargin.toString());
  }, [chatMargin]);

  // Auto-Save Personalities
  useEffect(() => {
    if (personalities.length > 0) {
      fetch('/api/personalities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(personalities)
      });
    }
    localStorage.setItem('gemoro_selected_personality_id', selectedPersonalityId);
  }, [personalities, selectedPersonalityId]);

  // Auto-Save Chats
  useEffect(() => {
    if (chats.length > 0) {
      fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chats)
      });
    }
  }, [chats]);

  // Close menus on click outside
  useEffect(() => {
    const handleGlobalClick = () => setMenuOpenId(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('gemoro_theme', theme);
  }, [theme]);

  // LIVE MODE LOGIC
  const handleLiveStop = useCallback(() => {
    liveSessionRef.current?.stop();
    liveSessionRef.current = null;
    liveAudioContextRef.current?.close();
    liveAudioContextRef.current = null;
    setLiveAnalyser(null);
    setLiveVisionType(null);
    setLiveVideoStream(null);
    setIsLiveSpeaking(false);
    setIsLiveActive(false);
    setLiveStatus('disconnected');
    setLiveTranscript([]);
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    nextAudioTimeRef.current = 0;
  }, []);

  // Handle Escape Key Global
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPersonalitiesModal) {
          setShowPersonalitiesModal(false);
          return;
        }
        if (showDnaModal) {
          setShowDnaModal(false);
          return;
        }
        if (showSettingsModal) {
          setShowSettingsModal(false);
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
  }, [showPersonalitiesModal, showDnaModal, showSettingsModal, isLiveActive, handleLiveStop]);

  const scrollToBottom = useCallback((force = false, smooth = false) => {
    if (chatWindowRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatWindowRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 300;
      if (force || isNearBottom) {
        chatWindowRef.current.scrollTo({ top: scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
      }
    }
  }, []);

  const executeAIRequest = useCallback(async (targetChatId: string, userText: string, filesToSend: PendingFile[], apiHistory: any[], isFirstMessage: boolean, replaceId?: string) => {
    setIsLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const selectedPersonality = personalities.find(p => p.id === selectedPersonalityId) || DEFAULT_PERSONALITY;

    const systemInstruction = "Você é o Gemoro, uma inteligência artificial avançada, empática e extremante RÁPIDA. Sua tarefa secundária é manter sua memória persistente (DNA) precisa e atualizada.\n" +
      (selectedPersonality.prompt ? `INSTRUÇÃO DE PERSONALIDADE ATIVA: "${selectedPersonality.prompt}"\n\n` : "") +
      (memoryFacts.length > 0 ? "Fatos que você já sabe sobre o usuário:\n" + memoryFacts.map((f: MemoryFact) => `[ID: ${f.id}] [Categoria: ${f.category}] ${f.text}`).join("\n") + "\n\n" : "") +
      "Regras de Pesquisa e Memória:\n" +
      "1. Se a ferramenta de pesquisa estiver ativada (WEB SEARCH ON), você DEVE obrigatoriamente realizar a ferramenta google_search para fazer uma pesquisa na web ANTES de responder, mesmo para assuntos que você considere de conhecimento geral. O usuário deseja ver as fontes e evidências (ícones de sites) em todas as respostas.\n" +
      "2. Se descobrir um fato NOVO importante, adicione <MEMORY category='...'>texto</MEMORY>.\n" +
      "3. Para atualizar: <UPDATE_MEMORY id='ID'>novo texto</UPDATE_MEMORY>.\n" +
      "4. Seja conciso e direto ao ponto quando possível.";

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
          messages: c.messages.map((m: any) => m.id === currentAiMsgId ? { ...m, duration: elapsed } : m)
        } : c));
      }, 100);

      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          const freshMsg: Message = { id: currentAiMsgId, role: 'ai', text: '', thoughts: '', duration: 0, isSearching: webSearchEnabled };
          const updatedMsgs = replaceId 
            ? c.messages.map(m => m.id === replaceId ? freshMsg : m)
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
            messages: c.messages.map((m: any) => m.id === currentAiMsgId ? { 
              ...m, 
              text: `Gerei esta imagem para você usando **${imagenModel}**:`, 
              files: [{ name: 'generated_image.png', mimeType: res.mimeType, data: res.data }],
              duration: currentDuration 
            } : m)
          } : c));
          
          setIsLoading(false);
          return;
        } catch (imgError: any) {
          throw new Error(`Erro na geração de imagem: ${imgError.message}`);
        }
      }

      const stream = streamGeminiContent(userText, model, apiHistory, systemInstruction, filesToSend, webSearchEnabled, controller.signal, thinkingEnabled);
      let fullText = "";
      let fullThoughts = "";
      let allSources: { title: string; uri: string }[] = [];
      let isSearching = webSearchEnabled;
      let isGrounded = false;
      let finalUsage = null;

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
        
        const currentDuration = (performance.now() - startTime) / 1000;
        const currentCleanText = parseMemoryTags(streamingText).trim();

        setChats((prev: ChatSession[]) => prev.map((c: ChatSession) => c.id === targetChatId ? {
          ...c,
          messages: c.messages.map((m: any) => m.id === currentAiMsgId ? { 
            ...m, 
            text: currentCleanText, 
            thoughts: streamingThoughts.trim(), 
            isGrounded, 
            isSearching, 
            sources: [...allSources], 
            duration: currentDuration 
          } : m)
        } : c));
      }

      if (finalUsage) {
        setDailyUsage((prev: DailyUsage) => {
          const today = getPacificDate();
          let state = prev.date === today ? prev : { date: today, models: {} };
          const modelData = state.models[model] || { requests: 0, tokens: { prompt: 0, candidates: 0, total: 0 } };
          const newState: DailyUsage = {
            ...state,
            models: { ...state.models, [model]: {
              requests: modelData.requests + 1,
              tokens: {
                prompt: modelData.tokens.prompt + (finalUsage.promptTokenCount || 0),
                candidates: modelData.tokens.candidates + (finalUsage.candidatesTokenCount || 0),
                total: modelData.tokens.total + (finalUsage.totalTokenCount || 0),
              }
            }}
          };
          localStorage.setItem('gemini_advanced_usage_v1', JSON.stringify(newState));
          return newState;
        });
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

      let finalCleanText = parseMemoryTags(finalCleanedText).trim();

      // 2. LÓGICA DE AUTO-RECUPERAÇÃO (Hidden Turn)
      if (!finalCleanText && finalThoughts && finalThoughts.length > 50) {
        // Mostrar estado temporário amigável
        setChats((prev: ChatSession[]) => prev.map((c: ChatSession) => c.id === targetChatId ? {
          ...c,
          messages: c.messages.map((m: any) => m.id === currentAiMsgId ? { ...m, text: "_Finalizando resposta baseada no raciocínio..._", thoughts: finalThoughts.trim() } : m)
        } : c));

        try {
          const recoveryRes = await generateGeminiContent(
            `O modelo gerou apenas o raciocínio interno. Com base no raciocínio abaixo, escreva apenas a RESPOSTA FINAL amigável e direta para o usuário (em Português), ignorando a parte técnica do planejamento:\n\n${finalThoughts}`,
            model,
            [],
            "Você é o Gemoro. Resuma o raciocínio em uma resposta final útil."
          );
          if (recoveryRes.text) {
            finalCleanText = parseMemoryTags(recoveryRes.text).trim();
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
        messages: c.messages.map((m: any) => m.id === currentAiMsgId ? { 
          ...m, 
          text: finalCleanText, 
          thoughts: finalThoughts.trim(),
          isSearching: false,
          isGrounded,
          isVerifying: false,
          sources: [...allSources]
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
          setChats(prev => prev.map(c => c.id === targetChatId ? { ...c, title: userText.substring(0, 25)+'...', isNaming: false } : c));
        });
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      const errorMsg: Message = { id: Date.now().toString(), role: 'ai', text: `**[Erro]:** ${error.message}` };
      setChats(prev => prev.map(c => c.id === targetChatId ? { ...c, messages: [...c.messages, errorMsg] } : c));
    } finally {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setIsLoading(false);
      abortControllerRef.current = null;
      currentAiMsgIdRef.current = null;
    }
  }, [model, webSearchEnabled, thinkingEnabled, imageGenEnabled, imagenModel, aspectRatio, paidApiKey, memoryFacts, scrollToBottom, personalities, selectedPersonalityId]);

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
    }
  }, [activeChatId]);



  const handleFactCheckSegment = useCallback(async (messageId: string, segmentText: string) => {
    // Ativar loading na mensagem específica
    setChats(prev => prev.map(chat => ({
      ...chat,
      messages: chat.messages.map(msg => msg.id === messageId ? { ...msg, isVerifying: true } : msg)
    })));

    try {
      const results = await performFactCheck(segmentText);
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
  }, [activeChatId]);

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

  const parseMemoryTags = useCallback((str: string) => {
    let newMemories = [...memoryFacts];
    let hasMemoryUpdates = false;
    const memoryTagRegex = /<MEMORY(?:\s+category=['"]([^'"]*)['"])?(?:\s+connections=['"]([^'"]*)['"])?>\s*([\s\S]*?)\s*<\/MEMORY>/g;
    const updateTagRegex = /<UPDATE_MEMORY\s+id=['"]([^'"]*)['"](?:\s+category=['"]([^'"]*)['"])?>\s*([\s\S]*?)\s*<\/UPDATE_MEMORY>/g;
    const deleteTagRegex = /<DELETE_MEMORY\s+id=['"]([^'"]*?)['"]\s*\/>/g;

    let match;
    // Adicionar
    while ((match = memoryTagRegex.exec(str)) !== null) {
      const categoryValue = match[1] || 'Diversos';
      const connectionsValue = match[2] ? match[2].split(',').map(s => s.trim()) : [];
      const textValue = match[3].trim();
      newMemories.push({ id: uuidv4(), text: textValue, category: categoryValue, connections: connectionsValue, timestamp: Date.now() });
      hasMemoryUpdates = true;
    }
    // Deletar
    while ((match = deleteTagRegex.exec(str)) !== null) {
      const idValue = match[1];
      newMemories = newMemories.filter((m: MemoryFact) => m.id !== idValue);
      hasMemoryUpdates = true;
    }
    // Atualizar
    while ((match = updateTagRegex.exec(str)) !== null) {
      const idValue = match[1];
      const categoryValue = match[2];
      const textValue = match[3].trim();
      newMemories = newMemories.map((mValue: MemoryFact) => mValue.id === idValue ? { ...mValue, text: textValue, category: categoryValue || mValue.category, timestamp: Date.now() } : mValue);
      hasMemoryUpdates = true;
    }

    if (hasMemoryUpdates) {
      setMemoryFacts(newMemories);
      fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newMemories) });
    }

    return str
      .replace(memoryTagRegex, '')
      .replace(updateTagRegex, '')
      .replace(deleteTagRegex, '')
      .trim();
  }, [memoryFacts]);

  const handleLiveStart = useCallback(() => {
    setShowLiveSetupModal(true);
  }, []);

  const confirmLiveStart = useCallback(async (useMemory: boolean) => {
    setShowLiveSetupModal(false);
    setIsLiveActive(true);
    setLiveStatus('connecting');
    setLiveTranscript([]);
    
    if (liveAudioContextRef.current) {
       liveAudioContextRef.current.close();
    }
    liveAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
    const analyserNode = liveAudioContextRef.current.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.connect(liveAudioContextRef.current.destination);
    setLiveAnalyser(analyserNode);

    // Contexto de Memória
    let dnaContext = "";
    if (useMemory && memoryFacts.length > 0) {
      dnaContext = "\n\nSua MEMÓRIA DNA atual:\n" + 
        memoryFacts.map(f => `- [ID: ${f.id}] [Categoria: ${f.category}] ${f.text}`).join("\n");
    }

    const memoryRules = useMemory ? `
REGRAS DE MEMÓRIA (MODO LIVE):
1. Use <MEMORY category='...'>texto</MEMORY> para novos fatos.
2. Use <UPDATE_MEMORY id='...' category='...'>texto</UPDATE_MEMORY> para atualizar.
3. Use <DELETE_MEMORY id='...' /> para remover.
4. IMPORTANTE: NUNCA, SOB HIPÓTESE ALGUMA, PRONUNCIE AS TAGS XML EM VOZ ALTA. Elas devem ficar invisíveis no áudio.
` : "";

    const selectedPersonalityProfile = personalities.find(p => p.id === selectedPersonalityId) || DEFAULT_PERSONALITY;
    const fullInstructionStr = `${selectedPersonalityProfile.prompt}${dnaContext}${memoryRules}\n\nResponda sempre de forma natural e conversacional.`;

    const session = new GeminiLiveSession({
      onStatusChange: (status) => setLiveStatus(status),
      onStream: (stream) => setLiveVideoStream(stream),
      onError: (err) => { alert(err); handleLiveStop(); },
      onTranscript: (role, text) => {
        setLiveTranscript(prev => [...prev, { role, text }]);
        
        lastLiveActivityRef.current = Date.now();
        
        if (role === 'user') {
          resetProactivityState("Fala do usuário");
        } else if (role === 'ai') {
          if (!proactiveTimerActiveRef.current) {
            resetProactivityState("Fala natural da IA");
          } else {
            // Se foi proativo, apenas marcamos que o prompt já foi lido para liberar o próximo reset natural
            proactiveTimerActiveRef.current = false;
          }
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
        if (role === 'ai' && useMemory) {
          parseMemoryTags(text);
        }

        setChats(prev => prev.map(c => {
          if (c.id === activeChatId) {
            const newMessage: Message = {
              id: Date.now() + Math.random().toString(),
              role, text, duration: 0
            };
            return { ...c, messages: [...c.messages, newMessage] };
          }
          return c;
        }));
      },
      onAudioData: (chunk) => {
        if (!liveAudioContextRef.current || !analyserNode) return;
        const ctx = liveAudioContextRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        const buffer = ctx.createBuffer(1, chunk.length, 24000);
        buffer.copyToChannel(chunk as any, 0);
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
        
        lastLiveActivityRef.current = Date.now();
        if (!proactiveTimerActiveRef.current && proactiveIdleCount !== 0) {
           resetProactivityState("Áudio reativo da IA");
        }

        source.start(startTime);
        nextAudioTimeRef.current = startTime + buffer.duration;
      }
    }, fullInstructionStr, liveVoice);

    liveSessionRef.current = session;
    await session.start();
  }, [activeChatId, personalities, selectedPersonalityId, liveVoice, memoryFacts, handleLiveStop, parseMemoryTags]);

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
    } catch (err) {
      alert("Não foi possível acessar a câmera.");
    }
  }, [liveVisionType]);

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
    } catch (err) {
      alert("Não foi possível compartilhar a tela.");
    }
  }, [liveVisionType]);

  const handleInterruptLive = useCallback(() => {
    // Parar todos os nós de áudio ativos e agendados
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    activeSourcesRef.current.clear();
    setIsLiveSpeaking(false);
    
    // Resetar o cronograma de áudio para o tempo atual
    if (liveAudioContextRef.current) {
      nextAudioTimeRef.current = liveAudioContextRef.current.currentTime;
    }

    resetProactivityState("Interrupção manual/VAD");
  }, [resetProactivityState]);

  const handleSend = useCallback((text: string, files: PendingFile[]) => {
    if (text.trim() === '' && files.length === 0) return;

    if (isLiveActive && liveSessionRef.current) {
      resetProactivityState("Chat manual (Live)");
      liveSessionRef.current.sendText(text);
      return;
    }

    let targetId = activeChatId;
    let isFirst = false;
    if (!activeChatId) {
      targetId = Date.now().toString();
      const newChat: ChatSession = { id: targetId, title: 'Nova Conversa', messages: [], isNaming: true };
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
  }, [activeChatId, activeChat, executeAIRequest, isLiveActive]);

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

  const handleFactCheck = useCallback(async (msgId: string) => {
    if (!activeChat) return;
    
    // Set loading state for this message
    setChats(prev => prev.map(chat => {
      if (chat.id === activeChatId) {
        return {
          ...chat,
          messages: chat.messages.map(m => 
            m.id === msgId ? { ...m, isFactChecking: true } : m
          )
        };
      }
      return chat;
    }));

    const msg = activeChat.messages.find(m => m.id === msgId);
    if (!msg) return;

    try {
      const results = await performFactCheck(msg.text);
      
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
    } catch (e) {
      console.error("Fact check failed:", e);
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
  }, [activeChat, activeChatId]);

  const handleDeleteChat = useCallback((e: any, id: string) => { 
    e.stopPropagation(); 
    if (confirm("Deseja excluir esta conversa para sempre?")) {
      setChats(p => p.filter(c => c.id !== id));
      if (activeChatId === id) setActiveChatId('');
    }
  }, [activeChatId]);

  const handleToggleArchive = useCallback((e: any, id: string) => { 
    e.stopPropagation(); 
    setChats(p => p.map(c => c.id === id ? {...c, archived: !c.archived} : c)); 
  }, []);

  const handleTogglePin = useCallback((e: any, id: string) => {
    e.stopPropagation();
    setChats(p => p.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
  }, []);

  const handleRenameChat = useCallback((id: string) => {
    if (editTitle.trim()) {
      setChats(p => p.map(c => c.id === id ? {...c, title: editTitle.trim()} : c));
    }
    setEditingChatId(null);
  }, [editTitle]);

  const handleArchiveChat = useCallback((chatId: string) => {
    setChats(prev => prev.map(chat => chat.id === chatId ? { ...chat, archived: !chat.archived } : chat));
    if (chatId === activeChatId) setActiveChatId('');
  }, [activeChatId]);

  const handleRestoreChat = useCallback((chatId: string) => {
    setChats(prev => prev.map(chat => chat.id === chatId ? { ...chat, archived: false } : chat));
    setActiveChatId(chatId);
    
    // Save to server
    fetch(`/api/history/${chatId}/archive`, { method: 'POST' });
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
        if (updatedMsgs[msgIndex+1]?.role === 'ai') updatedMsgs[msgIndex+1] = { ...updatedMsgs[msgIndex+1], text: '', thoughts: '' };
        return { ...c, messages: updatedMsgs };
      }
      return c;
    }));
    const historyBefore = chat.messages.slice(0, msgIndex);
    const apiHistory = historyBefore.map(m => ({
      role: m.role === 'ai' ? 'model' : 'user',
      parts: [...(m.files?.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.data } })) || []), { text: m.text }]
    }));
    executeAIRequest(activeChatId, newText, chat.messages[msgIndex].files || [], apiHistory, false, chat.messages[msgIndex+1]?.id);
  }, [activeChatId, chats, editingMsgText, isLoading, executeAIRequest]);

  const handleRegenerate = useCallback((msgId: string) => {
    if (!activeChatId || isLoading) return;
    const chat = chats.find(c => c.id === activeChatId);
    if (!chat) return;
    const idx = chat.messages.findIndex(m => m.id === msgId);
    if (idx <= 0) return;
    const userMsg = chat.messages[idx-1];
    setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: c.messages.map(m => m.id === msgId ? { ...m, text: '', thoughts: '' } : m) } : c));
    const historyBefore = chat.messages.slice(0, idx-1);
    const apiHistory = historyBefore.map(m => ({
      role: m.role === 'ai' ? 'model' : 'user',
      parts: [...(m.files?.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.data } })) || []), { text: m.text }]
    }));
    executeAIRequest(activeChatId, userMsg.text, userMsg.files || [], apiHistory, false, msgId);
  }, [activeChatId, chats, isLoading, executeAIRequest]);

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


  // Intersection Observer for Message Timeline sync
  useEffect(() => {
    if (!activeChatId || isLiveActive) return;

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
  }, [activeChatId, messages, visibleMessagesCount, isLiveActive]);

  return (
    <div className="flex h-screen overflow-hidden text-[var(--text-primary)] relative bg-[var(--bg-main)]">
      <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'} flex flex-col bg-[var(--bg-sidebar)] shadow-2xl`}>
        <div className="p-4 flex items-center justify-between text-[var(--text-secondary)] mb-4 lg:hidden">
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-blue-400" />
            <span className="font-bold text-white tracking-tighter">Gemoro</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 flex items-center justify-between text-[var(--text-secondary)] mb-4 hidden lg:flex">
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition hover:rotate-90 transition-transform duration-300"><Menu className="w-5 h-5" /></button>
          <button className="p-2 hover:bg-white/5 rounded-full transition ml-auto"><Search className="w-5 h-5" /></button>
        </div>

        <div className="px-4 mb-8">
          <button 
            onClick={() => { setActiveChatId(''); setVisibleMessagesCount(15); setActiveTab('chat'); }} 
            className="flex items-center gap-3 px-4 py-3 w-full rounded-full hover:bg-white/5 transition text-[var(--text-primary)] font-medium"
          >
            <SquarePen className="w-5 h-5 opacity-70" />
            <span>Nova conversa</span>
          </button>
          
          <button 
            onClick={() => setIsArchiveExpanded(!isArchiveExpanded)} 
            className={`flex items-center gap-3 px-4 py-2.5 mt-2 w-full rounded-full transition text-sm font-medium border border-transparent ${isArchiveExpanded ? 'bg-white/5 text-[var(--text-primary)] border-white/5' : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
          >
            <Archive className={`w-4 h-4 transition-transform duration-300 ${isArchiveExpanded ? 'text-blue-400' : 'opacity-50'}`} />
            <span>Arquivadas</span>
            <div className="ml-auto flex items-center gap-2">
              {chats.filter(c => c.archived).length > 0 && (
                <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-md text-[9px] font-bold">
                  {chats.filter(c => c.archived).length}
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isArchiveExpanded ? 'rotate-180' : 'opacity-30'}`} />
            </div>
          </button>

          {/* Drawer de Arquivadas */}
          {isArchiveExpanded && (
            <div className="mt-1 ml-4 border-l border-white/5 pl-2 space-y-1 animate-in slide-in-from-top-2 duration-300">
              {chats.filter(c => c.archived).length === 0 ? (
                <div className="text-[10px] text-[var(--text-secondary)] opacity-40 py-2 px-4 italic">Sem arquivados</div>
              ) : (
                chats.filter(c => c.archived).map(chat => (
                  <div 
                    key={chat.id} 
                    onClick={() => { setActiveChatId(chat.id); setIsSidebarOpen(false); }}
                    className={`group/arch flex items-center gap-2 py-1.5 px-3 rounded-xl cursor-pointer hover:bg-white/5 transition text-[var(--text-secondary)] hover:text-white ${activeChatId === chat.id ? 'bg-white/5 text-white' : ''}`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 opacity-40 group-hover/arch:opacity-100 transition-opacity" />
                    <span className="text-xs truncate flex-1">{chat.title}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleRestoreChat(chat.id); }}
                      className="opacity-0 group-hover/arch:opacity-100 p-1 hover:bg-blue-500/20 rounded-md transition text-blue-400"
                      title="Restaurar"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); if(confirm('Excluir permanentemente?')) handleDeleteChat(e, chat.id); }}
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
          <div className="flex items-center justify-between px-4 mb-4 mt-6">
            <div className="text-[14px] font-medium text-[var(--text-primary)]">Conversas</div>
            <button 
              onClick={() => setIsOrderLocked(!isOrderLocked)}
              className={`p-1.5 rounded-md transition-all ${isOrderLocked ? 'text-[var(--text-secondary)] opacity-40 hover:opacity-100 hover:bg-white/5' : 'text-blue-400 bg-blue-500/10'}`}
              title={isOrderLocked ? "Destravar reordenação" : "Travar reordenação"}
            >
              {isOrderLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>
          </div>
          
          <div className="space-y-1">
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext 
                items={chats.filter(c => !c.archived).map(c => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {chats.filter(c => !c.archived).map(chat => (
                  <SortableChatItem 
                    key={chat.id}
                    chat={chat}
                    activeChatId={activeChatId}
                    editingChatId={editingChatId}
                    editTitle={editTitle}
                    menuOpenId={menuOpenId}
                    isLocked={isOrderLocked}
                    onSelect={(id) => { setActiveChatId(id); setIsSidebarOpen(false); setActiveTab('chat'); }}
                    onRename={handleRenameChat}
                    onEditTitleChange={setEditTitle}
                    onRenameConfirm={handleRenameChat}
                    onToggleMenu={(id) => setMenuOpenId(menuOpenId === id ? null : id)}
                    onTogglePin={handleTogglePin}
                    onArchive={handleArchiveChat}
                    onDelete={handleDeleteChat}
                    onSetEditingId={(id, title) => { setEditingChatId(id); setEditTitle(title); }}
                  />
                ))}
              </SortableContext>

              <DragOverlay adjustScale={false}>
                {activeDragId ? (
                  <div className="bg-[var(--bg-chat-active)] text-[var(--text-nav-active)] py-2.5 px-4 rounded-full opacity-80 shadow-2xl border border-white/10 flex items-center gap-3">
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

        <div className="mt-auto p-4 border-t border-[var(--border-light)] relative">
          <button 
            onClick={() => setShowSettingsModal(true)} 
            className={`flex items-center gap-3 px-4 py-3 w-full rounded-full transition font-medium hover:bg-[var(--bg-chat-hover)] text-[var(--text-primary)]`}
          >
            <Settings className={`w-5 h-5 transition-transform duration-300 opacity-70`} /> 
            <span className="text-[14px]">Configurações</span>
          </button>
          
        </div>
      </aside>

      <main className="main-content flex flex-col h-full w-full bg-[var(--bg-main)]">
        <header className="p-4 flex justify-between items-center px-4 md:px-8 border-b border-[var(--border-light)] relative z-50 bg-[var(--bg-main)]">
          <div className="flex-1 flex items-center gap-4">
            {!isSidebarOpen && (
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2.5 hover:bg-[var(--bg-chat-hover)] rounded-xl transition-all hover:scale-110 active:scale-90"
              >
                <Menu className="w-6 h-6 text-[var(--text-secondary)]" />
              </button>
            )}
          </div>

          {/* Personality Selector */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2">
            <div className="relative">
              <button 
                onClick={() => setShowPersonalitySelector(!showPersonalitySelector)}
                className="flex items-center gap-2.5 px-5 py-2 rounded-full bg-[var(--bg-chat-active)] hover:bg-[var(--bg-user-bubble)] transition border border-[var(--border-light)] shadow-sm group min-w-[180px] justify-between"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <User className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-xs font-bold tracking-tight text-[var(--text-primary)] truncate">
                    {personalities.find(p => p.id === selectedPersonalityId)?.name || 'Normal'}
                  </span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 opacity-40 transition-transform ${showPersonalitySelector ? 'rotate-180' : ''}`} />
              </button>

              {showPersonalitySelector && (
                <div className="absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 bg-[var(--bg-sidebar)] border border-[var(--border-light)] rounded-2xl py-2 min-w-[200px] shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                  <button 
                    onClick={() => { setSelectedPersonalityId('default'); setShowPersonalitySelector(false); }}
                    className={`w-full text-left px-5 py-2.5 text-xs hover:bg-white/5 transition flex items-center gap-3 ${selectedPersonalityId === 'default' ? 'bg-blue-500/10 text-blue-400 font-bold' : 'text-[var(--text-secondary)]'}`}
                  >
                    <User className="w-3.5 h-3.5" /> Normal (Padrão)
                  </button>
                  {personalities.map(p => (
                    <button 
                      key={p.id}
                      onClick={() => { setSelectedPersonalityId(p.id); setShowPersonalitySelector(false); }}
                      className={`w-full text-left px-5 py-2.5 text-xs hover:bg-white/5 transition flex items-center gap-3 ${selectedPersonalityId === p.id ? 'bg-blue-500/10 text-blue-400 font-bold' : 'text-[var(--text-secondary)]'}`}
                    >
                      <User className="w-3.5 h-3.5" /> {p.name}
                    </button>
                  ))}
                  <div className="h-px bg-[var(--border-light)] my-2"></div>
                  <button 
                    onClick={() => { setShowPersonalitiesModal(true); setShowPersonalitySelector(false); }}
                    className="w-full text-left px-5 py-2.5 text-xs hover:bg-white/5 transition flex items-center gap-3 text-blue-400 font-medium"
                  >
                    <Settings className="w-3.5 h-3.5" /> Gerenciar Personalidades
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 flex justify-end items-center gap-2">
            {activeChatId && (
              <button 
                onClick={() => setActiveTab(activeTab === 'chat' ? 'files' : 'chat')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition text-xs font-semibold border ${activeTab === 'files' ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20' : 'bg-[var(--bg-chat-hover)] hover:bg-[var(--bg-user-bubble)] border-[var(--border-light)]'}`}
                title={activeTab === 'chat' ? 'Ver Arquivos' : 'Voltar para o Chat'}
              >
                <Files className={`w-3.5 h-3.5 ${activeTab === 'files' ? 'text-white' : 'text-blue-400'}`} />
                <span className="hidden sm:inline">{activeTab === 'chat' ? 'Arquivos' : 'Chat'}</span>
              </button>
            )}

            <button 
              onClick={() => setShowAnalytics(!showAnalytics)} 
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--bg-chat-hover)] hover:bg-[var(--bg-user-bubble)] transition text-xs font-semibold border border-[var(--border-light)]"
            >
              <Activity className="w-3.5 h-3.5 text-green-400" />
              <span>Uso Local</span>
              <div className="flex gap-0.5 ml-2">
                <div className="w-1 h-3 bg-green-500 rounded-full opacity-40"></div>
                <div className="w-1 h-3 bg-green-500 rounded-full opacity-70"></div>
                <div className="w-1 h-3 bg-green-500 rounded-full"></div>
              </div>
            </button>
          </div>
        </header>

        <ChatRuler margin={chatMargin} onMarginChange={setChatMargin} />

        {/* Removida a fita de LED do topo */}

        {showAnalytics && (
          <div className="absolute top-20 right-8 bg-[var(--bg-sidebar)] border border-[var(--border-light)] rounded-3xl p-6 w-96 shadow-2xl z-[70] animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-indigo-400" /> Analytics Hoje
              </h3>
              <button onClick={() => setShowAnalytics(false)} className="p-1.5 hover:bg-[var(--bg-chat-hover)] rounded-full text-[var(--text-placeholder)]"><X className="w-4 h-4" /></button>
            </div>
            
            <div className="space-y-6">
              {Object.entries(dailyUsage.models).length === 0 ? (
                <div className="text-center py-8 text-xs text-[var(--text-placeholder)] italic">Nenhum dado de uso registrado hoje.</div>
              ) : (
                Object.entries(dailyUsage.models).map(([modelId, data]) => {
                  const limit = MODEL_LIMITS[modelId] || { name: modelId, rpd: 100 };
                  const percent = Math.min(100, (data.requests / limit.rpd) * 100);
                  return (
                    <div key={modelId} className="space-y-2">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-[var(--text-primary)]">{limit.name}</span>
                        <span className="text-[var(--text-placeholder)]">{data.requests} / {limit.rpd} reqs</span>
                      </div>
                      <div className="h-1.5 bg-[var(--bg-chat-hover)] rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-1000 ${percent > 90 ? 'bg-red-500' : percent > 50 ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${percent}%` }}></div>
                      </div>
                      <div className="flex justify-between text-[10px] text-[var(--text-placeholder)] opacity-60">
                        <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> {data.tokens.total.toLocaleString()} tokens</span>
                        <span>{percent.toFixed(1)}% da cota</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-8 pt-4 border-t border-[var(--border-light)] flex justify-between items-center text-[10px] text-[var(--text-placeholder)]">
              <span>Data: {dailyUsage.date}</span>
              <span className="bg-green-500/10 text-green-400 px-2 py-1 rounded-full font-bold">API CONECTADA</span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col relative">
          {activeTab === 'files' && activeChatId ? (
            <ChatFileHub messages={messages} onClose={() => setActiveTab('chat')} />
          ) : (
            <>
              <div className="flex-1 overflow-hidden flex flex-col relative">
                {isLiveActive ? (
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
                    onVoiceChange={(v: string) => {
                      setLiveVoice(v);
                      localStorage.setItem('gemoro_live_voice', v);
                      handleLiveStop();
                      setTimeout(handleLiveStart, 500);
                    }}
                    isProactiveEnabled={isLiveProactive}
                    onToggleProactive={() => setIsLiveProactive(!isLiveProactive)}
                    onClose={handleLiveStop}
                  />
                ) : (
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
                    onDelete={(id: string) => setChats((p: ChatSession[]) => p.map((c: ChatSession) => c.id === activeChatId ? {...c, messages: c.messages.filter((m: any) => m.id !== id)} : c))}
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
                  />
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
                isLiveActive={isLiveActive}
                webSearchEnabled={webSearchEnabled}
                thinkingEnabled={thinkingEnabled}
                imageGenEnabled={imageGenEnabled}
                model={model}
                imagenModel={imagenModel}
                aspectRatio={aspectRatio}
                canSearch={model.includes('gemma') || model.includes('gemini-2')}
                showScrollButton={showScrollButton}
                margin={chatMargin}
                personalityName={personalities.find(p => p.id === selectedPersonalityId)?.name || 'Normal'}
                onSend={handleSend}
                onStartLive={handleLiveStart}
                onInterrupt={handleInterruptLive}
                onToggleWebSearch={() => setWebSearchEnabled(!webSearchEnabled)}
                onToggleThinking={() => setThinkingEnabled(!thinkingEnabled)}
                onToggleImageGen={() => setImageGenEnabled(!imageGenEnabled)}
                onSetModel={setModel}
                onSetImagenModel={setImagenModel}
                onSetAspectRatio={setAspectRatio}
                onScrollToBottom={() => scrollToBottom(true, true)}
                onStop={handleStopGeneration}
                enabledModelIds={enabledModelIds}
              />
            </>
          )}
        </div>

        {showPersonalitiesModal && (
          <PersonalitiesModal 
            personalities={personalities}
            onClose={() => setShowPersonalitiesModal(false)}
            onSave={(p: Personality) => {
              const exists = personalities.find(item => item.id === p.id);
              if (exists) {
                setPersonalities((prev: Personality[]) => prev.map((item: Personality) => item.id === p.id ? p : item));
              } else {
                setPersonalities((prev: Personality[]) => [...prev, p]);
              }
            }}
            onDelete={(id: string) => {
              setPersonalities((prev: Personality[]) => prev.filter((p: Personality) => p.id !== id));
              if (selectedPersonalityId === id) setSelectedPersonalityId('default');
            }}
          />
        )}


      </main>

        {showDnaModal && (
        <DnaModal 
          memoryFacts={memoryFacts}
          isCategorizing={isCategorizing}
          progress={categorizationProgress}
          onAutoCategorize={handleAutoCategorize}
          onClose={() => setShowDnaModal(false)}
          onDelete={(id) => {
            const next = memoryFacts.filter((m) => m.id !== id);
            setMemoryFacts(next);
            fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
          }}
          onSave={(fact: MemoryFact) => {
            let next;
            if (fact.id) {
              next = memoryFacts.map(m => m.id === fact.id ? fact : m);
            } else {
              next = [...memoryFacts, { ...fact, id: uuidv4(), timestamp: Date.now() }];
            }
            setMemoryFacts(next);
            fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
          }}
        />
      )}

      {showLiveSetupModal && (
        <LiveSetupModal 
          onClose={() => setShowLiveSetupModal(false)}
          onConfirm={confirmLiveStart}
          isConnecting={liveStatus === 'connecting' && isLiveActive}
        />
      )}

      {showSettingsModal && (
        <SettingsModal 
          onClose={() => setShowSettingsModal(false)}
          theme={theme}
          onSetTheme={setTheme}
          chatMargin={chatMargin}
          onSetChatMargin={(m) => {
            setChatMargin(m);
            localStorage.setItem('gemoro_chat_margin', m.toString());
          }}
          enabledModelIds={enabledModelIds}
          onSetEnabledModelIds={setEnabledModelIds}
          paidApiKey={paidApiKey}
          onUpdatePaidApiKey={(key) => {
            setPaidApiKey(key);
            saveConfig({ paidApiKey: key });
          }}
          onOpenPersonalities={() => setShowPersonalitiesModal(true)}
          onOpenDna={() => setShowDnaModal(true)}
        />
      )}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] md:hidden animate-in fade-in duration-300"
        ></div>
      )}
    </div>
  );
}

export default App;
