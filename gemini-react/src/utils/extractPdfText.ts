// Extração de texto de PDF no navegador (pdf.js). Usada para provedores que NÃO
// aceitam PDF binário (OpenRouter/local, compatíveis com OpenAI) — o texto é
// injetado no prompt. Gemini processa PDF nativamente e não passa por aqui.
//
// O import de `pdfjs-dist` é dinâmico para virar um chunk separado (só carrega
// quando um PDF precisa ser extraído).

// Nº máximo de páginas extraídas por documento (evita prompts gigantes).
const MAX_PAGES = 50;

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function extractPdfText(base64: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // Worker empacotado pelo Vite (padrão recomendado com import.meta.url).
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const data = base64ToUint8Array(base64);
  const doc = await pdfjs.getDocument({ data }).promise;
  const pageCount = doc.numPages;
  const limit = Math.min(pageCount, MAX_PAGES);

  const parts: string[] = [];
  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) parts.push(text);
  }

  let out = parts.join('\n\n');
  if (pageCount > limit) {
    out += `\n\n[... documento truncado: extraídas ${limit} de ${pageCount} páginas ...]`;
  }
  return out.trim();
}
