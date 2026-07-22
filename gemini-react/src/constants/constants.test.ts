import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  getModelContextWindow,
  formatTokenCount,
  DEFAULT_LOCAL_CONTEXT,
  DEFAULT_CONTEXT_FALLBACK,
  LOCAL_MODEL_ID,
} from './index';
import type { CustomModel } from './index';

describe('estimateTokens', () => {
  it('retorna 0 para vazio', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estima ~1 token a cada 4 caracteres (arredondando p/ cima)', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});

describe('getModelContextWindow', () => {
  it('usa a tabela interna para modelos conhecidos', () => {
    expect(getModelContextWindow('gemini-3.1-flash-lite-preview')).toBe(1_000_000);
    expect(getModelContextWindow('gemma-4-31b-it')).toBe(128_000);
  });

  it('usa o padrão do local para o modelo local', () => {
    expect(getModelContextWindow(LOCAL_MODEL_ID)).toBe(DEFAULT_LOCAL_CONTEXT);
  });

  it('prioriza o contextLength do modelo customizado', () => {
    const custom: CustomModel[] = [{ id: 'x/y', name: 'Y', provider: 'openrouter', contextLength: 256_000 }];
    expect(getModelContextWindow('x/y', custom)).toBe(256_000);
  });

  it('cai no fallback quando o custom não tem contextLength', () => {
    const custom: CustomModel[] = [{ id: 'x/y', name: 'Y', provider: 'openrouter' }];
    expect(getModelContextWindow('x/y', custom)).toBe(DEFAULT_CONTEXT_FALLBACK);
  });

  it('cai no fallback para modelo totalmente desconhecido', () => {
    expect(getModelContextWindow('desconhecido')).toBe(DEFAULT_CONTEXT_FALLBACK);
  });
});

describe('formatTokenCount', () => {
  it('formata compacto', () => {
    expect(formatTokenCount(940)).toBe('940');
    expect(formatTokenCount(16_400)).toBe('16k');
    expect(formatTokenCount(164_000)).toBe('164k');
    expect(formatTokenCount(1_000_000)).toBe('1M');
  });

  it('mostra 1 casa para milhares abaixo de 10k', () => {
    expect(formatTokenCount(1500)).toBe('1.5k');
  });
});
