import type { PendingFile } from './index';

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
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background-color: #09090b;
        color: #f4f4f5;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: system-ui, -apple-system, sans-serif;
        padding: 1rem;
      }
      .card {
        max-width: 28rem;
        width: 100%;
        text-align: center;
        padding: 2rem;
        border-radius: 1rem;
        background: rgba(24, 24, 27, 0.6);
        border: 1px solid #27272a;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        backdrop-filter: blur(4px);
      }
      .icon-box {
        width: 3rem;
        height: 3rem;
        border-radius: 0.75rem;
        background: linear-gradient(to top right, #f59e0b, #ea580c);
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1rem;
        font-size: 1.25rem;
      }
      h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: -0.025em; }
      p { color: #a1a1aa; font-size: 0.875rem; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon-box">✨</div>
      <h1>Pronto para criar</h1>
      <p>Descreva o que você deseja construir no chat ao lado para gerar sua aplicação em tempo real.</p>
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
  status: 'pending' | 'success' | 'error' | 'warning';
  error?: string;
  diff?: {
    targetContent?: string;
    replacementContent?: string;
    oldContent?: string;
    newContent?: string;
    isFullRewrite?: boolean;
  };
}

export interface HarnessStepBlock {
  id: string;
  stepNumber: number;
  totalSteps?: number;
  title?: string;
  thoughts?: string;
  content?: string;
  actions: HarnessAction[];
  status: 'running' | 'completed' | 'error';
  timestamp: number;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  files?: PendingFile[];
  thoughts?: string;
  actions?: HarnessAction[];
  steps?: HarnessStepBlock[];
  timestamp: number;
}

