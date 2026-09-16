import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  SandpackProvider,
  SandpackPreview,
  SandpackCodeEditor,
  SandpackConsole,
  useSandpack,
  useSandpackConsole,
} from '@codesandbox/sandpack-react';
import {
  ArrowLeft,
  Sparkles,
  Send,
  Square,
  RotateCcw,
  Monitor,
  Tablet,
  Smartphone,
  Maximize2,
  Minimize2,
  Trash2,
  Download,
  Edit2,
  Check,
  FileCode,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import NemonIcon from '../NemonIcon';
import { runHarnessCycle, cleanHarnessDisplayText } from '../../services/codeHarness';
import { MODEL_OPTIONS, type CustomModel } from '../../constants';
import { safeMarkdown } from '../../services/gemini';
import { DEFAULT_PROJECT_FILES, type AgentChatMessage, type HarnessAction } from '../../types/codeIde';

// Frases divertidas e dinâmicas no estilo Claude Code / Cursor para o rodapé durante a geração
const HARNESS_BLOPERS = [
  'Codando...',
  'Nemonzando...',
  'Construindo...',
  'Refatorando...',
  'Ajustando os parafusos...',
  'Compilando ideias...',
  'Conectando sinapses...',
  'Polindo a interface...',
  'Consultando os astros...',
  'Arquitetando módulos...',
  'Otimizando lógica...',
  'Sintetizando código...',
  'Acelerando motores...',
  'Formatando layout...',
];

interface CodeIdeViewProps {
  onBackToChat: () => void;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  customModels: CustomModel[];
  theme?: string;
}

// Sincronizador bidirecional entre o Sandpack e o estado do React
const SandpackSyncBridge: React.FC<{
  onFilesChange: (files: Record<string, string>) => void;
  activeFile: string;
}> = ({ onFilesChange, activeFile }) => {
  const { sandpack } = useSandpack();
  const prevFilesRef = useRef<string>('');

  useEffect(() => {
    const rawFiles = sandpack.files;
    const cleanFiles: Record<string, string> = {};
    for (const [path, fileObj] of Object.entries(rawFiles)) {
      const code = typeof fileObj === 'string' ? fileObj : fileObj.code;
      if (path === '/index.js' && code.includes('// Nemon HTML Runner')) continue;
      cleanFiles[path] = code;
    }
    const serialized = JSON.stringify(cleanFiles);
    if (serialized !== prevFilesRef.current) {
      prevFilesRef.current = serialized;
      onFilesChange(cleanFiles);
    }
  }, [sandpack.files, onFilesChange]);

  useEffect(() => {
    if (activeFile && sandpack.activeFile !== activeFile && sandpack.files[activeFile]) {
      sandpack.openFile(activeFile);
    }
  }, [activeFile, sandpack]);

  return null;
};

// Monitora logs e estatísticas em tempo real da aplicação em preview
const SandpackConsoleTracker: React.FC<{
  onStatsChange: React.Dispatch<React.SetStateAction<{ total: number; errors: number; warns: number }>>;
}> = ({ onStatsChange }) => {
  const { logs } = useSandpackConsole({ resetOnPreviewRestart: true, showSyntaxError: true });
  const prevRef = useRef('');

  useEffect(() => {
    const errors = logs.filter(l => l.method === 'error').length;
    const warns = logs.filter(l => l.method === 'warn').length;
    const key = `${logs.length}-${errors}-${warns}`;
    if (key !== prevRef.current) {
      prevRef.current = key;
      onStatsChange({ total: logs.length, errors, warns });
    }
  }, [logs, onStatsChange]);

  return null;
};

// Componente de Pensamento com timer dinâmico, preview auto-scroll e fechamento automático
const ThoughtBlock: React.FC<{
  thoughts: string;
  isGenerating: boolean;
}> = ({ thoughts, isGenerating }) => {
  const [isOpen, setIsOpen] = useState(isGenerating);
  const [elapsed, setElapsed] = useState<number>(0);
  const [finalDuration, setFinalDuration] = useState<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasGeneratingRef = useRef<boolean>(isGenerating);

  // Inicializa o timer quando a geração começa
  useEffect(() => {
    if (isGenerating && !wasGeneratingRef.current) {
      startTimeRef.current = Date.now();
      setIsOpen(true);
      setFinalDuration(null);
    }
    wasGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // Atualiza o tempo em tempo real enquanto estiver gerando
  useEffect(() => {
    if (!isGenerating) {
      if (finalDuration === null && elapsed > 0) {
        setFinalDuration(elapsed);
      }
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const sec = (now - startTimeRef.current) / 1000;
      setElapsed(sec);
    }, 100);

    return () => clearInterval(interval);
  }, [isGenerating, elapsed, finalDuration]);

  // Fecha automaticamente quando a geração de pensamento termina
  useEffect(() => {
    if (!isGenerating && wasGeneratingRef.current) {
      const duration = (Date.now() - startTimeRef.current) / 1000;
      setFinalDuration(duration > 0.1 ? duration : elapsed);
      setIsOpen(false);
    }
  }, [isGenerating, elapsed]);

  // Auto-scroll para baixo conforme novos pensamentos chegam
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thoughts, isOpen]);

  const displayTime = finalDuration !== null ? finalDuration : elapsed;

  return (
    <div className="border border-(--border-light) bg-(--bg-main)/60 rounded-xl overflow-hidden text-xs transition-all duration-200">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full px-3 py-2 cursor-pointer font-medium text-(--text-secondary) hover:text-(--text-primary) flex items-center justify-between select-none transition hover:bg-(--bg-chat-hover)"
      >
        <div className="flex items-center gap-2">
          {isGenerating && (
            <span className="flex items-center gap-1 mr-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" />
            </span>
          )}
          <span className="font-semibold text-zinc-300">
            {isGenerating ? 'Pensando...' : 'Processo de Raciocínio'}
          </span>
          <span className="px-1.5 py-0.5 rounded-md bg-(--bg-sidebar) border border-(--border-light) font-mono text-[10px] text-(--text-secondary)">
            {isGenerating ? `${elapsed.toFixed(1)}s` : `${displayTime.toFixed(1)}s`}
          </span>
        </div>
        <ChevronRight
          className={`w-3.5 h-3.5 text-(--text-placeholder) transition-transform duration-200 ${
            isOpen ? 'rotate-90' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          ref={scrollRef}
          className="p-3 border-t border-(--border-light) font-mono text-[11px] leading-relaxed text-(--text-secondary) whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar bg-black/20"
        >
          {thoughts}
        </div>
      )}
    </div>
  );
};

export const CodeIdeView: React.FC<CodeIdeViewProps> = ({
  onBackToChat,
  selectedModel,
  onSelectModel,
  customModels,
  theme = 'dark',
}) => {
  // Nome do projeto
  const [projectName, setProjectName] = useState<string>(() => {
    return localStorage.getItem('nemon_code_project_name') || 'Meu Aplicativo Web';
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Arquivos do projeto (inicia com DEFAULT_PROJECT_FILES se vazio)
  const [files, setFiles] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('nemon_code_files_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && Object.keys(parsed).length > 0) return parsed;
      } catch {
        /* fallback */
      }
    }
    return DEFAULT_PROJECT_FILES;
  });

  const [activeFile, setActiveFile] = useState<string>(() => {
    const keys = Object.keys(files);
    return keys.includes('/index.html') ? '/index.html' : keys[0] || '/index.html';
  });

  // Modo do Canvas: 'preview' (padrão estilo Google AI Studio), 'code' ou 'logs'
  const [canvasMode, setCanvasMode] = useState<'preview' | 'code' | 'logs'>('preview');

  // Logs e estatísticas do console da aplicação em preview
  const [consoleStats, setConsoleStats] = useState({ total: 0, errors: 0, warns: 0 });
  const [isPreviewConsoleOpen, setIsPreviewConsoleOpen] = useState(false);

  // Modo de Viewport no Preview: 'desktop' (100%), 'tablet' (768px), 'mobile' (375px)
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewKey, setPreviewKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Chat do Agente Harness
  const [messages, setMessages] = useState<AgentChatMessage[]>(() => {
    const saved = localStorage.getItem('nemon_code_agent_history');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        /* fallback */
      }
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  // Largura da coluna esquerda de Chat (redimensionável)
  const [chatWidth, setChatWidth] = useState<number>(() => {
    const saved = localStorage.getItem('nemon_code_chat_width');
    return saved ? Math.max(340, Math.min(800, parseInt(saved, 10))) : 460;
  });
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const dragStartRef = useRef<{ startX: number; startWidth: number }>({ startX: 0, startWidth: 460 });

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [bloperIndex, setBloperIndex] = useState(0);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Salva arquivos no localStorage
  useEffect(() => {
    localStorage.setItem('nemon_code_files_v2', JSON.stringify(files));
  }, [files]);

  // Salva histórico no localStorage
  useEffect(() => {
    localStorage.setItem('nemon_code_agent_history', JSON.stringify(messages));
  }, [messages]);

  // Salva nome do projeto no localStorage
  useEffect(() => {
    localStorage.setItem('nemon_code_project_name', projectName);
  }, [projectName]);

  // Scroll para a última mensagem somente se o usuário não rolou pra cima manualmente
  useEffect(() => {
    if (!isUserScrolledUp && chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading, isUserScrolledUp]);

  // Alterna as frases dos blopers dinâmicos durante a geração
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setBloperIndex(prev => (prev + 1) % HARNESS_BLOPERS.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [isLoading]);

  // Acompanhamento suave e estável da digitação no editor de código (sem flicker ou saltos)
  const lastCodeScrollTimeRef = useRef<number>(0);
  useEffect(() => {
    if (!isLoading || canvasMode !== 'code') return;

    const now = Date.now();
    if (now - lastCodeScrollTimeRef.current < 90) return;
    lastCodeScrollTimeRef.current = now;

    const rafId = requestAnimationFrame(() => {
      const scroller = document.querySelector('.sp-cm .cm-scroller') as HTMLElement | null;
      if (!scroller) return;

      const targetTop = scroller.scrollHeight - scroller.clientHeight;
      // Só rola para baixo se a diferença for relevante (> 8px), eliminando oscilações por caractere
      if (targetTop > 0 && targetTop - scroller.scrollTop > 8) {
        scroller.scrollTop = targetTop;
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [files, isLoading, canvasMode]);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Foco no input de edição de título
  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  // Redimensionamento do divisor entre Chat e Canvas
  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingDivider(true);
    dragStartRef.current = { startX: e.clientX, startWidth: chatWidth };
  };

  useEffect(() => {
    if (!isDraggingDivider) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartRef.current.startX;
      const next = Math.max(340, Math.min(window.innerWidth * 0.65, dragStartRef.current.startWidth + delta));
      setChatWidth(next);
    };

    const handleMouseUp = () => {
      setIsDraggingDivider(false);
      localStorage.setItem('nemon_code_chat_width', chatWidth.toString());
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingDivider, chatWidth]);

  // Detecção automática do template do Sandpack (sem necessidade de escolha manual pelo usuário)
  const detectedTemplate = useMemo((): 'react-ts' | 'react' | 'vanilla' => {
    const fileKeys = Object.keys(files);
    if (fileKeys.some(f => f.endsWith('.tsx'))) return 'react-ts';
    if (fileKeys.some(f => f.endsWith('.jsx'))) return 'react';
    return 'vanilla';
  }, [files]);

  // Prepara os arquivos para o Sandpack (adiciona runner caso seja HTML puro)
  const sandpackFiles = useMemo(() => {
    const result = { ...files };
    if (result['/index.html'] && !result['/package.json']) {
      result['/package.json'] = JSON.stringify(
        {
          name: 'nemon-app',
          main: 'index.html',
          dependencies: {},
        },
        null,
        2
      );
    }
    if (result['/index.html'] && !result['/index.js'] && !result['/src/index.ts'] && !result['/src/index.tsx']) {
      result['/index.js'] = '// Nemon HTML Runner\n';
    }
    return result;
  }, [files]);

  // Envio de mensagem para o Harness
  const handleSend = async (promptToSend?: string) => {
    const text = (promptToSend || input).trim();
    if (!text || isLoading) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const userMsg: AgentChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const assistantMsgId = (Date.now() + 1).toString();
    const initialAssistantMsg: AgentChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      actions: [],
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg, initialAssistantMsg]);
    setIsLoading(true);
    setIsUserScrolledUp(false);
    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }, 50);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const fileOps = {
      getFiles: () => files,
      setFiles: (updater: (prev: Record<string, string>) => Record<string, string>) => {
        setFiles(prev => updater(prev));
      },
      openFile: (path: string) => {
        setActiveFile(path);
      },
    };

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      history.push({ role: 'user', content: text });

      await runHarnessCycle({
        prompt: text,
        files,
        activeFile,
        model: selectedModel,
        chatHistory: history,
        fileOps,
        onChunk: (chunkText, thoughts) => {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsgId ? { ...m, content: chunkText, thoughts } : m
            )
          );
        },
        onAction: (action: HarnessAction) => {
          setMessages(prev =>
            prev.map(m => {
              if (m.id !== assistantMsgId) return m;
              const existingActions = m.actions || [];
              const idx = existingActions.findIndex(a => a.id === action.id);
              if (idx >= 0) {
                const nextActions = [...existingActions];
                nextActions[idx] = action;
                return { ...m, actions: nextActions };
              }
              return { ...m, actions: [...existingActions, action] };
            })
          );
        },
        onLiveWriting: (writingPath: string) => {
          setCanvasMode('code');
          setActiveFile(writingPath);
        },
        signal: controller.signal,
      });

      // Alterna automaticamente para preview ao concluir a geração
      setCanvasMode('preview');
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content:
                    (m.content ? m.content + '\n\n' : '') +
                    `⚠️ Erro durante a execução: ${err?.message || err}`,
                }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    if (window.confirm('Deseja limpar as mensagens do chat deste projeto?')) {
      setMessages([]);
      localStorage.removeItem('nemon_code_agent_history');
    }
  };

  const handleResetProject = () => {
    if (window.confirm('Deseja reiniciar o projeto para o modelo limpo inicial?')) {
      setFiles(DEFAULT_PROJECT_FILES);
      setActiveFile('/index.html');
      setPreviewKey(k => k + 1);
    }
  };

  const handleNewFile = () => {
    const filename = window.prompt('Nome do arquivo (ex: /styles.css, /app.js ou /Card.tsx):');
    if (!filename || !filename.trim()) return;
    let path = filename.trim().replace(/\\/g, '/');
    if (!path.startsWith('/')) path = '/' + path;

    if (files[path] !== undefined) {
      alert('Já existe um arquivo com esse nome.');
      return;
    }

    setFiles(prev => ({ ...prev, [path]: '// Arquivo criado\n' }));
    setActiveFile(path);
  };

  const handleDeleteFile = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    if (Object.keys(files).length <= 1) {
      alert('O projeto precisa ter pelo menos um arquivo.');
      return;
    }
    if (window.confirm(`Excluir o arquivo ${path}?`)) {
      setFiles(prev => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
      if (activeFile === path) {
        const remaining = Object.keys(files).filter(f => f !== path);
        if (remaining.length > 0) setActiveFile(remaining[0]);
      }
    }
  };

  const handleExportProject = () => {
    const dataStr = JSON.stringify(files, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'projeto'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentModelName =
    MODEL_OPTIONS.find(m => m.id === selectedModel)?.name ||
    customModels.find(m => m.id === selectedModel)?.name ||
    selectedModel;

  const sandpackTheme = theme === 'light' ? 'light' : 'dark';

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-(--bg-main) text-(--text-primary) select-none">
      {/* ── BARRA SUPERIOR (Estilo Google AI Studio) ────────────────────────── */}
      <header className="h-14 border-b border-(--border-light) bg-(--bg-sidebar) px-4 flex items-center justify-between shrink-0 z-20">
        {/* Esquerda: Voltar ao Início */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-chat-hover) transition-all border border-(--border-light) shadow-2xs"
            title="Voltar ao Chat Principal"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar</span>
          </button>

          {/* Título do Projeto Editável */}
          <div className="flex items-center gap-1.5 group">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={e => e.key === 'Enter' && setIsEditingTitle(false)}
                className="bg-(--bg-main) border border-(--border-main) rounded-lg px-2.5 py-1 text-sm font-semibold text-(--text-primary) outline-none focus:ring-1 focus:ring-(--accent-text)"
              />
            ) : (
              <div
                onClick={() => setIsEditingTitle(true)}
                className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded-lg hover:bg-(--bg-chat-hover) transition"
                title="Clique para renomear o projeto"
              >
                <span className="font-semibold text-sm text-(--text-bold) tracking-tight">
                  {projectName}
                </span>
                <Edit2 className="w-3 h-3 text-(--text-secondary) opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </div>
        </div>

        {/* Direita: Ações do Projeto */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetProject}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-(--text-secondary) hover:text-red-400 hover:bg-white/5 transition-all border border-transparent hover:border-red-500/20"
            title="Restaurar projeto inicial"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reiniciar</span>
          </button>

          <button
            onClick={handleExportProject}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-(--bg-main) hover:bg-(--bg-chat-hover) text-(--text-primary) border border-(--border-light) transition-all shadow-2xs"
            title="Exportar arquivos do projeto em JSON"
          >
            <Download className="w-3.5 h-3.5 opacity-70" />
            <span>Exportar</span>
          </button>
        </div>
      </header>

      {/* ── CORPO PRINCIPAL (Split View 2 Colunas: Chat à Esquerda + Canvas à Direita) ── */}
      <div className="flex-1 flex flex-row overflow-hidden relative min-h-0">
        {/* ── COLUNA ESQUERDA: CHAT DO PROJETO ─────────────────────────────── */}
        <div
          style={{ width: chatWidth }}
          className="h-full flex flex-col bg-(--bg-sidebar) border-r border-(--border-light) shrink-0 select-text overflow-hidden z-10"
        >
          {/* Subcabeçalho do Chat: Seletor de Modelo */}
          <div className="h-11 px-4 border-b border-(--border-light) flex items-center justify-between shrink-0 bg-(--bg-sidebar)/50">
            <div className="relative" ref={modelDropdownRef}>
              <button
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className="flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-(--bg-main) border border-(--border-light) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-main) transition shadow-2xs"
                title="Trocar modelo do agente"
              >
                <span className="truncate max-w-[140px] font-semibold">{currentModelName}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              {isModelDropdownOpen && (
                <div
                  style={{ backgroundColor: 'var(--bg-sidebar-solid, #18181b)' }}
                  className="absolute left-0 top-full mt-1 w-56 max-h-64 overflow-y-auto custom-scrollbar bg-zinc-900 border border-(--border-light) rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-(--text-placeholder)">
                    Modelos Nativos
                  </div>
                  {MODEL_OPTIONS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => {
                        onSelectModel(m.id);
                        setIsModelDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition ${
                        selectedModel === m.id
                          ? 'bg-(--bg-chat-active) text-(--text-nav-active) font-semibold'
                          : 'text-(--text-secondary) hover:bg-(--bg-chat-hover) hover:text-(--text-primary)'
                      }`}
                    >
                      <span className="truncate">{m.name}</span>
                      {selectedModel === m.id && <Check className="w-3 h-3 text-(--accent-text)" />}
                    </button>
                  ))}

                  {customModels.length > 0 && (
                    <>
                      <div className="h-px bg-(--border-light) my-1" />
                      <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-(--text-placeholder)">
                        Modelos Customizados
                      </div>
                      {customModels.map(m => (
                        <button
                          key={m.id}
                          onClick={() => {
                            onSelectModel(m.id);
                            setIsModelDropdownOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition ${
                            selectedModel === m.id
                              ? 'bg-(--bg-chat-active) text-(--text-nav-active) font-semibold'
                              : 'text-(--text-secondary) hover:bg-(--bg-chat-hover) hover:text-(--text-primary)'
                          }`}
                        >
                          <span className="truncate">{m.name}</span>
                          {selectedModel === m.id && <Check className="w-3 h-3 text-(--accent-text)" />}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleClearChat}
              className="p-1.5 rounded-lg text-(--text-secondary) hover:text-red-400 hover:bg-white/5 transition"
              title="Limpar histórico de mensagens"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Área de Mensagens */}
          <div
            ref={chatContainerRef}
            onScroll={() => {
              const el = chatContainerRef.current;
              if (!el) return;
              const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
              setIsUserScrolledUp(distance > 70);
            }}
            className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 relative"
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-5 max-w-sm mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-orange-500/20 to-red-500/20 border border-amber-500/30 flex items-center justify-center text-2xl shadow-lg">
                  <Sparkles className="w-7 h-7 text-(--accent-text)" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-(--text-bold)">
                    O que você quer construir hoje?
                  </h3>
                  <p className="text-xs text-(--text-secondary) leading-relaxed">
                    Peça um aplicativo, jogo, calculadora ou dashboard interativo. O código é gerado e visualizado em tempo real.
                  </p>
                </div>

                <div className="flex flex-col w-full gap-2 pt-2">
                  {[
                    'Criar uma calculadora moderna de vidro com Tailwind',
                    'Criar um jogo estilo Pong com placar e som',
                    'Criar um cronômetro com voltas e animação circular',
                    'Criar um aplicativo de notas com busca rápida',
                  ].map(promptText => (
                    <button
                      key={promptText}
                      onClick={() => handleSend(promptText)}
                      className="text-left px-3.5 py-2.5 rounded-xl bg-(--bg-main) hover:bg-(--bg-chat-hover) border border-(--border-light) text-xs text-(--text-secondary) hover:text-(--text-primary) transition-all shadow-2xs hover:scale-[1.01]"
                    >
                      ✨ {promptText}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map(m => {
                if (m.role === 'user') {
                  return (
                    <div key={m.id} className="flex justify-end">
                      <div className="bg-(--bg-chat-active) text-(--text-primary) border border-(--border-light) rounded-2xl px-4 py-2.5 max-w-[88%] text-sm shadow-2xs font-normal">
                        {m.content}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={m.id} className="flex flex-col gap-2 w-full">
                    {/* Pensamento / Raciocínio (Com timer e preview com auto-scroll e fechamento automático) */}
                    {m.thoughts && (
                      <ThoughtBlock
                        thoughts={m.thoughts}
                        isGenerating={isLoading && m.id === messages[messages.length - 1]?.id}
                      />
                    )}

                    {/* Ações de Arquivo do Harness (badges visuais informativos) */}
                    {m.actions && m.actions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {m.actions.map(act => {
                          const file = act.path ? act.path.replace(/^\//, '') : '';
                          const label =
                            act.type === 'write_file'
                              ? (file ? `Salvo: ${file}` : 'Arquivo salvo')
                              : act.type === 'edit_file'
                              ? (file ? `Editado: ${file}` : 'Arquivo editado')
                              : act.type === 'read_file'
                              ? (file ? `Lido: ${file}` : 'Arquivo lido')
                              : act.type === 'list_files'
                              ? 'Arquivos listados'
                              : act.path || act.type;

                          return (
                            <div
                              key={act.id}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-(--bg-main) border border-(--border-light) text-[11px] font-mono text-(--text-secondary)"
                              title={act.detail || act.error || label}
                            >
                              <FileCode className="w-3 h-3 text-(--accent-text)" />
                              <span className="truncate max-w-[180px]">{label}</span>
                              {act.status === 'success' ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : act.status === 'error' ? (
                                <span className="text-red-400 text-xs">✕</span>
                              ) : (
                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Indicador ao vivo caso o modelo esteja gerando código em segundo plano */}
                    {isLoading && m.id === messages[messages.length - 1]?.id && !cleanHarnessDisplayText(m.content) && (
                      <div className="flex items-center gap-2 text-xs text-(--text-secondary) py-1.5 px-3 rounded-xl bg-(--bg-main) border border-(--border-light) w-fit">
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" />
                        </span>
                        <span>Escrevendo código e preparando aplicação...</span>
                      </div>
                    )}

                    {/* Conteúdo Markdown da Resposta (100% limpo, sem JSONs vazados e com tabelas estilizadas) */}
                    {cleanHarnessDisplayText(m.content) && (
                      <div
                        className="response-body prose prose-invert max-w-none text-sm text-(--text-primary) leading-relaxed p-1"
                        dangerouslySetInnerHTML={{ __html: safeMarkdown(cleanHarnessDisplayText(m.content)) }}
                      />
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
            {isUserScrolledUp && (
              <button
                type="button"
                onClick={() => {
                  setIsUserScrolledUp(false);
                  if (chatContainerRef.current) {
                    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
                  }
                }}
                className="sticky bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-zinc-800/95 hover:bg-zinc-700 text-zinc-200 border border-zinc-600/50 shadow-xl transition backdrop-blur-md z-20 flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                title="Rolar para a mensagem mais recente"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Rolar para o fim</span>
              </button>
            )}
          </div>

          {/* Campo de Entrada Docked na Base */}
          <div className="p-3 bg-(--bg-sidebar) border-t border-(--border-light)">
            <form
              onSubmit={e => {
                e.preventDefault();
                handleSend();
              }}
              className="bg-(--bg-main) border border-(--border-light) focus-within:border-(--accent-text)/60 rounded-2xl p-2 flex flex-col gap-2 shadow-sm transition-colors"
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Faça alterações, adicione novos recursos, peça qualquer coisa..."
                rows={1}
                className="bg-transparent border-none outline-none text-(--text-primary) text-xs sm:text-sm resize-none px-2 py-1 max-h-36 w-full placeholder:text-(--text-placeholder)"
              />

              <div className="flex items-center justify-between px-1">
                <div className="text-xs text-(--text-placeholder)">
                  {isLoading ? (
                    <div className="flex items-center gap-2 font-medium">
                      <NemonIcon animated size={18} themed className="shrink-0" />
                      <span className="text-zinc-200 text-xs transition-all duration-300">
                        {HARNESS_BLOPERS[bloperIndex]}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px]">Shift + Enter para nova linha</span>
                  )}
                </div>

                {isLoading ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="p-1.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition shadow-2xs"
                    title="Parar geração"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className={`p-1.5 rounded-xl transition ${
                      input.trim()
                        ? 'bg-(--accent-bg) text-(--accent-text) shadow-sm hover:brightness-110'
                        : 'opacity-40 text-(--text-secondary)'
                    }`}
                    title="Enviar instrução"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* ── DIVISOR REDIMENSIONÁVEL ENTRE CHAT E CANVAS ───────────────────── */}
        <div
          onMouseDown={handleStartResize}
          onDoubleClick={() => setChatWidth(460)}
          className={`w-1.5 -ml-1 hover:w-2 hover:-ml-1 bg-transparent hover:bg-(--accent-text)/60 active:bg-(--accent-text) cursor-col-resize transition-all duration-150 z-30 shrink-0 select-none flex items-center justify-center ${
            isDraggingDivider ? 'bg-(--accent-text) w-2' : ''
          }`}
          title="Arraste para redimensionar (Duplo clique para redefinir)"
        >
          <div className="w-0.5 h-8 rounded-full bg-(--border-light)" />
        </div>

        {/* ── COLUNA DIREITA: CANVAS (PREVIEW / CÓDIGO) ────────────────────── */}
        <div className="flex-1 h-full flex flex-col bg-(--bg-main) overflow-hidden min-w-[360px]">
          <SandpackProvider
            key={previewKey}
            template={detectedTemplate}
            files={sandpackFiles}
            theme={sandpackTheme}
            className="!h-full !w-full !flex !flex-col !flex-1 !min-h-0 !min-w-0 !overflow-hidden"
            style={{
              height: '100%',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              overflow: 'hidden',
            }}
            options={{
              activeFile,
              recompileMode: 'delayed',
              recompileDelay: 350,
            }}
          >
            <SandpackSyncBridge onFilesChange={setFiles} activeFile={activeFile} />
            <SandpackConsoleTracker onStatsChange={setConsoleStats} />

            {/* Barra de Ferramentas Superior do Canvas */}
            <div className="h-12 px-4 border-b border-(--border-light) bg-(--bg-sidebar)/40 flex items-center justify-between shrink-0 select-none z-10">
              {/* Pill Switcher estilo Google AI Studio: [ • Preview ]  [ Código ]  [ Logs ] */}
              <div className="flex items-center p-0.5 bg-(--bg-main) border border-(--border-light) rounded-full shadow-inner">
                <button
                  type="button"
                  onClick={() => setCanvasMode('preview')}
                  className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-medium transition-all ${
                    canvasMode === 'preview'
                      ? 'bg-(--bg-chat-active) text-(--text-primary) shadow-sm'
                      : 'text-(--text-secondary) hover:text-(--text-primary)'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCanvasMode('code')}
                  className={`px-3.5 py-1 rounded-full text-xs font-medium transition-all ${
                    canvasMode === 'code'
                      ? 'bg-(--bg-chat-active) text-(--text-primary) shadow-sm'
                      : 'text-(--text-secondary) hover:text-(--text-primary)'
                  }`}
                >
                  <span>Código</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCanvasMode('logs')}
                  className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-medium transition-all ${
                    canvasMode === 'logs'
                      ? 'bg-(--bg-chat-active) text-(--text-primary) shadow-sm'
                      : 'text-(--text-secondary) hover:text-(--text-primary)'
                  }`}
                  title="Logs e saída do runtime da aplicação"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Logs</span>
                  {consoleStats.errors > 0 ? (
                    <span className="px-1.5 py-0.2 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-bold animate-pulse">
                      {consoleStats.errors}
                    </span>
                  ) : consoleStats.warns > 0 ? (
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-semibold">
                      {consoleStats.warns}
                    </span>
                  ) : consoleStats.total > 0 ? (
                    <span className="px-1.5 py-0.2 rounded-full bg-(--bg-main) border border-(--border-light) text-(--text-secondary) text-[10px]">
                      {consoleStats.total}
                    </span>
                  ) : null}
                </button>
              </div>

              {/* Controles da Direita */}
              <div className="flex items-center gap-1.5">
                {canvasMode === 'preview' ? (
                  <>
                    {/* Viewport switchers: Desktop, Tablet, Mobile */}
                    <div className="flex items-center bg-(--bg-main) border border-(--border-light) rounded-lg p-0.5 mr-1">
                      <button
                        onClick={() => setViewport('desktop')}
                        className={`p-1.5 rounded-md transition ${
                          viewport === 'desktop'
                            ? 'bg-(--bg-chat-active) text-(--text-primary)'
                            : 'text-(--text-secondary) hover:text-(--text-primary)'
                        }`}
                        title="Visualização Desktop (100%)"
                      >
                        <Monitor className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setViewport('tablet')}
                        className={`p-1.5 rounded-md transition ${
                          viewport === 'tablet'
                            ? 'bg-(--bg-chat-active) text-(--text-primary)'
                            : 'text-(--text-secondary) hover:text-(--text-primary)'
                        }`}
                        title="Visualização Tablet (768px)"
                      >
                        <Tablet className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setViewport('mobile')}
                        className={`p-1.5 rounded-md transition ${
                          viewport === 'mobile'
                            ? 'bg-(--bg-chat-active) text-(--text-primary)'
                            : 'text-(--text-secondary) hover:text-(--text-primary)'
                        }`}
                        title="Visualização Mobile (375px)"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Botão de Console rápido no Preview */}
                    <button
                      onClick={() => setIsPreviewConsoleOpen(v => !v)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition border border-(--border-light) ${
                        isPreviewConsoleOpen
                          ? 'bg-(--bg-chat-active) text-(--text-primary)'
                          : 'bg-(--bg-main) hover:bg-(--bg-chat-hover) text-(--text-secondary) hover:text-(--text-primary)'
                      }`}
                      title="Abrir/fechar gaveta de console da aplicação no preview"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Console</span>
                      {consoleStats.errors > 0 ? (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      ) : consoleStats.warns > 0 ? (
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                      ) : null}
                    </button>

                    <button
                      onClick={() => setPreviewKey(k => k + 1)}
                      className="p-1.5 rounded-lg hover:bg-(--bg-chat-hover) text-(--text-secondary) hover:text-(--text-primary) transition"
                      title="Recarregar aplicação"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : canvasMode === 'logs' ? (
                  <>
                    <button
                      onClick={() => setPreviewKey(k => k + 1)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-(--bg-main) hover:bg-(--bg-chat-hover) border border-(--border-light) text-xs text-(--text-secondary) hover:text-(--text-primary) transition shadow-2xs"
                      title="Recarregar aplicação e reiniciar console"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Recarregar App</span>
                    </button>
                  </>
                ) : (
                  <>
                    {/* Botão de adicionar arquivo no modo código */}
                    <button
                      onClick={handleNewFile}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-(--bg-main) hover:bg-(--bg-chat-hover) border border-(--border-light) text-xs text-(--text-secondary) hover:text-(--text-primary) transition shadow-2xs"
                      title="Criar novo arquivo"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Novo Arquivo</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-1.5 rounded-lg hover:bg-(--bg-chat-hover) text-(--text-secondary) hover:text-(--text-primary) transition ml-0.5"
                  title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                >
                  {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* No modo Código: Barra de Abas de Arquivos */}
            {canvasMode === 'code' && (
              <div className="h-10 px-3 bg-(--bg-sidebar)/30 border-b border-(--border-light) flex items-center gap-1.5 overflow-x-auto custom-scrollbar shrink-0 select-none">
                {Object.keys(files).map(fPath => {
                  const isActive = activeFile === fPath;
                  return (
                    <div
                      key={fPath}
                      onClick={() => setActiveFile(fPath)}
                      className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-mono cursor-pointer transition select-none ${
                        isActive
                          ? 'bg-(--bg-chat-active) text-(--text-primary) border border-(--border-light) font-semibold shadow-2xs'
                          : 'text-(--text-secondary) hover:bg-(--bg-chat-hover) hover:text-(--text-primary)'
                      }`}
                    >
                      <FileCode
                        className={`w-3.5 h-3.5 ${
                          isActive ? 'text-(--accent-text)' : 'text-(--text-placeholder)'
                        }`}
                      />
                      <span>{fPath}</span>
                      {Object.keys(files).length > 1 && (
                        <button
                          onClick={e => handleDeleteFile(e, fPath)}
                          className="p-0.5 rounded hover:bg-red-500/20 hover:text-red-400 text-(--text-placeholder) transition"
                          title="Excluir arquivo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Conteúdo do Canvas */}
            <div className="flex-1 flex flex-col overflow-hidden relative bg-(--bg-main)">
              {canvasMode === 'preview' ? (
                <div className="flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden bg-(--bg-main)">
                  <div
                    style={{
                      width:
                        viewport === 'mobile'
                          ? '375px'
                          : viewport === 'tablet'
                          ? '768px'
                          : '100%',
                      height: '100%',
                    }}
                    className={`transition-all duration-300 rounded-2xl overflow-hidden shadow-2xl border border-(--border-light) bg-zinc-950 flex flex-col relative ${
                      viewport !== 'desktop' ? 'max-h-[92%]' : ''
                    }`}
                  >
                    <div className="flex-1 relative overflow-hidden">
                      <SandpackPreview
                        showNavigator={false}
                        showOpenInCodeSandbox={false}
                        showRefreshButton={false}
                        style={{ height: '100%', width: '100%' }}
                      />

                      {/* Indicador ao vivo quando a IA estiver escrevendo */}
                      {isLoading && (
                        <div className="absolute top-3 right-3 bg-zinc-900/90 border border-zinc-700/60 text-zinc-200 text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 backdrop-blur-md animate-in fade-in duration-200">
                          <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                          <span>Atualizando aplicação...</span>
                        </div>
                      )}
                    </div>

                    {/* Gaveta de Console no rodapé do Preview */}
                    {isPreviewConsoleOpen && (
                      <div className="h-44 border-t border-(--border-light) bg-zinc-950 flex flex-col shrink-0 overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
                        <div className="h-7 px-3 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between text-xs text-zinc-400 select-none">
                          <div className="flex items-center gap-1.5 font-mono text-[11px]">
                            <Terminal className="w-3 h-3 text-cyan-400" />
                            <span className="font-semibold text-zinc-300">Console da Aplicação</span>
                            {consoleStats.errors > 0 ? (
                              <span className="text-red-400 font-bold">({consoleStats.errors} erro{consoleStats.errors > 1 ? 's' : ''})</span>
                            ) : consoleStats.warns > 0 ? (
                              <span className="text-amber-400">({consoleStats.warns} aviso{consoleStats.warns > 1 ? 's' : ''})</span>
                            ) : (
                              <span className="text-zinc-500">({consoleStats.total} logs)</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setCanvasMode('logs')}
                              className="text-[10px] text-zinc-400 hover:text-white transition underline"
                              title="Ver em tela cheia na aba Logs"
                            >
                              Ver na aba Logs
                            </button>
                            <button
                              onClick={() => setIsPreviewConsoleOpen(false)}
                              className="p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
                              title="Fechar gaveta"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div className="flex-1 overflow-auto bg-zinc-950">
                          <SandpackConsole
                            showHeader={false}
                            showSyntaxError
                            resetOnPreviewRestart
                            style={{ height: '100%', width: '100%' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : canvasMode === 'logs' ? (
                <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
                  <div className="px-4 py-2.5 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between shrink-0 select-none">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-semibold text-zinc-200">
                        Logs e Saída de Runtime da Aplicação
                      </span>
                      <span className="text-[11px] text-zinc-500 font-mono hidden md:inline">
                        (console.log, warnings e erros emitidos pela aplicação em execução)
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <span className="text-zinc-400">
                        Total: <strong className="text-zinc-200">{consoleStats.total}</strong>
                      </span>
                      {consoleStats.errors > 0 && (
                        <span className="text-red-400">
                          • Erros: <strong>{consoleStats.errors}</strong>
                        </span>
                      )}
                      {consoleStats.warns > 0 && (
                        <span className="text-amber-400">
                          • Avisos: <strong>{consoleStats.warns}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden bg-zinc-950">
                    <SandpackConsole
                      showHeader
                      showSyntaxError
                      showRestartButton
                      showResetConsoleButton
                      resetOnPreviewRestart
                      style={{ height: '100%', width: '100%' }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-hidden">
                  <SandpackCodeEditor
                    showTabs={false}
                    showLineNumbers
                    showInlineErrors
                    wrapContent={false}
                    style={{ height: '100%', width: '100%' }}
                  />
                </div>
              )}
            </div>
          </SandpackProvider>
        </div>
      </div>
    </div>
  );
};
