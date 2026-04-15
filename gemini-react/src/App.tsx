import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Pin, PinOff, Edit2, Archive, ArchiveRestore, Trash2, FileText, AlertCircle, ChevronDown, ChevronRight, X, Plus, Send, Bot, Settings, RotateCcw, Copy, Check, Globe, Square, Loader2, Lightbulb, Image, Camera, Download } from 'lucide-react';
import { safeMarkdown, generateGeminiContent, streamGeminiContent, generateImagenContent, type Message } from './services/gemini';

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  pinned?: boolean;
  archived?: boolean;
  isNaming?: boolean;
};

export const MODEL_LIMITS: Record<string, { name: string; rpd: number }> = {
  'gemma-4-31b-it': { name: 'Gemma 4 31B', rpd: 1500 },
  'gemini-3.1-flash-lite-preview': { name: 'Gemini 3.1 Flash Lite', rpd: 500 },
  'gemini-3-flash-preview': { name: 'Gemini 3 Flash', rpd: 20 },
  'imagen-4.0-fast-generate-001': { name: 'Imagen 4 Fast', rpd: 25 },
  'imagen-4.0-generate-001': { name: 'Imagen 4 Standard', rpd: 25 },
  'imagen-4.0-ultra-generate-001': { name: 'Imagen 4 Ultra', rpd: 25 },
};

export const MODEL_OPTIONS = [
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite', desc: 'Equilíbrio de velocidade e precisão', hasSearch: false },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', desc: 'Respostas ultra-rápidas', hasSearch: false },
  { id: 'gemma-4-31b-it', name: 'Gemma 4 Rápido', desc: 'Modelo local otimizado', hasSearch: true },
  // Optional
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'Alta performance com pesquisa', hasSearch: true, isOptional: true },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', desc: 'Versão eficiente estabilizada', hasSearch: true, isOptional: true },
  { id: 'gemma-4-26b-a4b-it', name: 'Gemma 4 (26B)', desc: 'Eficiência local balanceada', hasSearch: true, isOptional: true }
];

export const IMAGEN_OPTIONS = [
  { id: 'imagen-4.0-fast-generate-001', name: 'Fast Generate', desc: 'Geração veloz para rascunhos' },
  { id: 'imagen-4.0-generate-001', name: 'Standard Generate', desc: 'Equilíbrio e detalhamento' },
  { id: 'imagen-4.0-ultra-generate-001', name: 'Ultra Generate', desc: 'Fidelidade máxima e realismo' }
];

type ModelUsage = {
  requests: number;
  tokens: { prompt: number, candidates: number, total: number };
};

type DailyUsage = {
  date: string;
  models: Record<string, ModelUsage>;
};

// Google RPD resets purely at Midnight Pacific Time (Los Angeles)
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
  
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<{name: string, data: string, mimeType: string}[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState('gemma-4-31b-it');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [imageGenEnabled, setImageGenEnabled] = useState(false);
  const [imagenModel, setImagenModel] = useState('imagen-4.0-fast-generate-001');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '9:16' | '16:9'>('1:1');
  const [showImagenSettings, setShowImagenSettings] = useState(false);
  const [expandedSourcesMsgId, setExpandedSourcesMsgId] = useState<string | null>(null);
  
  // Analytics State
  const [showAnalytics, setShowAnalytics] = useState(false);
  
  // Theme State
  const [theme, setTheme] = useState(() => localStorage.getItem('gemoro_theme') || 'escuro');
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [settingsView, setSettingsView] = useState<'main' | 'theme' | 'advanced_models'>('main');
  
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('gemoro_theme', theme);
  }, [theme]);
  
  // DNA State
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
  
  // Sidebar Interaction States
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  
  // Message Interaction State
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgText, setEditingMsgText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Lazy Loading / Virtualization State
  const [visibleMessagesCount, setVisibleMessagesCount] = useState(15);
  const previousScrollHeightRef = useRef<number>(0);
  const isLazyLoadingRef = useRef<boolean>(false);

  // Removed initial activeChatId useEffect completely

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleEditPrompt = (msgId: string, currentText: string) => {
    setEditingMsgId(msgId);
    setEditingMsgText(currentText);
  };

  const handleSaveEdit = async (chatId: string, msgId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat || !editingMsgText.trim() || isLoading) return;

    const msgIndex = chat.messages.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    const newText = editingMsgText.trim();
    setEditingMsgId(null);
    setEditingMsgText('');

    // Update user message and CLEAR subsequent AI message
    setChats(prev => prev.map(c => {
      if (c.id === chatId) {
        const updatedMsgs = [...c.messages];
        updatedMsgs[msgIndex] = { ...updatedMsgs[msgIndex], text: newText };
        // Clear next AI message if it exists
        if (updatedMsgs[msgIndex + 1] && updatedMsgs[msgIndex + 1].role === 'ai') {
          updatedMsgs[msgIndex + 1] = { ...updatedMsgs[msgIndex + 1], text: '', thoughts: '' };
        }
        return { ...c, messages: updatedMsgs };
      }
      return c;
    }));

    // Re-generate
    const historyBefore = chat.messages.slice(0, msgIndex);
    const apiHistory = historyBefore.map(m => {
      const parts: any[] = [];
      if (m.files) m.files.forEach(f => parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } }));
      if (m.text) parts.push({ text: m.text });
      return { role: m.role === 'ai' ? 'model' : 'user', parts };
    });

    const aiMsgId = chat.messages[msgIndex + 1]?.id;
    executeAIRequest(chatId, newText, chat.messages[msgIndex].files || [], apiHistory, false, aiMsgId);
  };

  const currentModelData = MODEL_OPTIONS.find(m => m.id === model);
  const canSearch = currentModelData?.hasSearch || false;

  const handleDeleteMessage = (chatId: string, msgId: string) => {
    // Avoid deleting if currently loading a response
    if (isLoading) return;
    
    setChats(prev => prev.map(c => {
      if (c.id === chatId) {
        return { ...c, messages: c.messages.filter(m => m.id !== msgId) };
      }
      return c;
    }));
  };
  
  const chatWindowRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopGeneration = () => {
    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      
      // Remove any empty/partial AI messages at the end of the active chat
      if (activeChatId) {
        setChats(prev => prev.map(c => {
          if (c.id === activeChatId) {
            const lastMsg = c.messages[c.messages.length - 1];
            if (lastMsg && lastMsg.role === 'ai' && !lastMsg.text.trim()) {
              return { ...c, messages: c.messages.slice(0, -1) };
            }
          }
          return c;
        }));
      }
    }
  };

  useEffect(() => {
    const handleClickOutside = () => { 
      setMenuOpenId(null); 
      setIsModelMenuOpen(false); 
      setShowImagenSettings(false);
      setExpandedSourcesMsgId(null);
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpenId(null);
        setIsModelMenuOpen(false);
        setShowImagenSettings(false);
        setExpandedSourcesMsgId(null);
        setShowDnaModal(false);
        setShowAnalytics(false);
      }
    };

    window.addEventListener('click', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat ? activeChat.messages : [];

  useEffect(() => {
    fetch('/api/history')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          if (!('messages' in data[0])) {
            const migrated = [{ id: 'default', title: 'Chat Legado', messages: data }];
            setChats(migrated);
            setActiveChatId('default');
          } else {
            setChats(data);
            setActiveChatId(data[0].id || '');
          }
        }
        setIsHistoryLoaded(true);
      })
      .catch(err => {
        console.error("Erro ao carregar histórico: ", err);
        setIsHistoryLoaded(true);
      });

    fetch('/api/memory')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setMemoryFacts(data);
      })
      .catch(err => console.error("Erro ao carregar memória: ", err));
  }, []);

  useEffect(() => {
    if (!isHistoryLoaded) return;
    
    fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chats)
    }).catch(err => console.error("Erro ao salvar histórico: ", err));
  }, [chats, isHistoryLoaded]);

  const scrollToBottom = (force = false, instant = false) => {
    if (chatWindowRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatWindowRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
      
      if (force || isNearBottom) {
        chatWindowRef.current.scrollTo({
          top: scrollHeight,
          behavior: instant ? 'auto' : 'smooth'
        });
      }
    }
  };

  useEffect(() => {
    setVisibleMessagesCount(15);
    setTimeout(() => scrollToBottom(true, true), 10);
  }, [activeChatId]);

  useEffect(() => {
    // During active generation, we only scroll if the user is already at the bottom.
    // We don't want to force them back down if they are reading something above.
    scrollToBottom();
  }, [messages, isLoading, pendingFiles]);

  const handleScroll = () => {
    if (chatWindowRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatWindowRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 300;
      setShowScrollButton(!isNearBottom);

      // Lazy Loading trigger
      const activeChat = chats.find(c => c.id === activeChatId);
      const totalMessages = activeChat?.messages.length || 0;

      if (scrollTop < 50 && visibleMessagesCount < totalMessages && !isLazyLoadingRef.current) {
        isLazyLoadingRef.current = true;
        previousScrollHeightRef.current = scrollHeight;
        
        setTimeout(() => {
          setVisibleMessagesCount(prev => prev + 15);
        }, 300); // UI feedback delay
      }
    }
  };

  useLayoutEffect(() => {
    if (isLazyLoadingRef.current && chatWindowRef.current) {
      const newScrollHeight = chatWindowRef.current.scrollHeight;
      chatWindowRef.current.scrollTop += (newScrollHeight - previousScrollHeightRef.current);
      isLazyLoadingRef.current = false;
    }
  }, [visibleMessagesCount]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const createNewChat = () => {
    const newId = Date.now().toString();
    const newChat: ChatSession = { id: newId, title: 'Nova Conversa', messages: [] };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newId);
  };

  // ----- Chat Session Management -----
  const handleDeleteChat = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) {
      const remaining = chats.filter(c => c.id !== id && !c.archived);
      setActiveChatId(remaining.length > 0 ? remaining[0].id : '');
    }
    setMenuOpenId(null);
  };

  const handleTogglePin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setChats(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
    setMenuOpenId(null);
  };

  const handleToggleArchive = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setChats(prev => prev.map(c => c.id === id ? { ...c, archived: !c.archived } : c));
    setMenuOpenId(null);
  };

  const startRename = (e: React.MouseEvent, id: string, currentTitle: string) => {
    e.stopPropagation();
    setEditingChatId(id);
    setEditTitle(currentTitle);
    setMenuOpenId(null);
  };

  const saveRename = (id: string) => {
    setChats(prev => prev.map(c => c.id === id ? { ...c, title: editTitle.trim() || 'Chat' } : c));
    setEditingChatId(null);
  };
  // ------------------------------------

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      setPendingFiles(prev => [...prev, { name: file.name, data: base64, mimeType: file.type }]);
      fetch('/api/upload', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ filename: file.name, data: base64 })
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;
    Array.from(selectedFiles).forEach(processFile);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
          processFile(file);
        }
      }
    }
  };

  const executeAIRequest = async (targetChatId: string, userText: string, filesToSend: any[], apiHistory: any[], isFirstMessage: boolean, replaceId?: string) => {
    setIsLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const systemInstruction = "Você é o Gemoro, uma inteligência artificial avançada. Sua tarefa secundária é manter sua memória persistente (DNA) precisa e atualizada.\n" +
      (memoryFacts.length > 0 ? "Fatos que você já sabe sobre o usuário:\n" + memoryFacts.map((f, i) => `[ID: ${i}] ${f}`).join("\n") + "\n\n" : "") +
      "Regras de Memória:\n" +
      "1. Se descobrir um fato NOVO sobre o usuário, adicione <MEMORY>novo fato</MEMORY> na resposta.\n" +
      "2. Se um fato existente (listado acima) mudou, ATUALIZE-O usando <UPDATE_MEMORY id='X'>novo texto atualizado</UPDATE_MEMORY>.\n" +
      "3. Se um fato não for mais verdade, EXCLUA-O usando <DELETE_MEMORY id='X'></DELETE_MEMORY>.";

    try {
      const startTime = performance.now();
      const currentAiMsgId = replaceId || (Date.now() + 1).toString() + '-ai';

      // Force scroll to bottom to show the new message interaction
      setTimeout(() => scrollToBottom(true), 50);

      // Initialize AI message in the chat
      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          const updatedChat = { ...c };
          const freshMsg: Message = { id: currentAiMsgId, role: 'ai', text: '', thoughts: '', duration: 0, isSearching: webSearchEnabled };
          if (replaceId) {
            updatedChat.messages = updatedChat.messages.map(m => m.id === replaceId ? freshMsg : m);
          } else {
            updatedChat.messages = [...updatedChat.messages, freshMsg];
          }
          return updatedChat;
        }
        return c;
      }));

      const stream = streamGeminiContent(userText, model, apiHistory, systemInstruction, filesToSend, webSearchEnabled, controller.signal, thinkingEnabled);
      
      let fullText = "";
      let fullThoughts = "";
      let allSources: { title: string; uri: string }[] = [];
      let isSearching = false; // Start false, will trigger if API sends queries
      let isGrounded = false;
      let finalUsage = null;

      for await (const chunk of stream) {
        if (chunk.text) fullText += chunk.text;
        if (chunk.thoughts) fullThoughts += chunk.thoughts;
        if (chunk.isGrounded) isGrounded = true;
        
        // Sticky searching state: once it starts, it stays true until we get sources
        if (chunk.isSearching) isSearching = true;
        if (allSources.length > 0) isSearching = false; 

        if (chunk.usage) finalUsage = chunk.usage;
        
        if (chunk.sources) {
          chunk.sources.forEach(src => {
            // Deduplicate by both URI and Title to handle proxy links for the same site
            if (!allSources.find(s => s.uri === src.uri || (s.title && s.title === src.title))) {
              allSources.push(src);
            }
          });
        }


        const currentDuration = (performance.now() - startTime) / 1000;

        setChats(prev => prev.map(c => {
          if (c.id === targetChatId) {
            return {
              ...c,
              messages: c.messages.map(m => 
                m.id === currentAiMsgId ? { 
                  ...m, 
                  text: fullText, 
                  thoughts: fullThoughts, 
                  isGrounded: isGrounded, 
                  isSearching: isSearching,
                  sources: [...allSources],
                  duration: currentDuration 
                } : m

              )
            };
          }
          return c;
        }));
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
                prompt: modelData.tokens.prompt + finalUsage.promptTokenCount,
                candidates: modelData.tokens.candidates + finalUsage.candidatesTokenCount,
                total: modelData.tokens.total + finalUsage.totalTokenCount
              }
            }}
          };
          localStorage.setItem('gemini_advanced_usage_v1', JSON.stringify(newState));
          return newState;
        });
      }

      const memoryRegex = /<MEMORY>([\s\S]*?)<\/MEMORY>/g;
      const updateRegex = /<UPDATE_MEMORY id=['"]?(\d+)['"]?>([\s\S]*?)<\/UPDATE_MEMORY>/g;
      const deleteRegex = /<DELETE_MEMORY id=['"]?(\d+)['"]?>[\s\S]*?<\/DELETE_MEMORY>/g;
      
      let newMemories: string[] = [...memoryFacts];
      let hasMemoryUpdates = false;
      let match;
      
      const parseModelText = (contentStr: string) => {
        let str = contentStr;
        while ((match = deleteRegex.exec(str)) !== null) {
          const idx = parseInt(match[1]);
          if (newMemories[idx] !== undefined) {
            newMemories[idx] = "@@DELETE@@";
            hasMemoryUpdates = true;
          }
        }
        str = str.replace(deleteRegex, '');

        while ((match = updateRegex.exec(str)) !== null) {
          const idx = parseInt(match[1]);
          if (newMemories[idx] !== undefined) {
            newMemories[idx] = match[2].trim();
            hasMemoryUpdates = true;
          }
        }
        str = str.replace(updateRegex, '');

        while ((match = memoryRegex.exec(str)) !== null) {
          newMemories.push(match[1].trim());
          hasMemoryUpdates = true;
        }
        str = str.replace(memoryRegex, '').trim();

        return str;
      };

      const finalCleanText = parseModelText(fullText);
      const finalDuration = (performance.now() - startTime) / 1000;

      if (hasMemoryUpdates) {
        newMemories = newMemories.filter(m => m !== "@@DELETE@@");
        setMemoryFacts(newMemories);
        fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newMemories) });
      }

      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          return {
            ...c,
            messages: c.messages.map(m => 
              m.id === currentAiMsgId ? { ...m, text: finalCleanText, duration: finalDuration } : m
            )
          };
        }
        return c;
      }));

      if (isFirstMessage) {
        generateGeminiContent(
          `Com base na mensagem a seguir, gere um nome de título estritamente curto (entre 1 a 4 palavras no máximo) para identificar a conversa. Responda APENAS com o texto cru do título, sem aspas, sem negrito, e sem conversa fiada:\n\nMensagem: "${userText}"`,
          model,
          [],
          ""
        ).then(titleRes => {
          if (titleRes.text) {
            const cleanTitle = titleRes.text.replace(/["'*]/g, '').trim();
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
      
      const errorLabel = replaceId ? 'Regeneração Falhou' : 'Falha de API';
      const errorMsg: Message = { id: (Date.now() + 2).toString() + '-e', role: 'ai', text: `**[${errorLabel}]:** ${error.message}` };
      setChats(prevChats => {
        let currentChats = [...prevChats];
        let chatIndex = currentChats.findIndex(c => c.id === targetChatId);
        if (chatIndex !== -1) {
          const updatedChat = { ...currentChats[chatIndex] };
          if (replaceId) {
            updatedChat.messages = updatedChat.messages.map(m => m.id === replaceId ? errorMsg : m);
          } else {
            updatedChat.messages = [...updatedChat.messages, errorMsg];
          }
          if (updatedChat.isNaming) {
            updatedChat.isNaming = false;
            updatedChat.title = "Comunicação Interrompida";
          }
          currentChats[chatIndex] = updatedChat;
        }
        return currentChats;
      });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const executeImageRequest = async (targetChatId: string, userText: string) => {
    const currentUsage = dailyUsage.models[imagenModel]?.requests || 0;
    const limit = MODEL_LIMITS[imagenModel]?.rpd || 25;

    if (currentUsage >= limit) {
      alert(`Limite diário atingido para o modelo ${MODEL_LIMITS[imagenModel]?.name}. (Limite: ${limit})`);
      return;
    }

    setIsLoading(true);
    const startTime = performance.now();
    const currentAiMsgId = (Date.now() + 1).toString() + '-ai';

    // Show generating placeholder
    setChats(prev => prev.map(c => {
      if (c.id === targetChatId) {
        const freshMsg: Message = { id: currentAiMsgId, role: 'ai', text: 'Gerando imagem...', thoughts: '', duration: 0 };
        return { ...c, messages: [...c.messages, freshMsg] };
      }
      return c;
    }));
    
    setTimeout(() => scrollToBottom(true), 50);

    try {
      const result = await generateImagenContent(userText, imagenModel, aspectRatio);
      const duration = (performance.now() - startTime) / 1000;

      // Update message with image data
      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          return {
            ...c,
            messages: c.messages.map(m => 
              m.id === currentAiMsgId ? { 
                ...m, 
                text: '', 
                files: [{ name: `generated-${Date.now()}.png`, data: result.data, mimeType: result.mimeType }],
                duration: duration 
              } : m
            )
          };
        }
        return c;
      }));

      // Update Analytics
      setDailyUsage(prev => {
        const today = getPacificDate();
        const updated = {
          ...prev,
          date: today,
          models: {
            ...prev.models,
            [imagenModel]: {
              requests: (prev.models[imagenModel]?.requests || 0) + 1,
              tokens: prev.models[imagenModel]?.tokens || { prompt: 0, candidates: 0, total: 0 }
            }
          }
        };
        localStorage.setItem('gemini_advanced_usage_v1', JSON.stringify(updated));
        return updated;
      });

    } catch (err: any) {
      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          return {
            ...c,
            messages: c.messages.map(m => 
              m.id === currentAiMsgId ? { ...m, text: `❌ **Erro na geração:** ${err.message}` } : m
            )
          };
        }
        return c;
      }));
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollToBottom(true), 50);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && pendingFiles.length === 0) || isLoading) return;

    const userText = input.trim();
    const filesToSend = [...pendingFiles];
    setInput('');
    setPendingFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const newUserMsg: Message = { id: Date.now().toString() + '-u', role: 'user', text: userText, files: filesToSend };
    
    let targetChatId = activeChatId;
    const chatExists = chats.some(c => c.id === targetChatId);
    
    if (!chatExists) {
      targetChatId = Date.now().toString() + '-c';
      setActiveChatId(targetChatId);
    }
    
    let isFirstMessage = false;

    setChats(prevChats => {
      let currentChats = [...prevChats];
      let chatIndex = currentChats.findIndex(c => c.id === targetChatId);
      
      if (chatIndex === -1) {
        isFirstMessage = true;
        const newChat: ChatSession = { id: targetChatId, title: 'Conectando...', messages: [newUserMsg], isNaming: true };
        currentChats = [newChat, ...currentChats];
      } else {
        const updatedChat = { ...currentChats[chatIndex] };
        if (updatedChat.messages.length === 0) {
           isFirstMessage = true;
           updatedChat.title = 'Conectando...';
           updatedChat.isNaming = true;
        }
        updatedChat.messages = [...updatedChat.messages, newUserMsg];
        currentChats[chatIndex] = updatedChat;
      }
      return currentChats;
    });

    const activeChatTemp = chats.find(c => c.id === activeChatId);
    const msgsTemp = activeChatTemp ? [...activeChatTemp.messages, newUserMsg] : [newUserMsg];
    
    // Reset visible count when a new message is sent
    setVisibleMessagesCount(15);

    const apiHistory = msgsTemp.map(m => {
      const parts: any[] = [];
      if (m.files) {
        m.files.forEach(f => {
           parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
        });
      }
      if (m.text) parts.push({ text: m.text });
      return {
        role: m.role === 'ai' ? 'model' : 'user',
        parts: parts
      };
    });
    
    apiHistory.pop();
    if (imageGenEnabled) {
      executeImageRequest(targetChatId, userText);
    } else {
      executeAIRequest(targetChatId, userText, filesToSend, apiHistory, isFirstMessage);
    }
  };

  const handleRegenerate = (chatId: string, aiMsgId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat || isLoading) return;

    const aiMsgIndex = chat.messages.findIndex(m => m.id === aiMsgId);
    if (aiMsgIndex === -1 || aiMsgIndex === 0) return;

    const userMsg = chat.messages[aiMsgIndex - 1];
    if (userMsg.role !== 'user') return;

    // Clear UI immediately
    setChats(prev => prev.map(c => {
      if (c.id === chatId) {
        const updatedMsgs = [...c.messages];
        updatedMsgs[aiMsgIndex] = { ...updatedMsgs[aiMsgIndex], text: '', thoughts: '' };
        return { ...c, messages: updatedMsgs };
      }
      return c;
    }));

    // Force scroll as we start regeneration
    setTimeout(() => scrollToBottom(true), 50);

    // Build history up to that point
    const historyBefore = chat.messages.slice(0, aiMsgIndex - 1);
    const apiHistory = historyBefore.map(m => {
      const parts: any[] = [];
      if (m.files) {
        m.files.forEach(f => {
           parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
        });
      }
      if (m.text) parts.push({ text: m.text });
      return {
        role: m.role === 'ai' ? 'model' : 'user',
        parts: parts
      };
    });

    executeAIRequest(chatId, userMsg.text, userMsg.files || [], apiHistory, false, aiMsgId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // UI Render helper
  const renderChatItem = (chat: ChatSession) => {
    const isActive = activeChatId === chat.id;
    return (
      <div 
        key={chat.id} 
        onClick={() => setActiveChatId(chat.id)}
        className={`group relative py-2.0 pl-4 pr-3 mb-0.5 rounded-full cursor-pointer transition text-[13.5px] flex items-center justify-between ${isActive ? 'bg-[var(--bg-nav-active)] text-[var(--text-nav-active)] font-medium' : 'hover:bg-[var(--bg-chat-hover)] text-[var(--text-primary)] font-normal'}`}
      >
        <div className="flex-1 truncate flex items-center pr-2">
          {editingChatId === chat.id ? (
            <input 
              type="text" 
              autoFocus
              className="bg-[var(--bg-sidebar)] rounded border border-indigo-500/50 outline-none w-full text-[var(--text-primary)] placeholder-gray-500 py-1 px-2 text-sm"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={() => saveRename(chat.id)}
              onKeyDown={e => e.key === 'Enter' && saveRename(chat.id)}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            chat.isNaming ? (
               <div className="flex items-center gap-2 w-full text-indigo-400">
                 <div className="w-3.5 h-3.5 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin shrink-0"></div>
                 <span className="truncate text-xs font-medium tracking-wide">Compreendendo...</span>
               </div>
            ) : (
               <span className="truncate">{chat.title}</span>
            )
          )}
        </div>
        
        <div className="flex items-center gap-1 shrink-0">
          {chat.pinned && <Pin className={`w-3.5 h-3.5 ${isActive ? 'opacity-100' : 'opacity-50'}`} style={{ transform: 'rotate(45deg)' }} />}
          
          {/* Menu Toggle */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === chat.id ? null : chat.id); }}
            className="px-1.5 py-1 hover:bg-[var(--bg-user-bubble)] rounded transition text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <div className="w-4 flex items-center justify-center font-bold tracking-widest text-[16px]">⋮</div>
          </button>
          
          {menuOpenId === chat.id && (
            <div className="absolute right-6 top-6 bg-[var(--bg-sidebar)] shadow-2xl rounded-lg py-1 z-50 min-w-32 flex flex-col text-xs text-[var(--text-primary)]">
              <button className="flex items-center gap-2 text-left px-4 py-2 hover:bg-[var(--bg-user-bubble)] w-full" onClick={(e) => handleTogglePin(e, chat.id)}>
                {chat.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                {chat.pinned ? 'Desfixar' : 'Fixar'}
              </button>
              <button className="flex items-center gap-2 text-left px-4 py-2 hover:bg-[var(--bg-user-bubble)] w-full" onClick={(e) => startRename(e, chat.id, chat.title)}>
                <Edit2 className="w-4 h-4" /> Renomear
              </button>
              <button className="flex items-center gap-2 text-left px-4 py-2 hover:bg-[var(--bg-user-bubble)] w-full" onClick={(e) => handleToggleArchive(e, chat.id)}>
                {chat.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />} 
                {chat.archived ? 'Desarquivar' : 'Arquivar'}
              </button>
              <button className="flex items-center gap-2 text-left px-4 py-2 hover:bg-red-500/20 text-red-400 w-full border-t border-[var(--border-main)] mt-1 pt-2" onClick={(e) => handleDeleteChat(e, chat.id)}>
                <Trash2 className="w-4 h-4" /> Excluir
              </button>
            </div>
          )}
          </div>
        </div>
      </div>
    );
  };

  const pinnedChats = chats.filter(c => c.pinned && !c.archived);
  const recentChats = chats.filter(c => !c.pinned && !c.archived);
  const archivedChats = chats.filter(c => c.archived);

  return (
    <div className="flex h-screen overflow-hidden text-[var(--text-primary)]">
      <aside className="sidebar hidden md:flex flex-col p-4">
        <div className="p-2 mb-6 cursor-pointer hover:bg-[var(--bg-chat-active)] w-fit rounded-full transition">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11.9961 24C12.3961 17.6 17.6039 12.4 24 12.0039C17.6039 11.6039 12.3961 6.4 11.9961 0C11.5961 6.4 6.39609 11.6039 0 12.0039C6.39609 12.4 11.5961 17.6 11.9961 24Z" fill="url(#paint0_linear_1532_38)"/>
            <defs>
            <linearGradient id="paint0_linear_1532_38" x1="12" y1="0" x2="12" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4285F4"/><stop offset="0.5" stopColor="#9B72CB"/><stop offset="1" stopColor="#D96570"/>
            </linearGradient>
            </defs>
          </svg>
        </div>
        
        <button 
          onClick={createNewChat}
          className="flex items-center justify-center gap-3 bg-[var(--bg-chat-hover)] hover:bg-[var(--bg-user-bubble)] px-5 py-3 rounded-full text-sm font-medium transition mb-4 w-full shadow-sm text-[var(--text-primary)]"
        >
          <Plus className="w-5 h-5 ml-[-10px]" /> Nova conversa
        </button>
        
        <div className="flex-1 overflow-y-auto mt-2 space-y-4 pr-1">
          {pinnedChats.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-[var(--text-placeholder)] mb-2 px-2 uppercase tracking-wide">Fixados</div>
              <div className="space-y-0.5">{pinnedChats.map(renderChatItem)}</div>
            </div>
          )}
          
          {recentChats.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-[var(--text-placeholder)] mb-2 px-2 uppercase tracking-wide">Recentes</div>
              <div className="space-y-0.5">{recentChats.map(renderChatItem)}</div>
            </div>
          )}

          {archivedChats.length > 0 && (
            <div className="pt-4 border-t border-[var(--border-main)]">
              <button 
                onClick={() => setShowArchived(!showArchived)}
                className="flex items-center text-[10px] w-full text-left font-bold text-[var(--text-placeholder)] mb-1 px-2 uppercase tracking-wide hover:text-[var(--text-primary)] transition"
              >
                {showArchived ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />} 
                Arquivados ({archivedChats.length})
              </button>
              {showArchived && (
                <div className="space-y-0.5 mt-2">{archivedChats.map(renderChatItem)}</div>
              )}
            </div>
          )}
        </div>
        
        <div className="mt-4 pt-4 border-t border-[var(--border-main)]">
          <button 
            onClick={() => { setShowSettingsMenu(!showSettingsMenu); setSettingsView('main'); }}
            className="flex items-center justify-between w-full px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-chat-hover)] rounded-xl transition"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              <span>Configurações e ajuda</span>
            </div>
            {showSettingsMenu ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          
          {showSettingsMenu && (
            <div className="flex flex-col gap-1 mt-2 px-1">
              {settingsView === 'main' ? (
                <>
                  <button onClick={() => { setShowAnalytics(true); setShowSettingsMenu(false); }} className="text-left px-4 py-2 text-xs rounded-lg transition-colors text-[var(--text-placeholder)] hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)]">
                    Local Analytics
                  </button>
                  <button onClick={() => { setShowDnaModal(true); setShowSettingsMenu(false); }} className="text-left px-4 py-2 text-xs rounded-lg transition-colors text-[var(--text-placeholder)] hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)] relative">
                    DNA Cognitivo
                    <span className="absolute right-3 top-2 text-[9px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded">{memoryFacts.length}</span>
                  </button>
                  <button onClick={() => setSettingsView('advanced_models')} className="text-left flex justify-between items-center px-4 py-2 text-xs rounded-lg transition-colors text-[var(--text-placeholder)] hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)]">
                    <span>Modelos Avançados</span>
                    <Globe className="w-3 h-3 opacity-40" />
                  </button>
                  <button onClick={() => setSettingsView('theme')} className="text-left flex justify-between items-center px-4 py-2 text-xs rounded-lg transition-colors text-[var(--text-placeholder)] hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)]">
                    <span>Tema visual</span>
                    <span className="text-[9px] uppercase tracking-wider font-bold">{theme}</span>
                  </button>
                </>
              ) : settingsView === 'theme' ? (
                <>
                  <button onClick={() => setSettingsView('main')} className="text-left px-4 py-1 flex items-center gap-1 text-[10px] text-[var(--text-placeholder)] hover:text-[var(--text-primary)] opacity-70 mb-1">
                    <ChevronDown className="w-3 h-3 rotate-90" /> Voltar
                  </button>
                  {['claro', 'escuro', 'areia', 'galaxia'].map(t => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`text-left px-4 py-2 text-[11px] uppercase tracking-wider font-bold rounded-lg transition-colors ${theme === t ? 'bg-[var(--bg-nav-active)] text-[var(--text-nav-active)]' : 'text-[var(--text-placeholder)] hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)]'}`}
                    >
                      {t}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <button onClick={() => setSettingsView('main')} className="text-left px-4 py-1 flex items-center gap-1 text-[10px] text-[var(--text-placeholder)] hover:text-[var(--text-primary)] opacity-70 mb-1">
                    <ChevronDown className="w-3 h-3 rotate-90" /> Voltar
                  </button>
                  <div className="px-4 py-1 text-[9px] text-[var(--text-placeholder)] uppercase font-bold tracking-widest mb-1">Opcionais</div>
                  {MODEL_OPTIONS.filter(m => m.isOptional).map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => { setModel(opt.id); setShowSettingsMenu(false); }}
                      className={`text-left px-4 py-2.5 text-[11px] rounded-lg transition-colors flex flex-col gap-0.5 ${model === opt.id ? 'bg-[var(--bg-nav-active)] text-[var(--text-nav-active)]' : 'text-[var(--text-placeholder)] hover:bg-[var(--bg-chat-hover)] hover:text-[var(--text-primary)]'}`}
                    >
                      <div className="flex items-center justify-between pointer-events-none">
                        <span className="font-bold uppercase tracking-wider">{opt.name}</span>
                        {opt.hasSearch && <Globe className="w-3.5 h-3.5 opacity-70 text-blue-400" />}
                      </div>
                      <span className="text-[9px] opacity-60 leading-tight">{opt.desc}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="main-content flex flex-col h-full w-full">
        <header className="p-4 flex justify-between items-center px-4 md:px-8 border-b border-[var(--border-light)]">
          <div className="text-xl font-medium flex items-center gap-2">
            Gemoro
          </div>
          <div className="flex items-center gap-4">
            {/* Header controls relocated to sidebar settings */}
          </div>
        </header>

        {/* AI Generation LED strip */}
        {isLoading && (
          <div className="ai-led-strip" />
        )}
        <section 
          ref={chatWindowRef} 
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-24 xl:px-48 py-8 space-y-10"
        >
          {messages.length === 0 && !isLoading ? (
            <div className="h-full flex flex-col justify-center items-center text-center mt-20">
              <h2 className="text-5xl font-medium mb-6 gemini-gradient">Olá, Conselheiro</h2>
              <p className="text-[var(--text-placeholder)] text-xl font-light">Como posso ajudar você hoje?</p>
            </div>
          ) : (
            <>
              {visibleMessagesCount < messages.length && (
                <div className="flex justify-center py-4 opacity-50 mb-4 transition-opacity">
                  <Loader2 className="w-5 h-5 text-[var(--text-secondary)] animate-spin" />
                </div>
              )}
              {messages.slice(-visibleMessagesCount).map((msg, idx) => {
                const isEditing = editingMsgId === msg.id;
                
                // Logic for context indicator:
                const originalIdx = messages.findIndex(m => m.id === msg.id);
                const generatingIdx = messages.findIndex(m => m.role === 'ai' && !m.text && isLoading);
                const isContext = generatingIdx === -1 ? true : originalIdx < generatingIdx;

                return (
                  <div key={msg.id} className={`group/msg relative flex flex-col w-full mb-8 ${msg.role === 'ai' ? '' : 'items-end'} transition-all duration-300`}>
                    {/* Context Indicator Line */}
                    {isContext && (
                      <div className="absolute -left-4 top-0 bottom-0 border-l-2 border-indigo-500/50 opacity-0 group-hover/msg:opacity-100 transition-opacity" title="Parte do contexto ativo"></div>
                    )}

                    {msg.role === 'ai' ? (
                      <div className="ai-msg w-full">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-8 h-8 flex items-center justify-center relative">
                            {!msg.text && (
                              <div className="gemini-spinner absolute inset-0" />
                            )}
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M11.9961 24C12.3961 17.6 17.6039 12.4 24 12.0039C17.6039 11.6039 12.3961 6.4 11.9961 0C11.5961 6.4 6.39609 11.6039 0 12.0039C6.39609 12.4 11.5961 17.6 11.9961 24Z" fill="url(#geminiGrad)"/>
                              <defs>
                                <linearGradient id="geminiGrad" x1="12" y1="0" x2="12" y2="24" gradientUnits="userSpaceOnUse">
                                  <stop stopColor="#4285F4"/><stop offset="0.5" stopColor="#9B72CB"/><stop offset="1" stopColor="#D96570"/>
                                </linearGradient>
                              </defs>
                            </svg>
                          </div>

                          {/* Web Search Sources Icons */}
                          {(msg.sources && msg.sources.length > 0 || msg.isSearching) && (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-4 duration-500 ml-1">
                              {msg.isSearching && (!msg.sources || msg.sources.length === 0) && (
                                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] font-bold text-amber-500 animate-pulse">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span className="tracking-widest">PESQUISANDO...</span>
                                </div>
                              )}
                              
                              <div className="flex -space-x-1.5 overflow-hidden">
                                {msg.sources?.slice(0, 4).map((src, i) => {
                                  // SMART DOMAIN EXTRACTION
                                  let domain = "";
                                  const isProxy = src.uri.includes('vertexaisearch.cloud.google.com');
                                  
                                  try { 
                                     if (isProxy && src.title) {
                                       // Try to find domain in title (e.g. "G1 - O Portal de Notícias")
                                       const match = src.title.match(/([a-z0-9-]+\.[a-z.]{2,})/i);
                                       if (match) domain = match[1].toLowerCase();
                                       else domain = src.title.split(/[\s-]/)[0].toLowerCase() + ".com"; // heuristic
                                     } else {
                                       const cleanUri = src.uri.replace(/^(https?:\/\/)?(www\.)?/, 'https://');
                                       domain = new URL(cleanUri).hostname;
                                     }
                                  } catch(e) {}

                                  return (
                                    <a 
                                      key={i} 
                                      href={src.uri} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="relative inline-block w-5 h-5 rounded-full border border-[var(--border-light)] bg-white overflow-hidden hover:scale-110 hover:z-10 transition-transform animate-in zoom-in-50 fade-in duration-300 shadow-sm"
                                      title={src.title}
                                      style={{ animationDelay: `${i * 100}ms` }}
                                    >
                                      <img 
                                        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} 
                                        alt="" 
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).src = `https://www.google.com/s2/favicons?domain=google.com&sz=64`;
                                        }}
                                      />
                                    </a>
                                  );
                                })}
                                {msg.sources && msg.sources.length > 4 && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setExpandedSourcesMsgId(expandedSourcesMsgId === msg.id ? null : msg.id); }}
                                    className="relative inline-block w-5 h-5 rounded-full border border-[var(--border-light)] bg-[var(--bg-chat-active)] flex items-center justify-center text-[8px] font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-user-bubble)] transition z-20"
                                  >
                                    +{msg.sources.length - 4}
                                  </button>
                                )}
                              </div>
                              
                              {msg.sources && msg.sources.length > 0 && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setExpandedSourcesMsgId(expandedSourcesMsgId === msg.id ? null : msg.id); }}
                                  className="text-[10px] font-bold text-[var(--text-secondary)] tracking-tight opacity-80 uppercase hover:text-[var(--text-primary)] transition flex items-center gap-1"
                                >
                                  {msg.sources.length} {msg.sources.length === 1 ? 'fonte' : 'fontes'}
                                  <ChevronDown className={`w-2.5 h-2.5 transition-transform ${expandedSourcesMsgId === msg.id ? 'rotate-180' : ''}`} />
                                </button>
                              )}

                              {/* All Sources Popover */}
                              {expandedSourcesMsgId === msg.id && msg.sources && (
                                <div 
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute top-10 left-10 bg-[var(--bg-sidebar)] shadow-2xl rounded-2xl p-3 min-w-[320px] max-w-[400px] z-[60] border border-[var(--border-light)] animate-in fade-in zoom-in-95 duration-200"
                                >
                                  <div className="flex justify-between items-center mb-2 px-1">
                                    <h5 className="text-[10px] font-bold uppercase text-[var(--text-placeholder)] tracking-widest">Todas as Referências</h5>
                                    <button onClick={() => setExpandedSourcesMsgId(null)} className="text-[var(--text-placeholder)] hover:text-white"><X className="w-3.5 h-3.5" /></button>
                                  </div>
                                  <div className="max-h-[250px] overflow-y-auto space-y-1 custom-scrollbar px-1">
                                    {msg.sources.map((src, idx) => {
                                      let d = "";
                                      const isPx = src.uri.includes('vertexaisearch.cloud.google.com');
                                      try { 
                                         if (isPx && src.title) {
                                            const match = src.title.match(/([a-z0-9-]+\.[a-z.]{2,})/i);
                                            d = match ? match[1].toLowerCase() : src.title.split(/[\s-]/)[0].toLowerCase() + ".com";
                                         } else {
                                            const u = src.uri.replace(/^(https?:\/\/)?(www\.)?/, 'https://');
                                            d = new URL(u).hostname;
                                         }
                                      } catch(e) {}
                                      return (
                                        <a 
                                          key={idx} 
                                          href={src.uri} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition group"
                                        >
                                          <img src={`https://www.google.com/s2/favicons?domain=${d}&sz=64`} className="w-4 h-4 rounded-sm shrink-0" alt="" />
                                          <div className="flex flex-col min-w-0">
                                            <span className="text-xs text-[var(--text-primary)] font-medium truncate group-hover:text-blue-400 transition-colors">{src.title || 'Página da Web'}</span>
                                            <span className="text-[9px] text-[var(--text-placeholder)] truncate">{src.uri}</span>
                                          </div>
                                        </a>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {(msg.isGrounded || (msg.sources && msg.sources.length > 0)) && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-[10px] font-bold text-blue-400 animate-in fade-in slide-in-from-left-2 duration-500">
                              <Globe className="w-3 h-3" />
                              PESQUISADO NA WEB
                            </div>
                          )}
                        </div>

                        {/* Collapsible Thinking/Reasoning Drawer */}
                        {msg.thoughts && msg.thoughts.trim() && (
                          <details className="thinking-drawer mb-3 group/think">
                            <summary className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition select-none py-1.5 px-3 rounded-lg hover:bg-[var(--bg-user-bubble)]/50 w-fit">
                              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                              <span className="font-medium">Mostrar Raciocínio</span>
                              <ChevronRight className="w-3 h-3 transition-transform group-open/think:rotate-90" />
                            </summary>
                            <div className="thought-content mt-2 pl-3 border-l-2 border-amber-500/30 text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                              {msg.thoughts}
                            </div>
                          </details>
                        )}
                        
                        {msg.text.includes('❌ **Erro:**') ? (
                           <div className="flex items-center gap-2 text-red-400 bg-red-900/20 p-4 border border-red-500/30 rounded-lg text-sm">
                             <AlertCircle className="w-5 h-5 shrink-0" />
                             <div dangerouslySetInnerHTML={{ __html: safeMarkdown(msg.text.replace('❌', '').trim()) }} />
                           </div>
                        ) : msg.text ? (
                          <div 
                            className="response-body text-[var(--text-primary)] antialiased min-h-[1.5em]"
                            dangerouslySetInnerHTML={{ __html: safeMarkdown(msg.text) }}
                          />
                        ) : null}

                        {msg.files && msg.files.length > 0 && (
                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {msg.files.map((file, i) => (
                              <div key={i} className="relative group/img rounded-2xl overflow-hidden shadow-2xl border border-[var(--border-light)] bg-black/20">
                                <img 
                                  src={`data:${file.mimeType};base64,${file.data}`} 
                                  className="w-full h-auto object-contain block max-h-[500px]"
                                  alt="Imagem Gerada"
                                />
                                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity flex justify-between items-center">
                                  <span className="text-[10px] text-white/70 font-medium">IMAGE GEN · {MODEL_LIMITS[imagenModel]?.name}</span>
                                  <button 
                                    onClick={() => {
                                      const link = document.createElement('a');
                                      link.href = `data:${file.mimeType};base64,${file.data}`;
                                      link.download = file.name;
                                      link.click();
                                    }}
                                    className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors backdrop-blur-sm"
                                    title="Baixar imagem"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-4 mt-3 opacity-0 group-hover/msg:opacity-100 transition-opacity translate-y-1 group-hover/msg:translate-y-0 duration-300">
                           <button 
                             onClick={() => activeChatId && handleRegenerate(activeChatId, msg.id)}
                             disabled={isLoading}
                             className="text-[var(--text-placeholder)] hover:text-[var(--text-primary)] transition"
                             title="Tentar novamente"
                           >
                             <RotateCcw className={`w-4 h-4 ${isLoading && !msg.text ? 'animate-spin' : ''}`} />
                           </button>
                           
                           <button 
                             onClick={() => copyToClipboard(msg.text, msg.id + '-copy')}
                             className="text-[var(--text-placeholder)] hover:text-[var(--text-primary)] transition"
                             title="Copiar texto simples"
                           >
                             {copiedId === msg.id + '-copy' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                           </button>

                           <button 
                             onClick={() => copyToClipboard(`\`\`\`markdown\n${msg.text}\n\`\`\``, msg.id + '-md')}
                             className="text-[var(--text-placeholder)] hover:text-[var(--text-primary)] transition"
                             title="Copiar em Markdown"
                           >
                             {copiedId === msg.id + '-md' ? <Check className="w-4 h-4 text-green-500" /> : <FileText className="w-4 h-4" />}
                           </button>

                           <button 
                             onClick={() => activeChatId && handleDeleteMessage(activeChatId, msg.id)}
                             disabled={isLoading}
                             className="text-[var(--text-placeholder)] hover:text-red-400 transition"
                             title="Deletar mensagem"
                           >
                             <Trash2 className="w-3.5 h-3.5" />
                           </button>

                           {msg.duration !== undefined && (
                             <span className="text-[10px] font-normal text-[var(--text-placeholder)] opacity-60 ml-auto">
                               {msg.duration.toFixed(1)}s
                             </span>
                           )}
                        </div>
                      </div>
                    ) : (
                       <div className="flex flex-col items-end max-w-[85%]">
                         {msg.files && msg.files.length > 0 && (
                           <div className="flex gap-2 mb-2 flex-wrap justify-end">
                             {msg.files.map((f, i) => (
                               <div key={i} className="w-24 h-24 rounded-lg bg-[var(--bg-chat-active)] overflow-hidden border border-[var(--border-main)] opacity-90 relative group">
                                 {f.mimeType.startsWith('image/') ? (
                                   <img src={`data:${f.mimeType};base64,${f.data}`} className="object-cover w-full h-full" alt="upload" />
                                 ) : (
                                   <div className="flex flex-col items-center justify-center w-full h-full text-[10px] break-words p-2 text-center text-[var(--text-secondary)] bg-[var(--bg-sidebar)]">
                                     <FileText className="w-6 h-6 mb-2 text-indigo-400 opacity-80" />
                                     <span className="truncate w-full">{f.name}</span>
                                   </div>
                                 )}
                               </div>
                             ))}
                           </div>
                         )}
                         
                         {isEditing ? (
                           <div className="w-full flex flex-col gap-2 bg-[var(--bg-sidebar)] p-4 rounded-3xl border border-indigo-500/50 shadow-2xl">
                             <textarea
                               autoFocus
                               className="w-full bg-transparent border-none outline-none text-[var(--text-primary)] resize-none"
                               rows={3}
                               value={editingMsgText}
                               onChange={(e) => setEditingMsgText(e.target.value)}
                             />
                             <div className="flex justify-end gap-2">
                               <button onClick={() => setEditingMsgId(null)} className="px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">Cancelar</button>
                               <button onClick={() => activeChatId && handleSaveEdit(activeChatId, msg.id)} className="px-4 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-full hover:bg-indigo-500 transition shadow-lg">Salvar e Enviar</button>
                             </div>
                           </div>
                         ) : (
                           <div className="relative group/user bubble-container">
                             <div className="user-msg text-[var(--text-primary)] shadow-lg px-5 py-3 bg-[var(--bg-user-bubble)] rounded-3xl rounded-tr-sm">{msg.text}</div>
                             
                             <div className="flex items-center gap-3 mt-2 justify-end opacity-0 group-hover/user:opacity-100 transition-opacity">
                               <button 
                                 onClick={() => handleEditPrompt(msg.id, msg.text)}
                                 className="text-[var(--text-placeholder)] hover:text-[var(--text-primary)] transition"
                                 title="Editar prompt"
                               >
                                 <Edit2 className="w-3.5 h-3.5" />
                               </button>
                               <button 
                                 onClick={() => copyToClipboard(msg.text, msg.id)}
                                 className="text-[var(--text-placeholder)] hover:text-[var(--text-primary)] transition"
                                 title="Copiar prompt"
                               >
                                 {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                               </button>
                               <button 
                                 onClick={() => activeChatId && handleDeleteMessage(activeChatId, msg.id)}
                                 disabled={isLoading}
                                 className="text-[var(--text-placeholder)] hover:text-red-400 transition"
                                 title="Deletar mensagem"
                               >
                                 <Trash2 className="w-3.5 h-3.5" />
                               </button>
                             </div>
                           </div>
                         )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </section>

        <footer className="p-4 md:px-8 lg:px-24 xl:px-48 pb-8 bg-gradient-to-t from-[var(--bg-main)] via-[var(--bg-main)] to-transparent">
          <div className="max-w-5xl mx-auto">
            {pendingFiles.length > 0 && (
              <div className="flex gap-2 mb-2 px-2 flex-wrap">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl bg-[var(--bg-chat-active)] overflow-hidden border border-[var(--border-light)] shadow-lg group">
                    {f.mimeType.startsWith('image/') ? (
                      <img src={`data:${f.mimeType};base64,${f.data}`} className="object-cover w-full h-full" alt="pendente" />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-[9px] p-1 text-center bg-[var(--bg-sidebar)] text-[var(--text-secondary)]">
                        <FileText className="w-4 h-4 mb-1 text-indigo-400" />
                        <span className="truncate w-full">{f.name}</span>
                      </div>
                    )}
                    <button onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-black/60 rounded-bl-lg w-5 h-5 flex items-center justify-center hover:bg-black transition text-[var(--text-primary)]">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="input-wrapper p-3 shadow-2xl relative bg-[var(--bg-sidebar)] rounded-2xl border border-[var(--border-light)]">
              {showScrollButton && (
                <button 
                  onClick={() => scrollToBottom(true)}
                  className="absolute -top-14 left-1/2 -translate-x-1/2 bg-[var(--bg-sidebar)] hover:bg-[var(--bg-chat-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)] shadow-xl rounded-full px-5 py-1.5 text-xs font-semibold flex items-center gap-2 transition-all z-50 scroll-to-bottom-btn animate-scroll-button whitespace-nowrap"
                >
                   <ChevronDown className="w-4 h-4" />
                  Ir para o final
                </button>
              )}
              <textarea 
                ref={textareaRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                rows={1} 
                placeholder="Pergunte ao Gemoro..." 
                className="w-full bg-transparent border-none px-4 pt-2 pb-1 focus:outline-none resize-none text-[16px] text-[var(--text-primary)] placeholder-gray-500 overflow-hidden"
              />
              
              <div className="flex justify-between items-center px-2 mt-2">
                <div className="flex gap-1 text-[var(--text-secondary)] items-center">
                  <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,application/pdf" onChange={handleFileUpload} />
                  <button 
                    onClick={() => fileInputRef.current?.click()} 
                    className="w-10 h-10 flex items-center justify-center hover:bg-[var(--bg-user-bubble)]/50 hover:text-[var(--text-primary)] rounded-full transition font-light"
                    title="Anexar arquivo"
                  >
                    <Plus className="w-5 h-5" />
                  </button>

                  <button 
                    onClick={() => setWebSearchEnabled(!webSearchEnabled)} 
                    disabled={!canSearch}
                    className={`w-10 h-10 flex items-center justify-center rounded-full transition relative ${webSearchEnabled ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-[var(--bg-user-bubble)]/50 text-[var(--text-placeholder)]'} disabled:opacity-20 disabled:grayscale`}
                    title={canSearch ? "Pesquisa na Web" : "Modelo não suporta pesquisa"}
                  >
                    <Globe className="w-5 h-5" />
                    {webSearchEnabled && <span className="absolute top-2 right-2 w-2 h-2 bg-blue-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.8)]"></span>}
                  </button>

                  <button 
                    onClick={() => setThinkingEnabled(!thinkingEnabled)} 
                    className={`w-10 h-10 flex items-center justify-center rounded-full transition relative ${thinkingEnabled ? 'bg-amber-500/20 text-amber-400' : 'hover:bg-[var(--bg-user-bubble)]/50 text-[var(--text-placeholder)]'}`}
                    title="Pensamento (a IA raciocina antes de responder)"
                  >
                    <Lightbulb className="w-5 h-5" />
                    {thinkingEnabled && <span className="absolute top-2 right-2 w-2 h-2 bg-amber-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]"></span>}
                  </button>

                  <div className="relative">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setImageGenEnabled(!imageGenEnabled);
                        if (!imageGenEnabled) setShowImagenSettings(true);
                      }} 
                      className={`w-10 h-10 flex items-center justify-center rounded-full transition relative ${imageGenEnabled ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-[var(--bg-user-bubble)]/50 text-[var(--text-placeholder)]'}`}
                      title="Geração de Imagem (Imagen 4)"
                    >
                      <Image className="w-5 h-5" />
                      {imageGenEnabled && <span className="absolute top-2 right-2 w-2 h-2 bg-purple-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(168,85,247,0.8)]"></span>}
                    </button>

                    {imageGenEnabled && showImagenSettings && (
                      <div 
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-full mb-3 left-0 bg-[var(--bg-sidebar)] shadow-2xl rounded-2xl p-4 min-w-[280px] z-50 animate-in fade-in slide-in-from-bottom-2 duration-300"
                      >
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Imagen 4 Config</h4>
                          <button onClick={() => setShowImagenSettings(false)} className="text-[var(--text-placeholder)] hover:text-white"><X className="w-4 h-4" /></button>
                        </div>
                        
                        <div className="space-y-4">
                          <div>
                            <label className="text-[10px] uppercase font-bold text-[var(--text-placeholder)] mb-2 block">Modelo</label>
                            <div className="grid gap-2">
                              {IMAGEN_OPTIONS.map(opt => (
                                <button
                                  key={opt.id}
                                  onClick={() => setImagenModel(opt.id)}
                                  className={`text-left p-2 rounded-xl border transition text-sm ${imagenModel === opt.id ? 'bg-purple-500/10 border-purple-500/50 text-purple-200' : 'bg-black/20 border-transparent hover:border-white/10'}`}
                                >
                                  <div className="font-medium text-xs">{opt.name}</div>
                                  <div className="text-[10px] opacity-60 truncate">{opt.desc}</div>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="text-[10px] uppercase font-bold text-[var(--text-placeholder)] mb-2 block">Proporção (Aspect Ratio)</label>
                            <div className="flex gap-2">
                              {(['1:1', '9:16', '16:9'] as const).map(ratio => (
                                <button
                                  key={ratio}
                                  onClick={() => setAspectRatio(ratio)}
                                  className={`flex-1 py-2 rounded-lg border text-[10px] font-bold transition ${aspectRatio === ratio ? 'bg-purple-500/20 border-purple-500 text-purple-300' : 'bg-black/20 border-transparent hover:border-white/10'}`}
                                >
                                  {ratio === '1:1' ? 'QUADRADO' : ratio === '9:16' ? 'RETRATO' : 'PAISAGEM'}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setIsModelMenuOpen(!isModelMenuOpen); }}
                      className="flex items-center gap-1.5 bg-[var(--bg-chat-hover)] hover:bg-[var(--bg-user-bubble)] text-xs text-[var(--text-primary)] transition rounded-xl px-4 py-2.5 font-medium border border-[var(--border-light)] shadow-sm"
                    >
                      {MODEL_OPTIONS.find(o => o.id === model)?.name || 'Padrão'} 
                      {MODEL_OPTIONS.find(o => o.id === model)?.isOptional && <span className="text-[9px] opacity-60 ml-1.5 uppercase font-bold tracking-tighter">(Opcional)</span>}
                      <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-60" />
                    </button>
                    
                    {isModelMenuOpen && (
                      <div className="absolute bottom-[115%] right-0 bg-[var(--bg-sidebar)] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] rounded-2xl py-2 min-w-64 z-50 overflow-hidden flex flex-col items-start text-left origin-bottom-right animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-5 py-3 text-[13px] font-medium text-[var(--text-secondary)] w-full mb-1">
                          Modelos principais
                        </div>
                        {MODEL_OPTIONS.filter(opt => !opt.isOptional || opt.id === model).map(opt => (
                          <button 
                            key={opt.id}
                            onClick={() => { setModel(opt.id); setIsModelMenuOpen(false); }}
                            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/5 transition text-left group"
                          >
                            <div className="flex flex-col gap-1 pointer-events-none pr-8 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-medium text-[var(--text-primary)] group-hover:text-[var(--text-primary)] leading-none">{opt.name}</span>
                                {opt.isOptional && <span className="text-[9px] text-[var(--text-placeholder)] uppercase font-bold tracking-tighter">Opcional</span>}
                                {opt.hasSearch && <Globe className="w-3.5 h-3.5 opacity-40 text-blue-400 group-hover:opacity-100 transition-opacity" />}
                              </div>
                              <span className="text-[11px] text-[var(--text-placeholder)] leading-tight">{opt.desc}</span>
                            </div>
                            {model === opt.id && (
                              <svg className="w-[18px] h-[18px] text-[#A8C7FA] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                <path fillRule="evenodd" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" clipRule="evenodd" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {isLoading ? (
                    <button 
                      onClick={stopGeneration}
                      className="bg-red-500/10 hover:bg-red-500/20 text-red-500 p-2.5 rounded-full transition border border-red-500/20 shadow-md flex items-center justify-center"
                      title="Parar geração"
                    >
                      <Square className="w-4 h-4 fill-current" />
                    </button>
                  ) : (
                    <button 
                      onClick={handleSend}
                      disabled={!input.trim() && pendingFiles.length === 0}
                      className="bg-[#e3e3e3] hover:bg-white text-[var(--bg-main)] p-2.5 rounded-full transition shadow-md disabled:opacity-20 flex items-center justify-center"
                    >
                      <Send className="w-4 h-4 ml-[0.5px] mt-[0.5px]" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </footer>
      </main>

      {/* Analytics Modal */}
      {showAnalytics && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] px-4" onClick={() => setShowAnalytics(false)}>
          <div className="bg-[var(--bg-sidebar)] rounded-[1.5rem] w-full max-w-2xl shadow-2xl overflow-hidden p-6 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowAnalytics(false)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-chat-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-user-bubble)] transition">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-1 gemini-gradient">Analytics & Limites Diários</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">Consumo rastreado localmente referente a: <span className="font-bold text-[var(--text-primary)]">{dailyUsage.date.split('-').reverse().join('/')}</span></p>
            
            <div className="space-y-4">
              {Object.entries(MODEL_LIMITS).map(([mId, limits]) => {
                const usage = dailyUsage.models[mId] || { requests: 0, tokens: { total: 0 } };
                const percentage = Math.min((usage.requests / limits.rpd) * 100, 100);
                const isDanger = percentage > 90;
                const isWarn = percentage > 75 && !isDanger;
                const isImageModel = mId.includes('imagen');
                
                return (
                  <div key={mId} className={`p-4 rounded-xl border ${isImageModel ? 'bg-purple-900/10 border-purple-500/20' : 'bg-[var(--bg-user-bubble)] border-[var(--border-light)]'}`}>
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-medium text-[var(--text-primary)] text-sm flex items-center gap-2">
                        {isImageModel && <Image className="w-3.5 h-3.5 text-purple-400" />}
                        {limits.name} 
                        <span className="text-[10px] text-[var(--text-placeholder)] ml-1 opacity-60">({mId})</span>
                      </span>
                      {!isImageModel && (
                        <span className="text-[10px] font-mono text-[var(--text-secondary)] bg-black/20 px-2 py-1 rounded flex items-center gap-1">
                          <Bot className="w-3.5 h-3.5" /> Tokens: {usage.tokens.total.toLocaleString()}
                        </span>
                      )}
                      {isImageModel && (
                        <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">
                          IMAGE GENERATION
                        </span>
                      )}
                    </div>
                    
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-[var(--text-secondary)]">Uso Diário: <strong className={isDanger ? 'text-red-400' : 'text-[var(--text-primary)]'}>{usage.requests}</strong> / {limits.rpd}</span>
                      <span className={isDanger ? 'text-red-400 font-bold' : isWarn ? 'text-yellow-400' : 'text-[var(--text-placeholder)]'}>{percentage.toFixed(1)}%</span>
                    </div>
                    <div className="flex w-full h-2 bg-black/20 rounded-full overflow-hidden">
                      <div className={`transition-all duration-1000 ${isImageModel ? 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]' : isDanger ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : isWarn ? 'bg-yellow-500' : 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]'}`} style={{ width: `${percentage}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 text-[10px] text-gray-600 italic text-center">
              * O Reset Diário local acompanha o servidor do Google (Meia-noite no Horário do Pacífico), o equivalente a 03h00am / 04h00am no horário de Naviraí - MS.
            </div>
          </div>
        </div>
      )}

      {/* DNA Modal */}
      {showDnaModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] px-4" onClick={() => setShowDnaModal(false)}>
          <div className="bg-[var(--bg-sidebar)] rounded-[1.5rem] w-full max-w-2xl shadow-2xl overflow-hidden p-6 relative flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowDnaModal(false)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-chat-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-user-bubble)] transition z-10">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-1 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-500 flex items-center gap-2">
              DNA Cognitivo
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6 border-b border-[var(--border-main)] pb-4">Fatos e memórias que a Inteligência Artificial decodificou sobre você de forma autônoma e silenciosa.</p>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
              {memoryFacts.length === 0 ? (
                <div className="text-center py-10 text-[var(--text-placeholder)] text-sm">Nenhum fato analisado ainda. Converse mais para a IA extrair contexto da sua vida!</div>
              ) : (
                memoryFacts.map((fact, index) => (
                  <div key={index} className="flex gap-3 bg-[var(--bg-main)] p-3 rounded-xl border border-[var(--border-light)] group">
                    <textarea 
                      className="flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none resize-none leading-relaxed"
                      value={fact}
                      rows={2}
                      onChange={(e) => {
                        const newDna = [...memoryFacts];
                        newDna[index] = e.target.value;
                        setMemoryFacts(newDna);
                      }}
                      onBlur={() => {
                        const newDna = memoryFacts.filter(f => f.trim() !== ''); // auto-remove empties
                        setMemoryFacts(newDna);
                        fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newDna) });
                      }}
                    />
                    <button 
                      className="text-[var(--text-placeholder)] hover:text-red-400 transition h-fit mt-1 opacity-0 group-hover:opacity-100 bg-[var(--bg-sidebar)] p-1.5 rounded"
                      title="Excluir Fato"
                      onClick={() => {
                        const newDna = memoryFacts.filter((_, i) => i !== index);
                        setMemoryFacts(newDna);
                        fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newDna) });
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
            
            <div className="mt-4 pt-4 border-t border-[var(--border-main)]">
              <button 
                onClick={() => { setMemoryFacts(['', ...memoryFacts]) }}
                className="flex items-center justify-center gap-2 w-full py-3.5 bg-[var(--bg-main)] hover:bg-[var(--bg-user-bubble)] text-indigo-400 rounded-xl transition font-medium text-sm text-center border border-[var(--border-light)]"
              >
                <Plus className="w-4 h-4" /> Injetar Novo Fato Manualmente
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
