import { describe, it, expect } from 'vitest';
import {
  normalizePath,
  applyFileEdit,
  cleanHarnessDisplayText,
  cleanStepTitle,
  cleanStepContent,
  robustParseToolArgs,
  detectUnfulfilledActionIntent,
  validateScriptSyntax,
} from './codeHarness';

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

describe('detectUnfulfilledActionIntent', () => {
  it('detecta a frase exata relatada pelo usuário onde a IA prometeu ação e parou', () => {
    const text = 'CSS está essencialmente correto. Agora vou verificar o estado do projeto e criar o jogo completo:';
    const res = detectUnfulfilledActionIntent(text);
    expect(res.hasIntent).toBe(true);
    expect(res.phrase).toBeDefined();
  });

  it('detecta variações de intenções futuras', () => {
    expect(detectUnfulfilledActionIntent('Vou criar a estrutura inicial').hasIntent).toBe(true);
    expect(detectUnfulfilledActionIntent('Em seguida vou implementar a física').hasIntent).toBe(true);
    expect(detectUnfulfilledActionIntent('No próximo passo vamos adicionar o placar').hasIntent).toBe(true);
    expect(detectUnfulfilledActionIntent('Now I will implement the loop:').hasIntent).toBe(true);
  });

  it('detecta a segunda frase relatada pelo usuário com erro de digitação Passeo e término em dois-pontos', () => {
    const text = '[Passeo 3/4] Verificando o estado atual e adicionando cronômetro, efeitos sonoros, chord-click e polimento visual:';
    const res = detectUnfulfilledActionIntent(text);
    expect(res.hasIntent).toBe(true);
  });

  it('detecta frases terminadas em dois-pontos como introduções interrompidas', () => {
    expect(detectUnfulfilledActionIntent('Adicionando sistema de áudio e cronômetro:').hasIntent).toBe(true);
    expect(detectUnfulfilledActionIntent('Configuração do canvas e animações (Passo 2):').hasIntent).toBe(true);
    expect(detectUnfulfilledActionIntent('[Etapa 3/5] Implementando mecânicas:').hasIntent).toBe(true);
  });

  it('retorna false para conclusões legítimas ou textos neutros', () => {
    expect(detectUnfulfilledActionIntent('Aqui está o seu jogo completo!').hasIntent).toBe(false);
    expect(detectUnfulfilledActionIntent('Aplicação pronta e funcional com todos os controles.').hasIntent).toBe(false);
    expect(detectUnfulfilledActionIntent('O Campo Minado Clássico foi desenvolvido com sucesso em um único arquivo HTML.').hasIntent).toBe(false);
    expect(detectUnfulfilledActionIntent('').hasIntent).toBe(false);
  });
});

describe('cleanStepTitle', () => {
  it('remove prefixos redundantes de passos preservando a descrição da ação', () => {
    expect(cleanStepTitle('[Passo 1/4] Inspecionando o arquivo /index.html:')).toBe('Inspecionando o arquivo /index.html:');
    expect(cleanStepTitle('Passo 2/4: Criando a estrutura completa')).toBe('Criando a estrutura completa');
    expect(cleanStepTitle('[Step 3/5] Adicionando efeitos sonoros')).toBe('Adicionando efeitos sonoros');
    expect(cleanStepTitle('[Etapa 2 de 4] Configurando cronômetro')).toBe('Configurando cronômetro');
    expect(cleanStepTitle('Passo 2 Inspecionando /index.html')).toBe('Inspecionando /index.html');
    expect(cleanStepTitle('[Passo 4] Substituindo o script do Minesweeper')).toBe('Substituindo o script do Minesweeper');
  });

  it('preserva títulos sem prefixo', () => {
    expect(cleanStepTitle('Planejamento e Análise')).toBe('Planejamento e Análise');
    expect(cleanStepTitle('Aplicação Concluída')).toBe('Aplicação Concluída');
  });
});

describe('cleanStepContent', () => {
  it('remove primeira linha que repete o anúncio do passo', () => {
    const raw = '[Passo 1/4] Inspecionando o arquivo:\nConteúdo detalhado da análise.';
    const cleaned = cleanStepContent(raw, 'Inspecionando o arquivo');
    expect(cleaned).toBe('Conteúdo detalhado da análise.');
    expect(cleaned).not.toContain('[Passo 1/4]');
  });

  it('remove anúncio de passo Passo N sem barra e não duplica o título', () => {
    const raw = '[Passo 4] Substituindo o script do Minesweeper pelo Snake Game completo:\nLógica atualizada com sucesso.';
    const cleaned = cleanStepContent(raw, 'Substituindo o script do Minesweeper pelo Snake Game completo');
    expect(cleaned).toBe('Lógica atualizada com sucesso.');
    expect(cleaned).not.toContain('[Passo 4]');
  });
});

describe('validateScriptSyntax', () => {
  it('identifica redeclaração de const em script e retorna erro amigável', () => {
    const html = `<!DOCTYPE html><html><body><script>const modalOverlay = 1;\nconst modalOverlay = 2;</script></body></html>`;
    const res = validateScriptSyntax(html, '/index.html');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('modalOverlay');
  });

  it('valida script correto sem erros', () => {
    const html = `<!DOCTYPE html><html><body><script>const x = 1; let y = 2;</script></body></html>`;
    const res = validateScriptSyntax(html, '/index.html');
    expect(res.valid).toBe(true);
  });
});

describe('Anexos e Suporte Multimodal no Harness', () => {
  it('decodifica arquivos de texto anexados em base64 corretamente', () => {
    const sampleText = 'const greeting = "Hello Nemon";';
    const base64 = btoa(sampleText);
    const decoded = atob(base64);
    expect(decoded).toBe(sampleText);
  });
});


