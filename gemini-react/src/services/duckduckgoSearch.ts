/**
 * Serviço de Busca DuckDuckGo (MCP & Web Direct) com Fallback.
 * 
 * Permite buscar na web prioritariamente usando DuckDuckGo (via servidor MCP local
 * ou busca web direta) e extrair títulos, snippets e links reais.
 */

export interface DuckDuckGoResult {
  title: string;
  uri: string;
  snippet: string;
}

export interface DuckDuckGoSearchOutput {
  summary: string;
  sources: { title: string; uri: string }[];
  provider: 'duckduckgo-mcp' | 'duckduckgo';
}

let globalMcpEndpoint = typeof localStorage !== 'undefined' 
  ? (localStorage.getItem('nemon_mcp_endpoint') || 'http://localhost:3333')
  : 'http://localhost:3333';

export function setGlobalMcpEndpoint(url: string) {
  globalMcpEndpoint = (url || '').trim().replace(/\/+$/, '');
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('nemon_mcp_endpoint', globalMcpEndpoint);
    }
  } catch {
    // ignore
  }
}

export function getGlobalMcpEndpoint(): string {
  return globalMcpEndpoint;
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Faz o parse do HTML retornado pela página de busca do DuckDuckGo (html.duckduckgo.com).
 */
export function parseDuckDuckGoHtml(html: string): DuckDuckGoResult[] {
  const results: DuckDuckGoResult[] = [];
  if (!html) return results;

  const blocks = html.split('class="result ');
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    const linkMatch = b.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = b.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);

    if (linkMatch) {
      let rawUrl = linkMatch[1];
      // Desfaz o redirecionamento interno do DDG (/l/?uddg=https%3A%2F%2F...)
      if (rawUrl.includes('uddg=')) {
        try {
          const u = new URL(rawUrl.startsWith('http') ? rawUrl : 'https://duckduckgo.com' + rawUrl);
          const realUrl = u.searchParams.get('uddg');
          if (realUrl) rawUrl = decodeURIComponent(realUrl);
        } catch {
          // fallback para rawUrl
        }
      }

      const title = unescapeHtml(linkMatch[2]);
      const snippet = snippetMatch ? unescapeHtml(snippetMatch[1]) : '';

      if (title && rawUrl) {
        results.push({ title, uri: rawUrl, snippet });
      }
    }
  }

  return results;
}

/**
 * Formata os resultados do DuckDuckGo em um resumo factual textual + lista de fontes.
 */
export function formatDuckDuckGoSummary(results: DuckDuckGoResult[]): {
  summary: string;
  sources: { title: string; uri: string }[];
} {
  const sources: { title: string; uri: string }[] = [];
  const lines: string[] = [];

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

/**
 * Tenta buscar através de um servidor MCP local (MCP Server Bridge).
 */
/**
 * Tenta buscar através de um servidor MCP local (MCP Server Bridge).
 * Verifica primeiro o endpoint de saúde com timeout curto para evitar poluir o console do navegador
 * com ERR_CONNECTION_REFUSED caso o bridge local não esteja em execução.
 */
let lastMcpOfflineCheck = 0;
const MCP_OFFLINE_COOLDOWN_MS = 30000; // 30s cooldown se offline

export function resetMcpOfflineState() {
  lastMcpOfflineCheck = 0;
}

export async function searchDuckDuckGoMcp(
  query: string,
  mcpEndpoint: string = globalMcpEndpoint,
  signal?: AbortSignal
): Promise<{ summary: string; sources: { title: string; uri: string }[] } | null> {
  const isLocalDev = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  // Se estiver no dev server do Vite (porta 5173, etc), prioriza a rota interna do Vite
  const endpoint = (mcpEndpoint || (isLocalDev ? window.location.origin : 'http://localhost:3333')).replace(/\/+$/, '');

  if (!endpoint) return null;

  // Evita bombardear o console com ERR_CONNECTION_REFUSED a cada busca se o bridge estiver offline
  if (Date.now() - lastMcpOfflineCheck < MCP_OFFLINE_COOLDOWN_MS) {
    return null;
  }

  // 0. Probe rápido de saúde (1.2s): se o servidor não estiver online, marca cooldown
  try {
    const healthSig = AbortSignal.timeout(1200);
    const combinedHealth = signal ? AbortSignal.any([signal, healthSig]) : healthSig;
    const healthRes = await fetch(`${endpoint}/health`, { method: 'GET', signal: combinedHealth });
    if (!healthRes.ok) {
      lastMcpOfflineCheck = Date.now();
      return null;
    }
  } catch {
    // Bridge MCP não está em execução no momento
    lastMcpOfflineCheck = Date.now();
    return null;
  }

  // 1. Tenta POST /search simplificado do bridge
  try {
    const res = await fetch(`${endpoint}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4000)]) : AbortSignal.timeout(4000)
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        // Enriquecimento com ferramenta 'fetch' (ilimitada): lê conteúdos dos links em paralelo
        const linksToFetch = data.results.slice(0, 3);
        await Promise.allSettled(linksToFetch.map(async (linkItem: any) => {
          if (!linkItem?.uri) return;
          try {
            const fetchRes = await fetch(`${endpoint}/fetch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: linkItem.uri }),
              signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(3500)]) : AbortSignal.timeout(3500)
            });
            if (fetchRes.ok) {
              const fetchJson = await fetchRes.json();
              if (fetchJson.content) {
                linkItem.snippet = (linkItem.snippet ? `${linkItem.snippet}\n` : '') + `[Conteúdo principal]: ${fetchJson.content.slice(0, 1200)}`;
              }
            }
          } catch {}
        }));
        return formatDuckDuckGoSummary(data.results);
      }
      if (data.summary && Array.isArray(data.sources)) {
        return { summary: data.summary, sources: data.sources };
      }
    }
  } catch {
    // Falha no /search, tenta o protocolo JSON-RPC standard do MCP
  }

  // 2. Tenta protocolo standard do MCP: POST /tools/call
  try {
    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'search',
        arguments: { query }
      }
    };

    const res = await fetch(`${endpoint}/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4000)]) : AbortSignal.timeout(4000)
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.result?.content;
      if (Array.isArray(content) && content.length > 0) {
        const textContent = content.map(c => c.text || '').join('\n');
        // Se o MCP retornou JSON em string
        try {
          const parsed = JSON.parse(textContent);
          if (Array.isArray(parsed)) {
            const mapped = parsed.map((item: any) => ({
              title: item.title || item.name || 'DuckDuckGo Result',
              uri: item.url || item.uri || item.link || '',
              snippet: item.snippet || item.body || item.description || ''
            })).filter(x => x.uri);
            if (mapped.length > 0) return formatDuckDuckGoSummary(mapped);
          }
        } catch {
          // Retornou markdown ou texto puro
        }

        // Extrai fontes do texto se houver URLs
        const sources: { title: string; uri: string }[] = [];
        const urlMatches = textContent.match(/https?:\/\/[^\s)\]]+/g) || [];
        for (const u of urlMatches) {
          if (!sources.some(s => s.uri === u)) {
            sources.push({ title: u, uri: u });
          }
        }
        return { summary: textContent, sources };
      }
    }
  } catch {
    // MCP indisponível
  }

  return null;
}

/**
 * Tenta buscar diretamente no DuckDuckGo Web via proxy local (/api/duckduckgo)
 * ou via API Instantânea oficial do DuckDuckGo (suporta CORS nativamente).
 */
export async function searchDuckDuckGoWeb(
  query: string,
  signal?: AbortSignal
): Promise<{ summary: string; sources: { title: string; uri: string }[] } | null> {
  const encoded = encodeURIComponent(query);

  // 1. Tenta proxy local do Vite (/api/duckduckgo)
  try {
    const timeoutSig = AbortSignal.timeout(3500);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSig]) : timeoutSig;
    const res = await fetch(`/api/duckduckgo?q=${encoded}`, { signal: combinedSignal });
    if (res.ok) {
      const html = await res.text();
      const results = parseDuckDuckGoHtml(html);
      if (results.length > 0) {
        return formatDuckDuckGoSummary(results);
      }
    }
  } catch {
    // Continua para a API nativa CORS do DuckDuckGo
  }

  // 2. Tenta a API Instantânea do DuckDuckGo (suporta CORS nativamente sem proxies)
  try {
    const timeoutSig = AbortSignal.timeout(3000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSig]) : timeoutSig;
    const res = await fetch(`https://api.duckduckgo.com/?q=${encoded}&format=json`, { signal: combinedSignal });
    if (res.ok) {
      const data = await res.json();
      const results: DuckDuckGoResult[] = [];

      if (data.AbstractText && (data.AbstractURL || data.Heading)) {
        results.push({
          title: data.Heading || query,
          uri: data.AbstractURL || `https://duckduckgo.com/?q=${encoded}`,
          snippet: data.AbstractText
        });
      }

      if (Array.isArray(data.RelatedTopics)) {
        for (const t of data.RelatedTopics) {
          if (t.Text && t.FirstURL) {
            results.push({
              title: t.Text.slice(0, 70),
              uri: t.FirstURL,
              snippet: t.Text
            });
          }
        }
      }

      if (results.length > 0) {
        return formatDuckDuckGoSummary(results);
      }
    }
  } catch {
    // Falha silenciosa
  }

  return null;
}

/**
 * Executa a busca primária pelo DuckDuckGo:
 * 1. Tenta o servidor MCP (se houver bridge rodando).
 * 2. Tenta a busca Web do DuckDuckGo (direto / proxies).
 * 3. Retorna null se ambos falharem, permitindo o fallback imediato para o Gemma 4 31B.
 */
export async function executeDuckDuckGoSearch(
  query: string,
  signal?: AbortSignal,
  mcpEndpoint: string = globalMcpEndpoint
): Promise<DuckDuckGoSearchOutput | null> {
  const currentYear = new Date().getFullYear();
  let effectiveQuery = query.trim();
  // Se a busca trata do estado atual ou modelos recentes e não menciona o ano, ancora no ano corrente
  if (!effectiveQuery.includes(String(currentYear)) && /hoje|atual|recent|últim|nov[oa]s?|ranking|melhor|inteligente/i.test(effectiveQuery)) {
    effectiveQuery = `${effectiveQuery} ${currentYear}`;
  }

  // 1. Tenta MCP
  try {
    const mcpRes = await searchDuckDuckGoMcp(effectiveQuery, mcpEndpoint, signal);
    if (mcpRes && (mcpRes.summary || mcpRes.sources.length > 0)) {
      return {
        ...mcpRes,
        provider: 'duckduckgo-mcp'
      };
    }
  } catch (err) {
    console.debug('MCP DuckDuckGo não respondeu:', err);
  }

  // 2. Tenta DuckDuckGo Web direto
  try {
    const webRes = await searchDuckDuckGoWeb(effectiveQuery, signal);
    if (webRes && (webRes.summary || webRes.sources.length > 0)) {
      return {
        ...webRes,
        provider: 'duckduckgo'
      };
    }
  } catch (err) {
    console.debug('DuckDuckGo Web direto falhou:', err);
  }

  return null;
}
