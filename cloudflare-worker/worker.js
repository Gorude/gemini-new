/**
 * DuckDuckGo Search & MCP Bridge - Cloudflare Worker
 * 
 * Permite realizar buscas no DuckDuckGo e extrair conteúdo de páginas na web 24/7
 * de forma 100% gratuita, sem necessidade de manter o computador ligado ou rodar `npm run mcp`.
 * 
 * Compatível com:
 * - REST API simples (/health, /search, /fetch)
 * - MCP (Model Context Protocol) JSON-RPC (/tools/call, /tools/list)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-requested-with',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS
    }
  });
}

function unescapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

function isSafeHttpUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const h = parsed.hostname.toLowerCase().trim();
    const cleanHost = h.replace(/^\[|\]$/g, '');
    if (
      cleanHost === 'localhost' ||
      cleanHost === '127.0.0.1' ||
      cleanHost === '::1' ||
      cleanHost === '::' ||
      cleanHost === '0.0.0.0' ||
      cleanHost === '169.254.169.254'
    ) {
      return false;
    }
    // IPv4 privadas RFC 1918 e Link-Local
    if (
      cleanHost.startsWith('10.') ||
      cleanHost.startsWith('192.168.') ||
      cleanHost.startsWith('169.254.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanHost)
    ) {
      return false;
    }
    // IPv6 link-local e privadas
    if (
      cleanHost.startsWith('fe80:') ||
      cleanHost.startsWith('fc') ||
      cleanHost.startsWith('fd')
    ) {
      return false;
    }
    // Metadados de nuvem e hosts internos
    if (cleanHost.endsWith('.internal') || cleanHost.endsWith('.local')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function directDuckDuckGoSearch(query, count = 20) {
  const safeCount = Math.min(Math.max(1, count || 20), 30);
  const results = [];
  const encodedQuery = encodeURIComponent(query);

  // 1. Tenta DuckDuckGo Lite (POST): não sofre bloqueio por desafio bot / captcha
  try {
    const resLite = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      body: 'q=' + encodedQuery,
      signal: AbortSignal.timeout(6000)
    });

    if (resLite.ok) {
      const html = await resLite.text();
      const aTags = html.match(/<a[^>]*class=['"]result-link['"][\s\S]*?<\/a>/gi) || [];
      const snippets = (html.match(/<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi) || [])
        .map(s => unescapeHtml(s));

      for (let i = 0; i < aTags.length && results.length < safeCount; i++) {
        const a = aTags[i];
        const hrefMatch = a.match(/href=['"]([^'"]+)['"]/i);
        const title = unescapeHtml(a);
        if (hrefMatch && title) {
          let uri = hrefMatch[1];
          if (uri.includes('uddg=')) {
            try {
              const u = new URL(uri.startsWith('http') ? uri : 'https://duckduckgo.com' + uri);
              const real = u.searchParams.get('uddg');
              if (real) uri = decodeURIComponent(real);
            } catch {}
          }
          if (uri.startsWith('//')) uri = 'https:' + uri;
          if (!isSafeHttpUrl(uri)) continue;

          results.push({ title, uri, snippet: snippets[i] || '' });
        }
      }

      if (results.length > 0) return results;
    }
  } catch (e) {
    // Continua para o endpoint HTML tradicional se o Lite falhar
  }

  // 2. Fallback: DuckDuckGo HTML tradicional
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (res.ok) {
      const html = await res.text();
      const blocks = html.split('class="result ');

      for (let i = 1; i < blocks.length && results.length < safeCount; i++) {
        const b = blocks[i];
        if (/result--ad|highlight_ad|badge--ad/i.test(b)) continue;

        const linkMatch = b.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        const snippetMatch = b.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);

        if (linkMatch) {
          let rawUrl = linkMatch[1];
          if (rawUrl.includes('uddg=')) {
            try {
              const u = new URL(rawUrl.startsWith('http') ? rawUrl : 'https://duckduckgo.com' + rawUrl);
              const realUrl = u.searchParams.get('uddg');
              if (realUrl) rawUrl = decodeURIComponent(realUrl);
            } catch {}
          }
          if (rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl;
          if (!isSafeHttpUrl(rawUrl)) continue;

          if (/duckduckgo\.com\/(y\.js|duckduckgo-help-pages)/i.test(rawUrl) || /bing\.com\/aclick/i.test(rawUrl) || /ad_provider=/i.test(rawUrl)) {
            continue;
          }

          const title = unescapeHtml(linkMatch[2]);
          if (/^(more info|anúncio|patrocinado|ad)$/i.test(title)) continue;

          const snippet = snippetMatch ? unescapeHtml(snippetMatch[1]) : '';
          if (title && rawUrl) {
            results.push({ title, uri: rawUrl, snippet });
          }
        }
      }
    }
  } catch (e) {
    // Falha silenciosa
  }

  return results;
}

export async function directFetchUrl(url) {
  if (!isSafeHttpUrl(url)) return `[URL inválida ou não autorizada: ${url}]`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(2500)
    });
    if (!res.ok) return `[Falha HTTP ${res.status} ao acessar link ${url}]`;

    const contentType = res.headers.get('content-type') || '';
    if (contentType && !/text|html|xml|json/i.test(contentType)) {
      return `[Conteúdo não textual ignorado: ${contentType}]`;
    }

    const rawText = await res.text();
    // Protege contra limites de CPU da Cloudflare (10ms):
    // Descarta <head> se <body> existir e limita a 100KB antes das regexes
    let html = rawText;
    const bodyMatch = rawText.match(/<body[\s\S]*?<\/body>/i);
    if (bodyMatch) {
      html = bodyMatch[0];
    }
    html = html.slice(0, 100000);

    const clean = html
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, '')
      .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer\b[\s\S]*?<\/footer>/gi, '')
      .replace(/<header\b[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();

    return clean.slice(0, 3500);
  } catch (err) {
    return `[Erro ao ler ${url}: ${err.message || String(err)}]`;
  }
}

export function formatDuckDuckGoSummary(results) {
  const sources = [];
  const lines = [];

  for (const r of results) {
    if (!sources.some(s => s.uri === r.uri)) {
      sources.push({ title: r.title, uri: r.uri });
    }
    const snippetText = r.snippet ? `: ${r.snippet}` : '';
    lines.push(`- **${r.title}** (${r.uri})${snippetText}`);
  }

  const summary = `Resultados da pesquisa no DuckDuckGo:\n${lines.join('\n')}`;
  return { summary, sources };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS, status: 204 });
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    // 1. Health check
    if (pathname === '/health' || (pathname === '/' && request.method === 'GET')) {
      return jsonResponse({
        status: 'ok',
        service: 'duckduckgo-cloudflare-worker',
        version: '1.0.0',
        timestamp: Date.now(),
        routes: {
          health: 'GET /health',
          search: 'POST /search ou GET /search?q=...',
          fetch: 'POST /fetch (corpo: { url })',
          mcp: 'POST /tools/call (JSON-RPC MCP standard)'
        }
      });
    }

    // 2. Busca Web (/search)
    if (pathname === '/search' && (request.method === 'POST' || request.method === 'GET')) {
      let query = '';
      let maxResults = 20;

      if (request.method === 'GET') {
        query = url.searchParams.get('q') || url.searchParams.get('query') || '';
        const limitParam = url.searchParams.get('limit') || url.searchParams.get('count');
        if (limitParam) maxResults = parseInt(limitParam, 10) || 20;
      } else {
        try {
          const body = await request.json();
          query = body.query || body.q || '';
          if (body.max_results || body.count) maxResults = body.max_results || body.count;
        } catch {
          return jsonResponse({ error: 'JSON inválido no corpo da requisição.' }, 400);
        }
      }

      if (!query.trim()) {
        return jsonResponse({ error: 'Parâmetro "query" é obrigatório.' }, 400);
      }

      const results = await directDuckDuckGoSearch(query, maxResults);

      // Enriquecimento opcional: lê o conteúdo dos primeiros 3 links
      const topLinks = results.slice(0, 3);
      await Promise.allSettled(topLinks.map(async (item) => {
        if (item.uri) {
          const content = await directFetchUrl(item.uri);
          if (content && !content.startsWith('[')) {
            item.snippet = (item.snippet ? `${item.snippet}\n` : '') + `[Conteúdo da página]: ${content}`;
          }
        }
      }));

      const formatted = formatDuckDuckGoSummary(results);

      return jsonResponse({
        success: true,
        via: 'duckduckgo-cloudflare-worker',
        results,
        summary: formatted.summary,
        sources: formatted.sources
      });
    }

    // 3. Leitura direta de página (/fetch)
    if (pathname === '/fetch' && request.method === 'POST') {
      try {
        const body = await request.json();
        const targetUrl = body.url || body.uri;
        if (!targetUrl) {
          return jsonResponse({ error: 'Campo "url" é obrigatório.' }, 400);
        }

        const content = await directFetchUrl(targetUrl);
        return jsonResponse({
          success: true,
          url: targetUrl,
          content
        });
      } catch {
        return jsonResponse({ error: 'JSON inválido no corpo da requisição.' }, 400);
      }
    }

    // 4. MCP Protocol Standard (/tools/call e /tools/list)
    if (pathname === '/tools/call' && request.method === 'POST') {
      try {
        const body = await request.json();
        const toolName = body.params?.name || body.name;
        const toolArgs = body.params?.arguments || body.arguments || {};
        const reqId = body.id || Date.now();

        if (toolName === 'search' || toolName === 'duckduckgo_search') {
          const q = toolArgs.query || toolArgs.q || '';
          const results = await directDuckDuckGoSearch(q, toolArgs.max_results || 20);

          return jsonResponse({
            jsonrpc: '2.0',
            id: reqId,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(results)
                }
              ]
            }
          });
        }

        if (toolName === 'fetch' || toolName === 'get_page_content') {
          const targetUrl = toolArgs.url || toolArgs.uri || '';
          const content = await directFetchUrl(targetUrl);

          return jsonResponse({
            jsonrpc: '2.0',
            id: reqId,
            result: {
              content: [
                {
                  type: 'text',
                  text: content
                }
              ]
            }
          });
        }

        return jsonResponse({
          jsonrpc: '2.0',
          id: reqId,
          error: { code: -32601, message: `Ferramenta "${toolName}" não encontrada.` }
        }, 404);
      } catch (err) {
        return jsonResponse({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Erro ao processar JSON-RPC.' }
        }, 400);
      }
    }

    if (pathname === '/tools/list' && (request.method === 'POST' || request.method === 'GET')) {
      return jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: {
          tools: [
            {
              name: 'search',
              description: 'Pesquisa na web usando DuckDuckGo sem restrições de CORS.',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Termos de busca' },
                  max_results: { type: 'number', description: 'Número máximo de resultados' }
                },
                required: ['query']
              }
            },
            {
              name: 'fetch',
              description: 'Lê e extrai o conteúdo limpo de texto de uma página web.',
              inputSchema: {
                type: 'object',
                properties: {
                  url: { type: 'string', description: 'URL da página' }
                },
                required: ['url']
              }
            }
          ]
        }
      });
    }

    return jsonResponse({ error: 'Rota não encontrada.' }, 404);
  }
};
