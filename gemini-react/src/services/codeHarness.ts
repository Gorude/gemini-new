import { streamGeminiContent } from './gemini';
import type { HarnessAction, HarnessStepBlock } from '../types/codeIde';
import type { PendingFile } from '../types';

export interface HarnessFileOps {
  getFiles: () => Record<string, string>;
  setFiles: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  openFile?: (path: string) => void;
}

export function normalizePath(path: string): string {
  let p = path.trim().replace(/\\/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  return p;
}

/**
 * Aplica uma edição cirúrgica em um arquivo, substituindo targetContent por replacementContent.
 * Possui tolerância a quebras de linha (CRLF vs LF) e pequenas variações de indentação.
 */
export function applyFileEdit(
  currentContent: string,
  targetContent: string,
  replacementContent: string
): { success: boolean; newContent?: string; error?: string } {
  if (!targetContent) {
    return { success: false, error: 'target_content não pode ser vazio.' };
  }

  // 1. Casamento exato
  if (currentContent.includes(targetContent)) {
    const newContent = currentContent.replace(targetContent, replacementContent);
    return { success: true, newContent };
  }

  // 2. Normaliza quebras de linha para tentar casar se houver discrepância de CRLF/LF
  const normCurrent = currentContent.replace(/\r\n/g, '\n');
  const normTarget = targetContent.replace(/\r\n/g, '\n');
  const normReplacement = replacementContent.replace(/\r\n/g, '\n');

  if (normCurrent.includes(normTarget)) {
    const newContent = normCurrent.replace(normTarget, normReplacement);
    return { success: true, newContent };
  }

  // 3. Fallback com normalização de espaços horizontais múltiplos (tabs e múltiplos espaços convertidos em espaço único)
  const collapseHorizontalSpaces = (str: string) =>
    str
      .split('\n')
      .map(l => l.replace(/[ \t]+/g, ' ').trim())
      .join('\n');

  const collapsedCurrent = collapseHorizontalSpaces(normCurrent);
  const collapsedTarget = collapseHorizontalSpaces(normTarget);

  if (collapsedCurrent.includes(collapsedTarget)) {
    const targetLines = collapsedTarget.split('\n');
    const currentLines = normCurrent.split('\n');
    const collapsedCurrentLines = collapsedCurrent.split('\n');

    for (let i = 0; i <= currentLines.length - targetLines.length; i++) {
      let matched = true;
      for (let j = 0; j < targetLines.length; j++) {
        if (collapsedCurrentLines[i + j] !== targetLines[j]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        const before = currentLines.slice(0, i).join('\n');
        const after = currentLines.slice(i + targetLines.length).join('\n');
        const newContent = (before ? before + '\n' : '') + normReplacement + (after ? '\n' + after : '');
        return { success: true, newContent };
      }
    }
  }

  // 4. Fallback tolerante a indentação: casa bloco de linhas ignorando espaços em branco nas pontas
  const targetLines = normTarget.split('\n').map(l => l.trim()).filter(Boolean);
  if (targetLines.length > 0) {
    const currentLines = normCurrent.split('\n');
    for (let i = 0; i <= currentLines.length - targetLines.length; i++) {
      let matched = true;
      for (let j = 0; j < targetLines.length; j++) {
        if (currentLines[i + j].trim() !== targetLines[j]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        const before = currentLines.slice(0, i).join('\n');
        const after = currentLines.slice(i + targetLines.length).join('\n');
        const newContent = (before ? before + '\n' : '') + normReplacement + (after ? '\n' + after : '');
        return { success: true, newContent };
      }
    }
  }

  // 5. Fallback por Âncoras de Início e Fim (para blocos com >= 3 linhas)
  if (targetLines.length >= 3) {
    const firstTarget = targetLines[0];
    const lastTarget = targetLines[targetLines.length - 1];
    const currentLines = normCurrent.split('\n');

    const firstMatches: number[] = [];
    const lastMatches: number[] = [];

    for (let idx = 0; idx < currentLines.length; idx++) {
      const lineTrim = currentLines[idx].trim();
      if (lineTrim === firstTarget) firstMatches.push(idx);
      if (lineTrim === lastTarget) lastMatches.push(idx);
    }

    for (const startIdx of firstMatches) {
      for (const endIdx of lastMatches) {
        if (endIdx > startIdx && Math.abs((endIdx - startIdx + 1) - targetLines.length) <= 6) {
          const before = currentLines.slice(0, startIdx).join('\n');
          const after = currentLines.slice(endIdx + 1).join('\n');
          const newContent = (before ? before + '\n' : '') + normReplacement + (after ? '\n' + after : '');
          return { success: true, newContent };
        }
      }
    }
  }

  return {
    success: false,
    error: `O trecho original (targetContent) não foi encontrado no arquivo. Verifique se o conteúdo corresponde exatamente às linhas existentes.`
  };
}

/**
 * Realiza o parse tolerante a falhas dos argumentos de chamadas de ferramentas de LLMs.
 * LLMs frequentemente geram JSONs com quebras de linha literais não escapadas,
 * aspas internas sem escape em tags HTML, ou blocos semi-abertos.
 */
export function robustParseToolArgs(raw: string): {
  path?: string;
  content?: string;
  target_content?: string;
  replacement_content?: string;
  name?: string;
  [key: string]: any;
} {
  if (!raw || typeof raw !== 'string') return {};
  const trimmed = raw.trim();

  // 1. Tenta JSON.parse nativo direto
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}

  const result: Record<string, any> = {};

  // 2. Extrai "name" se presente
  const nameMatch = trimmed.match(/"name"\s*:\s*"([^"]+)"/);
  if (nameMatch) result.name = nameMatch[1];

  // 3. Extrai "path"
  const pathMatch = trimmed.match(/"path"\s*:\s*"([^"]+)"/);
  if (pathMatch) {
    result.path = pathMatch[1];
  } else {
    // Fallback: busca caminho começando com /
    const rawPathMatch = trimmed.match(/(\/[a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/);
    if (rawPathMatch) result.path = rawPathMatch[1];
  }

  // 4. Extrai "target_content" e "replacement_content" (para edit_file)
  const targetIdx = trimmed.search(/"target_content"\s*:\s*"/);
  const repIdx = trimmed.search(/"replacement_content"\s*:\s*"/);

  if (targetIdx !== -1 && repIdx !== -1) {
    const targetHeader = trimmed.slice(targetIdx).match(/"target_content"\s*:\s*"/);
    if (targetHeader) {
      const targetStart = targetIdx + targetHeader[0].length;
      let targetRaw = trimmed.slice(targetStart, repIdx);
      targetRaw = targetRaw.replace(/(?<!\\)"\s*,\s*$/g, '');
      if (targetRaw.endsWith('"') && !targetRaw.endsWith('\\"')) {
        targetRaw = targetRaw.slice(0, -1);
      }
      result.target_content = targetRaw
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }

    const repHeader = trimmed.slice(repIdx).match(/"replacement_content"\s*:\s*"/);
    if (repHeader) {
      const repStart = repIdx + repHeader[0].length;
      let repRaw = trimmed.slice(repStart);
      repRaw = repRaw.replace(/(?<!\\)"\s*\}?\s*(?:<\/tool_call>)?\s*$/i, '');
      if (repRaw.endsWith('"') && !repRaw.endsWith('\\"')) {
        repRaw = repRaw.slice(0, -1);
      }
      result.replacement_content = repRaw
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
    return result;
  }

  // 5. Extrai "content" (para write_file)
  const contentIdx = trimmed.search(/"content"\s*:\s*"/);
  if (contentIdx !== -1) {
    const headerMatch = trimmed.slice(contentIdx).match(/"content"\s*:\s*"/);
    if (headerMatch) {
      const start = contentIdx + headerMatch[0].length;
      let body = trimmed.slice(start);
      // Remove fechamento do JSON: aspas final seguida de } ou fim de string
      body = body.replace(/(?<!\\)"\s*\}?\s*(?:<\/tool_call>)?\s*$/i, '');
      if (body.endsWith('"') && !body.endsWith('\\"')) {
        body = body.slice(0, -1);
      }
      result.content = body
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  } else {
    // Fallback: procura bloco de código markdown ```...``` dentro dos argumentos
    const codeBlockMatch = trimmed.match(/```(?:html|javascript|js|tsx|jsx|css|json)?\s*([\s\S]*?)(?:```|$)/);
    if (codeBlockMatch && codeBlockMatch[1].trim()) {
      result.content = codeBlockMatch[1].trim();
    }
  }

  // 6. Fallback especial para blocos de markdown no content
  if (!result.content) {
    const codeBlockMatch = trimmed.match(/```(?:html|javascript|js|tsx|jsx)?\s*([\s\S]*?)(?:```|$)/);
    if (codeBlockMatch && codeBlockMatch[1].trim().length > 20) {
      result.content = codeBlockMatch[1].trim();
    }
  }

  return result;
}

/**
 * Remove chamadas de ferramentas, JSONs brutos e blocos de protocolo para que o usuário
 * veja apenas o texto narrativo limpo e formatado no chat.
 */
export function cleanHarnessDisplayText(raw?: string): string {
  if (!raw) return '';
  let cleaned = raw;
  // Remove blocos fechados e semi-abertos de <tool_call>
  cleaned = cleaned.replace(/<tool_call[\s\S]*?<\/tool_call>/g, '');
  cleaned = cleaned.replace(/<tool_call[\s\S]*$/g, '');
  // Remove blocos fechados e semi-abertos de <function_call>
  cleaned = cleaned.replace(/<function_call[\s\S]*?<\/function_call>/g, '');
  cleaned = cleaned.replace(/<function_call[\s\S]*$/g, '');
  // Remove tags soltas e marcadores de fechamento como [tag_close]
  cleaned = cleaned.replace(/<\/?(?:tool_call|function_call)[^>]*>?/gi, '');
  cleaned = cleaned.replace(/\[(?:tag_close|close|close_tag)\]/gi, '');
  // Remove blocos de markdown ```json ... ``` de ferramentas
  cleaned = cleaned.replace(/```(?:json)?\s*\{[\s\S]*?"(?:path|target_content|content)"[\s\S]*?\}\s*```/g, '');
  cleaned = cleaned.replace(/```(?:json)?\s*\{[\s\S]*?"(?:path|target_content|content)"[\s\S]*$/g, '');
  // Remove blocos de JSON contendo propriedades de ferramentas ("path", "content", "target_content")
  cleaned = cleaned.replace(/\{\s*"(?:path|target_content|replacement_content|content)"[\s\S]*?\}/g, '');
  // Remove JSONs semi-abertos em streaming
  cleaned = cleaned.replace(/\{\s*"(?:path|target_content|replacement_content|content)":[\s\S]*$/g, '');
  // Remove fragmentos com chaves e aspas soltas de JSON
  cleaned = cleaned.replace(/\{\s*"path"[\s\S]*$/g, '');
  cleaned = cleaned.replace(/"\s*\}\s*"?\s*\}?/g, '');
  // Remove cabeçalhos de resultados de ferramentas
  cleaned = cleaned.replace(/\[RESULTADOS DAS FERRAMENTAS[\s\S]*?\]/g, '');
  // Remove linhas que contenham apenas barras verticais isoladas ou caracteres conectores ("|", "│")
  cleaned = cleaned.replace(/^[ \t]*[|│]+[ \t]*$/gm, '');
  // Normaliza quebras de linha excessivas
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

/**
 * Valida a sintaxe JavaScript de scripts embutidos em HTML ou arquivos JS.
 * Detecta instantaneamente SyntaxError como redeclarações de const/let ou tags não fechadas.
 */
export function validateScriptSyntax(content: string, path: string): { valid: boolean; error?: string } {
  try {
    if (!content || !content.trim()) return { valid: true };
    const norm = normalizePath(path);

    if (norm.endsWith('.js') || norm.endsWith('.ts')) {
      new Function(content);
      return { valid: true };
    }

    if (norm.endsWith('.html')) {
      const scriptMatches = content.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi);
      for (const match of scriptMatches) {
        const code = match[1];
        if (code && code.trim()) {
          try {
            new Function(code);
          } catch (err: any) {
            return {
              valid: false,
              error: `Erro de sintaxe no <script>: ${err?.message || err}`,
            };
          }
        }
      }
    }
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err?.message || String(err) };
  }
}

/**
 * Remove prefixos de passo (ex: "[Passo 1/4]", "[Passo 4]", "Passo 2:", "Step 3:") do título
 * e valida que o título é uma frase humana legítima, não um fragmento de JSON/tag.
 */
export function cleanStepTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let cleaned = rawTitle
    .replace(/^\[?(?:Passo|Passeo|Paso|Step|Etapa)\s+\d+(?:\s*(?:\/|de)\s*\d+)?\]?:?\s*/i, '')
    .replace(/<\/?(?:tool_call|function_call)[^>]*>?/gi, '')
    .replace(/\[(?:tag_close|close|close_tag)\]/gi, '')
    .replace(/\{\s*"path"[\s\S]*$/g, '')
    .replace(/^[:\-\s]+/, '')
    .trim();

  // Se o título ficou apenas com JSON, tags, ou markdown quebrado, descarta
  if (
    cleaned.startsWith('{') ||
    cleaned.startsWith('<') ||
    cleaned.includes('"path"') ||
    cleaned.includes('"target_content"') ||
    cleaned === '**' ||
    cleaned === '*'
  ) {
    return '';
  }
  return cleaned;
}

/**
 * Limpa o conteúdo de um passo individual removendo cabeçalhos ou linhas
 * redundantes que repetem exatamente o título da ação.
 */
export function cleanStepContent(content: string, cleanTitle?: string): string {
  if (!content) return '';
  let cleaned = cleanHarnessDisplayText(content);
  // Remove anúncio de passo com ou sem "/total" (ex: "[Passo 4] ...", "Passo 2/4: ...", "Passo 1 ...")
  cleaned = cleaned.replace(/^\[?(?:Passo|Passeo|Paso|Step|Etapa)\s+\d+(?:\s*(?:\/|de)\s*\d+)?\]?:?[^\n\r]*\n*/i, '');
  if (cleanTitle && cleanTitle.length > 5) {
    const escaped = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp('^' + escaped + ':?\\s*\\n*', 'i'), '');
  }
  return cleaned.trim();
}

/**
 * Detecta se o modelo prometeu ou expressou intenção de ação futura em texto
 * sem emitir uma chamada de ferramenta (<tool_call>) na mesma resposta.
 */
export function detectUnfulfilledActionIntent(text: string): { hasIntent: boolean; phrase?: string } {
  if (!text || typeof text !== 'string') return { hasIntent: false };
  const cleaned = cleanHarnessDisplayText(text).trim();
  if (!cleaned) return { hasIntent: false };

  // Padrões de promessa futura / intenção de ação sem execução imediata
  const intentPatterns = [
    /(?:agora\s+vou\s+(?:verificar|criar|adicionar|implementar|fazer|analisar|continuar|iniciar|escrever|prosseguir|montar|gerar|ajustar|configurar)|vou\s+(?:verificar|criar|adicionar|implementar|fazer|analisar|continuar|iniciar|escrever|prosseguir|montar|gerar|ajustar|configurar)|em\s+seguida\s+vou|a\s+seguir\s+vou|no\s+próximo\s+passo|próxima\s+etapa|etapa\s+\d+|passo\s+\d+|passeo\s+\d+)/i,
    /(?:now\s+i\s+will|i\s+will\s+(?:create|check|verify|implement|add|write|proceed|continue|build|generate)|next\s+step|next\s+i'll)/i,
    /(?:verificando\s+o\s+estado|preparando\s+para\s+criar|vamos\s+criar|vou\s+iniciar|adicionando\s+(?:cronômetro|efeitos|som|lógica|física|colisões|placar|polimento|recursos))/i,
    /\[?(?:passo|passeo|paso|step|etapa)\s+\d+\s*(?:\/|de)\s*\d+\]?/i,
  ];

  for (const pattern of intentPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      return { hasIntent: true, phrase: match[0] };
    }
  }

  // Se o texto termina com dois pontos ":" (típico de introdução interrompida antes de tool_call ou código)
  if (/(?:[a-zA-ZÀ-ÿ0-9_\-\)\]])\s*:\s*$/i.test(cleaned)) {
    return { hasIntent: true, phrase: 'declaração de continuidade interrompida (terminada em dois pontos)' };
  }

  return { hasIntent: false };
}

export const HARNESS_SYSTEM_PROMPT = `Você é o Agente de Código Nemon (Nemon Code Harness), um assistente de engenharia de software avançado e rigoroso especializado no desenvolvimento, depuração e refatoração de aplicações web completas em um ambiente virtual interativo.

# REGRA MANDATÓRIA Nº 1: EXECUÇÃO OBRIGATÓRIA DE FERRAMENTAS (AÇÃO IMEDIATA)

⚠️ ATENÇÃO CRÍTICA:
1. Toda e qualquer resposta sua que envolva criação, edição ou inspeção de código DEVE conter obrigatoriamente a chamada de ferramenta correspondente (<tool_call name="...">...</tool_call>).
2. É ESTRITAMENTE PROIBIDO enviar uma resposta apenas conversando, listando passos ou prometendo ("Vou criar o esqueleto...", "Agora vou verificar o estado do projeto e criar o jogo completo...", "Primeiro vou analisar...") sem incluir a chamada de ferramenta na MESMA resposta. Se você disser o que vai fazer, FAÇA na mesma resposta chamando a ferramenta!
3. NUNCA termine sua mensagem em dois-pontos ":" sem emitir o bloco de ferramenta imediatamente em seguida.
4. No primeiro turno, você DEVE emitir imediatamente <tool_call name="write_file"> com o código inicial ou <tool_call name="read_file"> para inspecionar arquivos existentes.

# REGRA MANDATÓRIA Nº 2: ESCOLHA ENTRE edit_file E write_file

1. "edit_file" (PREFERENCIAL PARA MELHORIAS E AJUSTES PONTUAIS):
   - Use edit_file para adicionar mecânicas complementares, efeitos sonoros, ajustes em CSS, cronômetros, botões ou correções pontuais de bugs em um arquivo existente.
   - NUNCA reescreva um arquivo de 15KB inteiro apenas para mudar uma cor ou corrigir uma única linha de código.
   - Como usar "edit_file":
     <tool_call name="edit_file">
     {
       "path": "/index.html",
       "target_content": "  </style>",
       "replacement_content": "    .timer-badge { font-size: 1.25rem; color: #38bdf8; }\n  </style>"
     }
     </tool_call>

2. "write_file" (CRIAÇÃO INICIAL, TROCA COMPLETA DE JOGO/APLICAÇÃO OU LIMPEZA DE CONFLITOS):
   - Criação inicial da aplicação (/index.html) no Passo 1.
   - SUBSTITUIÇÃO COMPLETA: Se o usuário pedir expressamente para trocar de jogo (ex: "troque o minesweeper pelo snake game", "mude o jogo para...", "substitua por..."), recriar do zero ou reestruturar a arquitetura central, use write_file para gravar a aplicação completa, moderna e funcional sem deixar resíduos ou scripts conflitantes do jogo anterior.
   - RECUPERAÇÃO DE CONFLITOS: Se o arquivo estiver corrompido, com scripts duplicados, tags repetidas ou erros de SyntaxError por redeclaração difícil de limpar com edit_file, use write_file para regravar a versão definitiva limpa.

# REGRA MANDATÓRIA Nº 3: FLUXO DE DESENVOLVIMENTO REALISTA E CONCLUSÃO IMEDIATA

O ambiente executa suas ferramentas de forma interativa e passo a passo:

1. Passo 1 (Núcleo Funcional com write_file):
   - Crie a estrutura HTML completa com o layout, canvas/arena e o loop de jogo/lógica básica JÁ VISÍVEL e jogável em tela. NUNCA crie apenas containers vazios ou esqueletos sem lógica no Passo 1.
2. Passos Subsequentes (Aperfeiçoamento ou Polimento com edit_file):
   - Se a aplicação necessitar de melhorias ou mecânicas adicionais (controles, cronômetro, som via Web Audio API, placar), use edit_file.
   - FLEXIBILIDADE DE ETAPAS: Se a aplicação já foi implementada de forma 100% completa, jogável e funcional com todos os requisitos solicitados pelo usuário, você NÃO É OBRIGADO a inventar etapas adicionais desnecessárias. Finalize imediatamente!
3. PROTOCOLO ESTRITO DE RESPOSTA (SEM DISCURSOS PREMATUROS):
   - ENQUANTO ESTIVER CONSTRUINDO (Turnos com ferramentas):
     Emita APENAS uma breve linha de transparência com o que está sendo feito (ex: "[Passo 1/2] Criando a estrutura completa do jogo:") seguida IMEDIATAMENTE da chamada de ferramenta (<tool_call>).
     É TERMINANTEMENTE PROIBIDO começar a escrever parágrafos de encerramento, manuais de como jogar, listas de controles ou congratulações enquanto você ainda estiver emitindo chamadas de ferramentas ou se o código ainda não estiver gravado!
   - APENAS NA RESPOSTA FINAL (Turno sem ferramentas):
     Somente APÓS o código estar 100% gravado e funcionando no arquivo virtual, envie uma mensagem limpa e elegante explicando ao usuário como a aplicação funciona, seus controles e recursos.

# MANDATOS FUNDAMENTAIS (Core Mandates)

1. ARQUITETURA ESTRITA DE ARQUIVO ÚNICO (Single-File Web Apps):
   - Para aplicações web, jogos, utilitários ou dashboards, SEMPRE consolide todo o HTML, estilização dentro de <style> e scripts dentro de <script> em UM ÚNICO ARQUIVO: /index.html.
   - É ESTRITAMENTE PROIBIDO criar ou separar código em pastas e arquivos externos como /styles.css, /style.css, /script.js, /app.js ou /src/..., a não ser que o usuário solicite explicitamente uma arquitetura multi-arquivo.
   - NUNCA insira tags <link rel="stylesheet" href="..."> ou <script src="..."> apontando para arquivos locais relativos inexistentes. Todo o código CSS e JavaScript deve estar diretamente dentro de /index.html.

2. Zero Assunção sobre Bibliotecas ou Frameworks:
   - Em projetos HTML/JS vanilla, se você precisar de bibliotecas de terceiros (ex: Tailwind CSS, Lucide Icons, FontAwesome, Chart.js, Three.js, Canvas-Confetti), SEMPRE as carregue explicitamente via tags CDN (<link> ou <script src="...">) dentro do <head> de /index.html.

3. Política Estrita de Comentários:
   - Adicione comentários com moderação extrema, focando apenas no PORQUÊ de cálculos físicos complexos.
   - NUNCA dialogue com o usuário através de comentários no código.

4. Proatividade e Completude Funcional (Sem Placeholders):
   - Entregue soluções 100% completas, operacionais e funcionais de ponta a ponta.
   - É ESTRITAMENTE PROIBIDO deixar "// TODO: implementar depois", "// adicione sua lógica aqui", reticências ou stubs vazios.

# FERRAMENTAS DISPONÍVEIS (Harness Primitives)

1. list_files:
   <tool_call name="list_files">{}</tool_call>
   Lista todos os caminhos de arquivos disponíveis no projeto.

2. read_file:
   <tool_call name="read_file">{"path": "/index.html"}</tool_call>
   Lê o conteúdo de um arquivo.

3. edit_file (PREFERENCIAL PARA MODIFICAÇÕES):
   <tool_call name="edit_file">{"path": "/index.html", "target_content": "trecho original exato", "replacement_content": "trecho modificado"}</tool_call>
   Aplica uma substituição cirúrgica no arquivo. O "target_content" DEVE corresponder ao conteúdo atual do arquivo.

4. write_file (APENAS CRIAÇÃO INICIAL OU REESCRITA TOTAL):
   <tool_call name="write_file">{"path": "/index.html", "content": "<!DOCTYPE html>..."}</tool_call>
   Cria um novo arquivo. Use apenas no Passo 1 ou quando uma reestruturação de mais de 80% for estritamente necessária.

# REGRAS DE CAMINHOS:
- Todos os caminhos de arquivos DEVEM ser absolutos no projeto virtual e começar com barra "/" (ex: "/index.html", "/App.tsx", "/src/styles.css").`;

export interface RunHarnessOptions {
  prompt: string;
  files: Record<string, string>;
  activeFile: string;
  model: string;
  chatHistory: { role: 'user' | 'assistant'; content: string }[];
  attachments?: PendingFile[];
  fileOps: HarnessFileOps;
  runtimeErrors?: string[];
  getRuntimeErrors?: () => string[];
  onChunk: (text: string, thoughts: string) => void;
  onAction: (action: HarnessAction) => void;
  onStepUpdate?: (step: HarnessStepBlock) => void;
  onStepReject?: (stepId: string) => void;
  onLiveWriting?: (path: string) => void;
  signal?: AbortSignal;
}

export async function runHarnessCycle({
  prompt,
  files,
  activeFile,
  model,
  chatHistory,
  attachments,
  fileOps,
  runtimeErrors,
  getRuntimeErrors,
  onChunk,
  onAction,
  onStepUpdate,
  onStepReject,
  onLiveWriting,
  signal,
}: RunHarnessOptions): Promise<{ finalResponse: string; actions: HarnessAction[] }> {
  let currentFiles = { ...files };
  const actions: HarnessAction[] = [];

  // Constrói o contexto inicial com os arquivos principais disponíveis
  const fileNames = Object.keys(currentFiles);
  const runtimeErrorHeader =
    runtimeErrors && runtimeErrors.length > 0
      ? `\n\n[ERROS DE RUNTIME / CONSOLE DETECTADOS NO PREVIEW]\nAtenção: A aplicação em execução gerou os seguintes erros no console:\n${runtimeErrors.map((err, i) => `${i + 1}. ${err}`).join('\n')}\n⚠️ CORRIJA ESTES ERROS DE RUNTIME no código para que a aplicação funcione perfeitamente.`
      : '';

  // Processa anexos de arquivos e fotos enviados pelo usuário
  let attachmentNotice = '';
  const mediaAttachments: { name: string; mimeType: string; data: string }[] = [];
  const textAttachments: { name: string; content: string }[] = [];

  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.mimeType.startsWith('image/') || att.mimeType === 'application/pdf') {
        mediaAttachments.push(att);
      } else {
        try {
          const binaryStr = atob(att.data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const decoded = new TextDecoder().decode(bytes);
          textAttachments.push({ name: att.name, content: decoded });
        } catch {
          textAttachments.push({ name: att.name, content: `[Arquivo anexado: ${att.name}]` });
        }
      }
    }

    if (mediaAttachments.length > 0) {
      attachmentNotice += `\n\n[ANEXOS MULTIMODAIS / IMAGENS ANEXADAS]: O usuário enviou ${mediaAttachments.length} imagem(ns)/documento(s) (${mediaAttachments.map(m => m.name).join(', ')}). Inspecione a imagem com atenção e atenda aos requisitos visuais, cores e estrutura solicitados.`;
    }

    if (textAttachments.length > 0) {
      attachmentNotice += `\n\n[CONTEÚDO DOS ARQUIVOS ANEXADOS PELO USUÁRIO]:\n${textAttachments
        .map(t => `--- Início do Arquivo: ${t.name} ---\n${t.content}\n--- Fim do Arquivo: ${t.name} ---`)
        .join('\n\n')}`;
    }
  }

  const isMajorSwap = /(?:troqu|mud|substitu|recri|reinici|outro\s+jogo|snake\s+game|novo\s+jogo)/i.test(prompt);
  const contextRule = isMajorSwap
    ? `💡 DICA DE ARQUITETURA: O usuário solicitou uma substituição/troca completa de aplicação ou jogo. Utilize 'write_file' para gravar a aplicação completa, moderna e funcional sem deixar resíduos ou scripts conflitantes do jogo anterior.`
    : `⚠️ REGRA DE MODIFICAÇÃO: Para melhorias pontuais ou correções de bugs, priorize 'edit_file' cirúrgico. (Caso haja scripts duplicados ou SyntaxError por redeclaração, você pode usar 'write_file' para regravar o arquivo limpo).`;

  const contextHeader = `[PROJETO ATUAL]
Arquivos existentes: ${fileNames.join(', ')}
Arquivo ativo no editor: ${activeFile}

Instrução do Usuário: ${prompt}${attachmentNotice}${runtimeErrorHeader}

${contextRule}`;

  // Limita o histórico pregresso e garante alternância estrita (sem duplicar role 'user' consecutivo)
  const trimmedChat = [...chatHistory];
  while (trimmedChat.length > 0 && trimmedChat[trimmedChat.length - 1].role === 'user') {
    trimmedChat.pop();
  }
  const recentChat = trimmedChat.slice(-4);
  const history: { role: string; parts: any[] }[] = recentChat.map(m => {
    let content = m.content;
    if (m.role === 'assistant' && content.length > 600) {
      content = content.replace(/```[\s\S]*?```/g, '[código salvo nos arquivos]').slice(0, 800);
    }
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: content }]
    };
  });

  let currentPrompt = contextHeader;
  let accumulatedFinalText = '';
  let accumulatedThoughts = '';
  let highestStepSeen = 0;
  let totalStepsExpected = 0;

  // Loop agêntico (máximo de 10 iterações para comportar projetos multifásicos ricos)
  for (let iteration = 0; iteration < 10; iteration++) {
    if (signal?.aborted) break;

    const stream = streamGeminiContent(
      currentPrompt,
      model,
      history,
      HARNESS_SYSTEM_PROMPT,
      iteration === 0 && mediaAttachments.length > 0
        ? mediaAttachments.map(m => ({ mimeType: m.mimeType, data: m.data }))
        : [],
      false,
      signal,
      true // thinking habilitado para planejamento
    );

    let stepText = '';
    let stepThoughts = '';
    let lastLiveUpdate = 0;
    let focusedPath = '';
    let lastExtractedCode = '';
    let lastTargetPath = '';
    const stepId = `step-${iteration}`;
    const stepActions: HarnessAction[] = [];
    let stepTitle = '';

    for await (const chunk of stream) {
      if (chunk.thoughts) {
        stepThoughts += chunk.thoughts;
        accumulatedThoughts += chunk.thoughts;
      }
      if (chunk.text) {
        stepText += chunk.text;

        // Detecta em tempo real se o modelo está escrevendo código em um arquivo e transmite ao editor
        const pathMatch = stepText.match(/(?:<tool_call\s+name=["']write_file["']>[\s\S]*?)?["']path["']\s*:\s*["']([^"']+)["']/);
        if (pathMatch) {
          const targetPath = normalizePath(pathMatch[1]);
          lastTargetPath = targetPath;

          // Se mudou de arquivo, abre e foca apenas uma vez por arquivo
          if (focusedPath !== targetPath) {
            focusedPath = targetPath;
            if (fileOps.openFile) fileOps.openFile(targetPath);
            onLiveWriting?.(targetPath);
          }

          const contentStartMatch = stepText.match(/["']content["']\s*:\s*"/);
          if (contentStartMatch && contentStartMatch.index !== undefined) {
            const startIndex = contentStartMatch.index + contentStartMatch[0].length;
            let rawSnippet = stepText.slice(startIndex);
            // Remove fechamento no final se já tiver chegado (aspas finais seguidas de } ou </tool_call>)
            rawSnippet = rawSnippet.replace(/(?<!\\)"\s*\}?\s*(?:<\/tool_call>)?\s*$/i, '');
            if (rawSnippet.endsWith('</tool_call>')) {
              rawSnippet = rawSnippet.replace(/<\/tool_call>\s*$/i, '');
            }

            const liveCode = rawSnippet
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '\r')
              .replace(/\\t/g, '\t')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');

            if (liveCode) {
              lastExtractedCode = liveCode;
              currentFiles[targetPath] = liveCode;
              // Throttle a ~120ms para estabilidade visual e alívio do React/CodeMirror sem lag perceptível
              const now = Date.now();
              if (now - lastLiveUpdate > 120) {
                lastLiveUpdate = now;
                fileOps.setFiles(prev => ({ ...prev, [targetPath]: liveCode }));
              }
            }
          }
        }
      }

      // Detecta título inteligente e amigável da etapa (evita JSONs brutos, tags semi-abertas e markdown quebrado)
      const stepMatch = stepText.match(/\[?(?:Passo|Passeo|Paso|Step|Etapa)\s+\d+(?:\s*(?:\/|de)\s*\d+)?\]?:?\s*([^\n\r<{}]+)/i);
      if (stepMatch && stepMatch[1]) {
        const candidate = cleanStepTitle(stepMatch[1]);
        if (candidate && candidate.length >= 4) {
          stepTitle = candidate;
        }
      } else if (!stepTitle || stepTitle.startsWith('Etapa') || stepTitle.startsWith('Planejamento')) {
        if (stepText.includes('read_file')) {
          const p = stepText.match(/["']path["']\s*:\s*["']([^"']+)["']/);
          stepTitle = p ? `Inspecionando ${p[1]}` : 'Inspecionando arquivos';
        } else if (stepText.includes('edit_file')) {
          const p = stepText.match(/["']path["']\s*:\s*["']([^"']+)["']/);
          stepTitle = p ? `Ajustando ${p[1]}` : 'Ajustando código';
        } else if (stepText.includes('write_file')) {
          const p = stepText.match(/["']path["']\s*:\s*["']([^"']+)["']/);
          stepTitle = p ? `Salvando ${p[1]}` : 'Gerando aplicação';
        } else if (stepText.includes('list_files')) {
          stepTitle = 'Listando arquivos do projeto';
        } else {
          const cleanedText = cleanHarnessDisplayText(stepText);
          const firstLine = cleanedText.trim().split('\n')[0];
          const cleanedFirst = cleanStepTitle(firstLine);
          if (
            cleanedFirst.length >= 6 &&
            cleanedFirst.length <= 80 &&
            !cleanedFirst.startsWith('#') &&
            !cleanedFirst.startsWith('*') &&
            !cleanedFirst.endsWith('**') &&
            !/[{}[\]<>]/.test(cleanedFirst) &&
            !/^(?:o|a|os|as)\s*\**/i.test(cleanedFirst)
          ) {
            stepTitle = cleanedFirst;
          }
        }
      }

      const displayStepText = cleanStepContent(stepText, stepTitle);
      const currentStepNum = iteration + 1;
      const safeTotalSteps = totalStepsExpected && currentStepNum <= totalStepsExpected ? totalStepsExpected : undefined;

      // Emite atualização do bloco da etapa corrente
      onStepUpdate?.({
        id: stepId,
        stepNumber: currentStepNum,
        totalSteps: safeTotalSteps,
        title: stepTitle || (iteration === 0 ? 'Planejamento e Análise' : `Etapa ${currentStepNum}`),
        thoughts: stepThoughts,
        content: displayStepText,
        actions: [...stepActions],
        status: 'running',
        timestamp: Date.now(),
      });

      // Higieniza o texto para o chat para que o usuário NUNCA veja JSONs brutos ou chamadas de ferramentas vazando
      const displayChunk = cleanHarnessDisplayText(
        accumulatedFinalText + (accumulatedFinalText ? '\n\n' : '') + stepText
      );
      onChunk(displayChunk, accumulatedThoughts);
    }

    // Garante que o código final da iteração seja transmitido na íntegra sem perdas
    if (lastTargetPath && lastExtractedCode) {
      currentFiles[lastTargetPath] = lastExtractedCode;
      fileOps.setFiles(prev => ({ ...prev, [lastTargetPath]: lastExtractedCode }));
    }

    // 1. Detecta chamadas de ferramentas <tool_call ...>...</tool_call> (fechadas ou semi-abertas)
    const toolCallRegex = /<tool_call(?:\s+name=["']?([^"'>\s]+)["']?)?>([\s\S]*?)(?:<\/tool_call>|$)/gi;
    const toolCalls: { name: string; rawArgs: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = toolCallRegex.exec(stepText)) !== null) {
      let name = match[1] || '';
      const rawArgs = match[2].trim();
      if (!rawArgs) continue;

      const parsed = robustParseToolArgs(rawArgs);
      if (!name) {
        if (parsed.name) name = parsed.name;
        else if (parsed.content !== undefined) name = 'write_file';
        else if (parsed.target_content !== undefined) name = 'edit_file';
        else if (parsed.path) name = 'read_file';
      }
      if (name) toolCalls.push({ name, rawArgs });
    }

    // 2. Detecta chamadas com <function_call ...> (fechadas ou semi-abertas)
    if (toolCalls.length === 0) {
      const funcRegex = /<function_call(?:\s+name=["']?([^"'>\s]+)["']?)?>([\s\S]*?)(?:<\/function_call>|$)/gi;
      while ((match = funcRegex.exec(stepText)) !== null) {
        const rawArgs = match[2].trim();
        if (!rawArgs) continue;
        const parsed = robustParseToolArgs(rawArgs);
        const name = match[1] || parsed.name || (parsed.content !== undefined ? 'write_file' : 'edit_file');
        toolCalls.push({ name, rawArgs });
      }
    }

    // 3. Fallback: blocos de markdown ```json { "path": ... }
    if (toolCalls.length === 0) {
      const jsonBlockMatches = stepText.match(/```(?:json)?\s*(\{[\s\S]*?"(?:path|target_content|content)"[\s\S]*?\})\s*```/g);
      if (jsonBlockMatches) {
        for (const block of jsonBlockMatches) {
          const rawJson = block.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
          const parsed = robustParseToolArgs(rawJson);
          if (parsed.path && parsed.content !== undefined) {
            toolCalls.push({ name: 'write_file', rawArgs: rawJson });
          } else if (parsed.path && parsed.target_content !== undefined) {
            toolCalls.push({ name: 'edit_file', rawArgs: rawJson });
          } else if (parsed.path) {
            toolCalls.push({ name: 'read_file', rawArgs: rawJson });
          }
        }
      }
    }

    // 4. Fallback: se o modelo omitiu <tool_call> e emitiu JSON direto
    if (toolCalls.length === 0) {
      const jsonMatches = stepText.match(/\{[\s\S]*?"(?:path|target_content|replacement_content)"[\s\S]*?\}/g);
      if (jsonMatches) {
        for (const rawJson of jsonMatches) {
          const parsed = robustParseToolArgs(rawJson);
          if (parsed.path && parsed.content !== undefined) {
            toolCalls.push({ name: 'write_file', rawArgs: rawJson });
          } else if (parsed.path && parsed.target_content !== undefined) {
            toolCalls.push({ name: 'edit_file', rawArgs: rawJson });
          } else if (parsed.path) {
            toolCalls.push({ name: 'read_file', rawArgs: rawJson });
          }
        }
      }
    }

    // 5. Fallback: se o modelo gerou um bloco de código markdown puro (ex: ```html <!DOCTYPE ...```)
    if (toolCalls.length === 0) {
      const codeBlockMatch = stepText.match(/```(?:html|javascript|js|tsx|jsx)\s*([\s\S]*?)(?:```|$)/);
      if (codeBlockMatch && codeBlockMatch[1].trim().length > 50) {
        const targetPath = activeFile.endsWith('.html') ? activeFile : '/index.html';
        toolCalls.push({
          name: 'write_file',
          rawArgs: JSON.stringify({ path: targetPath, content: codeBlockMatch[1].trim() }),
        });
      }
    }

    // Rastreia persistência de etapas anunciadas entre iterações
    const stepMentionMatch = stepText.match(/\[?(?:Passo|Passeo|Paso|Step|Etapa)\s+(\d+)\s*(?:\/|de)\s*(\d+)\]?/i);
    if (stepMentionMatch) {
      const s = parseInt(stepMentionMatch[1], 10);
      const t = parseInt(stepMentionMatch[2], 10);
      if (!isNaN(s) && s > highestStepSeen) highestStepSeen = s;
      if (!isNaN(t) && t > totalStepsExpected) totalStepsExpected = t;
    }

    const isEmptyResponse = stepText.trim().length === 0;

    if (toolCalls.length === 0) {
      const activePath = activeFile || '/index.html';
      const mainContent = currentFiles[activePath] || '';
      const isDefaultPlaceholder =
        mainContent.includes('Pronto para criar') ||
        mainContent.includes('Descreva o que você deseja construir');
      const isBareSkeleton =
        mainContent.trim().length < 350 ||
        (!mainContent.includes('<script') && !mainContent.includes('<canvas') && !mainContent.includes('function'));
      const successfulModifyingActions = actions.filter(
        a => (a.type === 'write_file' || a.type === 'edit_file') && (a.status === 'success' || a.status === 'warning')
      );
      const failedModifyingActions = actions.filter(
        a => (a.type === 'write_file' || a.type === 'edit_file') && a.status === 'error'
      );

      // Detecta se o modelo prometeu ações em texto sem emitir ferramentas
      const unfulfilledIntent = detectUnfulfilledActionIntent(stepText);

      // A aplicação é REALMENTE incompleta se:
      // 1. Resposta veio vazia e nenhuma ação de modificação foi realizada ainda;
      // 2. Ou o arquivo ainda é o placeholder inicial padrão ("Pronto para criar");
      // 3. Ou o arquivo é um esqueleto mínimo sem lógica/scripts;
      // 4. Ou tentativas de edição falharam e nenhuma ação de modificação teve sucesso;
      // 5. Ou o modelo prometeu explicitamente uma ação futura sem executar ("Agora vou verificar o estado:").
      const isAppActuallyIncomplete =
        (isEmptyResponse && successfulModifyingActions.length === 0) ||
        isDefaultPlaceholder ||
        isBareSkeleton ||
        (failedModifyingActions.length > 0 && successfulModifyingActions.length === 0) ||
        (successfulModifyingActions.length === 0 && isBareSkeleton) ||
        unfulfilledIntent.hasIntent;

      if (isAppActuallyIncomplete && iteration < 9) {
        console.warn(
          `[Harness] Iteração ${iteration}: Aplicação incompleta (isEmpty: ${isEmptyResponse}, isBare: ${isBareSkeleton}, isDefault: ${isDefaultPlaceholder}, successfulActions: ${successfulModifyingActions.length}, failedActions: ${failedModifyingActions.length}, unfulfilledIntent: ${unfulfilledIntent.hasIntent}). Forçando continuação.`
        );

        // Descarte o passo incompleto ou prematuro para que o usuário NUNCA veja o corte no chat!
        onStepReject?.(stepId);

        const safePromptForHistory =
          currentPrompt.length > 2500
            ? currentPrompt.slice(0, 2500) + '\n...[resumo]'
            : currentPrompt;
        history.push({ role: 'user', parts: [{ text: safePromptForHistory }] });
        history.push({ role: 'model', parts: [{ text: stepText || '[continuação solicitada]' }] });

        let promptReason = '';
        if (unfulfilledIntent.hasIntent) {
          promptReason = `⚠️ ATENÇÃO: Você declarou '${unfulfilledIntent.phrase}', mas NÃO emitiu nenhuma ferramenta (<tool_call>) na resposta! É estritamente proibido anunciar etapas sem chamadas de ferramenta na mesma resposta.`;
        } else if (failedModifyingActions.length > 0 && successfulModifyingActions.length === 0) {
          promptReason = `⚠️ ATENÇÃO: Sua tentativa de edit_file em ${activePath} FALHOU porque o 'target_content' não foi encontrado exatamente no arquivo. Utilize o resultado de read_file para ver o código real e passe o trecho exato de linhas a serem substituídas.`;
        } else if (isEmptyResponse) {
          promptReason = `Sua resposta veio vazia ou foi interrompida antes de emitir a ferramenta. Emita a ferramenta para a etapa atual agora!`;
        } else if (isDefaultPlaceholder || isBareSkeleton) {
          promptReason = `O arquivo ${activePath} ainda não possui a lógica e as físicas implementadas (está vazio ou apenas com estrutura preliminar).`;
        } else {
          promptReason = `A alteração solicitada pelo usuário no arquivo ${activePath} ainda não foi concluída.`;
        }

        const isSwapRequest = /(?:troqu|mud|substitu|recri|reinici|outro\s+jogo|snake\s+game|novo\s+jogo)/i.test(prompt);
        const hasExistingCode = mainContent.length > 300 && !isDefaultPlaceholder;
        const toolGuidance = hasExistingCode && !isSwapRequest
          ? `Como o arquivo ${activePath} já existe com uma aplicação, utilize edit_file para implementar o trecho necessário:
<tool_call name="edit_file">{"path": "${activePath}", "target_content": "trecho original exato", "replacement_content": "trecho com o novo código"}</tool_call>
(Se houver blocos conflitantes, scripts duplicados ou o usuário pediu troca de jogo, utilize write_file para regravar a versão limpa).`
          : `Você pode emitir a chamada de ferramenta write_file nesta resposta para implementar a aplicação completa:
<tool_call name="write_file">{"path": "${activePath}", "content": "<!DOCTYPE html>..."}</tool_call>`;

        currentPrompt = `⚠️ AVISO MANDATÓRIO: A solicitação no arquivo ${activePath} ainda precisa de implementação!
${promptReason}
${toolGuidance}`;
        continue;
      }

      // Conclusão legítima: código já implementado, aplicação completa e funcional!
      const currentStepNum = iteration + 1;
      const safeTotalSteps = totalStepsExpected && currentStepNum <= totalStepsExpected ? totalStepsExpected : undefined;
      const finalDisplay = cleanHarnessDisplayText(stepText);

      onStepUpdate?.({
        id: stepId,
        stepNumber: currentStepNum,
        totalSteps: safeTotalSteps,
        title: cleanStepTitle(stepTitle) || (successfulModifyingActions.length > 0 ? 'Ajustes Concluídos' : 'Aplicação Concluída'),
        thoughts: stepThoughts,
        content: finalDisplay,
        actions: [...stepActions],
        status: 'completed',
        timestamp: Date.now(),
      });

      if (stepText.trim()) {
        accumulatedFinalText += (accumulatedFinalText ? '\n\n' : '') + stepText;
      }
      break;
    }

    // Se ferramentas foram emitidas, adiciona o texto explicativo ao chat final
    if (stepText.trim()) {
      accumulatedFinalText += (accumulatedFinalText ? '\n\n' : '') + stepText;
    }

    // Executa as ferramentas e coleta os resultados
    const toolResults: string[] = [];

    for (const call of toolCalls) {
      const actionId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const parsedArgs = robustParseToolArgs(call.rawArgs);

      const action: HarnessAction = {
        id: actionId,
        type: call.name as any,
        path: parsedArgs.path ? normalizePath(parsedArgs.path) : undefined,
        status: 'pending'
      };

      onAction(action);

      switch (call.name) {
        case 'list_files': {
          const list = Object.keys(currentFiles);
          action.status = 'success';
          action.detail = `Arquivos: ${list.join(', ')}`;
          toolResults.push(`[list_files resultado]: ${list.join(', ')}`);
          break;
        }
        case 'read_file': {
          const path = action.path || normalizePath(parsedArgs.path || '');
          const content = currentFiles[path];
          if (content !== undefined) {
            action.status = 'success';
            action.detail = `${path} (${content.length} caracteres)`;
            let safeContent = content;
            if (content.length > 120000) {
              safeContent =
                content.slice(0, 80000) +
                `\n\n... [${content.length - 100000} caracteres omitidos por limite de segurança. O arquivo tem ${content.length} caracteres no total] ...\n\n` +
                content.slice(-20000);
            }
            toolResults.push(`[read_file resultado para ${path}]:\n\`\`\`\n${safeContent}\n\`\`\``);
            if (fileOps.openFile) fileOps.openFile(path);
          } else {
            action.status = 'error';
            action.error = `Arquivo ${path} não encontrado.`;
            toolResults.push(`[read_file erro]: Arquivo ${path} não existe no projeto. Arquivos existentes: ${Object.keys(currentFiles).join(', ')}`);
          }
          break;
        }
        case 'write_file': {
          const path = action.path || normalizePath(parsedArgs.path || lastTargetPath || activeFile || '/index.html');
          action.path = path;
          const oldCode = currentFiles[path];
          const newCode = parsedArgs.content || lastExtractedCode || '';
          currentFiles[path] = newCode;
          fileOps.setFiles(prev => ({ ...prev, [path]: newCode }));
          if (fileOps.openFile) fileOps.openFile(path);

          const syntaxCheck = validateScriptSyntax(newCode, path);
          if (!syntaxCheck.valid) {
            action.status = 'warning';
            action.error = syntaxCheck.error;
            action.detail = `Arquivo ${path} salvo com aviso de sintaxe`;
            toolResults.push(`[write_file aviso de sintaxe]: ⚠️ ATENÇÃO: ${syntaxCheck.error}. Há variáveis duplicadas ou erro de sintaxe. Corrija o script antes de concluir.`);
          } else {
            action.status = 'success';
            action.detail = `Arquivo ${path} salvo (${newCode.length} chars)`;
            toolResults.push(`[write_file resultado]: Arquivo ${path} criado/atualizado com sucesso (${newCode.length} caracteres).`);
          }

          if (oldCode && oldCode !== newCode) {
            action.diff = {
              oldContent: oldCode,
              newContent: newCode,
              isFullRewrite: true,
            };
          }
          break;
        }
        case 'edit_file': {
          const path = action.path || normalizePath(parsedArgs.path || '');
          const target = parsedArgs.target_content;
          const replacement = parsedArgs.replacement_content;
          const oldContent = currentFiles[path];

          if (oldContent === undefined) {
            action.status = 'error';
            action.error = `Arquivo ${path} não existe para editar.`;
            toolResults.push(`[edit_file erro]: Arquivo ${path} não encontrado.`);
            break;
          }

          const res = applyFileEdit(oldContent, target || '', replacement || '');
          if (res.success && res.newContent !== undefined) {
            currentFiles[path] = res.newContent;
            fileOps.setFiles(prev => ({ ...prev, [path]: res.newContent! }));
            if (fileOps.openFile) fileOps.openFile(path);

            const syntaxCheck = validateScriptSyntax(res.newContent, path);
            if (!syntaxCheck.valid) {
              action.status = 'warning';
              action.error = syntaxCheck.error;
              action.detail = `Substituição aplicada em ${path} (com aviso de sintaxe)`;
              toolResults.push(`[edit_file aviso de sintaxe]: ⚠️ ATENÇÃO: ${syntaxCheck.error}. A alteração introduziu declarações duplicadas ou erro de sintaxe. Corrija ou utilize write_file para gravar uma versão limpa.`);
            } else {
              action.status = 'success';
              action.detail = `Substituição aplicada em ${path}`;
              toolResults.push(`[edit_file resultado]: Trecho em ${path} substituído com sucesso.`);
            }

            action.diff = {
              targetContent: target,
              replacementContent: replacement,
              oldContent,
              newContent: res.newContent,
              isFullRewrite: false,
            };
          } else {
            action.status = 'error';
            action.error = res.error;
            toolResults.push(`[edit_file erro]: ${res.error}`);
          }
          break;
        }
        default: {
          action.status = 'error';
          action.error = `Ferramenta desconhecida: ${call.name}`;
          toolResults.push(`[erro]: Ferramenta ${call.name} não existe.`);
        }
      }

      actions.push(action);
      stepActions.push(action);
      onAction({ ...action });

      const currentStepNum = iteration + 1;
      const safeTotalSteps = totalStepsExpected && currentStepNum <= totalStepsExpected ? totalStepsExpected : undefined;
      const displayStepText = cleanStepContent(stepText, cleanStepTitle(stepTitle));

      onStepUpdate?.({
        id: stepId,
        stepNumber: currentStepNum,
        totalSteps: safeTotalSteps,
        title: cleanStepTitle(stepTitle) || (iteration === 0 ? 'Planejamento e Análise' : `Etapa ${currentStepNum}`),
        thoughts: stepThoughts,
        content: displayStepText,
        actions: [...stepActions],
        status: 'running',
        timestamp: Date.now(),
      });
    }

    // Finaliza o bloco da etapa corrente
    const currentStepNum = iteration + 1;
    const safeTotalSteps = totalStepsExpected && currentStepNum <= totalStepsExpected ? totalStepsExpected : undefined;
    const displayStepText = cleanStepContent(stepText, cleanStepTitle(stepTitle));

    onStepUpdate?.({
      id: stepId,
      stepNumber: currentStepNum,
      totalSteps: safeTotalSteps,
      title: cleanStepTitle(stepTitle) || (iteration === 0 ? 'Planejamento e Análise' : `Etapa ${currentStepNum}`),
      thoughts: stepThoughts,
      content: displayStepText,
      actions: [...stepActions],
      status: 'completed',
      timestamp: Date.now(),
    });

    // Higieniza stepText antes de enviar ao histórico interno:
    // Remove o conteúdo bruto de write_file do histórico de mensagens para evitar estourar limites de tokens da API
    const sanitizedStepText = stepText.replace(
      /"content"\s*:\s*"(?:[^"\\]|\\.)*"/g,
      '"content": "[código do arquivo salvo com sucesso]"'
    );

    // Mantém no máximo as últimas 4 mensagens no histórico interno do loop agêntico (janela deslizante)
    while (history.length > 4) {
      history.shift();
    }

    // Alimenta o resultado de volta para o modelo para a próxima iteração
    const safePromptForHistory = currentPrompt.length > 2500 ? currentPrompt.slice(0, 2500) + '\n...[resumo]' : currentPrompt;
    history.push({ role: 'user', parts: [{ text: safePromptForHistory }] });
    history.push({ role: 'model', parts: [{ text: sanitizedStepText }] });

    const targetFile = lastTargetPath || activeFile || '/index.html';
    const currentCode = currentFiles[targetFile] || '';
    let codePreview = currentCode;
    if (codePreview.length > 2500) {
      codePreview =
        codePreview.slice(0, 1200) +
        '\n\n... [linhas intermediárias omitidas para economizar tokens] ...\n\n' +
        codePreview.slice(-800);
    }

    const latestRuntimeErrors = getRuntimeErrors ? getRuntimeErrors() : [];
    const runtimeErrorPrompt =
      latestRuntimeErrors && latestRuntimeErrors.length > 0
        ? `\n\n[ERROS DE RUNTIME DO PREVIEW APÓS A ÚLTIMA AÇÃO]:\n${latestRuntimeErrors.map(e => `• ${e}`).join('\n')}\n⚠️ ATENÇÃO: A aplicação em execução emitiu os erros acima! Corrija-os agora!`
        : '';

    currentPrompt = `[RESULTADOS DAS FERRAMENTAS EXECUTADAS]
${toolResults.join('\n\n')}

Estado atual do arquivo ${targetFile} (${currentCode.length} caracteres):
\`\`\`html
${codePreview}
\`\`\`${runtimeErrorPrompt}

⚠️ PROSSIGA COM A PRÓXIMA ETAPA (USE edit_file):
Como o arquivo ${targetFile} já existe, use OBRIGATORIAMENTE <tool_call name="edit_file"> com 'target_content' e 'replacement_content' para adicionar as próximas funcionalidades (cronômetro, placar, física, sons ou polimento).
NÃO reescreva o arquivo inteiro com write_file.
NÃO termine sua resposta em dois-pontos ":" sem incluir a chamada de ferramenta na mesma resposta. Se tudo já estiver concluído, envie sua mensagem final explicando os controles ao usuário.`;
  }

  // Remove os blocos de chamada de ferramentas e JSONs vazados do texto final
  const cleanedText = cleanHarnessDisplayText(accumulatedFinalText);

  return { finalResponse: cleanedText || 'Ações do projeto concluídas com sucesso.', actions };
}

