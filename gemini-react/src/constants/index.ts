// Identificador fixo do modelo local servido via llama.cpp (localhost).
export const LOCAL_MODEL_ID = "local-model";

// Provedores de modelos de chat suportados. `gemini` usa a API nativa do Google;
// `local` e `openrouter` falam a API compatível com OpenAI (/v1/chat/completions)
// através do mesmo caminho de streaming.
export type ChatProvider = "gemini" | "local" | "openrouter";

// Provedores que o usuário pode cadastrar modelos customizados (por id).
export type CustomModelProvider = "openrouter";

// URL base (compatível com OpenAI) do provedor externo.
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// URL padrão do servidor local (llama.cpp / llama-server) rodando em localhost.
export const DEFAULT_LOCAL_ENDPOINT = "http://localhost:8080";

// Metadados de exibição de cada provedor customizável (usado na UI e nos rótulos
// do seletor de modelos do chat).
export const CUSTOM_MODEL_PROVIDERS: {
  id: CustomModelProvider;
  name: string;
  // Placeholder de exemplo de id de modelo para o campo de cadastro.
  example: string;
  // URL da página de catálogo/keys do provedor (mostrada como ajuda).
  keysUrl: string;
}[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    example: "deepseek/deepseek-r1:free",
    keysUrl: "https://openrouter.ai/keys",
  },
];

// Capacidades de um modelo, exibidas como emojis no seletor do chat.
export type ModelCapability = "text" | "image" | "audio" | "file" | "tools";

// Rótulo (tooltip) de cada capacidade. O ícone (lucide) é mapeado na UI.
export const CAPABILITY_META: Record<ModelCapability, { label: string }> = {
  text: { label: "Texto" },
  image: { label: "Visão (imagens)" },
  audio: { label: "Áudio" },
  file: { label: "Arquivos/PDF" },
  tools: { label: "Ferramentas (tool calling)" },
};

// Ordem canônica de exibição das capacidades.
export const CAPABILITY_ORDER: ModelCapability[] = ["text", "image", "audio", "file", "tools"];

// Modelo de chat customizado cadastrado pelo usuário. O `id` é enviado literalmente
// no campo `model` da requisição ao provedor; `provider` define para onde roteamos.
// `contextLength` é a janela de contexto (em tokens) e `capabilities` são as
// modalidades suportadas — ambos buscados da API do OpenRouter no cadastro
// (best-effort; podem ficar indefinidos).
export interface CustomModel {
  id: string;
  name: string;
  provider: CustomModelProvider;
  contextLength?: number;
  capabilities?: ModelCapability[];
}

// Janela de contexto (em tokens) dos modelos internos conhecidos. Usada como
// denominador do indicador de contexto por chat (ex.: 16k / 1M).
export const MODEL_CONTEXT: Record<string, number> = {
  "gemini-3.5-flash-lite": 1_000_000,
  "gemini-3.1-flash-lite-preview": 1_000_000,
  "gemma-4-31b-it": 128_000,
  "gemma-4-26b-a4b-it": 128_000,
};

// Janela de contexto padrão do modelo local (llama.cpp). Ajustável no futuro por
// configuração; hoje é um valor conservador razoável.
export const DEFAULT_LOCAL_CONTEXT = 32_000;

// Fallback quando não sabemos a janela de contexto de um modelo (ex.: OpenRouter
// cujo context_length não pôde ser buscado).
export const DEFAULT_CONTEXT_FALLBACK = 128_000;

/**
 * Resolve a janela de contexto (em tokens) de um modelo, considerando os modelos
 * customizados cadastrados. Ordem: contextLength do custom model → tabela interna →
 * padrão do local → fallback genérico.
 */
export function getModelContextWindow(
  model: string,
  customModels: CustomModel[] = []
): number {
  const custom = customModels.find((m) => m.id === model);
  if (custom?.contextLength) return custom.contextLength;
  if (MODEL_CONTEXT[model]) return MODEL_CONTEXT[model];
  if (model === LOCAL_MODEL_ID) return DEFAULT_LOCAL_CONTEXT;
  return DEFAULT_CONTEXT_FALLBACK;
}

/**
 * Estimativa rápida de tokens no navegador (~4 caracteres por token). NÃO é exata
 * — serve só para o texto ainda não enviado no indicador de contexto ao vivo.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Formata uma contagem de tokens de forma compacta: 940, 16k, 164k, 1M. */
export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`;
  }
  const m = n / 1_000_000;
  return `${m < 10 ? m.toFixed(m % 1 === 0 ? 0 : 1) : Math.round(m)}M`;
}

// Fontes de texto disponíveis para o sistema. `stack` é aplicado na variável CSS --app-font.
// As marcadas como "inspirada" usam aproximações livres das fontes proprietárias originais.
export const DEFAULT_FONT_ID = "gemini";

export const FONT_OPTIONS: {
  id: string;
  name: string;
  desc: string;
  stack: string;
}[] = [
  {
    id: "gemini",
    name: "Gemini",
    desc: "Google Sans · padrão",
    stack: "'Google Sans', sans-serif",
  },
  {
    id: "claude",
    name: "Claude",
    desc: "Serifada editorial (inspirada)",
    stack: "'Source Serif 4', Georgia, serif",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    desc: "Inter, estilo Söhne (inspirada)",
    stack: "'Inter', system-ui, sans-serif",
  },
  {
    id: "roboto",
    name: "Roboto",
    desc: "Clássica do Android",
    stack: "'Roboto', sans-serif",
  },
  {
    id: "arial",
    name: "Arial",
    desc: "Clássica do sistema",
    stack: "Arial, Helvetica, sans-serif",
  },
  {
    id: "system",
    name: "Sistema",
    desc: "Fonte nativa do SO",
    stack: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  {
    id: "serif",
    name: "Serifada",
    desc: "Georgia / Times",
    stack: "Georgia, 'Times New Roman', serif",
  },
  {
    id: "mono",
    name: "Monoespaçada",
    desc: "Estilo terminal",
    stack: "ui-monospace, 'Consolas', monospace",
  },
];

export const MODEL_LIMITS: Record<string, { name: string; rpd: number }> = {
  "gemma-4-31b-it": { name: "Gemma 4 31B", rpd: 1500 },
  "gemma-4-26b-a4b-it": { name: "Gemma 4 26B", rpd: 1500 },
  "gemini-3.5-flash-lite": { name: "Gemini 3.5 Flash Lite", rpd: 1000 },
  "gemini-3.1-flash-lite-preview": { name: "Gemini 3.1 Flash Lite", rpd: 500 },
  [LOCAL_MODEL_ID]: { name: "Modelo Local", rpd: Infinity },
  "imagen-4.0-fast-generate-001": { name: "Imagen 4 Fast", rpd: 25 },
  "imagen-4.0-generate-001": { name: "Imagen 4 Standard", rpd: 25 },
  "imagen-4.0-ultra-generate-001": { name: "Imagen 4 Ultra", rpd: 25 },
};

export const MODEL_OPTIONS = [
  {
    // Modelo estável 3.5 (id nativo da API Google AI Studio). Confirme o id exato
    // em Configurações → API (lista de modelos da conta) caso a API retorne 404.
    // No tier FREE não há grounding com Google Search (recurso só no tier pago),
    // por isso hasSearch: false — igual ao 3.1 Flash Lite.
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash Lite",
    desc: "O 3.5 mais rápido e econômico (alto throughput). Janela de 1M tokens. Sem pesquisa web no tier free.",
    hasSearch: false,
    capabilities: ["text", "image", "audio", "file", "tools"] as ModelCapability[],
  },
  {
    id: "gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash Lite",
    desc: "15 requisições por minuto, 250K tokens por minutos e 500 requisições por dia",
    hasSearch: false,
    capabilities: ["text", "image", "audio", "file", "tools"] as ModelCapability[],
  },
  {
    id: "gemma-4-31b-it",
    name: "Gemma 4 31B",
    desc: "15 Requisições por minuto, ilimitados tokens por minuto e 1500 requisiçoes por dia",
    hasSearch: true,
    capabilities: ["text", "image", "tools"] as ModelCapability[],
  },
  {
    id: "gemma-4-26b-a4b-it",
    name: "Gemma 4 26B",
    desc: "Gemma 4 26B (MoE, mais leve e veloz). 15 req/min, tokens ilimitados por minuto e 1500 req/dia",
    hasSearch: true,
    capabilities: ["text", "image", "tools"] as ModelCapability[],
  },
  {
    id: LOCAL_MODEL_ID,
    name: "Modelo Local",
    desc: "Seu modelo rodando em llama.cpp no localhost (API compatível com OpenAI)",
    hasSearch: false,
    capabilities: ["text"] as ModelCapability[],
  },
];

/**
 * Capacidades (modalidades) de um modelo para exibir os emojis no seletor.
 * Custom → o que foi buscado no cadastro; interno → a tabela acima; fallback: texto.
 */
export function getModelCapabilities(
  model: string,
  customModels: CustomModel[] = [],
): ModelCapability[] {
  const custom = customModels.find((m) => m.id === model);
  if (custom?.capabilities && custom.capabilities.length > 0) return custom.capabilities;
  const builtin = MODEL_OPTIONS.find((o) => o.id === model);
  if (builtin?.capabilities) return builtin.capabilities;
  return ["text"];
}

export const IMAGEN_OPTIONS = [
  {
    id: "imagen-4.0-fast-generate-001",
    name: "Fast Generate",
    desc: "Geração veloz para rascunhos",
  },
  {
    id: "imagen-4.0-generate-001",
    name: "Standard Generate",
    desc: "Equilíbrio e detalhamento",
  },
  {
    id: "imagen-4.0-ultra-generate-001",
    name: "Ultra Generate",
    desc: "Fidelidade máxima e realismo",
  },
];

export const DEFAULT_LIVE_MODEL = "gemini-3-flash-live";

export const LIVE_MODEL_OPTIONS = [
  {
    id: "gemini-3-flash-live",
    name: "Gemini 3 Flash Live",
    desc: "Modelo padrão nativo de áudio da família Gemini 3, baixa latência.",
  },
  {
    id: "gemini-2.5-flash-live",
    name: "Gemini 2.5 Flash Live",
    desc: "Modelo estável alternativo otimizado para conversas por voz.",
  },
];

// O id de API real do "Gemini 3 Flash Live" é gemini-3.1-flash-live-preview
// (confirmado via ListModels da conta; é o único modelo Live da geração 3).
export const LIVE_MODEL_MAP: Record<string, string> = {
  "gemini-2.5-flash-live":
    "models/gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-3-flash-live": "models/gemini-3.1-flash-live-preview",
};

// Vozes prebuilt disponíveis no modo LIVE (Gemini Live API). Fonte única de
// verdade usada tanto pela UI (LiveView, editor de personalidades) quanto pelas
// ferramentas expostas ao modelo (set_voice, list_voices).
export const LIVE_VOICES: { id: string; desc: string }[] = [
  { id: "Puck", desc: "Animada e enérgica" },
  { id: "Charon", desc: "Grave, informativa e calma" },
  { id: "Kore", desc: "Firme e neutra" },
  { id: "Fenrir", desc: "Jovem e empolgada" },
  { id: "Aoede", desc: "Leve e suave" },
];

export const LIVE_VOICE_IDS = LIVE_VOICES.map((v) => v.id);

// Voz padrão do modo LIVE quando nada foi escolhido.
export const DEFAULT_LIVE_VOICE = "Charon";
