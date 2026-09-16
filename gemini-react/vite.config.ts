/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

const chatFile = path.resolve(__dirname, 'chat-history.json')
const memoryFile = path.resolve(__dirname, 'user-memory.json')
const personalitiesFile = path.resolve(__dirname, 'personalities.json')
const usageFile = path.resolve(__dirname, 'usage-data.json')
const configFile = path.resolve(__dirname, 'app-config.json')

if (!fs.existsSync(usageFile)) fs.writeFileSync(usageFile, JSON.stringify({ dailyUsage: [] }))
if (!fs.existsSync(configFile)) fs.writeFileSync(configFile, JSON.stringify({ paidApiKey: '' }))
const uploadsDir = path.resolve(__dirname, 'public/uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

async function fetchDuckDuckGoLiteOrHtml(query: string, max_results: number = 50) {
  const results: { title: string; uri: string; snippet: string }[] = [];

  // 1. Tenta DuckDuckGo Lite (POST): não sofre bloqueio por captcha / desafio bot (HTTP 202)
  try {
    const resLite = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: 'q=' + encodeURIComponent(query),
      signal: AbortSignal.timeout(5000)
    });

    if (resLite.ok) {
      const html = await resLite.text();
      const aTags = html.match(/<a[^>]*class=['"]result-link['"][\s\S]*?<\/a>/gi) || [];
      const snippets = (html.match(/<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi) || [])
        .map(s => s.replace(/<[^>]+>/g, '').trim());

      for (let i = 0; i < aTags.length && results.length < max_results; i++) {
        const a = aTags[i];
        const hrefMatch = a.match(/href=['"]([^'"]+)['"]/i);
        const title = a.replace(/<[^>]+>/g, '').trim();
        if (hrefMatch && title) {
          let uri = hrefMatch[1];
          if (uri.includes('uddg=')) {
            try {
              const u = new URL(uri.startsWith('http') ? uri : 'https://duckduckgo.com' + uri);
              const real = u.searchParams.get('uddg');
              if (real) uri = decodeURIComponent(real);
            } catch {}
          }
          results.push({ title, uri, snippet: snippets[i] || '' });
        }
      }
      if (results.length > 0) return results;
    }
  } catch {}

  // 2. Fallback: DuckDuckGo HTML
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(5000)
    });
    const html = await res.text();
    const blocks = html.split('class="result ');
    for (let i = 1; i < blocks.length && results.length < max_results; i++) {
      const b = blocks[i];
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
        const title = linkMatch[2].replace(/<[^>]+>/g, '').trim();
        const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        if (title && rawUrl) results.push({ title, uri: rawUrl, snippet });
      }
    }
  } catch {}

  return results;
}

function chatHistoryApi() {
  return {
    name: 'chat-history-api',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use((req: import('http').IncomingMessage, res: import('http').ServerResponse, next: () => void) => {
        if (req.url === '/api/history' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          if (fs.existsSync(chatFile)) {
            res.end(fs.readFileSync(chatFile, 'utf-8'))
          } else {
            res.end(JSON.stringify([]))
          }
        } else if (req.url === '/api/history' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: string) => body += chunk)
          req.on('end', () => {
            fs.writeFileSync(chatFile, body, 'utf-8')
            res.end(JSON.stringify({ success: true }))
          })
        } else if (req.url === '/api/memory' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          if (fs.existsSync(memoryFile)) {
            res.end(fs.readFileSync(memoryFile, 'utf-8'))
          } else {
            res.end(JSON.stringify([]))
          }
        } else if (req.url === '/api/memory' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: string) => body += chunk)
          req.on('end', () => {
            fs.writeFileSync(memoryFile, body, 'utf-8')
            res.end(JSON.stringify({ success: true }))
          })
        } else if (req.url === '/api/personalities' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          if (fs.existsSync(personalitiesFile)) {
            res.end(fs.readFileSync(personalitiesFile, 'utf-8'))
          } else {
            res.end(JSON.stringify([]))
          }
        } else if (req.url === '/api/personalities' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: string) => body += chunk)
          req.on('end', () => {
            fs.writeFileSync(personalitiesFile, body, 'utf-8')
            res.end(JSON.stringify({ success: true }))
          })
        } else if (req.url === '/api/usage' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          if (fs.existsSync(usageFile)) {
            res.end(fs.readFileSync(usageFile, 'utf-8'))
          } else {
            res.end(JSON.stringify({}))
          }
        } else if (req.url === '/api/usage' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: string) => body += chunk)
          req.on('end', () => {
            fs.writeFileSync(usageFile, body, 'utf-8')
            res.end(JSON.stringify({ success: true }))
          })
        } else if (req.url === '/api/config' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.end(fs.readFileSync(configFile, 'utf-8'))
        } else if (req.url === '/api/config' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: string) => body += chunk)
          req.on('end', () => {
            fs.writeFileSync(configFile, body, 'utf-8')
            res.end(JSON.stringify({ success: true }))
          })
        } else if (req.url === '/api/upload' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: string) => body += chunk)
          req.on('end', () => {
            try {
              const payload = JSON.parse(body)
              const buffer = Buffer.from(payload.data, 'base64')
              fs.writeFileSync(path.join(uploadsDir, payload.filename), buffer)
              res.end(JSON.stringify({ success: true, path: '/uploads/' + payload.filename }))
            } catch {
              res.end(JSON.stringify({ error: true }))
            }
          })
        } else if (req.url?.startsWith('/api/duckduckgo') && req.method === 'GET') {
          const urlObj = new URL(req.url, 'http://localhost')
          const q = urlObj.searchParams.get('q') || ''
          if (!q) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify([]))
            return
          }
          fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          })
            .then(r => r.text())
            .then(html => {
              res.setHeader('Content-Type', 'text/html; charset=utf-8')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(html)
            })
            .catch(err => {
              res.statusCode = 502
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: err.message }))
            })
        } else if ((req.url === '/health' || req.url === '/api/mcp/health') && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({ status: 'ok', service: 'vite-duckduckgo-mcp-bridge' }))
        } else if ((req.url === '/search' || req.url === '/api/mcp/search') && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: string) => body += chunk)
          req.on('end', async () => {
            try {
              const { query, max_results = 50 } = JSON.parse(body || '{}')
              const results = await fetchDuckDuckGoLiteOrHtml(query, max_results)
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(JSON.stringify({ success: true, via: 'vite-mcp-internal', results }))
            } catch (err: any) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(JSON.stringify({ error: err.message }))
            }
          })
        } else if ((req.url === '/fetch' || req.url === '/api/mcp/fetch') && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: string) => body += chunk)
          req.on('end', async () => {
            try {
              const { url } = JSON.parse(body || '{}')
              if (!url) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'url is required' }))
                return
              }
              const fetchRes = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: AbortSignal.timeout(6000)
              })
              const html = await fetchRes.text()
              const clean = html
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
                .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
                .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
                .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 3000)
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(JSON.stringify({ success: true, url, content: clean }))
            } catch (err: any) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(JSON.stringify({ error: err.message }))
            }
          })
        } else if ((req.url === '/tools/call' || req.url === '/api/mcp/tools/call') && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: string) => body += chunk)
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}')
              const toolName = payload.params?.name || payload.name
              const toolArgs = payload.params?.arguments || payload.arguments || {}
              const query = toolArgs.query || ''
              const max_results = toolArgs.max_results || toolArgs.count || 50

              // Tool: fetch
              if (toolName === 'fetch' || toolArgs.url) {
                const targetUrl = toolArgs.url || toolArgs.uri || ''
                const fetchRes = await fetch(targetUrl, {
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                  signal: AbortSignal.timeout(6000)
                })
                const html = await fetchRes.text()
                const clean = html
                  .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                  .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                  .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
                  .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
                  .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
                  .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .slice(0, 3000)

                res.setHeader('Content-Type', 'application/json')
                res.setHeader('Access-Control-Allow-Origin', '*')
                res.end(JSON.stringify({
                  jsonrpc: '2.0',
                  id: payload.id || 1,
                  result: {
                    content: [{ type: 'text', text: clean }]
                  }
                }))
                return
              }

              const results = await fetchDuckDuckGoLiteOrHtml(query, max_results)

              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                id: payload.id || 1,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(results)
                    }
                  ]
                }
              }))
            } catch (err: any) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(JSON.stringify({ error: err.message }))
            }
          })
        } else {
          next()
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [
    tailwindcss(),
    react(),
    chatHistoryApi()
  ],
  server: {
    watch: {
      ignored: ['**/chat-history.json', '**/user-memory.json', '**/personalities.json', '**/usage-data.json', '**/app-config.json']
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Separa libs pesadas em chunks próprios para reduzir o bundle principal
        // e permitir cache independente entre deploys. (rolldown usa a forma função.)
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (id.includes("firebase") || id.includes("@firebase")) return "firebase";
          if (id.includes("katex")) return "katex";
          if (id.includes("highlight.js")) return "highlight";
          if (id.includes("/marked")) return "markdown";
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  }
})
