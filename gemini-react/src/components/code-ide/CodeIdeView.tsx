import React, { useState, useEffect, useRef } from 'react';
import {
  SandpackProvider,
  SandpackCodeEditor,
  SandpackPreview,
  SandpackConsole,
  useSandpack,
} from '@codesandbox/sandpack-react';
import {
  Files,
  FilePlus,
  Trash2,
  Play,
  Terminal as TerminalIcon,
  RotateCcw,
  Sparkles,
  Download,
  FolderOpen,
  ArrowLeft,
  FileCode,
  Layers,
  PanelRightClose,
  PanelRightOpen
} from 'lucide-react';
import { CODE_TEMPLATES } from '../../constants/codeTemplates';
import type { ProjectTemplate, AgentChatMessage, HarnessAction } from '../../types/codeIde';
import { CodeAgentDrawer } from './CodeAgentDrawer';
import { runHarnessCycle } from '../../services/codeHarness';
import type { CustomModel } from '../../constants';

interface CodeIdeViewProps {
  onBackToChat: () => void;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  customModels: CustomModel[];
}

// Subcomponente interno para sincronizar arquivos do Sandpack com o estado do Nemon
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
      cleanFiles[path] = typeof fileObj === 'string' ? fileObj : fileObj.code;
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
}) => {
  const [template, setTemplate] = useState<ProjectTemplate>(() => {
    return (localStorage.getItem('nemon_code_template') as ProjectTemplate) || 'react-ts';
  });

  const [files, setFiles] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem(`nemon_code_files_${template}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const appCode = parsed['/App.tsx'] || parsed['/App.js'] || parsed['/index.html'] || '';
        // Se contiver códigos de exemplo antigos (Contador Interativo, Olá Desenvolvedor, Todo, etc.), descarta e carrega o template limpo
        if (
          !appCode.includes('Contador Interativo') &&
          !appCode.includes('Olá, Desenvolvedor!') &&
          !appCode.includes('Lista de Tarefas') &&
          !appCode.includes('updateClock')
        ) {
          return parsed;
        }
      } catch {
        /* fallback */
      }
    }
    return CODE_TEMPLATES[template].files;
  });

  const [activeFile, setActiveFile] = useState<string>(() => {
    return CODE_TEMPLATES[template].activeFile;
  });

  const [openFiles, setOpenFiles] = useState<string[]>([CODE_TEMPLATES[template].activeFile]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [bottomTab, setBottomTab] = useState<'preview' | 'terminal'>('preview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Resizing de painéis (VS Code Style)
  const [explorerWidth, setExplorerWidth] = useState<number>(() => {
    const saved = localStorage.getItem('nemon_code_explorer_width');
    return saved ? Math.max(160, Math.min(550, parseInt(saved, 10))) : 240;
  });

  const [bottomPanelHeight, setBottomPanelHeight] = useState<number>(() => {
    const saved = localStorage.getItem('nemon_code_bottom_height');
    return saved ? Math.max(80, Math.min(650, parseInt(saved, 10))) : 240;
  });

  const [drawerWidth, setDrawerWidth] = useState<number>(() => {
    const saved = localStorage.getItem('nemon_code_drawer_width');
    return saved ? Math.max(280, Math.min(750, parseInt(saved, 10))) : 380;
  });

  const [activeResize, setActiveResize] = useState<'explorer' | 'bottom' | 'drawer' | null>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; startDim: number }>({
    startX: 0,
    startY: 0,
    startDim: 0,
  });

  const handleStartResize = (type: 'explorer' | 'bottom' | 'drawer', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveResize(type);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startDim: type === 'explorer' ? explorerWidth : type === 'bottom' ? bottomPanelHeight : drawerWidth,
    };
  };

  useEffect(() => {
    if (!activeResize) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (activeResize === 'explorer') {
        const delta = e.clientX - dragStartRef.current.startX;
        const next = Math.max(160, Math.min(550, dragStartRef.current.startDim + delta));
        setExplorerWidth(next);
      } else if (activeResize === 'bottom') {
        const delta = dragStartRef.current.startY - e.clientY;
        const next = Math.max(80, Math.min(window.innerHeight * 0.75, dragStartRef.current.startDim + delta));
        setBottomPanelHeight(next);
      } else if (activeResize === 'drawer') {
        const delta = dragStartRef.current.startX - e.clientX;
        const next = Math.max(280, Math.min(window.innerWidth * 0.65, dragStartRef.current.startDim + delta));
        setDrawerWidth(next);
      }
    };

    const handleMouseUp = () => {
      if (activeResize === 'explorer') {
        localStorage.setItem('nemon_code_explorer_width', explorerWidth.toString());
      } else if (activeResize === 'bottom') {
        localStorage.setItem('nemon_code_bottom_height', bottomPanelHeight.toString());
      } else if (activeResize === 'drawer') {
        localStorage.setItem('nemon_code_drawer_width', drawerWidth.toString());
      }
      setActiveResize(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeResize, explorerWidth, bottomPanelHeight, drawerWidth]);

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
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Salva arquivos localmente
  useEffect(() => {
    localStorage.setItem(`nemon_code_files_${template}`, JSON.stringify(files));
  }, [files, template]);

  // Salva histórico do agente
  useEffect(() => {
    localStorage.setItem('nemon_code_agent_history', JSON.stringify(messages));
  }, [messages]);

  // Troca de template
  const handleSelectTemplate = (newTemplate: ProjectTemplate) => {
    setTemplate(newTemplate);
    localStorage.setItem('nemon_code_template', newTemplate);
    const newFiles = CODE_TEMPLATES[newTemplate].files;
    setFiles(newFiles);
    setActiveFile(CODE_TEMPLATES[newTemplate].activeFile);
    setOpenFiles([CODE_TEMPLATES[newTemplate].activeFile]);
    setShowTemplateModal(false);
  };

  // Reseta projeto para o template original
  const handleResetProject = () => {
    if (window.confirm('Deseja resetar todos os arquivos para o modelo original do template?')) {
      const initial = CODE_TEMPLATES[template].files;
      setFiles(initial);
      setActiveFile(CODE_TEMPLATES[template].activeFile);
      setOpenFiles([CODE_TEMPLATES[template].activeFile]);
    }
  };

  // Criar novo arquivo
  const handleNewFile = () => {
    const filename = window.prompt('Nome do novo arquivo (ex: /src/Utils.ts ou /Button.tsx):');
    if (!filename || !filename.trim()) return;
    let path = filename.trim().replace(/\\/g, '/');
    if (!path.startsWith('/')) path = '/' + path;

    if (files[path] !== undefined) {
      alert('Já existe um arquivo com esse nome.');
      return;
    }

    setFiles(prev => ({ ...prev, [path]: '// Novo arquivo\n' }));
    setActiveFile(path);
    if (!openFiles.includes(path)) setOpenFiles(prev => [...prev, path]);
  };

  // Excluir arquivo
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
      setOpenFiles(prev => prev.filter(f => f !== path));
      if (activeFile === path) {
        const remaining = Object.keys(files).filter(f => f !== path);
        if (remaining.length > 0) setActiveFile(remaining[0]);
      }
    }
  };

  // Baixar código como JSON/ZIP básico
  const handleDownloadProject = () => {
    const blob = new Blob([JSON.stringify(files, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nemon-${template}-project.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Enviar comando para o Agente Harness
  const handleSendMessage = async (prompt: string) => {
    const userMsg: AgentChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      timestamp: Date.now()
    };

    const assistantMsgId = (Date.now() + 1).toString();
    const initialAssistantMsg: AgentChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      actions: [],
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg, initialAssistantMsg]);
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const fileOps = {
      getFiles: () => files,
      setFiles: (updater: (prev: Record<string, string>) => Record<string, string>) => {
        setFiles(prev => {
          const next = updater(prev);
          return next;
        });
      },
      openFile: (path: string) => {
        setActiveFile(path);
        setOpenFiles(prev => (prev.includes(path) ? prev : [...prev, path]));
      }
    };

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      history.push({ role: 'user', content: prompt });

      await runHarnessCycle({
        prompt,
        files,
        activeFile,
        model: selectedModel,
        chatHistory: history,
        fileOps,
        onChunk: (text, thoughts) => {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsgId ? { ...m, content: text, thoughts: thoughts } : m
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
        signal: controller.signal
      });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsgId
              ? { ...m, content: (m.content ? m.content + '\n\n' : '') + `⚠️ Erro no harness: ${err?.message || err}` }
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

  const handleClearHistory = () => {
    if (window.confirm('Deseja limpar todo o histórico do chat do agente de código?')) {
      setMessages([]);
      localStorage.removeItem('nemon_code_agent_history');
    }
  };

  // Mapeia template do Nemon para o template do Sandpack
  const getSandpackTemplate = (t: ProjectTemplate): any => {
    switch (t) {
      case 'react-ts':
        return 'vite-react-ts';
      case 'react':
        return 'vite-react';
      case 'vanilla-ts':
        return 'vanilla-ts';
      case 'vanilla':
        return 'vanilla';
      case 'vue-ts':
        return 'vite-vue-ts';
      default:
        return 'vite-react-ts';
    }
  };

  const fileList = Object.keys(files).sort();

  return (
    <div className="flex flex-row h-full w-full bg-[#090d13] text-[#c9d1d9] overflow-hidden font-sans relative select-none">
      {/* Barra de Atividades (VS Code Activity Bar) */}
      <aside className="w-12 h-full bg-[#0d1117] border-r border-white/10 flex flex-col items-center py-3 justify-between z-20 shrink-0">
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={onBackToChat}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition mb-2"
            title="Voltar ao Chat tradicional"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-2 rounded-xl transition ${
              isSidebarOpen ? 'bg-[#ff5500]/20 text-[#ff5500]' : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
            title="Explorador de Arquivos (Ctrl+B)"
          >
            <Files className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowTemplateModal(true)}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition"
            title="Trocar Template do Projeto"
          >
            <Layers className="w-5 h-5" />
          </button>

          <button
            onClick={handleDownloadProject}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition"
            title="Exportar projeto (JSON)"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleResetProject}
            className="p-2 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-white/5 transition"
            title="Restaurar template inicial"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className={`p-2 rounded-xl transition ${
              isDrawerOpen ? 'bg-[#ff5500] text-white shadow-lg shadow-[#ff5500]/30' : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
            title={isDrawerOpen ? 'Fechar Assistente Harness' : 'Abrir Assistente Harness'}
          >
            <Sparkles className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Sidebar do Explorador de Arquivos (VS Code Explorer) */}
      {isSidebarOpen && (
        <aside
          style={{ width: explorerWidth }}
          className={`h-full bg-[#161b22] border-r border-white/10 flex flex-col shrink-0 z-10 select-none ${
            activeResize === 'explorer' ? '' : 'transition-[width] duration-150'
          }`}
        >
          <div className="h-10 px-3 border-b border-white/10 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-400">
            <span className="truncate">EXPLORADOR</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleNewFile}
                title="Novo Arquivo"
                className="p-1 rounded hover:bg-white/10 text-zinc-300 hover:text-white transition"
              >
                <FilePlus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="px-3 py-2 text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5 uppercase tracking-wider border-b border-white/5">
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span className="truncate">{CODE_TEMPLATES[template].name}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 text-xs">
            {fileList.map((path) => {
              const isActive = activeFile === path;
              return (
                <div
                  key={path}
                  onClick={() => {
                    setActiveFile(path);
                    if (!openFiles.includes(path)) setOpenFiles(prev => [...prev, path]);
                  }}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition text-xs group ${
                    isActive
                      ? 'bg-[#21262d] text-white font-medium border-l-2 border-[#ff5500]'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileCode className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#ff5500]' : 'text-zinc-500'}`} />
                    <span className="truncate font-mono text-[11px]">{path}</span>
                  </div>

                  <button
                    onClick={(e) => handleDeleteFile(e, path)}
                    title="Excluir arquivo"
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-red-400 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* Divisor de Resize do Explorador */}
      {isSidebarOpen && (
        <div
          onMouseDown={(e) => handleStartResize('explorer', e)}
          onDoubleClick={() => {
            setExplorerWidth(240);
            localStorage.setItem('nemon_code_explorer_width', '240');
          }}
          className="w-1.5 -ml-1 hover:w-2 hover:-ml-1.5 bg-transparent hover:bg-[#ff5500]/60 active:bg-[#ff5500] cursor-col-resize transition-all duration-150 z-20 shrink-0 select-none group flex items-center justify-center"
          title="Arrastar para redimensionar o Explorador (Duplo clique para redefinir)"
        >
          <div className="w-0.5 h-8 rounded-full bg-white/10 group-hover:bg-[#ff5500] transition-colors" />
        </div>
      )}

      {/* Área Central (Editor + Painel Inferior de Terminal/Preview) */}
      <main className="flex-1 h-full flex flex-col overflow-hidden bg-[#0d1117] min-w-0">
        <SandpackProvider
          template={getSandpackTemplate(template)}
          files={files}
          theme="dark"
          className="!h-full !w-full !flex !flex-col !flex-1 !min-h-0 !min-w-0 !overflow-hidden"
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden'
          }}
          options={{
            activeFile,
            visibleFiles: openFiles,
            recompileMode: 'delayed',
            recompileDelay: 400,
          }}
        >
          <SandpackSyncBridge onFilesChange={setFiles} activeFile={activeFile} />

          {/* Barra de Abas Superiores (Editor Tabs) */}
          <div className="h-10 bg-[#161b22] border-b border-white/10 flex items-center justify-between px-2 shrink-0 overflow-x-auto">
            <div className="flex items-center gap-1 overflow-x-auto h-full">
              {openFiles.map((path) => {
                const isActive = activeFile === path;
                return (
                  <div
                    key={path}
                    onClick={() => setActiveFile(path)}
                    className={`h-full flex items-center gap-2 px-3 border-r border-white/5 cursor-pointer text-xs font-mono transition select-none ${
                      isActive
                        ? 'bg-[#0d1117] text-zinc-100 border-t-2 border-t-[#ff5500] font-semibold'
                        : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-300'
                    }`}
                  >
                    <span className="truncate">{path}</span>
                    {openFiles.length > 1 && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenFiles(prev => prev.filter(f => f !== path));
                          if (activeFile === path) {
                            const remaining = openFiles.filter(f => f !== path);
                            if (remaining.length > 0) setActiveFile(remaining[0]);
                          }
                        }}
                        className="hover:text-red-400 p-0.5 rounded text-zinc-500"
                      >
                        ×
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Ações Rápidas no Topo */}
            <div className="flex items-center gap-2 pr-2 shrink-0">
              <button
                onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition ${
                  isDrawerOpen ? 'bg-[#ff5500]/20 text-[#ff5500]' : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                }`}
                title={isDrawerOpen ? 'Recolher Drawer de Chat' : 'Abrir Drawer de Chat'}
              >
                {isDrawerOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline text-[11px] font-medium">Harness Agent</span>
              </button>
            </div>
          </div>

          {/* Editor de Código & Painel Inferior em Split */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Editor de Código Principal */}
            <div className="flex-1 overflow-hidden min-h-0 relative">
              <SandpackCodeEditor
                showLineNumbers
                showInlineErrors
                wrapContent
                style={{ height: '100%', width: '100%' }}
              />
            </div>

            {/* Divisor de Resize do Painel Inferior */}
            <div
              onMouseDown={(e) => handleStartResize('bottom', e)}
              onDoubleClick={() => {
                setBottomPanelHeight(240);
                localStorage.setItem('nemon_code_bottom_height', '240');
              }}
              className="h-1.5 -mt-1 hover:h-2 hover:-mt-1.5 bg-transparent hover:bg-[#ff5500]/60 active:bg-[#ff5500] cursor-row-resize transition-all duration-150 z-20 shrink-0 select-none group flex items-center justify-center"
              title="Arrastar para redimensionar o Console / Live Preview (Duplo clique para redefinir)"
            >
              <div className="h-0.5 w-10 rounded-full bg-white/10 group-hover:bg-[#ff5500] transition-colors" />
            </div>

            {/* Painel Inferior: Terminal & Preview ao Vivo */}
            <div
              style={{ height: bottomPanelHeight }}
              className={`border-t border-white/10 flex flex-col bg-[#161b22] shrink-0 ${
                activeResize === 'bottom' ? '' : 'transition-[height] duration-150'
              }`}
            >
              {/* Abas do Painel Inferior */}
              <div className="h-9 px-3 border-b border-white/10 flex items-center justify-between text-xs bg-[#0d1117]/80">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBottomTab('preview')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition text-[11px] font-semibold ${
                      bottomTab === 'preview' ? 'bg-[#ff5500]/15 text-[#ff5500]' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Play className="w-3 h-3" />
                    <span>Live Preview</span>
                  </button>

                  <button
                    onClick={() => setBottomTab('terminal')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition text-[11px] font-semibold ${
                      bottomTab === 'terminal' ? 'bg-[#ff5500]/15 text-[#ff5500]' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <TerminalIcon className="w-3 h-3" />
                    <span>Console / Terminal</span>
                  </button>
                </div>

                <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                  Nemon Web Sandbox
                </span>
              </div>

              {/* Conteúdo do Painel Inferior */}
              <div className="flex-1 overflow-hidden min-h-0 bg-[#0d1117] relative">
                {bottomTab === 'preview' ? (
                  <div className="h-full w-full">
                    <SandpackPreview
                      showOpenInCodeSandbox={false}
                      showRefreshButton={true}
                      style={{ height: '100%', width: '100%' }}
                    />
                  </div>
                ) : (
                  <div className="h-full w-full overflow-y-auto font-mono text-xs">
                    <SandpackConsole style={{ height: '100%' }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </SandpackProvider>
      </main>

      {/* Divisor de Resize do Harness Agent Drawer */}
      {isDrawerOpen && (
        <div
          onMouseDown={(e) => handleStartResize('drawer', e)}
          onDoubleClick={() => {
            setDrawerWidth(380);
            localStorage.setItem('nemon_code_drawer_width', '380');
          }}
          className="w-1.5 -mr-1 hover:w-2 hover:-mr-1.5 bg-transparent hover:bg-[#ff5500]/60 active:bg-[#ff5500] cursor-col-resize transition-all duration-150 z-20 shrink-0 select-none group flex items-center justify-center"
          title="Arrastar para redimensionar o Harness Agent (Duplo clique para redefinir)"
        >
          <div className="w-0.5 h-8 rounded-full bg-white/10 group-hover:bg-[#ff5500] transition-colors" />
        </div>
      )}

      {/* Drawer de Chat do Agente Harness (Direita) */}
      <CodeAgentDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        messages={messages}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        onStop={handleStop}
        onClearHistory={handleClearHistory}
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
        customModels={customModels}
        activeFile={activeFile}
        width={drawerWidth}
        isDragging={activeResize === 'drawer'}
      />

      {/* Overlay transparente para prevenir que iframes capturem eventos durante drag */}
      {activeResize && (
        <div
          className={`fixed inset-0 z-[9999] select-none ${
            activeResize === 'bottom' ? 'cursor-row-resize' : 'cursor-col-resize'
          }`}
        />
      )}

      {/* Modal de Troca de Template */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#161b22] border border-white/10 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#ff5500]" />
                Escolher Template do Projeto
              </h3>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-md"
              >
                ×
              </button>
            </div>

            <div className="grid gap-2.5">
              {(Object.keys(CODE_TEMPLATES) as ProjectTemplate[]).map((tKey) => {
                const item = CODE_TEMPLATES[tKey];
                const isCurrent = template === tKey;
                return (
                  <button
                    key={tKey}
                    onClick={() => handleSelectTemplate(tKey)}
                    className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
                      isCurrent
                        ? 'bg-[#ff5500]/10 border-[#ff5500] text-white'
                        : 'bg-[#0d1117] border-white/5 hover:border-white/20 text-zinc-300'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-xs text-white">{item.name}</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">{item.description}</div>
                    </div>
                    {isCurrent && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#ff5500] text-white">
                        Ativo
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
