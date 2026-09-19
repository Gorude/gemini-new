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
        padding: 2.5rem 2rem;
        border-radius: 8px;
        background: #121216;
        border: 1px solid #27272a;
        box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
      }
      .icon-box {
        width: 3.5rem;
        height: 3.5rem;
        border-radius: 6px;
        background: #1c1c24;
        border: 1px solid #3f3f46;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1.25rem;
        color: #ffffff;
      }
      h1 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: -0.02em; color: #ffffff; }
      p { color: #a1a1aa; font-size: 0.8125rem; line-height: 1.6; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon-box">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"></polyline>
          <polyline points="8 6 2 12 8 18"></polyline>
        </svg>
      </div>
      <h1>Workspace Pronto</h1>
      <p>Descreva o que deseja construir no assistente ao lado para gerar sua aplicação em tempo real com live preview.</p>
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

