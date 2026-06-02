import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, 
  X, 
  Trash2, 
  Search, 
  Database, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  Maximize2,
  Minimize2,
  ChevronDown,
  Code
} from 'lucide-react';
import { logger, type LogEntry } from '../services/logger';

const LogWindow: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'geral' | 'api'>('geral');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [isDragging, setIsDragging] = useState(false);

  const dragStart = useRef({ x: 0, y: 0 });
  const positionStart = useRef({ x: 0, y: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to central logger
  useEffect(() => {
    const unsubscribe = logger.subscribe((newLogs) => {
      setLogs(newLogs);
    });
    return unsubscribe;
  }, []);

  // Position window on bottom right by default on mount
  useEffect(() => {
    setPosition({
      x: Math.max(20, window.innerWidth - 540),
      y: Math.max(20, window.innerHeight - 520)
    });
  }, []);

  // Scroll to bottom on new logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, activeTab, isMinimized, isOpen]);

  // Drag listeners
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('details')) return;

    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    positionStart.current = { x: position.x, y: position.y };
    e.preventDefault();
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 200, positionStart.current.x + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 50, positionStart.current.y + dy))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const clearLogs = () => {
    logger.clear();
  };

  // Filter logs
  const filteredLogs = logs.filter(log => {
    // Filter by tab
    const isApiLog = log.type.startsWith('api');
    if (activeTab === 'geral' && isApiLog) return false;
    if (activeTab === 'api' && !isApiLog) return false;

    // Filter by search query
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      log.message.toLowerCase().includes(query) ||
      log.type.toLowerCase().includes(query) ||
      (log.details && JSON.stringify(log.details).toLowerCase().includes(query))
    );
  });

  const getLogBadge = (type: LogEntry['type']) => {
    switch (type) {
      case 'error':
      case 'api-error':
        return <span className="px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-[9px] font-bold text-red-500 flex items-center gap-1 shrink-0"><AlertTriangle className="w-2.5 h-2.5" />ERRO</span>;
      case 'warn':
        return <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[9px] font-bold text-amber-500 flex items-center gap-1 shrink-0"><AlertTriangle className="w-2.5 h-2.5" />AVISO</span>;
      case 'api-request':
        return <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[9px] font-bold text-blue-400 flex items-center gap-1 shrink-0"><Database className="w-2.5 h-2.5" />REQ</span>;
      case 'api-response':
        return <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-400 flex items-center gap-1 shrink-0"><CheckCircle2 className="w-2.5 h-2.5" />RESP</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded bg-zinc-500/10 border border-zinc-500/20 text-[9px] font-bold text-zinc-400 flex items-center gap-1 shrink-0"><Info className="w-2.5 h-2.5" />INFO</span>;
    }
  };

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'error':
      case 'api-error':
        return 'text-red-400 border-red-950/20 bg-red-950/5';
      case 'warn':
        return 'text-amber-400 border-amber-950/20 bg-amber-950/5';
      case 'api-request':
        return 'text-blue-300 border-blue-950/20 bg-blue-950/5';
      case 'api-response':
        return 'text-emerald-400 border-emerald-950/20 bg-emerald-950/5';
      default:
        return 'text-zinc-300 border-zinc-800 bg-transparent';
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-[9998] p-3 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 text-white shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300 group/btn"
        title="Painel de Debug"
      >
        <Code className="w-5 h-5 text-white group-hover/btn:scale-110 transition-transform" />
        {logs.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-black rounded-full h-5 w-5 flex items-center justify-center border border-zinc-950 animate-pulse">
            {logs.length}
          </span>
        )}
      </button>

      {/* Draggable Log Window */}
      {isOpen && (
        <div
          style={{ 
            left: `${position.x}px`, 
            top: `${position.y}px` 
          }}
          className={`fixed z-[9999] w-[500px] rounded-2xl border border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md shadow-2xl overflow-hidden select-none ${
            isDragging ? '' : 'transition-all duration-300'
          } ${
            isMinimized ? 'h-[48px]' : 'h-[450px]'
          }`}
        >
          {/* Draggable Header */}
          <div 
            onMouseDown={handleMouseDown}
            className={`flex items-center justify-between px-4 py-3 bg-zinc-900/40 border-b border-zinc-800/60 cursor-move ${
              isDragging ? 'bg-zinc-900/60' : ''
            }`}
          >
            <div className="flex items-center gap-2 text-zinc-200">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider">Logs & Diagnósticos</span>
            </div>
            
            <div className="flex items-center gap-1.5">
              <button 
                onClick={() => setIsMinimized(!isMinimized)} 
                className="p-1 hover:bg-white/5 rounded text-zinc-400 hover:text-white transition"
                title={isMinimized ? "Maximizar" : "Minimizar"}
              >
                {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </button>
              <button 
                onClick={() => setIsOpen(false)} 
                className="p-1 hover:bg-red-500/10 hover:text-red-400 rounded text-zinc-400 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Body Content */}
          {!isMinimized && (
            <div className="flex flex-col h-[402px] text-zinc-300 text-xs">
              {/* Toolbar & Tabs */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-zinc-900 bg-zinc-900/20 px-3 py-2 gap-2">
                {/* Tabs */}
                <div className="flex items-center gap-1 bg-black/30 p-0.5 rounded-lg border border-zinc-800/40 w-fit">
                  <button 
                    onClick={() => setActiveTab('geral')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md uppercase tracking-wider transition ${
                      activeTab === 'geral' 
                        ? 'bg-indigo-600/25 border border-indigo-500/25 text-indigo-400 shadow-sm' 
                        : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                    }`}
                  >
                    Log Geral
                  </button>
                  <button 
                    onClick={() => setActiveTab('api')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md uppercase tracking-wider transition flex items-center gap-1 ${
                      activeTab === 'api' 
                        ? 'bg-indigo-600/25 border border-indigo-500/25 text-indigo-400 shadow-sm' 
                        : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                    }`}
                  >
                    API Gemma
                    <span className="px-1 py-0.2 bg-indigo-500/20 text-indigo-400 rounded-full text-[8px] font-bold">
                      {logs.filter(l => l.type.startsWith('api')).length}
                    </span>
                  </button>
                </div>

                {/* Filter and Clear Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-2 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text" 
                      placeholder="Filtrar logs..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-black/40 border border-zinc-800/80 rounded-lg pl-7 pr-2.5 py-1 text-[10px] w-[140px] focus:outline-none focus:border-indigo-500/40 text-zinc-200 transition"
                    />
                  </div>
                  <button 
                    onClick={clearLogs}
                    className="p-1.5 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 border border-transparent hover:border-red-500/20 rounded-lg transition"
                    title="Limpar logs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Log Streams */}
              <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-3 space-y-1.5 font-mono text-[10.5px] custom-scrollbar bg-black/10 select-text"
              >
                {filteredLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-2 animate-pulse">
                    <Terminal className="w-8 h-8 opacity-40" />
                    <span className="text-[10px] uppercase font-bold tracking-wider">Nenhum log encontrado</span>
                  </div>
                ) : (
                  filteredLogs.map((log) => (
                    <div 
                      key={log.id} 
                      className={`p-2 rounded-lg border flex flex-col gap-1 transition-all ${getLogColor(log.type)}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {getLogBadge(log.type)}
                          <span className="font-semibold break-all leading-normal">{log.message}</span>
                        </div>
                        <span className="text-[9px] text-zinc-500 font-normal shrink-0">{log.timestamp}</span>
                      </div>

                      {/* Collapsible Details for API Requests */}
                      {log.type.startsWith('api') && log.details && (
                        <details className="mt-1 bg-zinc-950/50 rounded-md border border-zinc-900 p-2 cursor-default">
                          <summary className="text-[9px] text-zinc-500 hover:text-indigo-400 cursor-pointer select-none font-bold uppercase tracking-wider flex items-center gap-1">
                            Ver Payload / Resposta
                            <ChevronDown className="w-2.5 h-2.5 transition-transform" />
                          </summary>
                          <div className="mt-2 text-[10px] font-mono whitespace-pre-wrap max-h-[180px] overflow-y-auto custom-scrollbar space-y-2 select-text">
                            {log.details.url && (
                              <div>
                                <span className="text-zinc-600 font-bold">API Endpoint:</span>
                                <div className="bg-black/30 p-1.5 rounded text-zinc-400 mt-1 max-w-full overflow-x-auto text-[9.5px]">
                                  {log.details.url}
                                </div>
                              </div>
                            )}
                            {log.details.payload && (
                              <div>
                                <span className="text-indigo-400 font-bold">Request Payload:</span>
                                <pre className="bg-black/30 p-1.5 rounded text-zinc-300 mt-1 max-w-full overflow-x-auto text-[9.5px]">
                                  {JSON.stringify(log.details.payload, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.details.response && (
                              <div>
                                <span className="text-emerald-400 font-bold">Response Stream Summary:</span>
                                <pre className="bg-black/30 p-1.5 rounded text-zinc-300 mt-1 max-w-full overflow-x-auto text-[9.5px]">
                                  {typeof log.details.response === 'string' 
                                    ? log.details.response 
                                    : JSON.stringify(log.details.response, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.details.error && (
                              <div>
                                <span className="text-red-400 font-bold">Error Details:</span>
                                <pre className="bg-red-950/20 border border-red-500/20 p-1.5 rounded text-red-300 mt-1 text-[9.5px]">
                                  {log.details.error}
                                </pre>
                              </div>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default LogWindow;
