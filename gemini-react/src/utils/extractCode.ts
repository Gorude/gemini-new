// Extração de blocos de código pré-visualizáveis (HTML/SVG/XML) de uma resposta
// em markdown. Usado no modo "Comparar modelos" para renderizar o resultado
// visual do código de cada modelo lado a lado, do mesmo modo que o painel de
// preview faz com os blocos das mensagens do chat.
//
// Regra de ouro: NUNCA incluir o texto/prosa que vem antes ou depois do código —
// isso quebraria a pré-visualização. Extraímos só o conteúdo do bloco cercado
// (``` … ```) ou, na ausência de cerca, apenas a região que é HTML/SVG de fato.

// Linguagens cujo resultado conseguimos renderizar num iframe.
export const PREVIEWABLE_LANGS = new Set(['html', 'svg', 'xml']);

// Bloco cercado por ``` … ```. Aceita um bloco final SEM fechamento (`(?:\n```|$)`)
// para funcionar durante o streaming, quando o ``` de fechamento ainda não chegou.
const FENCE_RE = /```([\w-]+)?[^\n]*\n([\s\S]*?)(?:\n```|$)/g;

export interface CodeBlock {
  code: string;
  lang: string;
}

/**
 * Retorna o maior bloco de código pré-visualizável do texto (HTML/SVG/XML), ou
 * `null` se não houver nenhum. Considera blocos cercados (mesmo sem fechamento,
 * durante o streaming) e, como último recurso, uma região HTML/SVG crua — sempre
 * recortando apenas o código, nunca a prosa ao redor.
 */
export function extractPreviewableCode(text: string): CodeBlock | null {
  if (!text) return null;

  let best: CodeBlock | null = null;
  let m: RegExpExecArray | null;
  FENCE_RE.lastIndex = 0;
  while ((m = FENCE_RE.exec(text)) !== null) {
    if (m.index === FENCE_RE.lastIndex) FENCE_RE.lastIndex++; // evita laço infinito em match vazio
    const rawLang = (m[1] || '').toLowerCase();
    const code = (m[2] || '').replace(/\s+$/, '');
    if (!code) continue;
    // Cerca com linguagem pré-visualizável, OU cerca sem rótulo cujo conteúdo é HTML.
    const isPreviewable = PREVIEWABLE_LANGS.has(rawLang) || (!m[1] && looksLikeHtml(code));
    if (!isPreviewable) continue;
    const lang = PREVIEWABLE_LANGS.has(rawLang) ? rawLang : 'html';
    if (!best || code.length > best.code.length) best = { code, lang };
  }
  if (best) return best;

  // Sem cerca alguma: recorta apenas a região HTML/SVG do texto (descarta prosa).
  return sliceMarkup(text);
}

function looksLikeHtml(s: string): boolean {
  return /<(!doctype html|html|body|div|svg|section|main|canvas|style|script|h[1-6]|ul|table)[\s>/]/i.test(s);
}

/**
 * Recorta a região de marcação de um texto que mistura prosa e HTML/SVG cru
 * (modelo que respondeu sem cercar em ```). Preferimos documentos completos
 * (`<html>…</html>`, `<svg>…</svg>`); senão, do primeiro ao último "<…>".
 */
function sliceMarkup(text: string): CodeBlock | null {
  const html = text.match(/<!doctype html[\s\S]*<\/html\s*>/i) || text.match(/<html[\s\S]*<\/html\s*>/i);
  if (html) return { code: html[0].trim(), lang: 'html' };

  const svg = text.match(/<svg[\s\S]*<\/svg\s*>/i);
  if (svg) return { code: svg[0].trim(), lang: 'svg' };

  // Genérico: do primeiro tag de abertura conhecido até o último ">".
  const open = text.search(/<(body|div|section|main|canvas|style|script|h[1-6]|ul|table|p)[\s>]/i);
  if (open === -1) return null;
  const lastClose = text.lastIndexOf('>');
  if (lastClose <= open) return null;
  const code = text.slice(open, lastClose + 1).trim();
  return looksLikeHtml(code) ? { code, lang: 'html' } : null;
}

/**
 * Monta o `srcDoc` para o iframe de pré-visualização. SVG é centralizado num
 * HTML mínimo; HTML/XML vão direto. Mesma lógica do CodePreviewPanel.
 */
export function buildPreviewSrcDoc(code: string, lang: string): string {
  return lang === 'svg'
    ? `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff">${code}</body></html>`
    : code;
}
