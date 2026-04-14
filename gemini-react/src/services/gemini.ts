import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.min.css';

// Configuração segura do Marked.js
const markedOptions: any = {
  renderer: new marked.Renderer(),
  highlight: function (code: string, lang: string) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  langPrefix: 'hljs language-',
  breaks: true,
  gfm: true
};
marked.setOptions(markedOptions);

export function safeMarkdown(content: string): string {
  if (typeof content !== 'string') return "";
  return marked.parse(content) as string;
}

export type Message = {
  id: string;
  role: 'user' | 'ai';
  text: string;
  thoughts?: string;
  isGrounded?: boolean;
  duration?: number;
  files?: { name: string; data: string; mimeType: string }[];
};

export async function* streamGeminiContent(
  text: string, 
  model: string, 
  history: {role: string, parts: any[]}[],
  systemInstruction?: string,
  files: { mimeType: string; data: string }[] = [],
  webSearch: boolean = false,
  signal?: AbortSignal
): AsyncGenerator<{ 
  text?: string; 
  thoughts?: string; 
  isGrounded?: boolean;
  usage?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number }
}> {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) throw new Error("Chave de API não configurada no arquivo .env");

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
      thinkingConfig: { includeThoughts: true, thinkingLevel: "HIGH" },
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
            if (json.candidates && json.candidates[0].content) {
              const candidate = json.candidates[0];
              const parts = candidate.content.parts;
              const isGrounded = !!candidate.groundingMetadata;
              
              let chunkText = "";
              let chunkThoughts = "";

              parts.forEach((part: any) => {
                // part.thought is a boolean flag; skip thought parts entirely
                if (part.thought === true) return;
                if (part.text) chunkText += part.text;
              });

              yield { 
                text: chunkText, 
                thoughts: chunkThoughts, 
                isGrounded, 
                usage: json.usageMetadata 
              };
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
