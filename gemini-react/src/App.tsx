import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { 
  Plus,
  Pin, 
  PinOff, 
  Edit2, 
  Archive, 
  ArchiveRestore, 
  Trash2, 
  ChevronDown, 
  ChevronRight,
  X, 
  Bot, 
  Settings, 
  Globe,
  Loader2,
  Menu,
  Search,
  SquarePen,
  MoreVertical,
  Circle,
  History,
  Check,
  Activity,
  Zap,
  BarChart2,
  User
} from 'lucide-react';
import ChatRuler from './components/ChatRuler';

import { 
  generateGeminiContent, 
  streamGeminiContent, 
  type Message 
} from './services/gemini';

import { 
  type ChatSession, 
  type DailyUsage, 
  type PendingFile,
  type Personality
} from './types';

const DEFAULT_PERSONALITY: Personality = {
  id: 'default',
  name: 'Normal',
  prompt: ''
};

import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import PersonalitiesModal from './components/PersonalitiesModal';
import LiveView from './components/LiveView';
import { GeminiLiveSession } from './services/geminiLive';

import { 
  MODEL_LIMITS,
  MODEL_OPTIONS,
  IMAGEN_OPTIONS
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
  const [memoryFacts, setMemoryFacts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState('gemma-4-31b-it');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [imageGenEnabled, setImageGenEnabled] = useState(false);
  const [imagenModel, setImagenModel] = useState('imagen-4.0-fast-generate-001');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '9:16' | '16:9'>('1:1');
  const [expandedSourcesMsgId, setExpandedSourcesMsgId] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('gemoro_theme') || 'escuro');
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [settingsView, setSettingsView] = useState<'main' | 'theme' | 'advanced_models'>('main');
  const [showDnaModal, setShowDnaModal] = useState(false);
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
    return saved ? parseInt(saved, 10) : 15;
  });
  const [personalities, setPersonalities] = useState<Personality[]>(() => {
    const saved = localStorage.getItem('gemoro_personalities');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedPersonalityId, setSelectedPersonalityId] = useState(() => {
    return localStorage.getItem('gemoro_selected_personality_id') || 'default';
  });
  const [showPersonalitiesModal, setShowPersonalitiesModal] = useState(false);
  const [showPersonalitySelector, setShowPersonalitySelector] = useState(false);
  
  // LIVE MODE STATE
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('disconnected');
  const [liveTranscript, setLiveTranscript] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [liveVoice, setLiveVoice] = useState(() => localStorage.getItem('gemoro_live_voice') || 'Charon');
  const [liveVisionType, setLiveVisionType] = useState<'camera' | 'screen' | null>(null);
  const [liveVideoStream, setLiveVideoStream] = useState<MediaStream | null>(null);
  const [isLiveSpeaking, setIsLiveSpeaking] = useState(false);
  const liveSessionRef = useRef<GeminiLiveSession | null>(null);
  const liveAudioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextAudioTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const [liveAnalyser, setLiveAnalyser] = useState<AnalyserNode | null>(null);

  const previousScrollHeightRef = useRef<number>(0);
  const isLazyLoadingRef = useRef<boolean>(false);
  const chatWindowRef = useRef<HTMLElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentAiMsgIdRef = useRef<string | null>(null);

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat?.messages || [];

  // Load Initial Data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [historyRes, memoryRes] = await Promise.all([
          fetch('/api/history'),
          fetch('/api/memory')
        ]);
        if (historyRes.ok) {
          const history = await historyRes.json();
          if (Array.isArray(history)) {
            setChats(history);
            if (history.length > 0) setActiveChatId(history[0].id);
          }
        }
        if (memoryRes.ok) {
          const memory = await memoryRes.json();
          if (Array.isArray(memory)) setMemoryFacts(memory);
        }
      } catch (e) {
        console.error("Erro ao carregar dados iniciais:", e);
      }
    };
    loadData();
  }, []);

  // Auto-Save Margins
  useEffect(() => {
    localStorage.setItem('gemoro_chat_margin', chatMargin.toString());
  }, [chatMargin]);

  // Auto-Save Personalities
  useEffect(() => {
    localStorage.setItem('gemoro_personalities', JSON.stringify(personalities));
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
        if (showSettingsMenu) {
          setShowSettingsMenu(false);
          setSettingsView('main');
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
  }, [showPersonalitiesModal, showDnaModal, showSettingsMenu, isLiveActive, handleLiveStop]);

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

    const systemInstruction = "Você é o Gemoro, uma inteligência artificial avançada. Sua tarefa secundária é manter sua memória persistente (DNA) precisa e atualizada.\n" +
      (selectedPersonality.prompt ? `INSTRUÇÃO DE PERSONALIDADE ATIVA: "${selectedPersonality.prompt}"\n\n` : "") +
      (memoryFacts.length > 0 ? "Fatos que você já sabe sobre o usuário:\n" + memoryFacts.map((f, i) => `[ID: ${i}] ${f}`).join("\n") + "\n\n" : "") +
      "Regras de Memória:\n" +
      "1. Se descobrir um fato NOVO sobre o usuário, adicione <MEMORY>novo fato</MEMORY> na resposta.\n" +
      "2. Se um fato existente mudou, ATUALIZE-O usando <UPDATE_MEMORY id='X'>novo texto atualizado</UPDATE_MEMORY>.\n" +
      "3. Se um fato não for mais verdade, EXCLUA-O usando <DELETE_MEMORY id='X'></DELETE_MEMORY>.";

    try {
      const startTime = performance.now();
      const currentAiMsgId = replaceId || (Date.now() + 1).toString() + '-ai';
      currentAiMsgIdRef.current = currentAiMsgId;
      setTimeout(() => scrollToBottom(true), 50);

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

      const stream = streamGeminiContent(userText, model, apiHistory, systemInstruction, filesToSend, webSearchEnabled, controller.signal, thinkingEnabled);
      let fullText = "";
      let fullThoughts = "";
      let allSources: { title: string; uri: string }[] = [];
      let isSearching = false;
      let isGrounded = false;
      let finalUsage = null;

      for await (const chunk of stream) {
        if (chunk.text) fullText += chunk.text;
        if (chunk.thoughts) fullThoughts += chunk.thoughts;
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
        const currentDuration = (performance.now() - startTime) / 1000;
        setChats(prev => prev.map(c => c.id === targetChatId ? {
          ...c,
          messages: c.messages.map(m => m.id === currentAiMsgId ? { ...m, text: fullText, thoughts: fullThoughts, isGrounded, isSearching, sources: [...allSources], duration: currentDuration } : m)
        } : c));
      }

      if (finalUsage) {
        setDailyUsage(prev => {
          const today = getPacificDate();
          let state = prev.date === today ? prev : { date: today, models: {} };
          const modelData = state.models[model] || { requests: 0, tokens: { prompt: 0, candidates: 0, total: 0 } };
          const newState = {
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

      let hasMemoryUpdates = false;
      let newMemories = [...memoryFacts];
      const parseModelText = (str: string) => {
        const memoryRegex = /<MEMORY>(.*?)<\/MEMORY>/gi;
        const updateRegex = /<UPDATE_MEMORY id='(\d+)'>(.*?)<\/UPDATE_MEMORY>/gi;
        const deleteRegex = /<DELETE_MEMORY id='(\d+)'><\/DELETE_MEMORY>/gi;
        let match;
        while ((match = deleteRegex.exec(str)) !== null) { let idx = parseInt(match[1]); if (newMemories[idx]) { newMemories[idx] = "@@DELETE@@"; hasMemoryUpdates = true; } }
        str = str.replace(deleteRegex, '');
        while ((match = updateRegex.exec(str)) !== null) { let idx = parseInt(match[1]); if (newMemories[idx]) { newMemories[idx] = match[2].trim(); hasMemoryUpdates = true; } }
        str = str.replace(updateRegex, '');
        while ((match = memoryRegex.exec(str)) !== null) { newMemories.push(match[1].trim()); hasMemoryUpdates = true; }
        return str.replace(memoryRegex, '').trim();
      };

      const finalCleanText = parseModelText(fullText);
      if (hasMemoryUpdates) {
        newMemories = newMemories.filter(m => m !== "@@DELETE@@");
        setMemoryFacts(newMemories);
        fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newMemories) });
      }

      setChats(prev => prev.map(c => c.id === targetChatId ? { ...c, messages: c.messages.map(m => m.id === currentAiMsgId ? { ...m, text: finalCleanText } : m) } : c));

      if (isFirstMessage) {
        generateGeminiContent(
          `Com base na mensagem a seguir, gere um nome de título estritamente curto (entre 1 a 4 palavras no máximo) para identificar a conversa. Responda APENAS com o texto cru do título, sem aspas, sem negrito, e sem conversa fiada:\n\nMensagem: "${userText}"`,
          model,
          [],
          ""
        ).then(res => {
          if (res.text) {
            const cleanTitle = res.text.replace(/["'*]/g, '').trim();
            setChats(prev => prev.map(c => c.id === targetChatId ? { ...c, title: cleanTitle, isNaming: false } : c));
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
      setIsLoading(false);
      abortControllerRef.current = null;
      currentAiMsgIdRef.current = null;
    }
  }, [model, webSearchEnabled, thinkingEnabled, memoryFacts, scrollToBottom, personalities, selectedPersonalityId]);

  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      
      // Remover a mensagem vazia/incompleta que estava sendo gerada
      if (currentAiMsgIdRef.current && activeChatId) {
        setChats(prev => prev.map(c => {
          if (c.id === activeChatId) {
            return {
              ...c,
              messages: c.messages.filter(m => m.id !== currentAiMsgIdRef.current)
            };
          }
          return c;
        }));
      }
      
      setIsLoading(false);
      currentAiMsgIdRef.current = null;
    }
  }, [activeChatId]);



  const handleLiveStart = useCallback(async () => {
    setIsLiveActive(true);
    setLiveTranscript([]);
    
    const selectedPersonality = personalities.find(p => p.id === selectedPersonalityId) || DEFAULT_PERSONALITY;
    
    liveAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
    
    // Initialize Analyser
    const analyser = liveAudioContextRef.current.createAnalyser();
    analyser.fftSize = 256;
    analyser.connect(liveAudioContextRef.current.destination);
    setLiveAnalyser(analyser);

    const session = new GeminiLiveSession({
      onStatusChange: (status) => setLiveStatus(status),
      onStream: (stream) => setLiveVideoStream(stream),
      onError: (err) => { alert(err); handleLiveStop(); },
      onTranscript: (role, text) => {
        setLiveTranscript(prev => [...prev, { role, text }]);
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
        // Enfileirar e agendar áudio
        if (!liveAudioContextRef.current || !analyser) return;
        const ctx = liveAudioContextRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        const buffer = ctx.createBuffer(1, chunk.length, 24000);
        buffer.copyToChannel(chunk, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);

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
        source.start(startTime);
        nextAudioTimeRef.current = startTime + buffer.duration;
      }
    }, selectedPersonality.prompt, liveVoice);

    liveSessionRef.current = session;
    await session.start();
  }, [activeChatId, personalities, selectedPersonalityId, liveVoice, handleLiveStop]);

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
  }, []);

  const handleSend = useCallback((text: string, files: PendingFile[]) => {
    if (text.trim() === '' && files.length === 0) return;

    if (isLiveActive && liveSessionRef.current) {
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
        setTimeout(() => setVisibleMessagesCount(prev => prev + 15), 300);
      }
    }
  }, [messages.length, visibleMessagesCount]);

  useLayoutEffect(() => {
    if (isLazyLoadingRef.current && chatWindowRef.current) {
      const newScrollHeight = chatWindowRef.current.scrollHeight;
      chatWindowRef.current.scrollTop += (newScrollHeight - previousScrollHeightRef.current);
      isLazyLoadingRef.current = false;
    }
  }, [visibleMessagesCount]);

  useEffect(() => { setVisibleMessagesCount(15); setTimeout(() => scrollToBottom(true, true), 10); }, [activeChatId, scrollToBottom]);
  useEffect(() => { scrollToBottom(); }, [messages, isLoading, scrollToBottom]);

  const handleTogglePin = (e: any, id: string) => { e.stopPropagation(); setChats(p => p.map(c => c.id === id ? {...c, pinned: !c.pinned} : c)); };
  const handleDeleteChat = (e: any, id: string) => { 
    e.stopPropagation(); setChats(p => p.filter(c => c.id !== id));
    if (activeChatId === id) setActiveChatId('');
  };
  const handleToggleArchive = (e: any, id: string) => { e.stopPropagation(); setChats(p => p.map(c => c.id === id ? {...c, archived: !c.archived} : c)); };
  const handleRenameChat = (id: string) => {
    if (editTitle.trim()) {
      setChats(p => p.map(c => c.id === id ? {...c, title: editTitle.trim()} : c));
    }
    setEditingChatId(null);
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

  const pinnedChats = chats.filter(c => c.pinned && !c.archived);
  const recentChats = chats.filter(c => !c.pinned && !c.archived);
  const archivedChats = chats.filter(c => c.archived);

  return (
    <div className="flex h-screen overflow-hidden text-[var(--text-primary)]">
      <aside className="sidebar hidden md:flex flex-col w-72 bg-[#1e1f20] transition-all duration-300">
        <div className="p-4 flex items-center justify-between text-[var(--text-secondary)] mb-4">
          <button className="p-2 hover:bg-white/5 rounded-full transition"><Menu className="w-5 h-5" /></button>
          <button className="p-2 hover:bg-white/5 rounded-full transition ml-auto"><Search className="w-5 h-5" /></button>
        </div>

        <div className="px-4 mb-8">
          <button 
            onClick={() => { setActiveChatId(''); setVisibleMessagesCount(15); }} 
            className="flex items-center gap-3 px-4 py-3 w-full rounded-full hover:bg-white/5 transition text-[var(--text-primary)] font-medium"
          >
            <SquarePen className="w-5 h-5 opacity-70" />
            <span>Nova conversa</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-2">
          <div className="text-[14px] font-medium text-[var(--text-primary)] px-4 mb-4 mt-6">Conversas</div>
          
          <div className="space-y-1">
            {chats.filter(c => !c.archived).map(chat => (
              <div key={chat.id} className="relative group">
                <div 
                  onClick={() => setActiveChatId(chat.id)} 
                  className={`group/item flex items-center gap-3 py-2.5 px-4 mx-1 rounded-full cursor-pointer transition relative ${activeChatId === chat.id ? 'bg-[#1D3153] text-[#A8C7FA]' : 'hover:bg-white/5 text-[var(--text-primary)]'}`}
                >
                  {editingChatId === chat.id ? (
                    <input autoFocus className="bg-transparent border-none outline-none text-white w-full text-[14px]" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onBlur={() => handleRenameChat(chat.id)} onKeyDown={(e) => e.key === 'Enter' && handleRenameChat(chat.id)} />
                  ) : (
                    <span className="truncate text-[14px] flex-1 font-normal">{chat.title}</span>
                  )}

                  {chat.pinned && <Pin className="w-3.5 h-3.5 opacity-60 ml-1" />}
                  
                  <button 
                    onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === chat.id ? null : chat.id); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`p-1 hover:bg-white/10 rounded-full transition shrink-0 ${activeChatId === chat.id || menuOpenId === chat.id ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'}`}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>

                {menuOpenId === chat.id && (
                  <div 
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-4 top-full mt-1 bg-[#1e1f20] border border-[var(--border-light)] rounded-xl py-2 w-48 shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-200"
                  >
                    <button onClick={(e) => { e.stopPropagation(); setEditingChatId(chat.id); setEditTitle(chat.title); setMenuOpenId(null); }} className="w-full text-left px-4 py-2 hover:bg-white/5 transition text-sm flex items-center gap-2">
                      <Edit2 className="w-4 h-4 opacity-60" /> Renomear
                    </button>
                    <button onClick={(e) => { handleTogglePin(e, chat.id); setMenuOpenId(null); }} className="w-full text-left px-4 py-2 hover:bg-white/5 transition text-sm flex items-center gap-2">
                      <Pin className="w-4 h-4 opacity-60" /> {chat.pinned ? 'Desafixar' : 'Fixar'}
                    </button>
                    <button onClick={(e) => { handleToggleArchive(e, chat.id); setMenuOpenId(null); }} className="w-full text-left px-4 py-2 hover:bg-white/5 transition text-sm flex items-center gap-2">
                      <Archive className="w-4 h-4 opacity-60" /> Arquivar
                    </button>
                    <button onClick={(e) => { handleDeleteChat(e, chat.id); setMenuOpenId(null); }} className="w-full text-left px-4 py-2 hover:bg-white/5 transition text-sm flex items-center gap-2 text-red-400">
                      <Trash2 className="w-4 h-4" /> Excluir
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto p-4 border-t border-[var(--border-light)]">
          <button onClick={() => setShowSettingsMenu(!showSettingsMenu)} className="flex items-center gap-3 px-4 py-3 w-full rounded-full hover:bg-[var(--bg-chat-hover)] transition text-[var(--text-primary)] font-medium">
            <Settings className="w-5 h-5 opacity-70" /> 
            <span className="text-[14px]">Configurações e ajuda</span>
          </button>
          {showSettingsMenu && (
            <div className="absolute bottom-20 left-4 bg-[var(--bg-modal)] border border-[var(--border-light)] rounded-2xl p-3 w-64 shadow-2xl z-[80]">
              <div className="text-[10px] uppercase font-bold text-[var(--text-placeholder)] mb-2 px-2 tracking-widest">Tema</div>
              {['claro', 'escuro', 'areia', 'galaxia'].map(t => (
                <button key={t} onClick={() => setTheme(t)} className={`w-full text-left px-4 py-2 rounded-lg text-sm transition ${theme === t ? 'bg-indigo-600 text-white' : 'hover:bg-[var(--bg-chat-hover)] text-[var(--text-secondary)] hover:text-white'}`}>{t.toUpperCase()}</button>
              ))}
              <div className="h-px bg-[var(--border-light)] my-2"></div>
              <button 
                onClick={() => { setShowPersonalitiesModal(true); setShowSettingsMenu(false); }}
                className="w-full text-left px-4 py-2 rounded-lg text-sm hover:bg-[var(--bg-chat-hover)] text-[var(--text-secondary)] hover:text-white transition flex items-center gap-2"
              >
                <User className="w-4 h-4" /> Personalidades
              </button>
              <div className="h-px bg-[var(--border-light)] my-2"></div>
              <button 
                onClick={() => { setShowDnaModal(true); setShowSettingsMenu(false); }}
                className="w-full text-left px-4 py-2 rounded-lg text-sm hover:bg-[var(--bg-chat-hover)] text-[var(--text-secondary)] hover:text-white transition flex items-center gap-2"
              >
                <Bot className="w-4 h-4" /> DNA de Memória
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="main-content flex flex-col h-full w-full bg-[var(--bg-main)]">
        <header className="p-4 flex justify-between items-center px-8 border-b border-[var(--border-light)] relative z-50 bg-[var(--bg-main)]">
          <div className="flex-1"></div>

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

          <div className="flex-1 flex justify-end">
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

        {isLoading && <div className="ai-led-strip" />}

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
              onVoiceChange={(v) => {
                setLiveVoice(v);
                localStorage.setItem('gemoro_live_voice', v);
                handleLiveStop();
                setTimeout(handleLiveStart, 500);
              }}
              onClose={handleLiveStop}
            />
          ) : (
            <MessageList 
              messages={messages}
              margin={chatMargin}
              visibleMessagesCount={visibleMessagesCount}
              onScroll={handleScroll}
              chatWindowRef={chatWindowRef}
              isLoading={isLoading}
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
              onDelete={(id) => setChats(p => p.map(c => c.id === activeChatId ? {...c, messages: c.messages.filter(m => m.id !== id)} : c))}
              onCopy={(text, id) => { navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); }}
              onToggleSources={setExpandedSourcesMsgId}
            />
          )}
        </div>

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
        />

        {showPersonalitiesModal && (
          <PersonalitiesModal 
            personalities={personalities}
            onClose={() => setShowPersonalitiesModal(false)}
            onSave={(p) => {
              const exists = personalities.find(item => item.id === p.id);
              if (exists) {
                setPersonalities(prev => prev.map(item => item.id === p.id ? p : item));
              } else {
                setPersonalities(prev => [...prev, p]);
              }
            }}
            onDelete={(id) => {
              setPersonalities(prev => prev.filter(p => p.id !== id));
              if (selectedPersonalityId === id) setSelectedPersonalityId('default');
            }}
          />
        )}
      </main>

      {showDnaModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
           <div className="bg-[var(--bg-sidebar)] w-full max-w-2xl rounded-3xl border border-[var(--border-light)] overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
             <div className="p-6 border-b border-[var(--border-light)] flex justify-between items-center bg-indigo-600/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white"><Settings className="w-6 h-6" /></div>
                  <h3 className="text-xl font-bold">DNA de Memória</h3>
                </div>
                <button onClick={() => setShowDnaModal(false)} className="p-2 hover:bg-[var(--bg-chat-hover)] rounded-full transition"><X className="w-5 h-5" /></button>
             </div>
             <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
               {memoryFacts.length === 0 ? (
                 <div className="text-center py-12 opacity-50 italic">Nenhum fato registrado na memória de longo prazo.</div>
               ) : (
                 memoryFacts.map((fact, idx) => (
                   <div key={idx} className="flex gap-3 p-3 bg-[var(--bg-chat-hover)] rounded-xl border border-[var(--border-light)]">
                     <span className="text-indigo-400 font-bold">#{idx}</span>
                     <span className="flex-1">{fact}</span>
                     <button onClick={() => {
                        const next = memoryFacts.filter((_, i) => i !== idx);
                        setMemoryFacts(next);
                        fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
                     }} className="text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                   </div>
                 ))
               )}
             </div>
           </div>
        </div>
      )}
    </div>
  );
}

export default App;
