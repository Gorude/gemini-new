import { describe, it, expect } from 'vitest';
import { estimatePayloadBytes, sanitizeChatForStorage } from './storageUtils';
import type { ChatSession } from '../types';

describe('storageUtils', () => {
  it('estimatePayloadBytes retorna tamanho correto de string e objeto', () => {
    const obj = { hello: 'world' };
    const bytes = estimatePayloadBytes(obj);
    expect(bytes).toBeGreaterThan(10);
    expect(bytes).toBe(new TextEncoder().encode(JSON.stringify(obj)).length);
  });

  it('preserva chat intacto se estiver abaixo de maxBytes', () => {
    const chat: ChatSession = {
      id: 'c1',
      title: 'Chat Normal',
      messages: [
        { id: 'm1', role: 'user', text: 'Olá' },
        { id: 'm2', role: 'ai', text: 'Como posso ajudar?' }
      ]
    };

    const sanitized = sanitizeChatForStorage(chat, 50_000);
    expect(sanitized).toBe(chat); // Referencialmente idêntico quando seguro
    expect(sanitized.messages.length).toBe(2);
  });

  it('remove Base64 pesado de arquivos quando ultrapassa maxBytes preservando metadados e textos', () => {
    // Cria string Base64 simulada de 500 KB
    const heavyBase64 = 'data:image/png;base64,' + 'A'.repeat(500_000);

    const chat: ChatSession = {
      id: 'c2',
      title: 'Chat com Imagem Pesada',
      messages: [
        {
          id: 'm1',
          role: 'user',
          text: 'Analise esta imagem grande',
          files: [
            { name: 'screenshot.png', mimeType: 'image/png', data: heavyBase64 }
          ]
        },
        {
          id: 'm2',
          role: 'ai',
          text: 'Esta imagem mostra uma interface com gráfico.',
          thoughts: 'Pensamento analítico detalhado do modelo.'
        }
      ]
    };

    const initialBytes = estimatePayloadBytes(chat);
    expect(initialBytes).toBeGreaterThan(450_000);

    // Sanitiza com limite seguro de 100 KB
    const sanitized = sanitizeChatForStorage(chat, 100_000);
    const finalBytes = estimatePayloadBytes(sanitized);

    expect(finalBytes).toBeLessThan(100_000);
    expect(sanitized.messages[0].text).toBe('Analise esta imagem grande');
    expect(sanitized.messages[1].text).toBe('Esta imagem mostra uma interface com gráfico.');
    expect(sanitized.messages[1].thoughts).toBe('Pensamento analítico detalhado do modelo.');

    // Metadados do arquivo preservados
    expect(sanitized.messages[0].files?.[0].name).toBe('screenshot.png');
    expect(sanitized.messages[0].files?.[0].mimeType).toBe('image/png');
    // Base64 descarregado
    expect(sanitized.messages[0].files?.[0].data).toBe('[midia_descarregada_limite_cota]');
  });
});
