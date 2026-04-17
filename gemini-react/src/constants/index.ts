export const MODEL_LIMITS: Record<string, { name: string; rpd: number }> = {
  'gemma-4-31b-it': { name: 'Gemma 4 31B', rpd: 1500 },
  'gemini-3.1-flash-lite-preview': { name: 'Gemini 3.1 Flash Lite', rpd: 500 },
  'gemini-3-flash-preview': { name: 'Gemini 3 Flash', rpd: 20 },
  'imagen-4.0-fast-generate-001': { name: 'Imagen 4 Fast', rpd: 25 },
  'imagen-4.0-generate-001': { name: 'Imagen 4 Standard', rpd: 25 },
  'imagen-4.0-ultra-generate-001': { name: 'Imagen 4 Ultra', rpd: 25 },
};

export const MODEL_OPTIONS = [
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite', desc: 'Equilíbrio de velocidade e precisão', hasSearch: false },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', desc: 'Respostas ultra-rápidas', hasSearch: false },
  { id: 'gemma-4-31b-it', name: 'Gemma 4 31B', desc: 'Modelo local otimizado', hasSearch: true },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'Alta performance com pesquisa', hasSearch: true, isOptional: true },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', desc: 'Versão eficiente estabilizada', hasSearch: true, isOptional: true },
  { id: 'gemma-4-26b-a4b-it', name: 'Gemma 4 (26B)', desc: 'Eficiência local balanceada', hasSearch: true, isOptional: true }
];

export const IMAGEN_OPTIONS = [
  { id: 'imagen-4.0-fast-generate-001', name: 'Fast Generate', desc: 'Geração veloz para rascunhos' },
  { id: 'imagen-4.0-generate-001', name: 'Standard Generate', desc: 'Equilíbrio e detalhamento' },
  { id: 'imagen-4.0-ultra-generate-001', name: 'Ultra Generate', desc: 'Fidelidade máxima e realismo' }
];
