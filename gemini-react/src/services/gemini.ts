import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import { logger } from './logger';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.min.css';
import 'katex/dist/katex.min.css';

const renderer = new marked.Renderer();

// Override paragraph: suppress empty paragraphs that create whitespace
renderer.paragraph = ({ tokens }) => {
  const body = (renderer as any).__proto__.paragraph.call(renderer, { tokens });
  const text = body.replace(/<p>(\s|<br>)*<\/p>/gi, '');
  return text;
};

// Configuração segura do Marked.js
const markedOptions: any = {
  renderer: renderer,
  highlight: function (code: string, lang: string) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  langPrefix: 'hljs language-',
  breaks: false,
  gfm: true
};
marked.setOptions(markedOptions);

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
              isStructuralClose = /^\s*["}\]0-9tfn{\[]/.test(afterComma);
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
            isStructuralClose = /^\s*["}\]0-9tfn{\[]/.test(afterComma);
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
  let tightenedContent = content.replace(/(\n\s*){2,}/g, '\n\n');

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
}


import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

let globalDefaultApiKey = '';
let globalPaidApiKey = '';

export function setGlobalDefaultApiKey(key: string) {
  globalDefaultApiKey = key;
}

export function setGlobalPaidApiKey(key: string) {
  globalPaidApiKey = key;
}

export async function getApiKey(manualApiKey?: string): Promise<string> {
  if (manualApiKey) return manualApiKey;
  if (globalDefaultApiKey) return globalDefaultApiKey;
  
  try {
    if (auth.currentUser) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
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
  manualApiKey?: string
): AsyncGenerator<{
  text?: string;
  thoughts?: string;
  isGrounded?: boolean;
  isSearching?: boolean;
  sources?: { title: string; uri: string }[];
  usage?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number }
}> {
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
      maxOutputTokens: 8192,
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
