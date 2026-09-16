export interface CodeProject {
  id: string;
  name: string;
  files: Record<string, string>;
  activeFile: string;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_PROJECT_FILES: Record<string, string> = {
  '/index.html': `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Minha Aplicação</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-zinc-950 text-zinc-100 min-h-screen flex flex-col items-center justify-center p-4 font-sans">
    <div class="max-w-md w-full text-center space-y-4 p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-2xl backdrop-blur-sm">
      <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center mx-auto text-xl shadow-lg">
        ✨
      </div>
      <h1 class="text-2xl font-bold tracking-tight">Pronto para criar</h1>
      <p class="text-zinc-400 text-sm">
        Descreva o que você deseja construir no chat ao lado para gerar sua aplicação em tempo real.
      </p>
    </div>
  </body>
</html>`
};

export type HarnessActionType = 'read_file' | 'write_file' | 'edit_file' | 'list_files' | 'run_preview';

export interface HarnessAction {
  id: string;
  type: HarnessActionType;
  path?: string;
  detail?: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
  diff?: {
    targetContent?: string;
    replacementContent?: string;
  };
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thoughts?: string;
  actions?: HarnessAction[];
  timestamp: number;
}
