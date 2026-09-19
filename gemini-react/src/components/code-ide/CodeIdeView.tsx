import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Send,
  Square,
  RotateCcw,
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
  Terminal,
  Eye,
  Paperclip,
} from 'lucide-react';
import NemonIcon from '../NemonIcon';
import { runHarnessCycle, cleanHarnessDisplayText } from '../../services/codeHarness';
import { MODEL_OPTIONS, type CustomModel } from '../../constants';
import { safeMarkdown } from '../../services/gemini';
import { DEFAULT_PROJECT_FILES, type AgentChatMessage, type HarnessAction, type HarnessStepBlock } from '../../types/codeIde';
import type { PendingFile } from '../../types';
import { HarnessDiffViewer } from './HarnessDiffViewer';
import { NativeCodeEditor } from './NativeCodeEditor';
import { NativePreviewRunner, type PreviewLogItem } from './NativePreviewRunner';
import { NativeConsoleViewer } from './NativeConsoleViewer';

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

  // Arquivos do projeto (inicia com DEFAULT_PROJECT_FILES se vazio, limpando vazamentos do Sandpack)
  const [files, setFiles] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('nemon_code_files_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && Object.keys(parsed).length > 0) {
          // Remove arquivos boilerplate que possam ter vazado do Sandpack anteriormente
          const cleaned: Record<string, string> = {};
          for (const [k, v] of Object.entries(parsed as Record<string, string>)) {
            if (k === '/package.json' && (v.includes('nemon-app') || v.includes('/index.html'))) continue;
            if (k === '/index.js' && v.includes('// Nemon HTML Runner')) continue;
            if (k === '/styles.css' && v.includes('font-family: sans-serif;') && v.includes('-webkit-font-smoothing')) continue;
            cleaned[k] = v;
          }
          if (Object.keys(cleaned).length > 0) return cleaned;
        }
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

  // Diffs visuais expandidos por id de ação
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});

  // Erros de runtime e console coletados da aplicação em preview
  const [, setRuntimeErrors] = useState<string[]>([]);
  const runtimeErrorsRef = useRef<string[]>([]);
  const autoFixAttemptsRef = useRef(0);
  const [isAutoFixing, setIsAutoFixing] = useState(false);

  const handleUpdateRuntimeErrors = (errors: string[]) => {
    runtimeErrorsRef.current = errors;
    setRuntimeErrors(errors);
  };

  const toggleDiff = (actionId: string) => {
    setExpandedDiffs(prev => ({ ...prev, [actionId]: !prev[actionId] }));
  };

  // Modo do Canvas: 'preview' (padrão estilo Google AI Studio), 'code' ou 'logs'
  const [canvasMode, setCanvasMode] = useState<'preview' | 'code' | 'logs'>('preview');

  // Quando o modo preview for ativado, dispara resize para que canvas/iframe se reajustem e pintem imediatamente
  useEffect(() => {
    if (canvasMode === 'preview') {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [canvasMode]);

  // Logs e estatísticas do console da aplicação em preview
  const [consoleStats, setConsoleStats] = useState({ total: 0, errors: 0, warns: 0 });
  const [previewLogs, setPreviewLogs] = useState<PreviewLogItem[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fecha tela cheia com Escape e dispara resize para reajustar layout de preview e editor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

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
  const isUserScrolledUpRef = useRef(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bloperIndex, setBloperIndex] = useState(0);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lastProcessedRef = useRef<{ name: string; size: number; time: number } | null>(null);

  // Processa arquivos selecionados ou colados da área de transferência com proteção contra duplicatas
  const processFile = (file: File) => {
    const now = Date.now();
    if (
      lastProcessedRef.current &&
      lastProcessedRef.current.name === file.name &&
      lastProcessedRef.current.size === file.size &&
      now - lastProcessedRef.current.time < 1000
    ) {
      return; // Ignora duplicatas disparadas pelo navegador em sequência rápida
    }
    lastProcessedRef.current = { name: file.name, size: file.size, time: now };

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      setPendingFiles(prev => {
        if (prev.some(p => p.data === base64)) return prev;
        return [
          ...prev,
          { name: file.name, data: base64, mimeType: file.type || 'application/octet-stream' }
        ];
      });
    };
    reader.readAsDataURL(file);
  };

  // Captura eventos de paste da área de transferência (Ctrl+V de imagens/arquivos)
  const handlePaste = (e: React.ClipboardEvent) => {
    e.stopPropagation();
    const items = e.clipboardData?.items;
    if (!items) return;

    let hasFile = false;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          hasFile = true;
          processFile(file);
        }
      }
    }

    if (hasFile) {
      const hasText = Array.from(items).some(it => it.kind === 'string' && it.type === 'text/plain');
      if (!hasText) {
        e.preventDefault();
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected) return;
    Array.from(selected).forEach(processFile);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
    if (!isUserScrolledUp && !isUserScrolledUpRef.current && chatContainerRef.current) {
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



  // Envio de mensagem para o Harness
  const handleSend = async (promptToSend?: string, isAutoFix = false) => {
    const text = (promptToSend || input).trim();
    if ((!text && pendingFiles.length === 0) || isLoading) return;

    if (!isAutoFix) {
      autoFixAttemptsRef.current = 0;
      setIsAutoFixing(false);
      // Limpa erros acumulados da instrução anterior ao iniciar nova demanda
      runtimeErrorsRef.current = [];
      setRuntimeErrors([]);
      setConsoleStats({ total: 0, errors: 0, warns: 0 });
      setPreviewLogs([]);
    } else {
      setIsAutoFixing(true);
    }

    const filesToSend = [...pendingFiles];
    setInput('');
    setPendingFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const userMsg: AgentChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      files: filesToSend.length > 0 ? filesToSend : undefined,
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
    isUserScrolledUpRef.current = false;
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
        attachments: filesToSend,
        fileOps,
        runtimeErrors: runtimeErrorsRef.current,
        getRuntimeErrors: () => runtimeErrorsRef.current,
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
        onStepUpdate: (stepBlock: HarnessStepBlock) => {
          setMessages(prev =>
            prev.map(m => {
              if (m.id !== assistantMsgId) return m;
              const existingSteps = m.steps ? [...m.steps] : [];
              const idx = existingSteps.findIndex(s => s.id === stepBlock.id);
              if (idx >= 0) {
                existingSteps[idx] = stepBlock;
              } else {
                existingSteps.push(stepBlock);
              }
              return { ...m, steps: existingSteps };
            })
          );
        },
        onStepReject: (rejectedStepId: string) => {
          setMessages(prev =>
            prev.map(m => {
              if (m.id !== assistantMsgId || !m.steps) return m;
              return {
                ...m,
                steps: m.steps.filter(s => s.id !== rejectedStepId),
              };
            })
          );
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

      // Auto-validação de runtime pós-geração: se a aplicação gerou erros de console no preview,
      // o harness corrige automaticamente sem exigir clique manual do usuário.
      setTimeout(() => {
        const errors = runtimeErrorsRef.current;
        if (
          errors.length > 0 &&
          autoFixAttemptsRef.current < 2 &&
          !abortControllerRef.current
        ) {
          autoFixAttemptsRef.current += 1;
          setIsAutoFixing(true);
          const errorSummary = errors.slice(0, 5).join('\n');
          handleSend(
            `Corrija os seguintes erros de runtime detectados no console do preview da aplicação:\n\`\`\`\n${errorSummary}\n\`\`\`\nPor favor, examine o código, localize a causa raiz (ex: elementos nulos, variáveis duplicadas ou erros de sintaxe) e realize as correções necessárias com edit_file ou write_file para eliminar estes erros.`,
            true
          );
        } else {
          setIsAutoFixing(false);
        }
      }, 750);
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

  // Renderizador de linha individual para Tool Calls do Harness (com quebra de linha dedicada)
  const renderActionRow = (act: HarnessAction) => {
    const file = act.path ? act.path.replace(/^\//, '') : '';
    const actionVerb =
      act.type === 'write_file'
        ? 'Salvo'
        : act.type === 'edit_file'
        ? 'Editado'
        : act.type === 'read_file'
        ? 'Lido'
        : act.type === 'list_files'
        ? 'Listado'
        : act.type;

    const hasDiff = Boolean(
      act.diff && (act.diff.targetContent || act.diff.newContent || act.diff.oldContent)
    );
    const isDiffOpen = Boolean(expandedDiffs[act.id]);

    return (
      <div key={act.id} className="flex flex-col gap-1 w-full">
        <div
          className={`flex items-center justify-between px-3 py-1.5 rounded-xl border text-xs font-mono transition-all ${
            isDiffOpen
              ? 'bg-(--bg-chat-active) border-(--accent-text)/50 text-(--text-primary) shadow-2xs'
              : 'bg-(--bg-main) border-(--border-light) text-(--text-secondary) hover:border-(--border-main)'
          }`}
          title={act.detail || act.error || `${actionVerb}: ${file}`}
        >
          <div className="flex items-center gap-2 min-w-0 truncate">
            <FileCode className="w-3.5 h-3.5 text-(--accent-text) shrink-0" />
            <span className="font-semibold text-(--text-primary)">{actionVerb}:</span>
            <span className="text-(--text-secondary) truncate font-mono text-[11px]">{file || act.path || 'projeto'}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasDiff && (
              <button
                type="button"
                onClick={() => toggleDiff(act.id)}
                className={`px-2 py-0.5 rounded-lg text-[10px] flex items-center gap-1 font-semibold transition cursor-pointer ${
                  isDiffOpen
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-(--bg-sidebar) hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-(--border-light)'
                }`}
                title={isDiffOpen ? 'Ocultar Diff' : 'Visualizar alterações (Diff)'}
              >
                <Eye className="w-3 h-3" />
                <span>{isDiffOpen ? 'Fechar Diff' : 'Diff'}</span>
              </button>
            )}

            {act.status === 'success' ? (
              <div className="flex items-center gap-1 text-emerald-400 text-xs">
                <Check className="w-3.5 h-3.5" />
              </div>
            ) : act.status === 'error' ? (
              <div className="flex items-center gap-1 text-red-400 text-xs font-bold" title={act.error || 'Erro'}>
                ✕
              </div>
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </div>
        </div>

        {isDiffOpen && act.diff && (
          <div className="my-1">
            <HarnessDiffViewer diff={act.diff} path={act.path} defaultExpanded={true} />
          </div>
        )}
      </div>
    );
  };

  const currentModelName =
    MODEL_OPTIONS.find(m => m.id === selectedModel)?.name ||
    customModels.find((m: CustomModel) => m.id === selectedModel)?.name ||
    selectedModel;

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
                      {customModels.map((m: CustomModel) => (
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
            onWheel={(e) => {
              if (e.deltaY < 0) {
                // Roda para CIMA: trava o scroll imediatamente para que o usuário leia mensagens anteriores sem snap
                isUserScrolledUpRef.current = true;
                setIsUserScrolledUp(true);
              } else if (e.deltaY > 0) {
                const el = chatContainerRef.current;
                if (el) {
                  const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
                  if (dist <= 25) {
                    isUserScrolledUpRef.current = false;
                    setIsUserScrolledUp(false);
                  }
                }
              }
            }}
            onScroll={() => {
              const el = chatContainerRef.current;
              if (!el) return;
              const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
              if (distance <= 25) {
                isUserScrolledUpRef.current = false;
                setIsUserScrolledUp(false);
              } else if (distance > 50) {
                isUserScrolledUpRef.current = true;
                setIsUserScrolledUp(true);
              }
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
                      <div className="bg-(--bg-chat-active) text-(--text-primary) border border-(--border-light) rounded-2xl px-4 py-2.5 max-w-[88%] text-sm shadow-2xs font-normal space-y-2">
                        {m.files && m.files.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-0.5">
                            {m.files.map((f, fIdx) => (
                              <div key={fIdx} className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
                                {f.mimeType.startsWith('image/') ? (
                                  <img
                                    src={`data:${f.mimeType};base64,${f.data}`}
                                    alt={f.name}
                                    className="max-h-52 max-w-xs object-cover rounded-lg"
                                  />
                                ) : (
                                  <div className="flex items-center gap-2 px-3 py-2 text-xs">
                                    <FileCode className="w-4 h-4 text-amber-400 shrink-0" />
                                    <span className="truncate max-w-[150px] font-mono text-[11px] text-zinc-300">{f.name}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {m.content && <div>{m.content}</div>}
                      </div>
                    </div>
                  );
                }

                const hasSteps = Boolean(m.steps && m.steps.length > 0);

                return (
                  <div key={m.id} className="flex flex-col gap-3 w-full">
                    {hasSteps ? (
                      /* ── BLOCOS CRONOLÓGICOS MODULARES DO HARNESS ──────────── */
                      <div className="flex flex-col gap-3.5 w-full">
                        {m.steps!.map((step, sIdx) => {
                          const isCurrentGeneratingStep =
                            isLoading &&
                            m.id === messages[messages.length - 1]?.id &&
                            step.status === 'running';

                          const stepBadge =
                            step.totalSteps && step.stepNumber <= step.totalSteps
                              ? `Passo ${step.stepNumber}/${step.totalSteps}`
                              : `Passo ${step.stepNumber || sIdx + 1}`;

                          const displayTitle = step.title
                            ? step.title
                                .replace(/^\[?(?:Passo|Passeo|Paso|Step|Etapa)\s+\d+(?:\s*(?:\/|de)\s*\d+)?\]?:?\s*/i, '')
                                .replace(/^[:\-\s]+/, '')
                                .trim()
                            : '';

                          return (
                            <div
                              key={step.id || `step-${sIdx}`}
                              className="flex flex-col gap-2 p-3.5 rounded-2xl bg-(--bg-main)/75 border border-(--border-light) shadow-2xs transition-all"
                            >
                              {/* Cabeçalho do Passo */}
                              <div className="flex items-center justify-between pb-2 border-b border-(--border-light)/40">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-(--accent-bg) text-(--accent-text) shrink-0">
                                    {stepBadge}
                                  </span>
                                  {displayTitle && (
                                    <span className="text-xs font-semibold text-(--text-bold) truncate">
                                      {displayTitle}
                                    </span>
                                  )}
                                </div>
                                {step.status === 'completed' && (
                                  <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 shrink-0">
                                    <Check className="w-3.5 h-3.5" /> Concluído
                                  </span>
                                )}
                                {step.status === 'running' && (
                                  <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1 shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Executando
                                  </span>
                                )}
                              </div>

                              {/* Pensamento / Raciocínio individual deste Passo */}
                              {step.thoughts && (
                                <ThoughtBlock
                                  thoughts={step.thoughts}
                                  isGenerating={isCurrentGeneratingStep}
                                />
                              )}

                              {/* Tool Calls deste Passo (com quebra de linha dedicada para cada ação) */}
                              {step.actions && step.actions.length > 0 && (
                                <div className="flex flex-col gap-1.5 w-full my-0.5">
                                  {step.actions.map(act => renderActionRow(act))}
                                </div>
                              )}

                              {/* Conteúdo textual explicativo deste Passo */}
                              {cleanHarnessDisplayText(step.content) && (
                                <div
                                  className="response-body prose prose-invert max-w-none text-sm text-(--text-primary) leading-relaxed p-1"
                                  dangerouslySetInnerHTML={{
                                    __html: safeMarkdown(cleanHarnessDisplayText(step.content)),
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* ── MENSAGENS LEGADAS (FALLBACK) ─────────────────────── */
                      <>
                        {m.thoughts && (
                          <ThoughtBlock
                            thoughts={m.thoughts}
                            isGenerating={isLoading && m.id === messages[messages.length - 1]?.id}
                          />
                        )}

                        {m.actions && m.actions.length > 0 && (
                          <div className="flex flex-col gap-1.5 w-full">
                            {m.actions.map(act => renderActionRow(act))}
                          </div>
                        )}

                        {cleanHarnessDisplayText(m.content) && (
                          <div
                            className="response-body prose prose-invert max-w-none text-sm text-(--text-primary) leading-relaxed p-1"
                            dangerouslySetInnerHTML={{
                              __html: safeMarkdown(cleanHarnessDisplayText(m.content)),
                            }}
                          />
                        )}
                      </>
                    )}

                    {/* Indicador ao vivo caso o modelo esteja gerando código e ainda sem texto no passo */}
                    {isLoading &&
                      m.id === messages[messages.length - 1]?.id &&
                      !cleanHarnessDisplayText(m.content) &&
                      (!m.steps || m.steps.length === 0 || !m.steps.some(s => s.actions.length > 0)) && (
                        <div className="flex items-center gap-2 text-xs text-(--text-secondary) py-1.5 px-3 rounded-xl bg-(--bg-main) border border-(--border-light) w-fit">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" />
                          </span>
                          <span>Escrevendo código e preparando aplicação...</span>
                        </div>
                      )}

                    {/* Status de auto-correção automática do Harness (sem necessidade de clique do usuário) */}
                    {isAutoFixing && (
                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 mt-2 animate-in fade-in duration-200">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                        <span>O Harness detectou erros de execução no console do preview e está auto-corrigindo o código automaticamente...</span>
                      </div>
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
                  isUserScrolledUpRef.current = false;
                  setIsUserScrolledUp(false);
                  if (chatContainerRef.current) {
                    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
                  }
                }}
                className="sticky bottom-2 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full bg-zinc-800/95 hover:bg-zinc-700 text-zinc-200 border border-zinc-600/50 shadow-xl transition backdrop-blur-md z-20 flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                title="Rolar para a mensagem mais recente"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Rolar para o fim</span>
              </button>
            )}
          </div>

          {/* Campo de Entrada Docked na Base */}
          <div className="p-3 bg-(--bg-sidebar) border-t border-(--border-light)">
            {/* Input oculto para anexar arquivos do explorador */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInput}
              multiple
              accept="image/*,.pdf,.txt,.md,.js,.jsx,.ts,.tsx,.html,.css,.json,.csv"
              className="hidden"
            />

            <form
              onSubmit={e => {
                e.preventDefault();
                handleSend();
              }}
              className="bg-(--bg-main) border border-(--border-light) focus-within:border-(--accent-text)/60 rounded-2xl p-2 flex flex-col gap-2 shadow-sm transition-colors"
            >
              {/* Chips de Arquivos e Fotos Pendentes */}
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 px-1 pt-1 pb-1.5 border-b border-(--border-light)/40">
                  {pendingFiles.map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-zinc-900/90 border border-zinc-700/60 text-xs text-(--text-primary) shadow-sm group animate-in fade-in zoom-in-95 duration-150"
                    >
                      {f.mimeType.startsWith('image/') ? (
                        <img
                          src={`data:${f.mimeType};base64,${f.data}`}
                          alt={f.name}
                          className="w-7 h-7 object-cover rounded-md border border-white/10 shrink-0"
                        />
                      ) : (
                        <FileCode className="w-4 h-4 text-(--accent-text) shrink-0" />
                      )}
                      <span className="max-w-[120px] truncate text-[11px] font-medium" title={f.name}>
                        {f.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="p-0.5 rounded hover:bg-white/10 text-(--text-secondary) hover:text-red-400 transition"
                        title="Remover anexo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={input}
                onPaste={handlePaste}
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
                placeholder={
                  pendingFiles.length > 0
                    ? 'Descreva o que fazer com os anexos ou faça seu pedido...'
                    : 'Cole fotos da área de transferência (Ctrl+V), anexe arquivos ou descreva seu app...'
                }
                rows={1}
                className="bg-transparent border-none outline-none text-(--text-primary) text-xs sm:text-sm resize-none px-2 py-1 max-h-36 w-full placeholder:text-(--text-placeholder)"
              />

              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className="p-1.5 rounded-xl text-(--text-secondary) hover:text-(--text-primary) hover:bg-white/5 transition flex items-center gap-1 text-xs"
                    title="Anexar fotos ou arquivos (você também pode colar direto com Ctrl+V)"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

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
                    disabled={!input.trim() && pendingFiles.length === 0}
                    className={`p-1.5 rounded-xl transition ${
                      input.trim() || pendingFiles.length > 0
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
        <div
          className={`h-full flex flex-col bg-(--bg-main) overflow-hidden transition-all duration-200 ${
            isFullscreen
              ? 'fixed inset-0 z-50 w-screen h-screen'
              : 'flex-1 min-w-[360px]'
          }`}
        >
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
              {canvasMode === 'code' && (
                <button
                  onClick={handleNewFile}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-(--bg-main) hover:bg-(--bg-chat-hover) border border-(--border-light) text-xs text-(--text-secondary) hover:text-(--text-primary) transition shadow-2xs"
                  title="Criar novo arquivo"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo Arquivo</span>
                </button>
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

          {/* Conteúdo do Canvas - Mantém Preview, Editor e Logs permanentemente montados */}
          <div className="flex-1 flex flex-col overflow-hidden relative bg-(--bg-main)">
            {/* Painel 1: Preview da Aplicação */}
            <div
              style={{ display: canvasMode === 'preview' ? 'flex' : 'none' }}
              className="flex-1 overflow-hidden w-full h-full"
            >
              <NativePreviewRunner
                files={files}
                onLogMessage={log => setPreviewLogs(prev => [...prev.slice(-200), log])}
                onStatsChange={setConsoleStats}
                onErrorLogsChange={handleUpdateRuntimeErrors}
                onClearLogs={() => {
                  setPreviewLogs([]);
                  setConsoleStats({ total: 0, errors: 0, warns: 0 });
                  handleUpdateRuntimeErrors([]);
                }}
                isGenerating={isLoading}
              />
            </div>

            {/* Painel 2: Editor de Código */}
            <div
              style={{ display: canvasMode === 'code' ? 'flex' : 'none' }}
              className="flex-1 overflow-hidden w-full h-full"
            >
              <NativeCodeEditor
                code={files[activeFile] ?? ''}
                onChange={newCode => {
                  setFiles(prev => ({ ...prev, [activeFile]: newCode }));
                }}
                activeFilePath={activeFile}
                isLoading={isLoading}
                theme={theme}
              />
            </div>

            {/* Painel 3: Logs e Console em Tela Cheia */}
            <div
              style={{ display: canvasMode === 'logs' ? 'flex' : 'none' }}
              className="flex-1 overflow-hidden w-full h-full"
            >
              <NativeConsoleViewer
                logs={previewLogs}
                onClearLogs={() => {
                  setPreviewLogs([]);
                  setConsoleStats({ total: 0, errors: 0, warns: 0 });
                  handleUpdateRuntimeErrors([]);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

