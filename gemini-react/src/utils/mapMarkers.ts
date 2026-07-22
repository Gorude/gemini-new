// Marcador de mapa que a IA insere na resposta quando o usuário pergunta onde algo
// fica: `[MAP: <local>]`. Extraímos o(s) marcador(es), removemos do texto exibido e
// renderizamos um mapa embutido (Google Maps sem chave) na mensagem.

const MAP_RE = /\[MAP:\s*([^\]]+?)\s*\]/gi;

export interface MapMarker {
  query: string;
}

/**
 * Extrai os marcadores `[MAP: …]` do texto: retorna o texto sem os marcadores e a
 * lista de locais (deduplicada, na ordem de aparição). Usar no texto FINAL.
 */
export function extractMapMarkers(text: string): { text: string; maps: MapMarker[] } {
  if (!text) return { text: text || '', maps: [] };
  const maps: MapMarker[] = [];
  const cleaned = text.replace(MAP_RE, (_full, q) => {
    const query = String(q).trim();
    if (query) maps.push({ query });
    return '';
  });
  const seen = new Set<string>();
  const uniq = maps.filter(m => {
    const k = m.query.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // Colapsa espaços/linhas em branco deixados pela remoção do marcador.
  const tidy = cleaned.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { text: tidy, maps: uniq };
}

/**
 * Remove marcadores de mapa (completos) e um fragmento final ainda não fechado
 * (`[MAP:…` sem `]`), para não "piscarem" durante o streaming.
 */
export function stripMapMarkers(text: string): string {
  if (!text) return text;
  return text.replace(MAP_RE, '').replace(/\[MAP:[^\]]*$/i, '');
}

/** URL do embed do Google Maps (sem chave de API) para um local textual. */
export function mapEmbedUrl(query: string): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`;
}

/** URL para abrir o local no Google Maps (nova aba). */
export function mapLinkUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
