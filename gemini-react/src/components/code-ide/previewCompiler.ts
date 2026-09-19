export const RUNTIME_TELEMETRY_SCRIPT = `
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
