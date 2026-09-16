#!/usr/bin/env node
/**
 * Servidor Bridge HTTP/JSON-RPC para o DuckDuckGo MCP Server.
 * Permite que o gemini-react (no navegador) se comunique com o processo MCP local
 * (ex: flatpak-spawn / uvx duckduckgo-mcp-server) via HTTP standard e CORS.
 * 
 * Uso: npm run mcp
 */

import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const PORT = process.env.MCP_PORT || 3333;

// Configuração padrão do MCP DuckDuckGo
let mcpConfig = {
  command: 'uvx',
  args: ['duckduckgo-mcp-server']
};

// Verifica se há configuração customizada em mcp-config.json
const configPath = path.resolve(process.cwd(), 'mcp-config.json');
if (fs.existsSync(configPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (raw.duckduckgo) {
      mcpConfig = raw.duckduckgo;
      console.log('📌 Carregada configuração personalizada de mcp-config.json:', mcpConfig.command, mcpConfig.args?.join(' '));
    }
  } catch (err) {
    console.warn('Aviso: falha ao carregar mcp-config.json:', err.message);
  }
}

let mcpProcess = null;
let isMcpAlive = false;
let pendingRequests = new Map();
let requestIdCounter = 1;

function startMcpProcess() {
  try {
    let cmd = mcpConfig.command;
    let args = mcpConfig.args || [];

    // Se o comando for flatpak-spawn mas estivermos no Windows ou sem flatpak:
    if (cmd === 'flatpak-spawn' && process.platform === 'win32') {
      console.log('ℹ️ flatpak-spawn detectado no Windows. Adaptando para uvx/direct search.');
      cmd = 'uvx';
      args = ['duckduckgo-mcp-server'];
    }

    console.log(`🚀 Iniciando processo MCP: ${cmd} ${args.join(' ')}`);
    mcpProcess = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'inherit'],
      shell: process.platform === 'win32'
    });

    mcpProcess.on('error', (err) => {
      console.warn(`⚠️ Não foi possível iniciar processo MCP (${cmd}): ${err.message}. O bridge usará fallback direto via Node.js.`);
      isMcpAlive = false;
    });

    mcpProcess.on('exit', (code) => {
      if (code !== 0) {
        console.log(`Processo MCP finalizado (código ${code}). O bridge continuará atendendo buscas via Node.js.`);
      }
      isMcpAlive = false;
    });

    let buffer = '';
    mcpProcess.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // mantém o restante incompleto

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id && pendingRequests.has(msg.id)) {
            const { resolve } = pendingRequests.get(msg.id);
            pendingRequests.delete(msg.id);
            resolve(msg);
          }
        } catch {
          // ignora linhas não JSON
        }
      }
    });

    isMcpAlive = true;

    // Envia initialize do MCP
    sendJsonRpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'nemon-mcp-bridge', version: '1.0.0' }
    }).catch(() => {});

  } catch (err) {
    console.warn('Erro ao inicializar processo MCP:', err.message);
    isMcpAlive = false;
  }
}

function sendJsonRpc(method, params, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    if (!mcpProcess || !isMcpAlive) {
      return reject(new Error('Processo MCP não está em execução.'));
    }

    const id = requestIdCounter++;
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Timeout aguardando resposta do MCP (${method})`));
    }, timeoutMs);

    pendingRequests.set(id, {
      resolve: (val) => {
        clearTimeout(timer);
        resolve(val);
      }
    });

    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    try {
      mcpProcess.stdin.write(payload);
    } catch (e) {
      clearTimeout(timer);
      pendingRequests.delete(id);
      reject(e);
    }
  });
}

// Fallback direto de busca web via fetch caso o processo stdio não esteja disponível
async function directDuckDuckGoSearch(query, count = 5) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();
  const results = [];
  const blocks = html.split('class="result ');

  for (let i = 1; i < blocks.length && results.length < count; i++) {
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
      if (title && rawUrl) {
        results.push({ title, uri: rawUrl, snippet });
      }
    }
  }
  return results;
}

startMcpProcess();

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health' || req.url === '/') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      status: 'ok',
      service: 'duckduckgo-mcp-bridge',
      mcpProcessAlive: isMcpAlive,
      command: mcpConfig.command
    }));
    return;
  }

  // POST /search (Endpoint simplificado)
  if (req.url === '/search' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { query, max_results = 5 } = JSON.parse(body || '{}');
        if (!query) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Parâmetro query é obrigatório' }));
          return;
        }

        console.log(`[MCP Bridge] Pesquisando: "${query}"`);

        // 1. Tenta via processo MCP
        if (isMcpAlive) {
          try {
            const mcpRes = await sendJsonRpc('tools/call', {
              name: 'search',
              arguments: { query, max_results, count: max_results }
            });
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, via: 'mcp-stdio', result: mcpRes.result }));
            return;
          } catch (e) {
            console.warn('Falha na chamada stdio do MCP:', e.message);
          }
        }

        // 2. Fallback direto DuckDuckGo
        const directResults = await directDuckDuckGoSearch(query, max_results);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, via: 'direct-duckduckgo', results: directResults }));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // POST /tools/call (Protocolo padrão MCP)
  if (req.url === '/tools/call' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const toolName = payload.params?.name || payload.name;
        const toolArgs = payload.params?.arguments || payload.arguments || {};
        const q = toolArgs.query || '';

        if (isMcpAlive) {
          try {
            const mcpRes = await sendJsonRpc('tools/call', { name: toolName, arguments: toolArgs });
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(mcpRes));
            return;
          } catch (e) {
            console.warn('Falha no MCP stdio:', e.message);
          }
        }

        // Fallback
        const results = await directDuckDuckGoSearch(q, toolArgs.max_results || 5);
        res.setHeader('Content-Type', 'application/json');
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
        }));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.statusCode = 404;
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`\n🦆 [DuckDuckGo MCP Bridge] Servidor ativo em http://localhost:${PORT}`);
  console.log(`   - Endpoint de saúde: http://localhost:${PORT}/health`);
  console.log(`   - Endpoint de busca: http://localhost:${PORT}/search`);
  console.log(`   - Protocolo MCP:     http://localhost:${PORT}/tools/call\n`);
});
