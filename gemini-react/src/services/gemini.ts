import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import { logger } from './logger';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.min.css';
import 'katex/dist/katex.min.css';

const renderer = new marked.Renderer();

// Custom code renderer supporting both positional and token object formats for Marked compatibility
renderer.code = (codeOrToken: any, langOrUndefined?: any) => {
  let text = '';
  let lang = 'plaintext';
  
  if (codeOrToken && typeof codeOrToken === 'object') {
    text = codeOrToken.text || '';
    lang = codeOrToken.lang || 'plaintext';
  } else {
    text = codeOrToken || '';
    lang = langOrUndefined || 'plaintext';
  }
  
  const language = hljs.getLanguage(lang) ? lang : 'plaintext';
  const highlighted = hljs.highlight(text, { language }).value;
  return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
};

// Configuração segura do Marked.js usando marked.use
marked.use({
  renderer: renderer,
  breaks: false,
  gfm: true
});

// Adicionar suporte nativo à matemática
marked.use(markedKatex({
  throwOnError: false,
  output: 'html',
  nonStandard: true
}));

function escapeInnerQuotes(jsonStr: string): string {
  let result = '';
  let inString = false;
  let isKey = false; // whether we are currently in a key string
  let lastStructuralChar = '';
  
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    
    if (!inString) {
      if (char === '"') {
        // Entering a string!
        // It is structural if the last structural char was '{', '[', ',', or ':'
        const isStructuralStart = ['{', '[', ',', ':'].includes(lastStructuralChar) || lastStructuralChar === '';
        if (isStructuralStart) {
          inString = true;
          isKey = (lastStructuralChar === '{' || lastStructuralChar === ',');
          result += '"';
        } else {
          // If it's a quote outside a string but not in structural position, escape it
          result += '\\"';
        }
      } else {
        result += char;
        if (['{', '}', '[', ']', ':', ','].includes(char)) {
          lastStructuralChar = char;
        }
      }
    } else {
      // Inside a string
      if (char === '\\') {
        // If the next character is a double quote, we check if it is the structural closing quote.
        // This is key for model-generated responses that incorrectly escape closing quotes (e.g. \" at the end of a value).
        if (jsonStr[i + 1] === '"') {
          const rest = jsonStr.slice(i + 2);
          let isStructuralClose = false;
          
          if (isKey) {
            isStructuralClose = /^\s*:/.test(rest);
          } else {
            if (/^\s*\}/.test(rest) || /^\s*\]/.test(rest)) {
              isStructuralClose = true;
            } else if (/^\s*,/.test(rest)) {
              const afterComma = rest.replace(/^\s*,/, '');
              isStructuralClose = /^\s*["}\]0-9tfn{[]/.test(afterComma);
            }
          }
          
          if (isStructuralClose) {
            inString = false;
            result += '"'; // Output unescaped structural closing quote
          } else {
            result += '\\"'; // Output escaped inner quote
          }
          i++; // Skip the quote character
        } else {
          // Copy backslash and next character as-is
          result += '\\' + (jsonStr[i + 1] || '');
          i++;
        }
      } else if (char === '"') {
        // We see a quote. Is it the structural closing quote?
        const rest = jsonStr.slice(i + 1);
        let isStructuralClose = false;
        
        if (isKey) {
          // A key's closing quote must be followed by ':'
          isStructuralClose = /^\s*:/.test(rest);
        } else {
          // A value's closing quote must be followed by ',', '}', or ']'
          if (/^\s*\}/.test(rest) || /^\s*\]/.test(rest)) {
            isStructuralClose = true;
          } else if (/^\s*,/.test(rest)) {
            // Verify it's a valid structural comma (followed by key start, value start, or end of container)
            const afterComma = rest.replace(/^\s*,/, '');
            isStructuralClose = /^\s*["}\]0-9tfn{[]/.test(afterComma);
          }
        }
        
        if (isStructuralClose) {
          inString = false;
          result += '"';
        } else {
          // Escape this inner quote
          result += '\\"';
        }
      } else {
        result += char;
      }
    }
  }
  
  return result;
}

export function extractAndParseJson(text: string): any {
  if (!text) return null;
  
  let cleaned = text.trim();
  
  // 1. Remove markdown code blocks if present
  if (cleaned.includes("```")) {
    cleaned = cleaned.replace(/```json|```/g, "").trim();
  }

  // 2. Find the first [ or { and the last ] or }
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');

  let start = -1;
  let end = -1;

  // Decide if we are looking for an object or an array
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    start = firstBracket;
    end = lastBracket;
  } else if (firstBrace !== -1) {
    start = firstBrace;
    end = lastBrace;
  }

  if (start === -1 || end === -1) {
    throw new Error("Não foi possível encontrar uma estrutura JSON válida na resposta.");
  }

  const jsonStr = cleaned.substring(start, end + 1);
  
  try {
    // Attempt standard parse first
    return JSON.parse(jsonStr);
  } catch (e: any) {
    // Standard parse failed, try aggressive parsing silently unless it completely fails.
    // This avoids annoying warning badges in the console for expected LaTeX/nested quote cases.
    try {
      // A. Escape unescaped double quotes and clean up escaped closing quotes inside text values using our robust state machine
      let fixedJson = escapeInnerQuotes(jsonStr);

      // B. Fix unescaped control backslashes (e.g. \tau, \approx, \$) by doubling them
      // We only double backslashes that are NOT part of a valid JSON escape sequence.
      fixedJson = fixedJson.replace(/\\(.)/g, (match, p1) => {
        if (['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(p1)) {
          return match;
        }
        if (p1 === 'u' && /^[0-9a-fA-F]{4}/.test(match.slice(2))) {
          return match;
        }
        return '\\\\' + p1;
      });

      // C. Remove trailing commas
      fixedJson = fixedJson.replace(/,\s*([\]}])/g, '$1');

      return JSON.parse(fixedJson);
    } catch (e2: any) {
      console.warn("JSON cleanup/parsing failed completely:", {
        originalError: e.message,
        cleanupError: e2.message,
        jsonStr
      });
      throw e; // throw original error
    }
  }
}

export function safeMarkdown(content: string): string {
  if (typeof content !== 'string') return "";

  // 1. Collapse all variations of multiple newlines (2+) into a single newline
  // This forces "tight" mode for almost everything by default.
  const tightenedContent = content.replace(/(\n\s*){2,}/g, '\n\n');

  let html = marked.parse(tightenedContent) as string;

  // 2. Aggressive List Cleanup: Strip ANY <p> tags that are direct children of <li>
  // We do this in a loop to catch nested or multiple paragraphs.
  let prevHtml;
  do {
    prevHtml = html;
    html = html.replace(/<li>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/gi, '<li>$1</li>');
  } while (html !== prevHtml);

  // 3. Remove spurious empty/whitespace paragraphs that marked might still emit
  html = html.replace(/<p>(\s|&nbsp;|<br\/?>)*<\/p>/gi, '');

  // 4. Collapse multiple <br> tags into one
  html = html.replace(/(<br\/?>\s*){2,}/gi, '<br/>');

  // 5. Tables ───────────────────────────────────────────────────────────────
  html = html.replace(/<table/g, '<div class="table-wrapper"><table');
  html = html.replace(/<\/table>/g, '</table></div>');

  return html;
}

export interface FactCheckResult {
  segment: string;
  isVerified: boolean;
  sourceUrl?: string;
  explanation?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  files?: Array<{ name: string; mimeType: string; data: string }>;
  isGrounded?: boolean;
  sources?: Array<{ title: string; uri: string }>;
  isSearching?: boolean;
  thoughts?: string;
  duration?: number;
  factCheckResults?: FactCheckResult[];
  isVerifying?: boolean;
  pendingMemoryUpdates?: Array<{
    id: string;
    category: string;
    oldText: string;
    newText: string;
    resolved?: 'accepted' | 'ignored';
  }>;
  continuationText?: string;
}


import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { LOCAL_MODEL_ID } from '../constants';

let globalDefaultApiKey = '';
let globalPaidApiKey = '';
let globalLocalEndpoint = '';

export function setGlobalDefaultApiKey(key: string) {
  globalDefaultApiKey = key;
}

export function setGlobalPaidApiKey(key: string) {
  globalPaidApiKey = key;
}

/**
 * URL base do servidor local (llama.cpp) exposto via ngrok.
 * A barra final é removida para podermos concatenar "/v1/chat/completions".
 */
export function setGlobalLocalEndpoint(url: string) {
  globalLocalEndpoint = (url || '').trim().replace(/\/+$/, '');
}

export function getGlobalLocalEndpoint(): string {
  return globalLocalEndpoint;
}

export function isLocalModel(model: string): boolean {
  return model === LOCAL_MODEL_ID;
}

export async function getApiKey(manualApiKey?: string): Promise<string> {
  if (manualApiKey) return manualApiKey;
  if (globalPaidApiKey) return globalPaidApiKey;
  if (globalDefaultApiKey) return globalDefaultApiKey;
  
  try {
    if (auth.currentUser) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        if (data.paidApiKey) {
          globalPaidApiKey = data.paidApiKey;
          return data.paidApiKey;
        }
        if (data.defaultApiKey) {
          globalDefaultApiKey = data.defaultApiKey;
          return data.defaultApiKey;
        }
      }
    }
  } catch (e) {
    // Ignore
  }
  
  throw new Error("Chave de API do Google AI Studio padrão não configurada. Vá em Configurações > API para configurar.");
}

/**
 * Diagnóstico: lista os modelos que a chave atual pode usar, destacando os que
 * suportam a Live API (método 'bidiGenerateContent'). Útil para descobrir o id
 * exato do modelo LIVE disponível para a conta.
 */
export async function listLiveModels(manualApiKey?: string): Promise<{ live: string[]; all: string[] }> {
  const key = await getApiKey(manualApiKey);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1000`);
  if (!res.ok) {
    const errText = await res.text();
    console.error(`[MODELS] Falha ao listar modelos (${res.status}): ${errText}`);
    throw new Error(`Falha ao listar modelos: ${res.status}`);
  }
  const data = await res.json();
  const models: any[] = data.models || [];
  const strip = (n: string) => (n || '').replace(/^models\//, '');
  const live = models
    .filter(m => (m.supportedGenerationMethods || []).includes('bidiGenerateContent'))
    .map(m => strip(m.name));
  const all = models.map(m => strip(m.name));
  console.log(`[MODELS] 🎙️ Modelos com suporte à Live API (bidiGenerateContent): ${live.length ? live.join(', ') : 'NENHUM'}`);
  console.log(`[MODELS] 📋 Todos os modelos disponíveis para esta chave: ${all.join(', ')}`);
  return { live, all };
}

/**
 * Retorna o tamanho do sufixo de `s` que é um prefixo (parcial) de `tag`.
 * Usado para "segurar" uma tag <think> que foi quebrada entre dois chunks do stream.
 */
function partialTagSuffix(s: string, tag: string): number {
  const max = Math.min(s.length, tag.length - 1);
  for (let len = max; len > 0; len--) {
    if (tag.startsWith(s.slice(s.length - len))) return len;
  }
  return 0;
}

/**
 * Streaming para o modelo local servido via llama.cpp (endpoint compatível com OpenAI).
 * Converte o histórico no formato Gemini para o formato `messages` do OpenAI e
 * separa blocos de raciocínio (`reasoning_content` ou tags <think>...</think>) dos thoughts.
 */
async function* streamLocalContent(
  text: string,
  history: { role: string, parts: any[] }[],
  systemInstruction: string | undefined,
  files: { mimeType: string; data: string }[],
  signal: AbortSignal | undefined,
  thinking: boolean
): AsyncGenerator<{
  text?: string;
  thoughts?: string;
  isGrounded?: boolean;
  isSearching?: boolean;
  sources?: { title: string; uri: string }[];
  usage?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number }
}> {
  const base = globalLocalEndpoint;
  if (!base) {
    throw new Error("Endpoint do modelo local não configurado. Vá em Configurações > API e cole a URL pública do seu ngrok.");
  }

  const url = `${base}/v1/chat/completions`;

  // Monta as mensagens no formato OpenAI a partir do histórico Gemini.
  const messages: any[] = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  for (const h of history) {
    const role = h.role === 'model' || h.role === 'assistant' ? 'assistant' : 'user';
    const content = (h.parts || []).map((p: any) => p.text || '').join('');
    if (content) messages.push({ role, content });
  }

  // Mensagem atual do usuário (com imagens opcionais para modelos multimodais como llava).
  if (files && files.length > 0) {
    const parts: any[] = [];
    if (text) parts.push({ type: 'text', text });
    files.forEach(f => parts.push({ type: 'image_url', image_url: { url: `data:${f.mimeType};base64,${f.data}` } }));
    messages.push({ role: 'user', content: parts });
  } else {
    messages.push({ role: 'user', content: text });
  }

  const payload = {
    model: LOCAL_MODEL_ID,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.7,
    max_tokens: 4096
  };

  logger.addLog('api-request', `Request: ${LOCAL_MODEL_ID} (local)`, { url, payload });

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Evita a página de aviso do ngrok (free) em requisições não-navegador.
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify(payload),
      signal
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    logger.addLog('api-error', `Falha ao conectar no modelo local: ${err?.message}`, { error: err?.message, url });
    throw new Error(`Não foi possível conectar ao modelo local (${base}). Verifique se o llama.cpp e o ngrok estão ativos. Detalhe: ${err?.message || err}`);
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    let errMsg = `Erro do servidor local (${response.status})`;
    try {
      const parsed = JSON.parse(errBody);
      errMsg = parsed?.error?.message || parsed?.message || errMsg;
    } catch { if (errBody) errMsg = errBody.slice(0, 300); }
    logger.addLog('api-error', `Erro definitivo do modelo local (${response.status})`, { error: errMsg });
    throw new Error(errMsg);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Falha ao abrir stream de leitura do modelo local.");

  const decoder = new TextDecoder();
  let buffer = "";
  let accumulatedText = "";
  let accumulatedThoughts = "";
  let finalUsage: any = null;

  // Estado do separador de blocos <think>...</think> entre chunks.
  let thinkMode = false;
  let carry = "";

  const splitThinking = (raw: string): { text: string; thoughts: string } => {
    let s = carry + raw;
    carry = "";
    let outText = "";
    let outThoughts = "";
    while (s.length) {
      if (!thinkMode) {
        const idx = s.indexOf('<think>');
        if (idx === -1) {
          const partial = partialTagSuffix(s, '<think>');
          outText += s.slice(0, s.length - partial);
          carry = s.slice(s.length - partial);
          s = "";
        } else {
          outText += s.slice(0, idx);
          s = s.slice(idx + '<think>'.length);
          thinkMode = true;
        }
      } else {
        const idx = s.indexOf('</think>');
        if (idx === -1) {
          const partial = partialTagSuffix(s, '</think>');
          outThoughts += s.slice(0, s.length - partial);
          carry = s.slice(s.length - partial);
          s = "";
        } else {
          outThoughts += s.slice(0, idx);
          s = s.slice(idx + '</think>'.length);
          thinkMode = false;
        }
      }
    }
    return { text: outText, thoughts: outThoughts };
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta || {};

          let chunkText = "";
          let chunkThoughts = "";

          // Canal de raciocínio nativo (llama.cpp com --reasoning-format).
          if (delta.reasoning_content) {
            chunkThoughts += delta.reasoning_content;
          }

          // Conteúdo normal — pode conter tags <think> embutidas.
          if (typeof delta.content === 'string' && delta.content) {
            const split = splitThinking(delta.content);
            chunkText += split.text;
            chunkThoughts += split.thoughts;
          }

          if (json.usage) {
            finalUsage = {
              promptTokenCount: json.usage.prompt_tokens || 0,
              candidatesTokenCount: json.usage.completion_tokens || 0,
              totalTokenCount: json.usage.total_tokens || 0
            };
          }

          if (chunkText || chunkThoughts) {
            accumulatedText += chunkText;
            accumulatedThoughts += chunkThoughts;
            yield {
              text: chunkText,
              thoughts: thinking ? chunkThoughts : "",
              usage: finalUsage || undefined
            };
          }
        } catch (e) {
          console.warn("Erro ao processar chunk do modelo local:", e);
        }
      }
    }
  } finally {
    reader.releaseLock();
    logger.addLog('api-response', `Response: ${LOCAL_MODEL_ID} (local) completed`, {
      response: { text: accumulatedText, thoughts: accumulatedThoughts, usage: finalUsage }
    });
  }
}

export async function* streamGeminiContent(
  text: string,
  model: string,
  history: { role: string, parts: any[] }[],
  systemInstruction?: string,
  files: { mimeType: string; data: string }[] = [],
  webSearch: boolean = false,
  signal?: AbortSignal,
  thinking: boolean = false,
  jsonMode: boolean = false,
  manualApiKey?: string,
  maxOutputTokens: number = 8192
): AsyncGenerator<{
  text?: string;
  thoughts?: string;
  isGrounded?: boolean;
  isSearching?: boolean;
  sources?: { title: string; uri: string }[];
  usage?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number }
}> {
  // Modelo local (llama.cpp + ngrok): roteamos para a API compatível com OpenAI.
  if (isLocalModel(model)) {
    yield* streamLocalContent(text, history, systemInstruction, files, signal, thinking);
    return;
  }

  const key = await getApiKey(manualApiKey);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;

  const currentParts: any[] = [];
  if (files.length > 0) {
    files.forEach(f => {
      currentParts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
    });
  }
  if (text) {
    currentParts.push({ text: text });
  }

  const payload: any = {
    contents: [...history, { role: "user", parts: currentParts }],
    generationConfig: {
      maxOutputTokens,
      temperature: 0.7,
      ...(jsonMode ? { response_mime_type: "application/json" } : {})
    }
  };

  if (thinking) {
    // Apenas modelos específicos suportam o parâmetro thinkingConfig nativo (como Gemini Thinking)
    const supportsThinkingConfig = model.includes('thinking') || model.includes('gemini-2.0');

    if (supportsThinkingConfig) {
      payload.generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinkingLevel: "HIGH"
      };
    } else {
      // Fallback: Instrução via prompt para modelos que não aceitam thinkingConfig
      const searchInstruction = webSearch ? "\n\nPESQUISA OBRIGATÓRIA: Planeje e use 'google_search' para basear sua resposta em fatos REAIS." : "";
      currentParts.unshift({ text: "Missão Final: Fornecer uma resposta útil e direta ao usuário.\n\n1. Raciocínio (Privado): SEMPRE use <thinking>...</thinking> para seu processo interno.\n2. Conclusão (Público): Após fechar o </thinking>, você DEVE obrigatoriamente escrever a resposta final detalhada que o usuário verá. NUNCA termine sua mensagem apenas com o raciocínio." + searchInstruction });
    }
  } else if (model.includes('gemma') && !webSearch) {
    // Gemma 4 gasta "thought tokens" mesmo com o raciocínio desligado. A doc confirma que
    // ele NÃO aceita thinkingBudget (retorna 400) e IGNORA includeThoughts, mas ACEITA
    // thinkingLevel — restrito a MINIMAL ou HIGH. Quando NÃO há busca, MINIMAL corta esse
    // overhead e acelera respostas diretas.
    // ATENÇÃO: NÃO usar MINIMAL com google_search — o Gemma precisa do raciocínio para
    // planejar e executar a ferramenta de busca; com MINIMAL ele pula o grounding e volta
    // vazio (sources: [], text: ""). Por isso o guard `!webSearch`.
    payload.generationConfig.thinkingConfig = { thinkingLevel: "MINIMAL" };
  }

  if (webSearch) {
    payload.tools = [{ google_search: {} }];
  }

  if (systemInstruction) {
    payload.systemInstruction = {
      role: "system",
      parts: [{ text: systemInstruction }]
    };
  }

  // API REQUEST LOGGING
  logger.addLog('api-request', `Request: ${model}`, { url, payload });

  const maxRetries = 5;
  let attempt = 0;
  let response: Response | null = null;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    attempt++;
    try {
      if (attempt > 1) {
        logger.addLog('warn', `Tentando reconectar com a API (${attempt}/${maxRetries})...`);
      }
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
      });

      if (res.ok) {
        response = res;
        break;
      } else {
        const errorBody = await res.json().catch(() => ({}));
        const errMsg = errorBody.error?.message || `Erro na API: ${res.status}`;
        
        // Se for um erro do servidor (>= 500), faremos nova tentativa com backoff exponencial
        if (res.status >= 500) {
          logger.addLog('warn', `Erro transiente da API (${res.status}): ${errMsg}. Nova tentativa em ${attempt * 1000}ms...`);
          lastError = new Error(errMsg);
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          continue;
        } else {
          // Erros de cliente (400, 403, etc.) não devem ser retentados pois são definitivos
          logger.addLog('api-error', `Erro definitivo de cliente (${res.status}): ${errMsg}`, { error: errMsg });
          throw new Error(errMsg);
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw err; // Requisição abortada manualmente pelo usuário
      }
      logger.addLog('warn', `Falha de rede/conexão: ${err.message}. Nova tentativa em ${attempt * 1000}ms...`);
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }

  if (!response) {
    const errMsg = lastError?.message || "Conexão com a API esgotada após várias tentativas.";
    logger.addLog('api-error', `API Connection Exhausted after ${maxRetries} attempts`, { error: errMsg });
    throw new Error(errMsg);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Falha ao abrir stream de leitura");

  const decoder = new TextDecoder();
  let buffer = "";

  let accumulatedText = "";
  let accumulatedThoughts = "";
  const accumulatedSources: { title: string; uri: string }[] = [];
  let finalUsage: any = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const json = JSON.parse(line.substring(6));
            if (json.candidates && json.candidates[0]) {
              const candidate = json.candidates[0];
              const parts = candidate.content?.parts || [];
              const metadata = candidate.groundingMetadata;
              const chunkGrounded = !!metadata;

              let chunkText = "";
              let chunkThoughts = "";
              let chunkSources: { title: string; uri: string }[] = [];

              if (metadata?.groundingChunks) {
                chunkSources = metadata.groundingChunks.map((chunk: any) => {
                  const s = chunk.web || chunk.webSource || chunk.source || chunk;
                  return {
                    title: s.title || chunk.title || "",
                    uri: s.uri || chunk.uri || ""
                  };
                }).filter((s: any) => s.uri);
              }

              const chunkIsSearching = !!(metadata?.webSearchQueries && metadata.webSearchQueries.length > 0);

              parts.forEach((part: any) => {
                // Se o componente de pensamento (thought) está presente
                if (part.thought === true || part.thought === 'true') {
                  if (thinking && part.text) {
                    chunkThoughts += part.text;
                  }
                  // Se o pensamento está OFF, descartamos esta parte para honrar o desejo do usuário
                  return;
                }

                // Se a parte contém texto normal
                if (part.text) {
                  chunkText += part.text;
                }
              });

              accumulatedText += chunkText;
              accumulatedThoughts += chunkThoughts;
              chunkSources.forEach(src => {
                if (!accumulatedSources.some(s => s.uri === src.uri)) {
                  accumulatedSources.push(src);
                }
              });
              if (json.usageMetadata) {
                finalUsage = json.usageMetadata;
              }

              yield {
                text: chunkText,
                thoughts: chunkThoughts,
                isGrounded: chunkGrounded,
                isSearching: chunkIsSearching,
                sources: chunkSources,
                usage: json.usageMetadata
              };

              // DIAGNÓSTICO: Log do finishReason e estrutura se o texto estiver vazio mas o pensamento não
              if (chunkThoughts && !chunkText && candidate.finishReason && candidate.finishReason !== 'STOP') {
                console.warn(`[DEBUG] Resposta terminou sem texto. Motivo: ${candidate.finishReason}`);
              }


              // INSTRUMENTATION: Log the raw JSON for grounding debug
              if (chunkSources.length > 0 || chunkGrounded) {
                console.group("DEBUG: Grounding Metadata Received");
                console.log("Sources:", chunkSources);
                console.log("Raw JSON:", json);
                console.groupEnd();
              }
            }
          } catch (e) {
            console.warn("Erro ao processar chunk JSON:", e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
    // API RESPONSE LOGGING
    logger.addLog('api-response', `Response: ${model} completed`, {
      response: {
        text: accumulatedText,
        thoughts: accumulatedThoughts,
        sources: accumulatedSources,
        usage: finalUsage
      }
    });
  }
}

// Keep a non-streaming version (optional, but good for title generation etc)
export async function generateGeminiContent(
  text: string,
  model: string,
  history: any[],
  systemInstruction?: string,
  files: any[] = [],
  webSearch: boolean = false,
  thinking: boolean = false,
  jsonMode: boolean = false,
  signal?: AbortSignal,
  manualApiKey?: string
) {
  const gen = streamGeminiContent(text, model, history, systemInstruction, files, webSearch, signal, thinking, jsonMode, manualApiKey);
  let fullText = "", fullThoughts = "", isGrounded = false, usage: any = null;

  for await (const chunk of gen) {
    if (chunk.text) fullText += chunk.text;
    if (chunk.thoughts) fullThoughts += chunk.thoughts;
    if (chunk.isGrounded) isGrounded = true;
    if (chunk.usage) usage = chunk.usage;
  }

  return { text: fullText, thoughts: fullThoughts, isGrounded, usage };
}

/**
 * Delegação de busca: usa o Gemma 4 31B (que suporta google_search) para pesquisar
 * na web e retornar um resumo factual + fontes. Serve para modelos que não fazem
 * busca nativa poderem responder com dados atuais.
 */
export async function performWebSearch(
  query: string,
  signal?: AbortSignal,
  manualApiKey?: string
): Promise<{ summary: string; sources: { title: string; uri: string }[] }> {
  const model = "gemma-4-31b-it";
  const systemInstruction =
    "Você é um mecanismo de pesquisa. Use OBRIGATORIAMENTE a ferramenta google_search para buscar na web " +
    "e retorne um resumo CONCISO (no máximo 6 linhas ou tópicos curtos) apenas com os fatos mais relevantes " +
    "e atualizados (números, datas, nomes) encontrados nas fontes. Vá direto ao ponto, sem introduções nem " +
    "conclusões. Não invente; baseie-se somente nos resultados da busca.";
  const prompt = `Pesquise na web e resuma de forma concisa as informações mais relevantes e atuais para responder: "${query}"`;

  // Teto de tokens baixo: o resumo é curto, então gera muito mais rápido que o padrão (8192).
  const gen = streamGeminiContent(prompt, model, [], systemInstruction, [], true, signal, false, false, manualApiKey, 1024);
  let summary = "";
  const sourceMap = new Map<string, { title: string; uri: string }>();
  for await (const chunk of gen) {
    if (chunk.text) summary += chunk.text;
    if (chunk.sources) {
      chunk.sources.forEach(s => {
        if (s.uri && !sourceMap.has(s.uri)) sourceMap.set(s.uri, { title: s.title || s.uri, uri: s.uri });
      });
    }
  }
  return { summary: summary.trim(), sources: [...sourceMap.values()] };
}

export async function generateImagenContent(
  prompt: string,
  model: string,
  aspectRatio: '1:1' | '9:16' | '16:9',
  manualApiKey?: string
): Promise<{ data: string; mimeType: string }> {
  const key = manualApiKey || globalPaidApiKey || globalDefaultApiKey;
  if (!key) throw new Error("Nenhuma chave de API configurada para o Imagen. Configure-a em Configurações > API.");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${key}`;

  const payload = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio,
      outputMimeType: "image/png"
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erro na geração de imagem: ${response.status}`);
  }

  const result = await response.json();
  const base64 = result.predictions?.[0]?.bytesBase64Encoded;

  if (!base64) throw new Error("Nenhuma imagem foi gerada pela API.");

  return { data: base64, mimeType: "image/png" };
}

export async function performFactCheck(text: string, signal?: AbortSignal): Promise<FactCheckResult[]> {
  const model = "gemma-4-31b-it";
  const prompt = `Analise o texto a seguir e REALIZE PESQUISAS NA WEB (usando a ferramenta google_search) para verificar cada afirmação de fato.
  
  TEXTO PARA CHECAGEM:
  "${text}"
  
  INSTRUÇÕES OBRIGATÓRIAS DE PESQUISA:
  - Você DEVE planejar e chamar a ferramenta 'google_search' para coletar fatos e links reais e atualizados sobre o texto acima.
  - Não responda nada de cabeça ou sem basear sua resposta em fontes retornadas pela busca.
  
  MISSÃO:
  1. Decompunha o texto em segmentos que contêm afirmações factuais (datas, nomes, leis, eventos, descobertas, etc).
  2. Use a pesquisa na web para VERIFICAR se cada afirmação é verdadeira ou falsa baseada em fontes confiáveis.
  3. Retorne APENAS UM JSON CRU contendo um array de objetos no formato:
     [{ "segment": "Trecho exato do texto original", "isVerified": boolean, "sourceUrl": "Link oficial se for verificado", "explanation": "Breve motivo da falha se não verificado" }]

  REGRAS:
  - O "segment" DEVE ser uma cópia IDÊNTICA (mesma pontuação, aspas, espaços e maiúsculas/minúsculas) de um trecho do texto original.
  - Se um fato for VERDADEIRO, isVerified é true e sourceUrl é OBRIGATÓRIO.
  - Se um fato for FALSO ou não houver evidências, isVerified é false.
  - Responda APENAS o JSON.`;

  try {
    const systemInstruction = 
      "Você é um checador de fatos rigoroso da Reuters. " +
      "Você DEVE OBRIGATORIAMENTE realizar pesquisas no Google (usando a ferramenta 'google_search') para validar cada afirmação no texto. " +
      "Não faça conjecturas e não responda baseando-se apenas em seu conhecimento interno de treinamento.";

    const res = await generateGeminiContent(prompt, model, [], systemInstruction, [], true, false, false, signal);
    const sanitized = extractAndParseJson(res.text);
    if (Array.isArray(sanitized)) {
      return sanitized;
    }
    return [];
  } catch (e) {
    console.warn("Erro ao realizar fact check:", e);
    return [];
  }
}
