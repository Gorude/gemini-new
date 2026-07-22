import { type Message } from '../services/gemini';

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  pinned?: boolean;
  archived?: boolean;
  isNaming?: boolean;
  personalityId?: string;
  // Tokens exatos do último turno (prompt + resposta) retornados pela API. Usado
  // como base precisa do indicador de contexto por chat.
  contextTokens?: number;
  // Modelo LLM associado a esta conversa. Ausente = usa o padrão ao abrir.
  model?: string;
  // Pasta à qual a conversa pertence (F5). Ausente = "Sem pasta".
  folderId?: string;
}

// Pasta para organizar conversas na sidebar (F5).
export interface Folder {
  id: string;
  name: string;
}

// Skill (habilidade) reutilizável: um template de prompt (kind='prompt') ou uma
// ferramenta embutida (kind='tool'). Templates são inseridos por "/" no chat;
// ferramentas são ativadas por conversa (tool calling).
export interface Skill {
  id: string;
  name: string;
  description?: string;
  kind: 'prompt' | 'tool';
  // kind='prompt': texto do template. Suporta {{input}} (substituído pelo texto digitado).
  prompt?: string;
  // kind='tool': id da ferramenta embutida (ex.: 'calculate', 'get_weather').
  toolId?: string;
}

export interface ModelUsage {
  requests: number;
  tokens: { prompt: number, candidates: number, total: number };
}

export interface DailyUsage {
  date: string;
  models: Record<string, ModelUsage>;
}

export interface ImagenFile {
  name: string;
  data: string;
  mimeType: string;
}

export interface PendingFile {
  name: string;
  data: string;
  mimeType: string;
}

export interface Personality {
  id: string;
  name: string;
  prompt: string;
  // Voz padrão do modo LIVE para esta personalidade. Ao ativá-la, a voz é
  // aplicada automaticamente. Vazio/ausente = mantém a voz atual.
  voice?: string;
}

export interface MemoryFact {
  id: string;
  text: string;
  category: string;
  connections: string[];
  timestamp: number;
}

export interface PendingMemoryUpdate {
  id: string;
  category: string;
  oldText: string;
  newText: string;
}
