/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

const chatFile = path.resolve(import.meta.dirname, 'chat-history.json')
const memoryFile = path.resolve(import.meta.dirname, 'user-memory.json')
const personalitiesFile = path.resolve(import.meta.dirname, 'personalities.json')
const usageFile = path.resolve(import.meta.dirname, 'usage-data.json')
const configFile = path.resolve(import.meta.dirname, 'app-config.json')

if (!fs.existsSync(usageFile)) fs.writeFileSync(usageFile, JSON.stringify({ dailyUsage: [] }))
if (!fs.existsSync(configFile)) fs.writeFileSync(configFile, JSON.stringify({ paidApiKey: '' }))
const uploadsDir = path.resolve(import.meta.dirname, 'public/uploads')
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

function readBoundedBody(req: import("http").IncomingMessage, limitBytes: number = 5 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    req.on("data", (chunk: string | Buffer) => {
      bytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
      if (bytes > limitBytes) {
        req.destroy();
        reject(new Error("PAYLOAD_TOO_LARGE"));
        return;
      }
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", (err) => reject(err));
  });
}

function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const h = parsed.hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0" || h === "169.254.169.254") return false;
    return true;
  } catch {
    return false;
  }
}

function chatHistoryApi() {
  return {
    name: "chat-history-api",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use(async (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: () => void) => {
        const sendJson = (status: number, data: any) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(JSON.stringify(data));
        };

        try {
          if (req.url === "/api/history" && req.method === "GET") {
            res.setHeader("Content-Type", "application/json");
            res.end(fs.existsSync(chatFile) ? fs.readFileSync(chatFile, "utf-8") : JSON.stringify([]));
          } else if (req.url === "/api/history" && req.method === "POST") {
            const body = await readBoundedBody(req, 20 * 1024 * 1024);
            JSON.parse(body); // validate JSON
            fs.writeFileSync(chatFile, body, "utf-8");
            sendJson(200, { success: true });
          } else if (req.url === "/api/memory" && req.method === "GET") {
            res.setHeader("Content-Type", "application/json");
            res.end(fs.existsSync(memoryFile) ? fs.readFileSync(memoryFile, "utf-8") : JSON.stringify([]));
          } else if (req.url === "/api/memory" && req.method === "POST") {
            const body = await readBoundedBody(req, 10 * 1024 * 1024);
            JSON.parse(body);
            fs.writeFileSync(memoryFile, body, "utf-8");
            sendJson(200, { success: true });
          } else if (req.url === "/api/personalities" && req.method === "GET") {
            res.setHeader("Content-Type", "application/json");
            res.end(fs.existsSync(personalitiesFile) ? fs.readFileSync(personalitiesFile, "utf-8") : JSON.stringify([]));
          } else if (req.url === "/api/personalities" && req.method === "POST") {
            const body = await readBoundedBody(req, 5 * 1024 * 1024);
            JSON.parse(body);
            fs.writeFileSync(personalitiesFile, body, "utf-8");
            sendJson(200, { success: true });
          } else if (req.url === "/api/usage" && req.method === "GET") {
            res.setHeader("Content-Type", "application/json");
            res.end(fs.existsSync(usageFile) ? fs.readFileSync(usageFile, "utf-8") : JSON.stringify({}));
          } else if (req.url === "/api/usage" && req.method === "POST") {
            const body = await readBoundedBody(req, 5 * 1024 * 1024);
            JSON.parse(body);
            fs.writeFileSync(usageFile, body, "utf-8");
            sendJson(200, { success: true });
          } else if (req.url === "/api/config" && req.method === "GET") {
            res.setHeader("Content-Type", "application/json");
            res.end(fs.existsSync(configFile) ? fs.readFileSync(configFile, "utf-8") : JSON.stringify({ paidApiKey: "" }));
          } else if (req.url === "/api/config" && req.method === "POST") {
            const body = await readBoundedBody(req, 1 * 1024 * 1024);
            JSON.parse(body);
            fs.writeFileSync(configFile, body, "utf-8");
            sendJson(200, { success: true });
          } else if (req.url === "/api/upload" && req.method === "POST") {
            const body = await readBoundedBody(req, 25 * 1024 * 1024);
            const payload = JSON.parse(body);
            const safeName = path.basename(payload.filename || "upload_" + Date.now() + ".bin").replace(/[^a-zA-Z0-9._-]/g, "_");
            const targetPath = path.resolve(uploadsDir, safeName);
            if (!targetPath.startsWith(uploadsDir)) {
              return sendJson(400, { error: "Path traversal detected" });
            }
            const buffer = Buffer.from(payload.data, "base64");
            fs.writeFileSync(targetPath, buffer);
            sendJson(200, { success: true, path: "/uploads/" + safeName });
          } else if (req.url?.startsWith("/api/duckduckgo") && req.method === "GET") {
            const urlObj = new URL(req.url, "http://localhost");
            const q = urlObj.searchParams.get("q") || "";
            if (!q) {
              return sendJson(200, []);
            }
            fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              }
            })
              .then(r => r.text())
              .then(html => {
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.end(html);
              })
              .catch(err => {
                sendJson(502, { error: err.message });
              });
          } else if ((req.url === "/health" || req.url === "/api/mcp/health") && req.method === "GET") {
            sendJson(200, { status: "ok", service: "vite-duckduckgo-mcp-bridge" });
          } else if ((req.url === "/search" || req.url === "/api/mcp/search") && req.method === "POST") {
            const body = await readBoundedBody(req, 1 * 1024 * 1024);
            const { query, max_results = 50 } = JSON.parse(body || "{}");
            const results = await fetchDuckDuckGoLiteOrHtml(query, max_results);
            sendJson(200, { success: true, via: "vite-mcp-internal", results });
          } else if ((req.url === "/fetch" || req.url === "/api/mcp/fetch") && req.method === "POST") {
            const body = await readBoundedBody(req, 1 * 1024 * 1024);
            const { url } = JSON.parse(body || "{}");
            if (!url || !isSafeHttpUrl(url)) {
              return sendJson(400, { error: "Valid external http(s) url is required" });
            }
            const fetchRes = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
              signal: AbortSignal.timeout(6000)
            });
            const html = await fetchRes.text();
            const clean = html
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
              .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
              .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
              .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
              .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 3000);
            sendJson(200, { success: true, url, content: clean });
          } else if ((req.url === "/tools/call" || req.url === "/api/mcp/tools/call") && req.method === "POST") {
            const body = await readBoundedBody(req, 2 * 1024 * 1024);
            const payload = JSON.parse(body || "{}");
            const toolName = payload.params?.name || payload.name;
            const toolArgs = payload.params?.arguments || payload.arguments || {};
            const query = toolArgs.query || "";
            const max_results = toolArgs.max_results || toolArgs.count || 50;

            if (toolName === "fetch" || toolArgs.url) {
              const targetUrl = toolArgs.url || toolArgs.uri || "";
              if (!targetUrl || !isSafeHttpUrl(targetUrl)) {
                return sendJson(400, {
                  jsonrpc: "2.0",
                  id: payload.id || 1,
                  error: { code: -32602, message: "Invalid or restricted target URL" }
                });
              }
              const fetchRes = await fetch(targetUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                signal: AbortSignal.timeout(6000)
              });
              const html = await fetchRes.text();
              const clean = html
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
                .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
                .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
                .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
                .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 3000);

              return sendJson(200, {
                jsonrpc: "2.0",
                id: payload.id || 1,
                result: { content: [{ type: "text", text: clean }] }
              });
            }

            const results = await fetchDuckDuckGoLiteOrHtml(query, max_results);
            return sendJson(200, {
              jsonrpc: "2.0",
              id: payload.id || 1,
              result: { content: [{ type: "text", text: JSON.stringify(results) }] }
            });
          } else {
            next();
          }
        } catch (err: any) {
          if (err.message === "PAYLOAD_TOO_LARGE") {
            sendJson(413, { error: "Payload too large" });
          } else {
            sendJson(500, { error: err.message || "Internal server error" });
          }
        }
      });
    }
  };
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
