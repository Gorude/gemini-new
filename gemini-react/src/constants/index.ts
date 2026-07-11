// Identificador fixo do modelo local servido via llama.cpp (exposto por ngrok).
export const LOCAL_MODEL_ID = "local-model";

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
  "gemini-3.1-flash-lite-preview": { name: "Gemini 3.1 Flash Lite", rpd: 500 },
  [LOCAL_MODEL_ID]: { name: "Modelo Local", rpd: Infinity },
  "imagen-4.0-fast-generate-001": { name: "Imagen 4 Fast", rpd: 25 },
  "imagen-4.0-generate-001": { name: "Imagen 4 Standard", rpd: 25 },
  "imagen-4.0-ultra-generate-001": { name: "Imagen 4 Ultra", rpd: 25 },
};

export const MODEL_OPTIONS = [
  {
    id: "gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash Lite",
    desc: "15 requisições por minuto, 250K tokens por minutos e 500 requisições por dia",
    hasSearch: false,
  },
  {
    id: "gemma-4-31b-it",
    name: "Gemma 4 31B",
    desc: "15 Requisições por minuto, ilimitados tokens por minuto e 1500 requisiçoes por dia",
    hasSearch: true,
  },
  {
    id: "gemma-4-26b-a4b-it",
    name: "Gemma 4 26B",
    desc: "Gemma 4 26B (MoE, mais leve e veloz). 15 req/min, tokens ilimitados por minuto e 1500 req/dia",
    hasSearch: true,
  },
  {
    id: LOCAL_MODEL_ID,
    name: "Modelo Local",
    desc: "Seu modelo rodando em llama.cpp e exposto via ngrok (API compatível com OpenAI)",
    hasSearch: false,
  },
];

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
