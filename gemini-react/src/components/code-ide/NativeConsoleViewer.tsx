import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Terminal,
  Trash2,
  Search,
  AlertCircle,
  AlertTriangle,
  Info,
} from 'lucide-react';
import type { PreviewLogItem } from './NativePreviewRunner';

interface NativeConsoleViewerProps {
  logs: PreviewLogItem[];
  onClearLogs: () => void;
}

export const NativeConsoleViewer: React.FC<NativeConsoleViewerProps> = ({
  logs,
  onClearLogs,
}) => {
  const [filterLevel, setFilterLevel] = useState<'all' | 'error' | 'warn' | 'log'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filtra os logs por nível e termo de busca
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (filterLevel !== 'all' && l.method !== filterLevel) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const text = l.data.join(' ').toLowerCase();
        return text.includes(query);
      }
      return true;
    });
  }, [logs, filterLevel, searchQuery]);

  // Rola para o rodapé automaticamente quando novos logs chegam
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs.length]);

  const errorCount = logs.filter(l => l.method === 'error').length;
  const warnCount = logs.filter(l => l.method === 'warn').length;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-zinc-950 font-mono select-text">
      {/* Barra de Ferramentas do Console */}
      <div className="h-10 px-3 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between shrink-0 select-none text-xs">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-zinc-200">Console da Aplicação</span>

          {/* Filtros por Categoria */}
          <div className="flex items-center gap-1 ml-3 p-0.5 bg-zinc-950/80 rounded-md border border-zinc-800">
            <button
              onClick={() => setFilterLevel('all')}
              className={`px-2 py-0.5 rounded transition ${
                filterLevel === 'all'
                  ? 'bg-zinc-800 text-zinc-100 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Todos ({logs.length})
            </button>
            <button
              onClick={() => setFilterLevel('error')}
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition ${
                filterLevel === 'error'
                  ? 'bg-red-500/20 text-red-300 font-medium'
                  : 'text-zinc-400 hover:text-red-400'
              }`}
            >
              <AlertCircle className="w-3 h-3 text-red-400" />
              <span>Erros ({errorCount})</span>
            </button>
            <button
              onClick={() => setFilterLevel('warn')}
              className={`px-2 py-0.5 rounded flex items-center gap-1 transition ${
                filterLevel === 'warn'
                  ? 'bg-amber-500/20 text-amber-300 font-medium'
                  : 'text-zinc-400 hover:text-amber-400'
              }`}
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>Avisos ({warnCount})</span>
            </button>
          </div>
        </div>

        {/* Lado Direito: Campo de Busca e Botão de Limpar */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filtrar logs..."
              className="pl-7 pr-2 py-1 bg-zinc-950 border border-zinc-800 rounded-md text-[11px] text-zinc-200 placeholder-zinc-500 outline-none focus:border-zinc-700 w-36 sm:w-48"
            />
          </div>

          <button
            onClick={onClearLogs}
            title="Limpar Console"
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Lista de Mensagens de Log */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar text-xs">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-2 select-none">
            <Terminal className="w-8 h-8 opacity-40 text-zinc-600" />
            <p className="text-xs">Nenhum log registrado.</p>
            <p className="text-[11px] text-zinc-600">
              Interaja com a aplicação no Preview para visualizar console.log, warnings e erros.
            </p>
          </div>
        ) : (
          filteredLogs.map(log => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString([], {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            const isError = log.method === 'error';
            const isWarn = log.method === 'warn';

            return (
              <div
                key={log.id}
                className={`px-3 py-1.5 rounded flex items-start gap-2.5 border transition leading-relaxed ${
                  isError
                    ? 'bg-red-950/20 border-red-900/40 text-red-300'
                    : isWarn
                    ? 'bg-amber-950/20 border-amber-900/40 text-amber-300'
                    : 'bg-zinc-900/30 border-zinc-800/40 text-zinc-300'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  {isError ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  ) : isWarn ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-cyan-400" />
                  )}
                </div>

                <div className="flex-1 overflow-x-auto min-w-0">
                  <div className="whitespace-pre-wrap break-words">
                    {log.data.join(' ')}
                  </div>
                </div>

                <div className="shrink-0 text-[10px] text-zinc-500 select-none">
                  {timeStr}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
