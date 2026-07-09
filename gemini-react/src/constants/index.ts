export const MODEL_LIMITS: Record<string, { name: string; rpd: number }> = {
  'gemma-4-31b-it': { name: 'Gemma 4 31B', rpd: 1500 },
  'gemini-3.1-flash-lite-preview': { name: 'Gemini 3.1 Flash Lite', rpd: 500 },
  'imagen-4.0-fast-generate-001': { name: 'Imagen 4 Fast', rpd: 25 },
  'imagen-4.0-generate-001': { name: 'Imagen 4 Standard', rpd: 25 },
  'imagen-4.0-ultra-generate-001': { name: 'Imagen 4 Ultra', rpd: 25 },
};

export const MODEL_OPTIONS = [
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite', desc: '15 requisições por minuto, 250K tokens por minutos e 500 requisições por dia', hasSearch: false },
  { id: 'gemma-4-31b-it', name: 'Gemma 4 31B', desc: '15 Requisições por minuto, ilimitados tokens por minuto e 1500 requisiçoes por dia', hasSearch: true }
];

export const IMAGEN_OPTIONS = [
  { id: 'imagen-4.0-fast-generate-001', name: 'Fast Generate', desc: 'Geração veloz para rascunhos' },
  { id: 'imagen-4.0-generate-001', name: 'Standard Generate', desc: 'Equilíbrio e detalhamento' },
  { id: 'imagen-4.0-ultra-generate-001', name: 'Ultra Generate', desc: 'Fidelidade máxima e realismo' }
];

export const DEFAULT_LIVE_MODEL = 'gemini-3-flash-live';

export const LIVE_MODEL_OPTIONS = [
  { id: 'gemini-3-flash-live', name: 'Gemini 3 Flash Live', desc: 'Modelo padrão nativo de áudio da família Gemini 3, baixa latência.' },
  { id: 'gemini-2.5-flash-live', name: 'Gemini 2.5 Flash Live', desc: 'Modelo estável alternativo otimizado para conversas por voz.' }
];

// O id de API real do "Gemini 3 Flash Live" é gemini-3.1-flash-live-preview
// (confirmado via ListModels da conta; é o único modelo Live da geração 3).
export const LIVE_MODEL_MAP: Record<string, string> = {
  'gemini-2.5-flash-live': 'models/gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-3-flash-live': 'models/gemini-3.1-flash-live-preview'
};


