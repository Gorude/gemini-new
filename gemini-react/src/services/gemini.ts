import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
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
    console.warn("JSON.parse falhou, tentando limpeza agressiva...", e.message);
    
    // Attempt 3: Fix trailing commas and other common issues using a simpler approach
    try {
      const fixedJson = jsonStr
        .replace(/,\s*([\]}])/g, '$1') // Remove trailing commas
        .replace(/\\n/g, "\\n")      // Ensure newlines are escaped correctly
        .replace(/\\'/g, "'");        // Fix unescaped single quotes
      return JSON.parse(fixedJson);
    } catch (e2) {
      throw e; // Throw original error if cleanup fails
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


export async function* streamGeminiContent(
  text: string,
  model: string,
  history: { role: string, parts: any[] }[],
  systemInstruction?: string,
  files: { mimeType: string; data: string }[] = [],
  webSearch: boolean = false,
  signal?: AbortSignal,
  thinking: boolean = false,
  jsonMode: boolean = false
): AsyncGenerator<{
  text?: string;
  thoughts?: string;
  isGrounded?: boolean;
  isSearching?: boolean;
  sources?: { title: string; uri: string }[];
  usage?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number }
}> {
  const key = import.meta.env.VITE_GEMINI_FREE_API_KEY;
  if (!key) throw new Error("Chave de API FREE não configurada no arquivo .env");

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

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error?.message || `Erro na API: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Falha ao abrir stream de leitura");

  const decoder = new TextDecoder();
  let buffer = "";

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
  jsonMode: boolean = false
) {
  const gen = streamGeminiContent(text, model, history, systemInstruction, files, webSearch, undefined, thinking, jsonMode);
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
  aspectRatio: '1:1' | '9:16' | '16:9'
): Promise<{ data: string; mimeType: string }> {
  const key = import.meta.env.VITE_GEMINI_PAID_API_KEY;
  if (!key) throw new Error("Chave de API PAID (Imagen) não configurada");

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

export async function performFactCheck(text: string): Promise<FactCheckResult[]> {
  const model = "gemma-4-31b-it";
  const prompt = `Analise o texto a seguir e REALIZE UMA PESQUISA NA WEB para verificar cada afirmação de fato contida nela.
  
  TEXTO PARA CHECAGEM:
  "${text}"
  
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
    const res = await generateGeminiContent(prompt, model, [], "Você é um checador de fatos rigoroso da Reuters.", [], true);
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
