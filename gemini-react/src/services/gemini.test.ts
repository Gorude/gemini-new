import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractAndParseJson,
  safeMarkdown,
  resolveProvider,
  setGlobalCustomModels,
} from './gemini';
import type { CustomModel } from '../constants';

describe('extractAndParseJson', () => {
  it('faz parse de JSON válido simples', () => {
    expect(extractAndParseJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
  });

  it('extrai JSON de dentro de bloco markdown ```json', () => {
    const input = 'Claro!\n```json\n{"ok":true}\n```\nPronto.';
    expect(extractAndParseJson(input)).toEqual({ ok: true });
  });

  it('lida com array quando aparece antes de um objeto', () => {
    expect(extractAndParseJson('[{"id":1},{"id":2}]')).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('recupera aspas internas não escapadas em valores', () => {
    // O modelo às vezes gera aspas cruas dentro do valor.
    const out = extractAndParseJson('{"texto":"ele disse "oi" pra mim"}');
    expect(out.texto).toContain('oi');
  });

  it('tolera vírgula final (trailing comma)', () => {
    expect(extractAndParseJson('{"a":1,"b":2,}')).toEqual({ a: 1, b: 2 });
  });

  it('corrige barra invertida inválida de LaTeX (\\alpha) que quebra o JSON padrão', () => {
    // `\a` não é um escape JSON válido → parse padrão falha e o fixup dobra a barra.
    const out = extractAndParseJson('{"eq":"\\alpha = x"}');
    expect(typeof out.eq).toBe('string');
    expect(out.eq).toContain('alpha');
  });

  it('retorna null para entrada vazia', () => {
    expect(extractAndParseJson('')).toBeNull();
  });

  it('lança erro quando não há estrutura JSON', () => {
    expect(() => extractAndParseJson('só texto sem json')).toThrow();
  });
});

describe('safeMarkdown', () => {
  it('renderiza negrito e envolve tabelas em wrapper com scroll', () => {
    const html = safeMarkdown('**oi**\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<strong>oi</strong>');
    expect(html).toContain('table-wrapper');
  });

  it('retorna string vazia para entrada não-string', () => {
    // @ts-expect-error teste de robustez runtime
    expect(safeMarkdown(null)).toBe('');
  });

  it('remove <p> direto dentro de <li> (listas "tight")', () => {
    const html = safeMarkdown('- item um\n- item dois');
    expect(html).not.toMatch(/<li>\s*<p>/);
  });
});

describe('resolveProvider', () => {
  beforeEach(() => setGlobalCustomModels([]));

  it('modelo built-in resolve para gemini', () => {
    expect(resolveProvider('gemma-4-31b-it')).toBe('gemini');
  });

  it('modelo local resolve para local', () => {
    expect(resolveProvider('local-model')).toBe('local');
  });

  it('modelo customizado cadastrado resolve pelo provider do registro', () => {
    const models: CustomModel[] = [{ id: 'deepseek/deepseek-r1', name: 'R1', provider: 'openrouter' }];
    setGlobalCustomModels(models);
    expect(resolveProvider('deepseek/deepseek-r1')).toBe('openrouter');
  });

  it('modelo desconhecido cai em gemini (nativo)', () => {
    expect(resolveProvider('modelo-inexistente-xyz')).toBe('gemini');
  });
});
