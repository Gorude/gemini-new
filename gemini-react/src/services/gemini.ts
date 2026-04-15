import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.min.css';
import 'katex/dist/katex.min.css';

const renderer = new marked.Renderer();


// Configuração segura do Marked.js
const markedOptions: any = {
  renderer: renderer,
  highlight: function (code: string, lang: string) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  langPrefix: 'hljs language-',
  breaks: true,
  gfm: true
};
marked.setOptions(markedOptions);

// Adicionar suporte nativo à matemática
marked.use(markedKatex({
  throwOnError: false,
  output: 'html',
  nonStandard: true
}));


export function safeMarkdown(content: string): string {
  if (typeof content !== 'string') return "";
  let html = marked.parse(content) as string;
  // Wrap simple tables to allow horizontal scrolling
  html = html.replace(/<table/g, '<div class="table-wrapper"><table');
  html = html.replace(/<\/table>/g, '</table></div>');
  return html;
}

export type Message = {
  id: string;
  role: 'user' | 'ai';
  text: string;
  thoughts?: string;
  isGrounded?: boolean;
  duration?: number;
  files?: { name: string; data: string; mimeType: string }[];
  sources?: { title: string; uri: string }[];
};

export async function* streamGeminiContent(
  text: string, 
  model: string, 
  history: {role: string, parts: any[]}[],
  systemInstruction?: string,
  files: { mimeType: string; data: string }[] = [],
  webSearch: boolean = false,
  signal?: AbortSignal,
  thinking: boolean = false
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
      ...(thinking ? { thinkingConfig: { includeThoughts: true, thinkingLevel: "HIGH" } } : {}),
      maxOutputTokens: 8192,
      temperature: 0.7
    }
  };

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
                chunkSources = metadata.groundingChunks.map((chunk: any) => ({
                  title: chunk.web?.title || "",
                  uri: chunk.web?.uri || ""
                })).filter((s: any) => s.uri);
              }

              const chunkIsSearching = !!(metadata?.webSearchQueries && metadata.webSearchQueries.length > 0);

              parts.forEach((part: any) => {
                if (part.thought === true) {
                  if (part.text) chunkThoughts += part.text;
                  return;
                }
                if (part.text) chunkText += part.text;
              });

              yield { 
                text: chunkText, 
                thoughts: chunkThoughts, 
                isGrounded: chunkGrounded, 
                isSearching: chunkIsSearching,
                sources: chunkSources,
                usage: json.usageMetadata 
              };


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
  webSearch: boolean = false
) {
  const gen = streamGeminiContent(text, model, history, systemInstruction, files, webSearch);
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
