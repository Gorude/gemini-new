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
 */
export function applyFileEdit(
  currentContent: string,
  targetContent: string,
  replacementContent: string
): { success: boolean; newContent?: string; error?: string } {
  if (!currentContent.includes(targetContent)) {
    // Normaliza quebras de linha para tentar casar se houver discrepância de CRLF/LF
    const normCurrent = currentContent.replace(/\r\n/g, '\n');
    const normTarget = targetContent.replace(/\r\n/g, '\n');
    if (!normCurrent.includes(normTarget)) {
      return {
        success: false,
        error: `O trecho original (targetContent) não foi encontrado no arquivo. Verifique se o conteúdo corresponde exatamente às linhas existentes.`
      };
    }
    const normReplacement = replacementContent.replace(/\r\n/g, '\n');
    const newContent = normCurrent.replace(normTarget, normReplacement);
    return { success: true, newContent };
  }

  const newContent = currentContent.replace(targetContent, replacementContent);
  return { success: true, newContent };
}

export const HARNESS_SYSTEM_PROMPT = `Você é o Agente de Código Nemon (Nemon Code Harness), um assistente de desenvolvimento integrado no estilo Pi CLI / VS Code.
Seu objetivo é ajudar o usuário a inspecionar, criar, depurar e refatorar código no projeto web virtual.

Você tem acesso a 4 ferramentas essenciais (Harness Primitives):

1. list_files:
   <tool_call name="list_files">{}</tool_call>
   Lista todos os arquivos do projeto.

2. read_file:
   <tool_call name="read_file">{"path": "/App.tsx"}</tool_call>
   Lê o código de um arquivo.

3. write_file:
   <tool_call name="write_file">{"path": "/src/NovoComponente.tsx", "content": "..."}</tool_call>
   Cria um novo arquivo ou substitui completamente um arquivo existente.

4. edit_file:
   <tool_call name="edit_file">{"path": "/App.tsx", "target_content": "texto exato a substituir", "replacement_content": "novo texto"}</tool_call>
   Aplica uma substituição cirúrgica no arquivo. O "target_content" DEVE ser idêntico a um trecho existente no arquivo.

DIRETRIZES DE EXECUÇÃO:
- Antes de editar um arquivo desconhecido, use sempre "read_file" para ler o código atual e garantir que suas edições sejam precisas.
- Você pode emitir múltiplos <tool_call> na mesma mensagem se precisar executar ações sequenciais.
- Após executar as ferramentas necessárias, forneça uma explicação concisa e amigável ao usuário sobre o que foi feito.
- Nunca invente caminhos; normalize sempre com barra inicial (ex: /App.tsx ou /styles.css).`;

export interface RunHarnessOptions {
  prompt: string;
  files: Record<string, string>;
  activeFile: string;
  model: string;
  chatHistory: { role: 'user' | 'assistant'; content: string }[];
  fileOps: HarnessFileOps;
  onChunk: (text: string, thoughts: string) => void;
  onAction: (action: HarnessAction) => void;
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
  signal,
}: RunHarnessOptions): Promise<{ finalResponse: string; actions: HarnessAction[] }> {
  let currentFiles = { ...files };
  const actions: HarnessAction[] = [];

  // Constrói o contexto inicial com os arquivos principais disponíveis
  const fileNames = Object.keys(currentFiles);
  const contextHeader = `[PROJETO ATUAL]
Arquivos existentes: ${fileNames.join(', ')}
Arquivo ativo no editor: ${activeFile}

Instrução do Usuário: ${prompt}`;

  const history: { role: string; parts: any[] }[] = chatHistory.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

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

    for await (const chunk of stream) {
      if (chunk.thoughts) {
        stepThoughts += chunk.thoughts;
        accumulatedThoughts += chunk.thoughts;
      }
      if (chunk.text) {
        stepText += chunk.text;
      }
      onChunk(stepText, accumulatedThoughts);
    }

    accumulatedFinalText += (accumulatedFinalText ? '\n\n' : '') + stepText;

    // Detecta chamadas de ferramentas <tool_call name="...">...</tool_call>
    const toolCallRegex = /<tool_call\s+name=["']([^"']+)["']>([\s\S]*?)<\/tool_call>/g;
    const toolCalls: { name: string; rawArgs: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = toolCallRegex.exec(stepText)) !== null) {
      toolCalls.push({ name: match[1], rawArgs: match[2].trim() });
    }

    if (toolCalls.length === 0) {
      // Nenhuma ferramenta solicitada, o modelo concluiu a resposta
      break;
    }

    // Executa as ferramentas e coleta os resultados
    const toolResults: string[] = [];

    for (const call of toolCalls) {
      const actionId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      let parsedArgs: any = {};
      try {
        parsedArgs = JSON.parse(call.rawArgs);
      } catch {
        parsedArgs = {};
      }

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
            toolResults.push(`[read_file resultado para ${path}]:\n\`\`\`\n${content}\n\`\`\``);
            if (fileOps.openFile) fileOps.openFile(path);
          } else {
            action.status = 'error';
            action.error = `Arquivo ${path} não encontrado.`;
            toolResults.push(`[read_file erro]: Arquivo ${path} não existe no projeto. Arquivos existentes: ${Object.keys(currentFiles).join(', ')}`);
          }
          break;
        }
        case 'write_file': {
          const path = action.path || normalizePath(parsedArgs.path || '');
          const newCode = parsedArgs.content || '';
          currentFiles[path] = newCode;
          fileOps.setFiles(prev => ({ ...prev, [path]: newCode }));
          if (fileOps.openFile) fileOps.openFile(path);

          action.status = 'success';
          action.detail = `Arquivo ${path} salvo (${newCode.length} chars)`;
          toolResults.push(`[write_file resultado]: Arquivo ${path} criado/atualizado com sucesso.`);
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

    // Alimenta o resultado de volta para o modelo para a próxima iteração
    history.push({ role: 'user', parts: [{ text: currentPrompt }] });
    history.push({ role: 'model', parts: [{ text: stepText }] });

    currentPrompt = `[RESULTADOS DAS FERRAMENTAS EXECUTADAS]\n${toolResults.join('\n\n')}\n\nContinue sua análise ou forneça a resposta final ao usuário se a tarefa foi concluída.`;
  }

  // Remove os blocos de chamada de ferramentas do texto final apresentado ao usuário
  const cleanedText = accumulatedFinalText
    .replace(/<tool_call[\s\S]*?<\/tool_call>/g, '')
    .trim();

  return { finalResponse: cleanedText || 'Ações do projeto concluídas com sucesso.', actions };
}
