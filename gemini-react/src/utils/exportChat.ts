import type { ChatSession } from '../types';

// Sanitiza o título para um nome de arquivo seguro.
function safeFileName(title: string, ext: string): string {
  const base = (title || 'conversa')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim().replace(/\s+/g, '-')
    .slice(0, 60) || 'conversa';
  return `${base}.${ext}`;
}

/**
 * Converte uma conversa em Markdown legível: por mensagem, papel + texto, com o
 * raciocínio (se houver) num bloco de citação, as fontes como lista de links e os
 * nomes dos anexos. Áudio/TTS não fazem parte da mensagem e não são exportáveis.
 */
export function chatToMarkdown(chat: ChatSession): string {
  const lines: string[] = [];
  lines.push(`# ${chat.title || 'Conversa'}`);
  if (chat.model) lines.push(`\n_Modelo: ${chat.model}_`);
  lines.push('');

  for (const m of chat.messages) {
    const who = m.role === 'user' ? '## 🧑 Você' : '## 🤖 Nemon';
    lines.push(who);
    lines.push('');

    if (m.thoughts && m.thoughts.trim()) {
      lines.push('> **Raciocínio:**');
      for (const l of m.thoughts.trim().split('\n')) lines.push(`> ${l}`);
      lines.push('');
    }

    const body = (m.text || '') + (m.continuationText ? `\n\n${m.continuationText}` : '');
    lines.push(body.trim() || '_(sem texto)_');
    lines.push('');

    if (m.files && m.files.length > 0) {
      lines.push(`**Anexos:** ${m.files.map(f => f.name).join(', ')}`);
      lines.push('');
    }

    if (m.sources && m.sources.length > 0) {
      lines.push('**Fontes:**');
      for (const s of m.sources) lines.push(`- [${s.title || s.uri}](${s.uri})`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/** Exporta o objeto ChatSession cru como JSON. */
export function chatToJson(chat: ChatSession): string {
  return JSON.stringify(chat, null, 2);
}

// Dispara o download de um conteúdo textual como arquivo.
function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoga após um tick para garantir o início do download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportChatAsMarkdown(chat: ChatSession) {
  downloadText(chatToMarkdown(chat), safeFileName(chat.title, 'md'), 'text/markdown');
}

export function exportChatAsJson(chat: ChatSession) {
  downloadText(chatToJson(chat), safeFileName(chat.title, 'json'), 'application/json');
}
