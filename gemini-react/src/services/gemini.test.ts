import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractAndParseJson,
  safeMarkdown,
  resolveProvider,
  setGlobalCustomModels,
  buildGeminiThinkingConfig,
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

  it('sanitiza links e imagens file:/// evitando violacao de seguranca em HTTPS', () => {
    const md = 'Consulte o arquivo [meu-script](file:///C:/Users/app/script.js) e a foto ![logo](file:///C:/Users/app/logo.png)';
    const html = safeMarkdown(md);
    expect(html).not.toContain('href="file:');
    expect(html).not.toContain('src="file:');
    expect(html).toContain('meu-script');
  });

  it('neutraliza vetores de XSS (script, iframe, manipuladores on* e javascript:)', () => {
    const malicious = `
      # Título seguro
      <script>alert("hack")</script>
      <img src="x" onerror="alert('xss')" />
      <iframe src="https://evil.com"></iframe>
      [Link suspeito](javascript:alert('pwned'))
    `;
    const html = safeMarkdown(malicious);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert("hack")');
    expect(html).not.toContain('onerror=');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('Título seguro');
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
    const models: CustomModel[] = [
      { id: 'deepseek/deepseek-r1', name: 'R1', provider: 'openrouter' },
      { id: 'orcarouter/auto', name: 'Auto', provider: 'orcarouter' },
    ];
    setGlobalCustomModels(models);
    expect(resolveProvider('deepseek/deepseek-r1')).toBe('openrouter');
    expect(resolveProvider('orcarouter/auto')).toBe('orcarouter');
  });

  it('modelo desconhecido cai em gemini (nativo)', () => {
    expect(resolveProvider('modelo-inexistente-xyz')).toBe('gemini');
  });
});

describe('buildGeminiThinkingConfig', () => {
  it('configura Gemini 3 com thinkingLevel HIGH e includeThoughts true quando ativado', () => {
    const config = buildGeminiThinkingConfig('gemini-3.5-flash-lite', true);
    expect(config).toEqual({
      includeThoughts: true,
      thinkingLevel: 'HIGH',
    });
  });

  it('desativa raciocínio em Gemini 3 com thinkingLevel MINIMAL quando desativado', () => {
    const config = buildGeminiThinkingConfig('gemini-3.5-flash-lite', false);
    expect(config).toEqual({
      thinkingLevel: 'MINIMAL',
    });
  });

  it('configura Gemini 2.5 com thinkingBudget -1 e includeThoughts true quando ativado', () => {
    const config = buildGeminiThinkingConfig('gemini-2.5-flash', true);
    expect(config).toEqual({
      includeThoughts: true,
      thinkingBudget: -1,
    });
  });

  it('desativa raciocínio em Gemini 2.5 com thinkingBudget 0 quando desativado', () => {
    const config = buildGeminiThinkingConfig('gemini-2.5-flash', false);
    expect(config).toEqual({
      thinkingBudget: 0,
    });
  });

  it('configura Gemma 4 com thinkingLevel HIGH quando ativado', () => {
    const config = buildGeminiThinkingConfig('gemma-4-31b-it', true);
    expect(config).toEqual({
      thinkingLevel: 'HIGH',
    });
  });

  it('configura Gemma 4 com thinkingLevel MINIMAL quando desativado sem busca web', () => {
    const config = buildGeminiThinkingConfig('gemma-4-31b-it', false, false);
    expect(config).toEqual({
      thinkingLevel: 'MINIMAL',
    });
  });

  it('não corta tokens de raciocínio de Gemma 4 quando busca web está ativa', () => {
    const config = buildGeminiThinkingConfig('gemma-4-31b-it', false, true);
    expect(config).toBeUndefined();
  });
});
