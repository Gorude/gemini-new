import { marked } from "marked";
import markedKatex from "marked-katex-extension";
import { logger } from "./logger";
// Usamos o core do highlight.js e registramos só as linguagens comuns, em vez do
// import padrão (que empacota TODAS as linguagens, ~900 KB). Linguagens não
// registradas caem em texto simples (o renderer já faz esse fallback).
import hljs from "highlight.js/lib/core";
import type { LanguageFn } from "highlight.js";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import shell from "highlight.js/lib/languages/shell";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import sql from "highlight.js/lib/languages/sql";
import java from "highlight.js/lib/languages/java";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import cpp from "highlight.js/lib/languages/cpp";
import c from "highlight.js/lib/languages/c";
import csharp from "highlight.js/lib/languages/csharp";
import php from "highlight.js/lib/languages/php";
import ruby from "highlight.js/lib/languages/ruby";
import yaml from "highlight.js/lib/languages/yaml";
import markdownLang from "highlight.js/lib/languages/markdown";
import "highlight.js/styles/github-dark.min.css";
import "katex/dist/katex.min.css";

const HLJS_LANGS: Record<string, LanguageFn> = {
  javascript, typescript, python, bash, shell, json, xml, css, sql, java,
  go, rust, cpp, c, csharp, php, ruby, yaml, markdown: markdownLang,
};
for (const [name, fn] of Object.entries(HLJS_LANGS)) {
  hljs.registerLanguage(name, fn);
}
// Aliases comuns → linguagens registradas.
hljs.registerAliases(["js", "jsx"], { languageName: "javascript" });
hljs.registerAliases(["ts", "tsx"], { languageName: "typescript" });
hljs.registerAliases(["py"], { languageName: "python" });
hljs.registerAliases(["sh", "zsh"], { languageName: "bash" });
hljs.registerAliases(["html", "xhtml", "svg"], { languageName: "xml" });
hljs.registerAliases(["yml"], { languageName: "yaml" });
hljs.registerAliases(["c++"], { languageName: "cpp" });
hljs.registerAliases(["cs"], { languageName: "csharp" });
hljs.registerAliases(["rb"], { languageName: "ruby" });

const renderer = new marked.Renderer();

// Ícone (SVG inline do lucide "copy") para o botão de copiar do bloco de código.
const COPY_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

// Ícone (lucide "eye") para o botão de pré-visualizar (HTML/SVG).
const PREVIEW_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';

// Linguagens de código que podem ser pré-visualizadas (renderizadas) no painel lateral.
const PREVIEWABLE_LANGS = new Set(["html", "svg", "xml"]);

// Escapa HTML para exibir código sem linguagem registrada como texto simples
// (evita injeção e o crash do highlight com "plaintext" não registrado).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Custom code renderer supporting both positional and token object formats for Marked compatibility
renderer.code = (codeOrToken: any, langOrUndefined?: any) => {
  let text = "";
  let lang = "plaintext";

  if (codeOrToken && typeof codeOrToken === "object") {
    text = codeOrToken.text || "";
    lang = codeOrToken.lang || "plaintext";
  } else {
    text = codeOrToken || "";
    lang = langOrUndefined || "plaintext";
  }

  // Só chamamos o highlight quando a linguagem está REGISTRADA. Antes caíamos em
  // "plaintext", que não está no build core → hljs.highlight lançava
  // ("Unknown language: plaintext"). Sem linguagem, escapamos o texto e exibimos
  // como código simples (o fallback que o comentário do topo promete).
  const language = hljs.getLanguage(lang) ? lang : null;
  const highlighted = language ? hljs.highlight(text, { language }).value : escapeHtml(text);
  // Envolvemos o <pre> num wrapper com um botão de copiar "grudento" (sticky):
  // ele fica no canto superior direito e acompanha a rolagem enquanto o bloco
  // estiver visível. O botão fica FORA do <pre> para não sofrer com o overflow-x
  // do código. A cópia (e o preview) são tratados por delegação de evento no
  // MessageItem (lê o texto do <code>).
  const cssLang = language || "plaintext";
  const previewBtn = language && PREVIEWABLE_LANGS.has(language)
    ? `<button type="button" class="code-preview-btn" data-lang="${language}" title="Pré-visualizar" aria-label="Pré-visualizar">${PREVIEW_ICON_SVG}<span>Preview</span></button>`
    : "";
  return `<div class="code-block"><div class="code-copy-holder">${previewBtn}<button type="button" class="code-copy-btn" title="Copiar código" aria-label="Copiar código">${COPY_ICON_SVG}<span>Copiar</span></button></div><pre><code class="hljs language-${cssLang}">${highlighted}</code></pre></div>`;
};

// Configuração segura do Marked.js usando marked.use
marked.use({
  renderer: renderer,
  breaks: false,
  gfm: true,
});

// Adicionar suporte nativo à matemática.
// - strict: false → o KaTeX não loga avisos "unicodeTextInMathMode" (acentos ã/ç/é
//   caindo em modo matemático). Antes esses avisos inundavam o log.
// - nonStandard: false (padrão) → NÃO trata qualquer `$…$` como fórmula. Assim
//   valores monetários em português ("R$ 50 … R$ 100") deixam de ser interpretados
//   como matemática (a causa raiz dos avisos e da renderização bagunçada). Fórmulas
//   reais com `$…$`/`$$…$$` bem formadas continuam funcionando.
marked.use(
  markedKatex({
    throwOnError: false,
    output: "html",
    strict: false,
    nonStandard: false,
  }),
);

function escapeInnerQuotes(jsonStr: string): string {
  let result = "";
  let inString = false;
  let isKey = false; // whether we are currently in a key string
  let lastStructuralChar = "";

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (!inString) {
      if (char === '"') {
        // Entering a string!
        // It is structural if the last structural char was '{', '[', ',', or ':'
        const isStructuralStart =
          ["{", "[", ",", ":"].includes(lastStructuralChar) ||
          lastStructuralChar === "";
        if (isStructuralStart) {
          inString = true;
          isKey = lastStructuralChar === "{" || lastStructuralChar === ",";
          result += '"';
        } else {
          // If it's a quote outside a string but not in structural position, escape it
          result += '\\"';
        }
      } else {
        result += char;
        if (["{", "}", "[", "]", ":", ","].includes(char)) {
          lastStructuralChar = char;
        }
      }
    } else {
      // Inside a string
      if (char === "\\") {
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
              const afterComma = rest.replace(/^\s*,/, "");
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
          result += "\\" + (jsonStr[i + 1] || "");
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
            const afterComma = rest.replace(/^\s*,/, "");
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
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  const lastBrace = cleaned.lastIndexOf("}");
  const lastBracket = cleaned.lastIndexOf("]");

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
    throw new Error(
      "Não foi possível encontrar uma estrutura JSON válida na resposta.",
    );
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
        if (['"', "\\", "/", "b", "f", "n", "r", "t"].includes(p1)) {
          return match;
        }
        if (p1 === "u" && /^[0-9a-fA-F]{4}/.test(match.slice(2))) {
          return match;
        }
        return "\\\\" + p1;
      });

      // C. Remove trailing commas
      fixedJson = fixedJson.replace(/,\s*([\]}])/g, "$1");

      return JSON.parse(fixedJson);
    } catch (e2: any) {
      console.warn("JSON cleanup/parsing failed completely:", {
        originalError: e.message,
        cleanupError: e2.message,
        jsonStr,
      });
      throw e; // throw original error
    }
  }
}

export function safeMarkdown(content: string): string {
  if (typeof content !== "string") return "";

  // 1. Collapse all variations of multiple newlines (2+) into a single newline
  // This forces "tight" mode for almost everything by default.
  const tightenedContent = content.replace(/(\n\s*){2,}/g, "\n\n");

  let html = marked.parse(tightenedContent) as string;

  // 2. Aggressive List Cleanup: Strip ANY <p> tags that are direct children of <li>
  // We do this in a loop to catch nested or multiple paragraphs.
  let prevHtml;
  do {
    prevHtml = html;
    html = html.replace(/<li>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/gi, "<li>$1</li>");
  } while (html !== prevHtml);

  // 3. Remove spurious empty/whitespace paragraphs that marked might still emit
  html = html.replace(/<p>(\s|&nbsp;|<br\/?>)*<\/p>/gi, "");

  // 4. Collapse multiple <br> tags into one
  html = html.replace(/(<br\/?>\s*){2,}/gi, "<br/>");

  // 5. Tables ───────────────────────────────────────────────────────────────
  html = html.replace(/<table/g, '<div class="table-wrapper"><table');
  html = html.replace(/<\/table>/g, "</table></div>");

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
  role: "user" | "ai";
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
    resolved?: "accepted" | "ignored";
  }>;
  continuationText?: string;
  // Mapas embutidos (F8): locais extraídos de marcadores [MAP: …] na resposta.
  maps?: Array<{ query: string }>;
}

// ── Contratos de streaming das APIs (parsing de rede) ──────────────────────────
// Tipar estes payloads evita bugs de campo errado (ex.: `reasoning` vs
// `reasoning_content`, ou o `usage` num chunk final sem conteúdo).

interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenAIUrlCitation {
  type?: string;
  url_citation?: { url?: string; title?: string };
}

interface OpenAIDelta {
  content?: string;
  reasoning?: string;
  reasoning_content?: string;
  annotations?: OpenAIUrlCitation[];
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: OpenAIDelta;
    message?: { annotations?: OpenAIUrlCitation[] };
    finish_reason?: string | null;
  }>;
  usage?: OpenAIUsage;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiPart {
  text?: string;
  thought?: boolean | string;
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  groundingMetadata?: {
    groundingChunks?: Array<Record<string, any>>;
    webSearchQueries?: string[];
  };
  finishReason?: string;
}

interface GeminiStreamChunk {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}

import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  LOCAL_MODEL_ID,
  OPENROUTER_BASE_URL,
  CAPABILITY_ORDER,
  type ChatProvider,
  type CustomModel,
  type ModelCapability,
} from "../constants";

let globalDefaultApiKey = "";
let globalPaidApiKey = "";
let globalLocalEndpoint = "";
let globalOpenRouterApiKey = "";
// Registro dos modelos customizados cadastrados pelo usuário. Serve para resolver
// o provedor (e portanto a URL/chave/cabeçalhos) a partir do id do modelo escolhido.
let globalCustomModels: CustomModel[] = [];

export function setGlobalDefaultApiKey(key: string) {
  globalDefaultApiKey = key;
}

export function setGlobalPaidApiKey(key: string) {
  globalPaidApiKey = key;
}

export function setGlobalOpenRouterApiKey(key: string) {
  globalOpenRouterApiKey = (key || "").trim();
}

export function setGlobalCustomModels(models: CustomModel[]) {
  globalCustomModels = Array.isArray(models) ? models : [];
}

export interface OpenRouterModelMeta {
  contextLength?: number;
  capabilities?: ModelCapability[];
}

/**
 * Busca metadados de um modelo no catálogo do OpenRouter: janela de contexto
 * (context_length) e capacidades (modalidades de entrada + tool calling).
 * Best-effort: retorna {} se não encontrar ou se a requisição falhar.
 */
export async function fetchOpenRouterModelMeta(modelId: string): Promise<OpenRouterModelMeta> {
  try {
    const headers: Record<string, string> = {};
    if (globalOpenRouterApiKey) headers['Authorization'] = `Bearer ${globalOpenRouterApiKey}`;
    const res = await fetch(`${OPENROUTER_BASE_URL}/models`, { headers });
    if (!res.ok) return {};
    const data = await res.json();
    const models: any[] = data?.data || [];
    const found = models.find(m => m?.id === modelId);
    if (!found) return {};

    const ctxRaw = found.context_length ?? found.top_provider?.context_length;
    const contextLength = typeof ctxRaw === 'number' && ctxRaw > 0 ? ctxRaw : undefined;

    // Modalidades de entrada: preferimos `architecture.input_modalities` (array);
    // fallback para a string legada `architecture.modality` (ex.: "text+image->text").
    const arch = found.architecture || {};
    const inputs: string[] = Array.isArray(arch.input_modalities)
      ? arch.input_modalities
      : (typeof arch.modality === 'string' ? arch.modality.split('->')[0].split('+') : []);

    const caps = new Set<ModelCapability>(['text']); // todo modelo de chat entende texto
    for (const m of inputs) {
      const v = String(m).toLowerCase();
      if (v.includes('image')) caps.add('image');
      else if (v.includes('audio')) caps.add('audio');
      else if (v.includes('file') || v.includes('pdf')) caps.add('file');
    }
    const params: string[] = found.supported_parameters || [];
    if (params.includes('tools') || params.includes('tool_choice')) caps.add('tools');

    const capabilities = CAPABILITY_ORDER.filter(c => caps.has(c));
    return { contextLength, capabilities };
  } catch {
    return {};
  }
}

/**
 * Resolve o provedor de um id de modelo. Modelos customizados (OpenRouter) são
 * consultados no registro; o modelo local tem id fixo; o resto é Gemini nativo.
 */
export function resolveProvider(model: string): ChatProvider {
  if (isLocalModel(model)) return "local";
  const custom = globalCustomModels.find((m) => m.id === model);
  if (custom) return custom.provider;
  return "gemini";
}

/**
 * URL base do servidor local (llama.cpp), normalmente http://localhost:8080.
 * A barra final é removida para podermos concatenar "/v1/chat/completions".
 */
export function setGlobalLocalEndpoint(url: string) {
  globalLocalEndpoint = (url || "").trim().replace(/\/+$/, "");
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
      const userDocRef = doc(db, "users", auth.currentUser.uid);
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

  throw new Error(
    "Chave de API do Google AI Studio padrão não configurada. Vá em Configurações > API para configurar.",
  );
}

/**
 * Diagnóstico: lista os modelos que a chave atual pode usar, destacando os que
 * suportam a Live API (método 'bidiGenerateContent'). Útil para descobrir o id
 * exato do modelo LIVE disponível para a conta.
 */
export async function listLiveModels(
  manualApiKey?: string,
): Promise<{ live: string[]; all: string[] }> {
  const key = await getApiKey(manualApiKey);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1000`,
  );
  if (!res.ok) {
    const errText = await res.text();
    console.error(
      `[MODELS] Falha ao listar modelos (${res.status}): ${errText}`,
    );
    throw new Error(`Falha ao listar modelos: ${res.status}`);
  }
  const data = await res.json();
  const models: any[] = data.models || [];
  const strip = (n: string) => (n || "").replace(/^models\//, "");
  const live = models
    .filter((m) =>
      (m.supportedGenerationMethods || []).includes("bidiGenerateContent"),
    )
    .map((m) => strip(m.name));
  const all = models.map((m) => strip(m.name));
  console.log(
    `[MODELS] 🎙️ Modelos com suporte à Live API (bidiGenerateContent): ${live.length ? live.join(", ") : "NENHUM"}`,
  );
  console.log(
    `[MODELS] 📋 Todos os modelos disponíveis para esta chave: ${all.join(", ")}`,
  );
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
 * Configuração de um endpoint compatível com OpenAI (modelo local ou OpenRouter).
 * Reúne o que muda entre provedores; o corpo do streaming é idêntico.
 */
interface OpenAIEndpointConfig {
  // URL completa do endpoint de chat completions.
  url: string;
  // Id do modelo enviado no campo `model` da requisição.
  modelId: string;
  // Cabeçalhos extras (Authorization, HTTP-Referer, etc).
  headers: Record<string, string>;
  // Rótulo curto para logs/erros (ex.: "local", "openrouter").
  label: string;
  // Mensagem amigável exibida quando a conexão de rede falha.
  connectErrorMsg: string;
  // Teto de tokens de saída.
  maxTokens: number;
  // Campos extras a serem mesclados no corpo da requisição (ex.: `reasoning` do OpenRouter).
  extraBody?: Record<string, any>;
}

/**
 * Streaming genérico para endpoints compatíveis com OpenAI (modelo local via
 * llama.cpp e OpenRouter). Converte o histórico no formato Gemini para o formato
 * `messages` do OpenAI e separa blocos de raciocínio (`reasoning_content` ou
 * tags <think>...</think>) dos thoughts.
 */
async function* streamOpenAICompatibleContent(
  cfg: OpenAIEndpointConfig,
  text: string,
  history: { role: string; parts: any[] }[],
  systemInstruction: string | undefined,
  files: { mimeType: string; data: string }[],
  signal: AbortSignal | undefined,
  thinking: boolean,
): AsyncGenerator<{
  text?: string;
  thoughts?: string;
  isGrounded?: boolean;
  isSearching?: boolean;
  sources?: { title: string; uri: string }[];
  usage?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}> {
  const url = cfg.url;

  // Monta as mensagens no formato OpenAI a partir do histórico Gemini.
  const messages: any[] = [];
  if (systemInstruction) {
    messages.push({ role: "system", content: systemInstruction });
  }
  for (const h of history) {
    const role =
      h.role === "model" || h.role === "assistant" ? "assistant" : "user";
    const content = (h.parts || []).map((p: any) => p.text || "").join("");
    if (content) messages.push({ role, content });
  }

  // Mensagem atual do usuário (com imagens opcionais para modelos multimodais).
  if (files && files.length > 0) {
    const parts: any[] = [];
    if (text) parts.push({ type: "text", text });
    files.forEach((f) =>
      parts.push({
        type: "image_url",
        image_url: { url: `data:${f.mimeType};base64,${f.data}` },
      }),
    );
    messages.push({ role: "user", content: parts });
  } else {
    messages.push({ role: "user", content: text });
  }

  const payload = {
    model: cfg.modelId,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.7,
    max_tokens: cfg.maxTokens,
    ...(cfg.extraBody || {}),
  };

  logger.addLog("api-request", `Request: ${cfg.modelId} (${cfg.label})`, {
    url,
    payload,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cfg.headers,
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") throw err;
    logger.addLog(
      "api-error",
      `Falha ao conectar (${cfg.label}): ${err?.message}`,
      { error: err?.message, url },
    );
    throw new Error(`${cfg.connectErrorMsg} Detalhe: ${err?.message || err}`);
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    let errMsg = `Erro do servidor (${cfg.label}) (${response.status})`;
    try {
      const parsed = JSON.parse(errBody);
      errMsg = parsed?.error?.message || parsed?.message || errMsg;
    } catch {
      if (errBody) errMsg = errBody.slice(0, 300);
    }
    logger.addLog(
      "api-error",
      `Erro definitivo (${cfg.label}) (${response.status})`,
      { error: errMsg },
    );
    throw new Error(errMsg);
  }

  const reader = response.body?.getReader();
  if (!reader)
    throw new Error(`Falha ao abrir stream de leitura (${cfg.label}).`);

  const decoder = new TextDecoder();
  let buffer = "";
  let accumulatedText = "";
  let accumulatedThoughts = "";
  const accumulatedSources: { title: string; uri: string }[] = [];
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
        const idx = s.indexOf("<think>");
        if (idx === -1) {
          const partial = partialTagSuffix(s, "<think>");
          outText += s.slice(0, s.length - partial);
          carry = s.slice(s.length - partial);
          s = "";
        } else {
          outText += s.slice(0, idx);
          s = s.slice(idx + "<think>".length);
          thinkMode = true;
        }
      } else {
        const idx = s.indexOf("</think>");
        if (idx === -1) {
          const partial = partialTagSuffix(s, "</think>");
          outThoughts += s.slice(0, s.length - partial);
          carry = s.slice(s.length - partial);
          s = "";
        } else {
          outThoughts += s.slice(0, idx);
          s = s.slice(idx + "</think>".length);
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
          const json = JSON.parse(data) as OpenAIStreamChunk;
          const delta: OpenAIDelta = json.choices?.[0]?.delta || {};

          let chunkText = "";
          let chunkThoughts = "";
          const chunkSources: { title: string; uri: string }[] = [];

          // Citações da busca web nativa do OpenRouter (plugin `web`). Chegam como
          // `annotations` do tipo `url_citation` — mapeamos para fontes exibíveis.
          const annotations =
            delta.annotations || json.choices?.[0]?.message?.annotations;
          if (Array.isArray(annotations)) {
            for (const ann of annotations) {
              const cit = ann?.url_citation;
              if ((ann?.type === "url_citation" || cit) && cit?.url) {
                chunkSources.push({
                  title: cit.title || cit.url,
                  uri: cit.url,
                });
              }
            }
          }

          // Canal de raciocínio nativo. Cada provedor usa um nome de campo diferente:
          // - llama.cpp (com --reasoning-format): `reasoning_content`
          // - OpenRouter (campo normalizado): `reasoning`
          if (
            typeof delta.reasoning_content === "string" &&
            delta.reasoning_content
          ) {
            chunkThoughts += delta.reasoning_content;
          }
          if (typeof delta.reasoning === "string" && delta.reasoning) {
            chunkThoughts += delta.reasoning;
          }

          // Conteúdo normal — pode conter tags <think> embutidas.
          if (typeof delta.content === "string" && delta.content) {
            const split = splitThinking(delta.content);
            chunkText += split.text;
            chunkThoughts += split.thoughts;
          }

          // O `usage` costuma chegar num chunk FINAL separado, sem conteúdo
          // (OpenRouter/OpenAI com include_usage). Por isso precisamos emiti-lo
          // mesmo quando não há texto/raciocínio/fontes — senão a contagem se perde.
          let usageArrived = false;
          if (json.usage) {
            finalUsage = {
              promptTokenCount: json.usage.prompt_tokens || 0,
              candidatesTokenCount: json.usage.completion_tokens || 0,
              totalTokenCount: json.usage.total_tokens || 0,
            };
            usageArrived = true;
          }

          if (chunkText || chunkThoughts || chunkSources.length > 0 || usageArrived) {
            accumulatedText += chunkText;
            accumulatedThoughts += chunkThoughts;
            chunkSources.forEach((src) => {
              if (!accumulatedSources.some((s) => s.uri === src.uri))
                accumulatedSources.push(src);
            });
            yield {
              text: chunkText,
              thoughts: thinking ? chunkThoughts : "",
              isGrounded: chunkSources.length > 0 ? true : undefined,
              sources: chunkSources.length > 0 ? chunkSources : undefined,
              usage: finalUsage || undefined,
            };
          }
        } catch (e) {
          console.warn(`Erro ao processar chunk (${cfg.label}):`, e);
        }
      }
    }
  } finally {
    reader.releaseLock();
    logger.addLog(
      "api-response",
      `Response: ${cfg.modelId} (${cfg.label}) completed`,
      {
        response: {
          text: accumulatedText,
          thoughts: accumulatedThoughts,
          sources: accumulatedSources,
          usage: finalUsage,
        },
      },
    );
  }
}

/**
 * Monta a config do endpoint compatível com OpenAI para cada provedor externo.
 * Lança erro amigável quando falta a chave/endpoint necessário.
 */
function buildOpenAIConfig(
  provider: Exclude<ChatProvider, "gemini">,
  model: string,
  maxTokens: number,
  thinking: boolean,
  webSearch: boolean,
  jsonMode: boolean,
): OpenAIEndpointConfig {
  if (provider === "local") {
    const base = globalLocalEndpoint;
    if (!base) {
      throw new Error(
        "Endpoint do modelo local não configurado. Vá em Configurações > API e informe a URL do seu llama.cpp (ex.: http://localhost:8080).",
      );
    }
    return {
      url: `${base}/v1/chat/completions`,
      modelId: LOCAL_MODEL_ID,
      headers: {},
      label: "local",
      connectErrorMsg: `Não foi possível conectar ao modelo local (${base}). Verifique se o llama.cpp (llama-server) está ativo.`,
      maxTokens,
      // Saída em JSON (ex.: organização de memórias). llama-server aceita response_format.
      extraBody: jsonMode ? { response_format: { type: "json_object" } } : undefined,
    };
  }

  // provider === 'openrouter'
  if (!globalOpenRouterApiKey) {
    throw new Error(
      "Chave da API do OpenRouter não configurada. Vá em Configurações > API para adicioná-la.",
    );
  }
  // Campos extras específicos do OpenRouter:
  // - `reasoning`: quando o "pensar" está ligado, pede os tokens de raciocínio
  //   (campo `reasoning`). Modelos que não suportam ignoram.
  // - `plugins: [{ id: 'web' }]`: busca web NATIVA do OpenRouter quando o usuário liga
  //   o botão de busca. As citações voltam como `annotations` (url_citation) e viram fontes.
  // - `response_format`: saída em JSON quando solicitado (ex.: organização de memórias).
  const extraBody: Record<string, any> = {};
  if (thinking) extraBody.reasoning = { enabled: true };
  if (webSearch) extraBody.plugins = [{ id: "web", max_results: 4 }];
  if (jsonMode) extraBody.response_format = { type: "json_object" };

  return {
    url: `${OPENROUTER_BASE_URL}/chat/completions`,
    modelId: model,
    headers: {
      Authorization: `Bearer ${globalOpenRouterApiKey}`,
      // Cabeçalhos recomendados pelo OpenRouter para atribuição do app.
      "HTTP-Referer":
        typeof location !== "undefined"
          ? location.origin
          : "https://nemon.chat",
      "X-Title": "Nemon Chat",
    },
    label: "openrouter",
    connectErrorMsg:
      "Não foi possível conectar ao OpenRouter. Verifique sua conexão e a chave de API.",
    maxTokens,
    extraBody: Object.keys(extraBody).length > 0 ? extraBody : undefined,
  };
}

export async function* streamGeminiContent(
  text: string,
  model: string,
  history: { role: string; parts: any[] }[],
  systemInstruction?: string,
  files: { mimeType: string; data: string }[] = [],
  webSearch: boolean = false,
  signal?: AbortSignal,
  thinking: boolean = false,
  jsonMode: boolean = false,
  manualApiKey?: string,
  maxOutputTokens: number = 8192,
): AsyncGenerator<{
  text?: string;
  thoughts?: string;
  isGrounded?: boolean;
  isSearching?: boolean;
  sources?: { title: string; uri: string }[];
  usage?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}> {
  // Provedores compatíveis com OpenAI (modelo local via llama.cpp, OpenRouter):
  // roteamos todos para o mesmo streamer, variando só a config.
  const provider = resolveProvider(model);
  if (provider !== "gemini") {
    const cfg = buildOpenAIConfig(
      provider,
      model,
      maxOutputTokens,
      thinking,
      webSearch,
      jsonMode,
    );
    yield* streamOpenAICompatibleContent(
      cfg,
      text,
      history,
      systemInstruction,
      files,
      signal,
      thinking,
    );
    return;
  }

  const key = await getApiKey(manualApiKey);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;

  const currentParts: any[] = [];
  if (files.length > 0) {
    files.forEach((f) => {
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
      ...(jsonMode ? { response_mime_type: "application/json" } : {}),
    },
  };

  if (thinking) {
    // Apenas modelos específicos suportam o parâmetro thinkingConfig nativo (como Gemini Thinking)
    const supportsThinkingConfig =
      model.includes("thinking") || model.includes("gemini-2.0");

    if (supportsThinkingConfig) {
      payload.generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinkingLevel: "HIGH",
      };
    } else {
      // Fallback: Instrução via prompt para modelos que não aceitam thinkingConfig
      const searchInstruction = webSearch
        ? "\n\nPESQUISA OBRIGATÓRIA: Planeje e use 'google_search' para basear sua resposta em fatos REAIS."
        : "";
      currentParts.unshift({
        text:
          "Missão Final: Fornecer uma resposta útil e direta ao usuário.\n\n1. Raciocínio (Privado): SEMPRE use <thinking>...</thinking> para seu processo interno.\n2. Conclusão (Público): Após fechar o </thinking>, você DEVE obrigatoriamente escrever a resposta final detalhada que o usuário verá. NUNCA termine sua mensagem apenas com o raciocínio." +
          searchInstruction,
      });
    }
  } else if (model.includes("gemma") && !webSearch) {
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
      parts: [{ text: systemInstruction }],
    };
  }

  // API REQUEST LOGGING
  logger.addLog("api-request", `Request: ${model}`, { url, payload });

  const maxRetries = 5;
  let attempt = 0;
  let response: Response | null = null;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    attempt++;
    try {
      if (attempt > 1) {
        logger.addLog(
          "warn",
          `Tentando reconectar com a API (${attempt}/${maxRetries})...`,
        );
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });

      if (res.ok) {
        response = res;
        break;
      } else {
        const errorBody = await res.json().catch(() => ({}));
        const errMsg = errorBody.error?.message || `Erro na API: ${res.status}`;

        // Se for um erro do servidor (>= 500), faremos nova tentativa com backoff exponencial
        if (res.status >= 500) {
          logger.addLog(
            "warn",
            `Erro transiente da API (${res.status}): ${errMsg}. Nova tentativa em ${attempt * 1000}ms...`,
          );
          lastError = new Error(errMsg);
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
          continue;
        } else {
          // Erros de cliente (400, 403, etc.) não devem ser retentados pois são definitivos
          logger.addLog(
            "api-error",
            `Erro definitivo de cliente (${res.status}): ${errMsg}`,
            { error: errMsg },
          );
          throw new Error(errMsg);
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw err; // Requisição abortada manualmente pelo usuário
      }
      logger.addLog(
        "warn",
        `Falha de rede/conexão: ${err.message}. Nova tentativa em ${attempt * 1000}ms...`,
      );
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  if (!response) {
    const errMsg =
      lastError?.message ||
      "Conexão com a API esgotada após várias tentativas.";
    logger.addLog(
      "api-error",
      `API Connection Exhausted after ${maxRetries} attempts`,
      { error: errMsg },
    );
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
            const json = JSON.parse(line.substring(6)) as GeminiStreamChunk;
            if (json.candidates && json.candidates[0]) {
              const candidate = json.candidates[0];
              const parts: GeminiPart[] = candidate.content?.parts || [];
              const metadata = candidate.groundingMetadata;
              const chunkGrounded = !!metadata;

              let chunkText = "";
              let chunkThoughts = "";
              let chunkSources: { title: string; uri: string }[] = [];

              if (metadata?.groundingChunks) {
                chunkSources = metadata.groundingChunks
                  .map((chunk: any) => {
                    const s =
                      chunk.web || chunk.webSource || chunk.source || chunk;
                    return {
                      title: s.title || chunk.title || "",
                      uri: s.uri || chunk.uri || "",
                    };
                  })
                  .filter((s: any) => s.uri);
              }

              const chunkIsSearching = !!(
                metadata?.webSearchQueries &&
                metadata.webSearchQueries.length > 0
              );

              parts.forEach((part: any) => {
                // Se o componente de pensamento (thought) está presente
                if (part.thought === true || part.thought === "true") {
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
              chunkSources.forEach((src) => {
                if (!accumulatedSources.some((s) => s.uri === src.uri)) {
                  accumulatedSources.push(src);
                }
              });
              const usageMeta = json.usageMetadata
                ? {
                    promptTokenCount: json.usageMetadata.promptTokenCount ?? 0,
                    candidatesTokenCount: json.usageMetadata.candidatesTokenCount ?? 0,
                    totalTokenCount: json.usageMetadata.totalTokenCount ?? 0,
                  }
                : undefined;
              if (usageMeta) {
                finalUsage = usageMeta;
              }

              yield {
                text: chunkText,
                thoughts: chunkThoughts,
                isGrounded: chunkGrounded,
                isSearching: chunkIsSearching,
                sources: chunkSources,
                usage: usageMeta,
              };

              // DIAGNÓSTICO: Log do finishReason e estrutura se o texto estiver vazio mas o pensamento não
              if (
                chunkThoughts &&
                !chunkText &&
                candidate.finishReason &&
                candidate.finishReason !== "STOP"
              ) {
                console.warn(
                  `[DEBUG] Resposta terminou sem texto. Motivo: ${candidate.finishReason}`,
                );
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
    logger.addLog("api-response", `Response: ${model} completed`, {
      response: {
        text: accumulatedText,
        thoughts: accumulatedThoughts,
        sources: accumulatedSources,
        usage: finalUsage,
      },
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
  manualApiKey?: string,
) {
  const gen = streamGeminiContent(
    text,
    model,
    history,
    systemInstruction,
    files,
    webSearch,
    signal,
    thinking,
    jsonMode,
    manualApiKey,
  );
  let fullText = "",
    fullThoughts = "",
    isGrounded = false,
    usage: any = null;

  for await (const chunk of gen) {
    if (chunk.text) fullText += chunk.text;
    if (chunk.thoughts) fullThoughts += chunk.thoughts;
    if (chunk.isGrounded) isGrounded = true;
    if (chunk.usage) usage = chunk.usage;
  }

  return { text: fullText, thoughts: fullThoughts, isGrounded, usage };
}

// ── Tool calling no chat (F3) ────────────────────────────────────────────────
// Ferramentas embutidas expostas ao chat (subconjunto seguro). O executor é o
// mesmo do modo LIVE (handleLiveToolCall no App), injetado por callback.

export interface ChatToolDef {
  id: string;
  label: string;
  // Declaração no formato Gemini (functionDeclarations).
  gemini: { name: string; description: string; parameters: any };
}

export const CHAT_TOOLS: ChatToolDef[] = [
  {
    id: "calculate",
    label: "Calculadora",
    gemini: {
      name: "calculate",
      description: "Avalia uma expressão matemática e retorna o resultado. Use para contas precisas.",
      parameters: {
        type: "OBJECT",
        properties: { expression: { type: "STRING", description: "Expressão matemática, ex.: '2*(3+4)/5'." } },
        required: ["expression"],
      },
    },
  },
  {
    id: "get_weather",
    label: "Clima",
    gemini: {
      name: "get_weather",
      description: "Consulta o clima atual e a previsão do dia de uma cidade (ou da localização do usuário).",
      parameters: {
        type: "OBJECT",
        properties: { location: { type: "STRING", description: "Cidade/local. Vazio usa a localização do dispositivo." } },
      },
    },
  },
  {
    id: "get_current_time",
    label: "Hora atual",
    gemini: {
      name: "get_current_time",
      description: "Retorna a data e hora atuais do sistema do usuário.",
      parameters: { type: "OBJECT", properties: {} },
    },
  },
];

export type ChatToolExecutor = (name: string, args: any) => Promise<{ result: string }>;

/**
 * Loop agêntico (não-streaming) de tool calling para modelos GEMINI. Envia o
 * pedido com as ferramentas declaradas; se o modelo chamar uma ferramenta,
 * executa via `executor` e devolve o resultado, repetindo até a resposta final.
 * Retorna o texto final e os nomes das ferramentas usadas. Limite de 5 iterações.
 */
export async function runGeminiToolLoop(
  text: string,
  model: string,
  history: { role: string; parts: any[] }[],
  systemInstruction: string | undefined,
  toolIds: string[],
  executor: ChatToolExecutor,
  signal?: AbortSignal,
  manualApiKey?: string,
): Promise<{ text: string; toolsUsed: string[] }> {
  const key = await getApiKey(manualApiKey);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const declarations = CHAT_TOOLS.filter(t => toolIds.includes(t.id)).map(t => t.gemini);

  const contents: any[] = [...history, { role: "user", parts: [{ text }] }];
  const toolsUsed: string[] = [];

  for (let iter = 0; iter < 5; iter++) {
    const payload: any = {
      contents,
      tools: [{ functionDeclarations: declarations }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
    };
    if (systemInstruction) payload.systemInstruction = { role: "system", parts: [{ text: systemInstruction }] };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Erro na API (${res.status})`);
    }
    const data = await res.json();
    const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
    const calls = parts.filter(p => p.functionCall);

    if (calls.length === 0) {
      const finalText = parts.map(p => p.text || "").join("").trim();
      return { text: finalText, toolsUsed };
    }

    // Registra a chamada do modelo e executa cada ferramenta, devolvendo os resultados.
    contents.push({ role: "model", parts: calls.map(c => ({ functionCall: c.functionCall })) });
    const responseParts: any[] = [];
    for (const c of calls) {
      const name = c.functionCall.name;
      const args = c.functionCall.args || {};
      toolsUsed.push(name);
      let result = "";
      try {
        result = (await executor(name, args)).result;
      } catch (e) {
        result = `Erro ao executar ${name}: ${e instanceof Error ? e.message : "desconhecido"}`;
      }
      responseParts.push({ functionResponse: { name, response: { result } } });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return { text: "Não foi possível concluir com as ferramentas (limite de iterações atingido).", toolsUsed };
}

/**
 * Delegação de busca: usa o Gemma 4 31B (que suporta google_search) para pesquisar
 * na web e retornar um resumo factual + fontes. Serve para modelos que não fazem
 * busca nativa poderem responder com dados atuais.
 */
export async function performWebSearch(
  query: string,
  signal?: AbortSignal,
  manualApiKey?: string,
  modelId: string = "gemma-4-31b-it",
): Promise<{ summary: string; sources: { title: string; uri: string }[] }> {
  const model = modelId;
  const systemInstruction =
    "Você é um mecanismo de pesquisa. Use OBRIGATORIAMENTE a ferramenta google_search para buscar na web " +
    "e retorne um resumo CONCISO (no máximo 6 linhas ou tópicos curtos) apenas com os fatos mais relevantes " +
    "e atualizados (números, datas, nomes) encontrados nas fontes. Vá direto ao ponto, sem introduções nem " +
    "conclusões. Não invente; baseie-se somente nos resultados da busca.";
  const prompt = `Pesquise na web e resuma de forma concisa as informações mais relevantes e atuais para responder: "${query}"`;

  // Teto de tokens baixo: o resumo é curto, então gera muito mais rápido que o padrão (8192).
  const gen = streamGeminiContent(
    prompt,
    model,
    [],
    systemInstruction,
    [],
    true,
    signal,
    false,
    false,
    manualApiKey,
    1024,
  );
  let summary = "";
  const sourceMap = new Map<string, { title: string; uri: string }>();
  for await (const chunk of gen) {
    if (chunk.text) summary += chunk.text;
    if (chunk.sources) {
      chunk.sources.forEach((s) => {
        if (s.uri && !sourceMap.has(s.uri))
          sourceMap.set(s.uri, { title: s.title || s.uri, uri: s.uri });
      });
    }
  }
  return { summary: summary.trim(), sources: [...sourceMap.values()] };
}

export async function generateImagenContent(
  prompt: string,
  model: string,
  aspectRatio: "1:1" | "9:16" | "16:9",
  manualApiKey?: string,
): Promise<{ data: string; mimeType: string }> {
  const key = manualApiKey || globalPaidApiKey || globalDefaultApiKey;
  if (!key)
    throw new Error(
      "Nenhuma chave de API configurada para o Imagen. Configure-a em Configurações > API.",
    );

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${key}`;

  const payload = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio,
      outputMimeType: "image/png",
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err.error?.message || `Erro na geração de imagem: ${response.status}`,
    );
  }

  const result = await response.json();
  const base64 = result.predictions?.[0]?.bytesBase64Encoded;

  if (!base64) throw new Error("Nenhuma imagem foi gerada pela API.");

  return { data: base64, mimeType: "image/png" };
}

export async function performFactCheck(
  text: string,
  signal?: AbortSignal,
  modelId: string = "gemma-4-31b-it",
): Promise<FactCheckResult[]> {
  const model = modelId;
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

    const res = await generateGeminiContent(
      prompt,
      model,
      [],
      systemInstruction,
      [],
      true,
      false,
      false,
      signal,
    );
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
