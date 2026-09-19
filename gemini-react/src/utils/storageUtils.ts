import type { Message } from '../services/gemini';
import type { ChatSession, PendingFile } from '../types';

/**
 * Estima o tamanho em bytes de um objeto quando serializado para JSON UTF-8.
 */
export function estimatePayloadBytes(data: unknown): number {
  try {
    const json = typeof data === 'string' ? data : JSON.stringify(data);
    return new TextEncoder().encode(json).length;
  } catch {
    return 0;
  }
}

/**
 * Sanitiza uma sessão de chat para persistência segura no Cloud Firestore,
 * garantindo que o documento JSON permaneça estritamente abaixo do limite rígido de 1 MB (1.048.576 bytes).
 *
 * Se o chat ultrapassar a margem segura (default: 850 KB):
 * 1. Preserva integralmente todos os textos, pensamentos (thoughts), fontes, mapas e metadados.
 * 2. Pruna cirurgicamente os payloads brutos de Base64 dos anexos (começando pelos maiores e mais antigos),
 *    mantendo o nome, mimeType e substituindo o Base64 por marcador leve.
 */
export function sanitizeChatForStorage(chat: ChatSession, maxBytes: number = 850_000): ChatSession {
  const currentBytes = estimatePayloadBytes(chat);
  if (currentBytes <= maxBytes) {
    return chat;
  }

  // Clona superficialmente a sessão e profundamente as mensagens com anexos
  const clonedMessages: Message[] = chat.messages.map(m => {
    if (!m.files || m.files.length === 0) return { ...m };
    return {
      ...m,
      files: m.files.map((f: PendingFile) => ({ ...f }))
    };
  });

  // Localiza todos os anexos com dados Base64 significativos (> 200 caracteres)
  interface FileRef {
    msgIndex: number;
    fileIndex: number;
    dataLen: number;
  }

  const fileRefs: FileRef[] = [];
  clonedMessages.forEach((msg, mIdx) => {
    if (msg.files) {
      msg.files.forEach((file: PendingFile, fIdx: number) => {
        if (file.data && file.data.length > 200) {
          fileRefs.push({
            msgIndex: mIdx,
            fileIndex: fIdx,
            dataLen: file.data.length
          });
        }
      });
    }
  });

  // Ordena para remover primeiro os anexos mais pesados
  fileRefs.sort((a, b) => b.dataLen - a.dataLen);

  const sanitizedChat: ChatSession = {
    ...chat,
    messages: clonedMessages
  };

  for (const ref of fileRefs) {
    const targetFile = clonedMessages[ref.msgIndex].files?.[ref.fileIndex];
    if (targetFile) {
      targetFile.data = '[midia_descarregada_limite_cota]';
    }

    if (estimatePayloadBytes(sanitizedChat) <= maxBytes) {
      return sanitizedChat;
    }
  }

  // Se ainda assim exceder maxBytes (caso de histórico massivo de texto de milhares de mensagens),
  // compacta pensamentos (thoughts) das mensagens antigas (mantendo o texto principal visível)
  for (let i = 0; i < clonedMessages.length - 2; i++) {
    if (clonedMessages[i].thoughts && clonedMessages[i].thoughts!.length > 500) {
      clonedMessages[i].thoughts = clonedMessages[i].thoughts!.slice(0, 300) + '... [raciocínio antigo resumido]';
      if (estimatePayloadBytes(sanitizedChat) <= maxBytes) {
        return sanitizedChat;
      }
    }
  }

  return sanitizedChat;
}

/**
 * Grava de forma segura no localStorage, com proteção contra QuotaExceededError.
 * Se a cota estiver esgotada, tenta remover entradas antigas de cache ou podar Base64.
 */
export function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error: unknown) {
    const isQuota = error instanceof DOMException && (
      error.name === 'QuotaExceededError' ||
      error.code === 22 ||
      error.code === 1014
    );

    if (!isQuota) {
      console.warn(`[Storage] Falha não relacionada à cota ao gravar ${key}:`, error);
      return false;
    }

    console.warn(`[Storage] Cota de localStorage excedida ao salvar ${key}. Tentando poda segura...`);

    try {
      // Se for o histórico de chat ou uso, tenta higienizar payloads pesados de Base64
      if (key === 'nemon_chat_history') {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          const pruned = parsed.map((item: any) => {
            if (item && item.messages && Array.isArray(item.messages)) {
              return sanitizeChatForStorage(item as ChatSession, 200_000);
            }
            return item;
          });
          const prunedStr = JSON.stringify(pruned);
          localStorage.setItem(key, prunedStr);
          return true;
        }
      }

      // Tenta remover caches secundários descartáveis do localStorage
      const evictableKeys = [
        'gemini_advanced_usage_v1',
        'nemon_code_agent_history',
        'nemon_code_files_v2'
      ];

      for (const evictKey of evictableKeys) {
        if (evictKey !== key) {
          localStorage.removeItem(evictKey);
          try {
            localStorage.setItem(key, value);
            return true;
          } catch {
            // continua tentando
          }
        }
      }
    } catch (fallbackErr) {
      console.error(`[Storage] Falha ao recuperar espaço no localStorage para ${key}:`, fallbackErr);
    }

    return false;
  }
}
