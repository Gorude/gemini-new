import { describe, it, expect } from 'vitest';
import { normalizePath, applyFileEdit } from './codeHarness';

describe('normalizePath', () => {
  it('garante que o caminho inicie com barra e use barras normais', () => {
    expect(normalizePath('App.tsx')).toBe('/App.tsx');
    expect(normalizePath('/src/components/Button.tsx')).toBe('/src/components/Button.tsx');
    expect(normalizePath('src\\utils\\helpers.ts')).toBe('/src/utils/helpers.ts');
  });
});

describe('applyFileEdit', () => {
  it('substitui conteúdo existente exatamente', () => {
    const code = `function App() {\n  return <div>Hello</div>;\n}`;
    const target = `<div>Hello</div>`;
    const replacement = `<div>Hello World</div>`;

    const res = applyFileEdit(code, target, replacement);
    expect(res.success).toBe(true);
    expect(res.newContent).toContain('<div>Hello World</div>');
  });

  it('retorna erro amigável se targetContent não existe', () => {
    const code = `const a = 1;`;
    const res = applyFileEdit(code, `const b = 2;`, `const b = 3;`);
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('tolera discrepância de CRLF e LF nas quebras de linha', () => {
    const code = "linha 1\r\nlinha 2\r\nlinha 3";
    const target = "linha 2\nlinha 3";
    const replacement = "linha 2 alterada\nlinha 3 alterada";

    const res = applyFileEdit(code, target, replacement);
    expect(res.success).toBe(true);
    expect(res.newContent).toContain('linha 2 alterada');
  });
});
