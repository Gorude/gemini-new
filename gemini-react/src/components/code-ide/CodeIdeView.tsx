import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  SandpackProvider,
  SandpackPreview,
  SandpackCodeEditor,
  useSandpack,
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
} from 'lucide-react';
import { runHarnessCycle } from '../../services/codeHarness';
import { MODEL_OPTIONS, type CustomModel } from '../../constants';
import { safeMarkdown } from '../../services/gemini';
import { DEFAULT_PROJECT_FILES, type AgentChatMessage, type HarnessAction } from '../../types/codeIde';

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

  // Modo do Canvas: 'preview' (padrão estilo Google AI Studio) ou 'code'
  const [canvasMode, setCanvasMode] = useState<'preview' | 'code'>('preview');

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

  // Scroll para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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
        signal: controller.signal,
      });
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
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span className="truncate max-w-[140px] font-semibold">{currentModelName}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              {isModelDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 w-56 max-h-64 overflow-y-auto custom-scrollbar bg-(--bg-sidebar) border border-(--border-light) rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
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
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
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
                    {/* Pensamento / Raciocínio (Colapsável) */}
                    {m.thoughts && (
                      <details className="group/thought border border-(--border-light) bg-(--bg-main)/50 rounded-xl overflow-hidden text-xs">
                        <summary className="px-3 py-1.5 cursor-pointer font-medium text-(--text-secondary) hover:text-(--text-primary) flex items-center gap-1.5 select-none transition">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>Processo de Raciocínio</span>
                          <ChevronRight className="w-3 h-3 ml-auto transition-transform group-open/thought:rotate-90 text-(--text-placeholder)" />
                        </summary>
                        <div className="p-3 pt-1 border-t border-(--border-light) font-mono text-[11px] leading-relaxed text-(--text-secondary) whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar bg-black/10">
                          {m.thoughts}
                        </div>
                      </details>
                    )}

                    {/* Ações de Arquivo do Harness (badges visuais) */}
                    {m.actions && m.actions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {m.actions.map(act => (
                          <div
                            key={act.id}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-(--bg-main) border border-(--border-light) text-[11px] font-mono text-(--text-secondary)"
                          >
                            <FileCode className="w-3 h-3 text-(--accent-text)" />
                            <span className="truncate max-w-[160px]">{act.path || act.type}</span>
                            {act.status === 'success' ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : act.status === 'error' ? (
                              <span className="text-red-400 text-xs">✕</span>
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Conteúdo Markdown da Resposta */}
                    {m.content && (
                      <div
                        className="prose prose-invert max-w-none text-sm text-(--text-primary) leading-relaxed p-1"
                        dangerouslySetInnerHTML={{ __html: safeMarkdown(m.content) }}
                      />
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
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
                <div className="text-[10px] text-(--text-placeholder)">
                  {isLoading ? (
                    <span className="flex items-center gap-1.5 text-amber-400">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      Gerando código...
                    </span>
                  ) : (
                    <span>Shift + Enter para nova linha</span>
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

            {/* Barra de Ferramentas Superior do Canvas */}
            <div className="h-12 px-4 border-b border-(--border-light) bg-(--bg-sidebar)/40 flex items-center justify-between shrink-0 select-none z-10">
              {/* Pill Switcher estilo Google AI Studio: [ • Preview ]  [ Code ] */}
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

                    <button
                      onClick={() => setPreviewKey(k => k + 1)}
                      className="p-1.5 rounded-lg hover:bg-(--bg-chat-hover) text-(--text-secondary) hover:text-(--text-primary) transition"
                      title="Recarregar aplicação"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
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
                </div>
              ) : (
                <div className="flex-1 overflow-hidden">
                  <SandpackCodeEditor
                    showTabs={false}
                    showLineNumbers
                    showInlineErrors
                    wrapContent
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
