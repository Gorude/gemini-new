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
  Sparkles,
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

const RUNTIME_TELEMETRY_SCRIPT = `
<script id="nemon-runtime-telemetry">
(function() {
  // Polyfill de armazenamento in-memory para sandbox seguro sem allow-same-origin
  try {
    var testKey = '__nemon_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
  } catch (e) {
    (function() {
      function createMemoryStorage() {
        var store = {};
        return {
          getItem: function(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
          setItem: function(key, val) { store[key] = String(val); },
          removeItem: function(key) { delete store[key]; },
          clear: function() { store = {}; },
          key: function(idx) { return Object.keys(store)[idx] || null; },
          get length() { return Object.keys(store).length; }
        };
      }
      try {
        var memStorage = createMemoryStorage();
        Object.defineProperty(window, 'localStorage', { value: memStorage, configurable: true, writable: true });
        Object.defineProperty(window, 'sessionStorage', { value: createMemoryStorage(), configurable: true, writable: true });
      } catch (err) {}
    })();
  }

  function serialize(item) {
    if (item === null) return 'null';
    if (item === undefined) return 'undefined';
    if (item instanceof Error) return item.stack || item.message;
    if (typeof item === 'object') {
      try { return JSON.stringify(item); } catch(e) { return String(item); }
    }
    return String(item);
  }

  function send(type, args) {
    try {
      var arr = [];
      for (var i = 0; i < args.length; i++) {
        arr.push(serialize(args[i]));
      }
      window.parent.postMessage({
        type: 'NEMON_PREVIEW_LOG',
        payload: {
          method: type,
          data: arr,
          timestamp: Date.now()
        }
      }, '*');
    } catch(e) {}
  }

  var origLog = console.log;
  var origWarn = console.warn;
  var origError = console.error;
  var origInfo = console.info;

  console.log = function() { send('log', arguments); if (origLog) origLog.apply(console, arguments); };
  console.warn = function() {
    var msg = arguments.length > 0 ? String(arguments[0]) : '';
    // Suprime o aviso inofensivo de desenvolvimento do CDN do Tailwind no ambiente de preview
    if (msg.indexOf('cdn.tailwindcss.com should not be used in production') !== -1) {
      return;
    }
    send('warn', arguments);
    if (origWarn) origWarn.apply(console, arguments);
  };
  console.error = function() { send('error', arguments); if (origError) origError.apply(console, arguments); };
  console.info = function() { send('info', arguments); if (origInfo) origInfo.apply(console, arguments); };

  window.addEventListener('error', function(e) {
    var loc = (e.filename ? e.filename.split('/').pop() : 'inline') + ':' + (e.lineno || 0);
    send('error', [e.message + ' (' + loc + ')']);
  });

  window.addEventListener('unhandledrejection', function(e) {
    var reason = e.reason ? (e.reason.message || String(e.reason)) : 'Erro desconhecido em Promise';
    send('error', ['Promise rejeitada: ' + reason]);
  });
})();
</script>
`;

/**
 * Compila os arquivos virtuais do projeto em um documento HTML autocontido.
 * Injeta estilos e scripts locais e inclui a telemetria de runtime.
 */
export function compileProjectToHtml(files: Record<string, string>): string {
  // 1. Identifica o ponto de entrada HTML
  let mainHtml = files['/index.html'] || files['index.html'];

  if (!mainHtml) {
    const htmlKey = Object.keys(files).find(k => k.endsWith('.html'));
    if (htmlKey) {
      mainHtml = files[htmlKey];
    }
  }

  // 2. Se não houver HTML, mas houver script, cria um esqueleto HTML5 padrão com CSS puro
  if (!mainHtml) {
    const jsKey = Object.keys(files).find(k => k.endsWith('.js') || k.endsWith('.ts'));
    const cssKey = Object.keys(files).find(k => k.endsWith('.css'));
    const jsCode = jsKey ? files[jsKey] : '';
    const cssCode = cssKey ? files[cssKey] : '';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aplicação</title>
  ${RUNTIME_TELEMETRY_SCRIPT}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background-color: #09090b; color: #f4f4f5; min-height: 100vh; padding: 1rem; font-family: system-ui, -apple-system, sans-serif; }
    ${cssCode}
  </style>
</head>
<body>
  <div id="root"></div>
  ${jsCode ? `<script>\n${jsCode}\n</script>` : ''}
</body>
</html>`;
  }

  let bundled = mainHtml;

  // 3. Resolve e embute arquivos CSS locais referenciados
  bundled = bundled.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
    let cleanPath = href.startsWith('/') ? href : '/' + href;
    cleanPath = cleanPath.replace(/^\.\//, '/');
    if (files[cleanPath]) {
      return `<style data-source="${cleanPath}">\n${files[cleanPath]}\n</style>`;
    }
    return match;
  });

  // 4. Resolve e embute arquivos JavaScript locais referenciados
  bundled = bundled.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
    let cleanPath = src.startsWith('/') ? src : '/' + src;
    cleanPath = cleanPath.replace(/^\.\//, '/');
    if (files[cleanPath]) {
      return `<script data-source="${cleanPath}">\n${files[cleanPath]}\n</script>`;
    }
    return match;
  });

  // 5. Injeta telemetria de logs antes de qualquer outro script
  if (bundled.includes('<head>')) {
    bundled = bundled.replace('<head>', '<head>\n' + RUNTIME_TELEMETRY_SCRIPT);
  } else if (bundled.includes('<html>')) {
    bundled = bundled.replace('<html>', '<html><head>' + RUNTIME_TELEMETRY_SCRIPT + '</head>');
  } else {
    bundled = RUNTIME_TELEMETRY_SCRIPT + '\n' + bundled;
  }

  return bundled;
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
      setStats({ total: 0, errors: 0, warns: 0 });
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

  // Abre em nova aba como Blob URL
  const handleOpenNewTab = () => {
    try {
      const blob = new Blob([compiledHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
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
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-[11px] font-sans font-medium transition cursor-pointer active:scale-95 disabled:opacity-50"
                  title="Mandar erros de execução do preview diretamente para o modelo corrigir"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
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
