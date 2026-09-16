import { streamGeminiContent } from './gemini';
import type { HarnessAction } from '../types/codeIde';

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

  // 3. Fallback tolerante a indentação: casa bloco de linhas ignorando espaços em branco nas pontas
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

  return result;
}

/**
 * Remove chamadas de ferramentas, JSONs brutos e blocos de protocolo para que o usuário
 * veja apenas o texto narrativo limpo e formatado no chat.
 */
export function cleanHarnessDisplayText(raw: string): string {
  if (!raw) return '';
  let cleaned = raw;
  // Remove blocos fechados e semi-abertos de <tool_call>
  cleaned = cleaned.replace(/<tool_call[\s\S]*?<\/tool_call>/g, '');
  cleaned = cleaned.replace(/<tool_call[\s\S]*$/g, '');
  // Remove blocos fechados e semi-abertos de <function_call>
  cleaned = cleaned.replace(/<function_call[\s\S]*?<\/function_call>/g, '');
  cleaned = cleaned.replace(/<function_call[\s\S]*$/g, '');
  // Remove blocos de markdown ```json ... ``` de ferramentas
  cleaned = cleaned.replace(/```(?:json)?\s*\{[\s\S]*?"(?:path|target_content|content)"[\s\S]*?\}\s*```/g, '');
  cleaned = cleaned.replace(/```(?:json)?\s*\{[\s\S]*?"(?:path|target_content|content)"[\s\S]*$/g, '');
  // Remove blocos de JSON contendo propriedades de ferramentas ("path", "content", "target_content")
  cleaned = cleaned.replace(/\{\s*"(?:path|target_content|replacement_content|content)"[\s\S]*?\}/g, '');
  // Remove JSONs semi-abertos em streaming
  cleaned = cleaned.replace(/\{\s*"(?:path|target_content|replacement_content|content)":[\s\S]*$/g, '');
  // Remove possíveis fragmentos com chaves e aspas soltas no final de chamadas de ferramentas
  cleaned = cleaned.replace(/"\s*\}\s*"?\s*\}?/g, '');
  // Remove cabeçalhos de resultados de ferramentas
  cleaned = cleaned.replace(/\[RESULTADOS DAS FERRAMENTAS[\s\S]*?\]/g, '');
  // Remove linhas que contenham apenas barras verticais isoladas ou caracteres conectores ("|", "│")
  cleaned = cleaned.replace(/^[ \t]*[|│]+[ \t]*$/gm, '');
  // Normaliza quebras de linha excessivas
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

export const HARNESS_SYSTEM_PROMPT = `Você é o Agente de Código Nemon (Nemon Code Harness), um assistente de engenharia de software avançado e rigoroso especializado no desenvolvimento, depuração e refatoração de aplicações web completas em um ambiente virtual interativo.

# REGRA MANDATÓRIA Nº 1: EXECUÇÃO OBRIGATÓRIA DE FERRAMENTAS (AÇÃO IMEDIATA)

⚠️ ATENÇÃO CRÍTICA:
1. Toda e qualquer resposta sua que envolva criação, edição ou inspeção de código DEVE conter obrigatoriamente a chamada de ferramenta correspondente (<tool_call name="...">...</tool_call>).
2. É ESTRITAMENTE PROIBIDO enviar uma resposta apenas conversando, listando passos ou prometendo ("Vou criar o esqueleto...", "Primeiro vou analisar...") sem incluir a chamada de ferramenta na MESMA resposta.
3. NUNCA declare uma etapa como "concluída" antes de ter executado a ferramenta e recebido a confirmação do ambiente.
4. No primeiro turno, você DEVE emitir imediatamente <tool_call name="write_file"> com o código funcional ou <tool_call name="read_file"> para inspecionar arquivos existentes.

# REGRA MANDATÓRIA Nº 2: DESENVOLVIMENTO INCREMENTAL E COMPLETUDE FUNCIONAL

O ambiente executa suas ferramentas de forma interativa e passo a passo. Para construir aplicações ricas e sem truncamento:

1. Aplicações de Arquivo Único (/index.html):
   - Passo 1 (Núcleo Funcional Operacional): Crie imediatamente com "write_file" a estrutura HTML com o layout, canvas/arena e o loop de jogo/lógica básica JÁ VISÍVEL e jogável em tela. NUNCA crie apenas containers vazios ou esqueletos sem lógica no Passo 1.
   - Passo 2 (Mecânicas Avançadas & Física): Adicione a física detalhada (aceleração, turbo, gravidade, cálculo vetorial de colisões, dodges) usando "edit_file" ou "write_file".
   - Passo 3 (Recursos Adicionais & Polimento): Adicione placar, efeitos de partículas, feedback visual, sons (Web Audio API) e polimento.

2. Uso Inteligente de Ferramentas:
   - "write_file": Use para criar o arquivo inicial funcional ou refatorar o arquivo com o código completo.
   - "edit_file": Use para adicionar funções específicas, ajustar parâmetros de física ou enriquecer o CSS/HTML sem reenviar todo o arquivo.
   - Sempre emita a ferramenta correspondente a cada passo.

3. Transparência de Progresso:
   - Ao emitir a chamada de ferramenta, informe uma breve linha explicativa (ex: "[Passo 1/3] Criando a arena e o loop de física base:").
   - NUNCA imprima barras verticais isoladas ("|" ou "│").
   - Continue avançando pelas etapas até que o jogo/aplicativo esteja 100% completo, polido e jogável.
   - Somente na última resposta (após todas as ferramentas serem executadas e a aplicação estar 100% funcional), envie a mensagem final sem ferramentas explicando os controles ao usuário.

# MANDATOS FUNDAMENTAIS (Core Mandates)

1. Convenções e Contexto Pré-Existente:
   - Analise rigorosamente as convenções do projeto antes de modificar o código.
   - Antes de editar arquivos existentes, use "read_file" caso precise confirmar linhas exatas para o target_content do "edit_file".

2. Zero Assunção sobre Bibliotecas ou Frameworks:
   - Em projetos HTML/JS vanilla, se você precisar de bibliotecas de terceiros (ex: Tailwind CSS, Lucide Icons, FontAwesome, Chart.js, Three.js, Canvas-Confetti), SEMPRE as carregue explicitamente via tags CDN (<link> ou <script src="...">) dentro do <head> de /index.html.

3. Política Estrita de Comentários:
   - Adicione comentários com moderação extrema, focando apenas no PORQUÊ de cálculos físicos complexos.
   - NUNCA dialogue com o usuário através de comentários no código.

4. Proatividade e Completude Funcional (Sem Placeholders):
   - Entregue soluções 100% completas, operacionais e funcionais de ponta a ponta.
   - É ESTRITAMENTE PROIBIDO deixar "// TODO: implementar depois", "// adicione sua lógica aqui", reticências ou stubs vazios.
   - Implemente manipuladores de clique, teclado, renderização canvas e tratamento de colisões.

5. Autonomia em Aplicações de Arquivo Único (Single-File Web Apps):
   - Se o projeto for baseado em HTML ou o usuário pedir um jogo, componente ou página em arquivo único, consolide HTML, estilos em <style> e scripts em <script> diretamente dentro de /index.html.

# FERRAMENTAS DISPONÍVEIS (Harness Primitives)

1. list_files:
   <tool_call name="list_files">{}</tool_call>
   Lista todos os caminhos de arquivos disponíveis no projeto.

2. read_file:
   <tool_call name="read_file">{"path": "/index.html"}</tool_call>
   Lê o conteúdo de um arquivo.

3. write_file:
   <tool_call name="write_file">{"path": "/index.html", "content": "<!DOCTYPE html>..."}</tool_call>
   Cria um novo arquivo ou substitui um arquivo existente com o novo código funcional.

4. edit_file:
   <tool_call name="edit_file">{"path": "/index.html", "target_content": "trecho exato", "replacement_content": "novo trecho"}</tool_call>
   Aplica uma substituição cirúrgica no arquivo. O "target_content" DEVE corresponder ao conteúdo atual do arquivo.

# REGRAS DE CAMINHOS:
- Todos os caminhos de arquivos DEVEM ser absolutos no projeto virtual e começar com barra "/" (ex: "/index.html", "/App.tsx", "/src/styles.css").`;

export interface RunHarnessOptions {
  prompt: string;
  files: Record<string, string>;
  activeFile: string;
  model: string;
  chatHistory: { role: 'user' | 'assistant'; content: string }[];
  fileOps: HarnessFileOps;
  onChunk: (text: string, thoughts: string) => void;
  onAction: (action: HarnessAction) => void;
  onLiveWriting?: (path: string) => void;
  signal?: AbortSignal;
}

export async function runHarnessCycle({
  prompt,
  files,
  activeFile,
  model,
  chatHistory,
  fileOps,
  onChunk,
  onAction,
  onLiveWriting,
  signal,
}: RunHarnessOptions): Promise<{ finalResponse: string; actions: HarnessAction[] }> {
  let currentFiles = { ...files };
  const actions: HarnessAction[] = [];

  // Constrói o contexto inicial com os arquivos principais disponíveis
  const fileNames = Object.keys(currentFiles);
  const contextHeader = `[PROJETO ATUAL]
Arquivos existentes: ${fileNames.join(', ')}
Arquivo ativo no editor: ${activeFile}

Instrução do Usuário: ${prompt}

⚠️ REGRA CRÍTICA: Divida seu trabalho em passos incrementais menores. NUNCA tente gerar ou reescrever a aplicação inteira de uma só vez para não estourar os limites de tokens da API. Crie apenas a estrutura base inicial enxuta com write_file e use as iterações seguintes com edit_file para construir o restante passo a passo.`;

  // Limita o histórico pregresso para as últimas 3 mensagens e resume respostas antigas muito longas
  const recentChat = chatHistory.slice(-3);
  const history: { role: string; parts: any[] }[] = recentChat.map(m => {
    let content = m.content;
    if (m.role === 'assistant' && content.length > 600) {
      // Remove blocos de código extensos de mensagens antigas para poupar tokens preciosos
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

  // Loop agêntico (máximo de 6 iterações para evitar loops descontrolados)
  for (let iteration = 0; iteration < 6; iteration++) {
    if (signal?.aborted) break;

    const stream = streamGeminiContent(
      currentPrompt,
      model,
      history,
      HARNESS_SYSTEM_PROMPT,
      [],
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
              // Throttle a ~80ms para evitar estresse no React / CodeMirror e eliminar flicker
              const now = Date.now();
              if (now - lastLiveUpdate > 80) {
                lastLiveUpdate = now;
                fileOps.setFiles(prev => ({ ...prev, [targetPath]: liveCode }));
              }
            }
          }
        }
      }

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

    accumulatedFinalText += (accumulatedFinalText ? '\n\n' : '') + stepText;

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

    if (toolCalls.length === 0) {
      const activePath = activeFile || '/index.html';
      const mainContent = currentFiles[activePath] || '';
      const isDefaultPlaceholder =
        mainContent.includes('Pronto para criar') ||
        mainContent.includes('Descreva o que você deseja construir');
      const isBareSkeleton =
        mainContent.trim().length < 350 ||
        (!mainContent.includes('<script') && !mainContent.includes('<canvas') && !mainContent.includes('function'));
      const codeModifyingActions = actions.filter(
        a => a.type === 'write_file' || a.type === 'edit_file'
      );

      // Detecta se o modelo mencionou etapas pendentes (ex: "[Passo 1/7]" ou "Passo 1 de 4")
      const stepMentionMatch = stepText.match(/\[?Passo\s+(\d+)\s*(?:\/|de)\s*(\d+)\]?/i);
      const hasPendingSteps = stepMentionMatch
        ? parseInt(stepMentionMatch[1], 10) < parseInt(stepMentionMatch[2], 10)
        : false;

      const isAppIncomplete =
        isDefaultPlaceholder ||
        isBareSkeleton ||
        codeModifyingActions.length === 0 ||
        hasPendingSteps;

      if (isAppIncomplete && iteration < 5) {
        console.warn(
          `[Harness] Iteração ${iteration}: Aplicação incompleta (isBare: ${isBareSkeleton}, isDefault: ${isDefaultPlaceholder}, codeActions: ${codeModifyingActions.length}, hasPending: ${hasPendingSteps}). Forçando continuação.`
        );

        const safePromptForHistory =
          currentPrompt.length > 2500
            ? currentPrompt.slice(0, 2500) + '\n...[resumo]'
            : currentPrompt;
        history.push({ role: 'user', parts: [{ text: safePromptForHistory }] });
        history.push({ role: 'model', parts: [{ text: stepText }] });

        currentPrompt = `⚠️ AVISO MANDATÓRIO: A aplicação no arquivo ${activePath} ainda está incompleta!
${isDefaultPlaceholder || isBareSkeleton ? 'O arquivo ainda não possui a lógica e as físicas implementadas (está vazio ou apenas com estrutura preliminar).' : ''}
${hasPendingSteps ? `Você anunciou a etapa ${stepMentionMatch![1]} de ${stepMentionMatch![2]}. Prossiga para a próxima etapa agora!` : ''}
Você DEVE OBRIGATORIAMENTE emitir a chamada de ferramenta nesta resposta para implementar o código:
<tool_call name="write_file">{"path": "${activePath}", "content": "<!DOCTYPE html>..."}</tool_call>
OU
<tool_call name="edit_file">{"path": "${activePath}", "target_content": "...", "replacement_content": "..."}</tool_call>`;
        continue;
      }

      // Conclusão legítima: código implementado e sem etapas pendentes
      break;
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
            if (content.length > 8000) {
              safeContent =
                content.slice(0, 4000) +
                `\n\n... [${content.length - 6000} caracteres omitidos para economizar tokens. O arquivo tem ${content.length} caracteres no total. Use edit_file com trechos conhecidos] ...\n\n` +
                content.slice(-2000);
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
          const newCode = parsedArgs.content || lastExtractedCode || '';
          currentFiles[path] = newCode;
          fileOps.setFiles(prev => ({ ...prev, [path]: newCode }));
          if (fileOps.openFile) fileOps.openFile(path);

          action.status = 'success';
          action.detail = `Arquivo ${path} salvo (${newCode.length} chars)`;
          toolResults.push(`[write_file resultado]: Arquivo ${path} criado/atualizado com sucesso (${newCode.length} caracteres).`);
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

            action.status = 'success';
            action.detail = `Substituição aplicada em ${path}`;
            action.diff = { targetContent: target, replacementContent: replacement };
            toolResults.push(`[edit_file resultado]: Trecho em ${path} substituído com sucesso.`);
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
      onAction({ ...action });
    }

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

    currentPrompt = `[RESULTADOS DAS FERRAMENTAS EXECUTADAS]
${toolResults.join('\n\n')}

Estado atual do arquivo ${targetFile} (${currentCode.length} caracteres):
\`\`\`html
${codePreview}
\`\`\`

⚠️ PROSSIGA COM A PRÓXIMA ETAPA:
Continue implementando as funcionalidades restantes (física detalhada, controles, colisões, loop de jogo, placar ou polimento) via edit_file ou write_file.
NÃO pare agora. Chame a ferramenta na sua resposta para continuar construindo a aplicação até que ela esteja 100% jogável e completa. Se tudo já estiver concluído, envie sua mensagem final explicando os controles ao usuário.`;
  }

  // Remove os blocos de chamada de ferramentas e JSONs vazados do texto final
  const cleanedText = cleanHarnessDisplayText(accumulatedFinalText);

  return { finalResponse: cleanedText || 'Ações do projeto concluídas com sucesso.', actions };
}

