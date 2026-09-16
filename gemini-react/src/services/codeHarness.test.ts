import { describe, it, expect } from 'vitest';
import { normalizePath, applyFileEdit, cleanHarnessDisplayText, robustParseToolArgs } from './codeHarness';

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

  it('tolera pequenas variações de indentação através do casamento por linhas', () => {
    const code = `  function test() {\n    const x = 1;\n    return x;\n  }`;
    const target = `function test() {\nconst x = 1;\nreturn x;\n}`;
    const replacement = `function test() {\n  const x = 2;\n  return x * 2;\n}`;

    const res = applyFileEdit(code, target, replacement);
    expect(res.success).toBe(true);
    expect(res.newContent).toContain('const x = 2;');
  });
});

describe('robustParseToolArgs', () => {
  it('faz parse de JSON válido normalmente', () => {
    const raw = `{"path": "/index.html", "content": "<h1>Olá</h1>"}`;
    const parsed = robustParseToolArgs(raw);
    expect(parsed.path).toBe('/index.html');
    expect(parsed.content).toBe('<h1>Olá</h1>');
  });

  it('extrai conteúdo mesmo com quebras de linha reais não escapadas no JSON', () => {
    const raw = `{"path": "/index.html", "content": "<!DOCTYPE html>\n<html>\n  <body>\n    <h1>Jogo</h1>\n  </body>\n</html>"}`;
    const parsed = robustParseToolArgs(raw);
    expect(parsed.path).toBe('/index.html');
    expect(parsed.content).toContain('<h1>Jogo</h1>');
  });

  it('extrai target_content e replacement_content de edit_file', () => {
    const raw = `{"path": "/index.html", "target_content": "<body>", "replacement_content": "<body><canvas id='c'></canvas>"}`;
    const parsed = robustParseToolArgs(raw);
    expect(parsed.path).toBe('/index.html');
    expect(parsed.target_content).toBe('<body>');
    expect(parsed.replacement_content).toContain('<canvas');
  });

  it('extrai bloco markdown se o modelo enviou código puro', () => {
    const raw = `/index.html\n\`\`\`html\n<!DOCTYPE html>\n<html>\n</html>\n\`\`\``;
    const parsed = robustParseToolArgs(raw);
    expect(parsed.path).toBe('/index.html');
    expect(parsed.content).toContain('<!DOCTYPE html>');
  });
});

describe('cleanHarnessDisplayText', () => {
  it('remove linhas de barras verticais isoladas (|) e preserva tabelas markdown', () => {
    const raw = `[Etapa 2/7] Construindo:\n|\n|\n[Etapa 2/7 concluída] - Sucesso!`;
    const cleaned = cleanHarnessDisplayText(raw);
    expect(cleaned).not.toContain('|');
    expect(cleaned).toContain('[Etapa 2/7] Construindo:');
    expect(cleaned).toContain('[Etapa 2/7 concluída] - Sucesso!');
  });

  it('mantém tabelas markdown intactas', () => {
    const table = `| Coluna 1 | Coluna 2 |\n|---|---|\n| Dado A | Dado B |`;
    const cleaned = cleanHarnessDisplayText(table);
    expect(cleaned).toContain('| Coluna 1 | Coluna 2 |');
  });

  it('remove chamadas de ferramentas e JSONs brutos', () => {
    const raw = `Criando arquivo...\n<tool_call name="write_file">{"path": "/index.html"}</tool_call>\nPronto!`;
    const cleaned = cleanHarnessDisplayText(raw);
    expect(cleaned).toBe("Criando arquivo...\n\nPronto!");
  });

  it('remove blocos markdown json de ferramentas', () => {
    const raw = `Planejamento concluído:\n\`\`\`json\n{"path": "/index.html", "content": "..."}\n\`\`\`\nAqui está a aplicação!`;
    const cleaned = cleanHarnessDisplayText(raw);
    expect(cleaned).not.toContain('```json');
    expect(cleaned).toContain('Planejamento concluído:');
    expect(cleaned).toContain('Aqui está a aplicação!');
  });
});

