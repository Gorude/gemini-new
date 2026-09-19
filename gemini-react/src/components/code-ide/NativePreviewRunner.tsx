import { compileProjectToHtml, generateSandboxedRunnerHtml } from './previewCompiler';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  RotateCw,
  ExternalLink,
  Monitor,
  Tablet,
  Smartphone,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  Wrench,
} from 'lucide-react';

export interface PreviewLogItem {
  id: string;
  method: 'log' | 'warn' | 'error' | 'info';
  data: string[];
  timestamp: number;
}

interface NativePreviewRunnerProps {
  files: Record<string, string>;
  onLogMessage?: (log: PreviewLogItem) => void;
  onStatsChange?: (stats: { total: number; errors: number; warns: number }) => void;
  onErrorLogsChange?: (errorMessages: string[]) => void;
  onClearLogs?: () => void;
  onAutoFixErrors?: () => void;
  onSendErrorsToModel?: () => void;
  isGenerating?: boolean;
}

export const NativePreviewRunner: React.FC<NativePreviewRunnerProps> = ({
  files,
  onLogMessage,
  onStatsChange,
  onErrorLogsChange,
  onClearLogs,
  onAutoFixErrors: _onAutoFixErrors,
  onSendErrorsToModel,
  isGenerating: _isGenerating = false,
}) => {
  const [viewportMode, setViewportMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState({ total: 0, errors: 0, warns: 0 });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const errorLogsRef = useRef<string[]>([]);

  // Gera o HTML compilado de forma memoizada
  const compiledHtml = useMemo(() => {
    return compileProjectToHtml(files);
  }, [files]);

  // Quando o código do projeto for alterado/recompilado, reinicia os erros da execução anterior
  // para que problemas resolvidos sumam do console e não fiquem persistindo falsamente
  const prevCompiledHtmlRef = useRef(compiledHtml);
  useEffect(() => {
    if (prevCompiledHtmlRef.current !== compiledHtml) {
      prevCompiledHtmlRef.current = compiledHtml;
      errorLogsRef.current = [];
      queueMicrotask(() => setStats({ total: 0, errors: 0, warns: 0 }));
      onStatsChange?.({ total: 0, errors: 0, warns: 0 });
      onErrorLogsChange?.([]);
      onClearLogs?.();
    }
  }, [compiledHtml, onStatsChange, onErrorLogsChange, onClearLogs]);

  // Escuta mensagens de log e erros vindas do iframe via postMessage
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'NEMON_PREVIEW_LOG') return;

      const { method, data, timestamp } = event.data.payload || {};
      if (!method || !data) return;

      const logItem: PreviewLogItem = {
        id: `${timestamp}-${Math.random().toString(36).slice(2, 6)}`,
        method,
        data,
        timestamp,
      };

      onLogMessage?.(logItem);

      setStats(prev => {
        const next = {
          total: prev.total + 1,
          errors: prev.errors + (method === 'error' ? 1 : 0),
          warns: prev.warns + (method === 'warn' ? 1 : 0),
        };
        onStatsChange?.(next);
        return next;
      });

      if (method === 'error') {
        const errText = data.join(' ');
        if (!errorLogsRef.current.includes(errText)) {
          errorLogsRef.current = [...errorLogsRef.current, errText];
          onErrorLogsChange?.(errorLogsRef.current);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onLogMessage, onStatsChange, onErrorLogsChange]);

  // Recarrega o iframe
  const handleReload = useCallback(() => {
    errorLogsRef.current = [];
    setStats({ total: 0, errors: 0, warns: 0 });
    onStatsChange?.({ total: 0, errors: 0, warns: 0 });
    onErrorLogsChange?.([]);
    onClearLogs?.();
    setReloadKey(k => k + 1);
  }, [onStatsChange, onErrorLogsChange, onClearLogs]);

  // Abre em nova aba dentro de um invólucro de iframe sandboxed seguro (sem allow-same-origin)
  const handleOpenNewTab = () => {
    try {
      const runnerHtml = generateSandboxedRunnerHtml(compiledHtml);
      const blob = new Blob([runnerHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch {
      /* fallback */
    }
  };

  // Copia o HTML compilado completo
  const handleCopyHtml = () => {
    navigator.clipboard.writeText(compiledHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getViewportWidth = () => {
    switch (viewportMode) {
      case 'mobile':
        return '375px';
      case 'tablet':
        return '768px';
      default:
        return '100%';
    }
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-zinc-950">
      {/* Barra de Ferramentas Superior do Preview */}
      <div className="h-10 px-3 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between shrink-0 select-none">
        {/* Lado Esquerdo: Status e Controles de Recarga */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Nativo (0ms)</span>
          </div>

          <button
            onClick={handleReload}
            title="Recarregar Aplicação (F5)"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 active:scale-95 transition"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          {/* Badges de Erros / Avisos com Ação Manual */}
          {stats.errors > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/15 border border-red-500/30 text-red-400 text-[11px] font-mono">
                <XCircle className="w-3 h-3 text-red-400" />
                <span>{stats.errors} erro(s)</span>
              </div>
              {onSendErrorsToModel && (
                <button
                  type="button"
                  onClick={onSendErrorsToModel}
                  disabled={_isGenerating}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-[11px] font-sans font-medium transition cursor-pointer active:scale-95 disabled:opacity-50"
                  title="Mandar erros de execução do preview diretamente para o modelo corrigir"
                >
                  <Wrench className="w-3 h-3 text-red-300" />
                  <span>Mandar pro modelo</span>
                </button>
              )}
            </div>
          )}

          {stats.warns > 0 && (
            <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-mono">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>{stats.warns} aviso(s)</span>
            </div>
          )}
        </div>

        {/* Centro: Alternador de Resoluções Responsivas */}
        <div className="hidden md:flex items-center gap-1 p-0.5 bg-zinc-950/60 rounded-lg border border-zinc-800/80">
          <button
            onClick={() => setViewportMode('desktop')}
            title="Desktop (100%)"
            className={`p-1.5 rounded-md transition ${
              viewportMode === 'desktop'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewportMode('tablet')}
            title="Tablet (768px)"
            className={`p-1.5 rounded-md transition ${
              viewportMode === 'tablet'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Tablet className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewportMode('mobile')}
            title="Celular (375px)"
            className={`p-1.5 rounded-md transition ${
              viewportMode === 'mobile'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Lado Direito: Ações de Compartilhamento e Nova Aba */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopyHtml}
            title="Copiar Código HTML Completo"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleOpenNewTab}
            title="Abrir em Nova Aba do Navegador"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-200 text-xs font-medium transition"
          >
            <ExternalLink className="w-3 h-3" />
            <span className="hidden sm:inline">Nova Aba</span>
          </button>
        </div>
      </div>

      {/* Área de Visualização com Suporte a Moldura Responsiva */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-0 bg-zinc-950/40 relative">
        <div
          style={{
            width: getViewportWidth(),
            maxWidth: '100%',
            height: '100%',
            transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          className={`relative flex flex-col bg-white overflow-hidden shadow-2xl ${
            viewportMode !== 'desktop' ? 'my-4 rounded-xl border border-zinc-700/80 h-[calc(100%-2rem)]' : ''
          }`}
        >
          <iframe
            key={reloadKey}
            ref={iframeRef}
            srcDoc={compiledHtml}
            sandbox="allow-scripts allow-modals allow-forms allow-popups"
            className="w-full h-full border-0 bg-white"
            title="Aplicação em Execução"
          />
        </div>
      </div>
    </div>
  );
};
