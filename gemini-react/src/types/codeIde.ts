export type ProjectTemplate = 'react-ts' | 'react' | 'vanilla-ts' | 'vanilla' | 'html' | 'vue-ts';

export interface CodeProject {
  id: string;
  name: string;
  template: ProjectTemplate;
  files: Record<string, string>;
  activeFile: string;
  createdAt: number;
  updatedAt: number;
}

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
