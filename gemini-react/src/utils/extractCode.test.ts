import { describe, it, expect } from 'vitest';
import { extractPreviewableCode, buildPreviewSrcDoc } from './extractCode';

describe('extractPreviewableCode', () => {
  it('retorna null para texto vazio ou sem código', () => {
    expect(extractPreviewableCode('')).toBeNull();
    expect(extractPreviewableCode('só texto normal aqui')).toBeNull();
    expect(extractPreviewableCode('```js\nconst x = 1;\n```')).toBeNull();
  });

  it('extrai um bloco html cercado, sem a prosa ao redor', () => {
    const r = extractPreviewableCode('Claro, aqui vai:\n```html\n<div>oi</div>\n```\nEspero que ajude!');
    expect(r).toEqual({ code: '<div>oi</div>', lang: 'html' });
  });

  it('extrai svg e xml', () => {
    expect(extractPreviewableCode('```svg\n<svg></svg>\n```')?.lang).toBe('svg');
    expect(extractPreviewableCode('```xml\n<a/>\n```')?.lang).toBe('xml');
  });

  it('escolhe o maior bloco pré-visualizável', () => {
    const text = '```html\n<i>a</i>\n```\n```html\n<div><p>bem maior aqui</p></div>\n```';
    expect(extractPreviewableCode(text)?.code).toContain('bem maior aqui');
  });

  it('funciona com bloco AINDA sem fechamento (streaming)', () => {
    const streaming = 'Aqui está o site:\n```html\n<!doctype html><html><body><h1>Olá</h1>';
    const r = extractPreviewableCode(streaming);
    expect(r?.lang).toBe('html');
    expect(r?.code).toContain('<h1>Olá</h1>');
    expect(r?.code).not.toContain('Aqui está o site');
  });

  it('detecta bloco html sem rótulo de linguagem', () => {
    const r = extractPreviewableCode('```\n<!doctype html><html><body>x</body></html>\n```');
    expect(r?.lang).toBe('html');
  });

  it('recorta html cru cercado de prosa, sem cerca', () => {
    const r = extractPreviewableCode('Segue o código: <html><body>oi</body></html> — pronto!');
    expect(r).toEqual({ code: '<html><body>oi</body></html>', lang: 'html' });
  });

  it('recorta svg cru sem incluir texto antes/depois', () => {
    const r = extractPreviewableCode('Desenhei um ícone: <svg><circle/></svg> gostou?');
    expect(r?.lang).toBe('svg');
    expect(r?.code).toBe('<svg><circle/></svg>');
  });
});

describe('buildPreviewSrcDoc', () => {
  it('embrulha svg em html centralizado', () => {
    const doc = buildPreviewSrcDoc('<svg/>', 'svg');
    expect(doc).toContain('<svg/>');
    expect(doc).toContain('align-items:center');
  });

  it('passa html direto', () => {
    expect(buildPreviewSrcDoc('<div/>', 'html')).toBe('<div/>');
  });
});
