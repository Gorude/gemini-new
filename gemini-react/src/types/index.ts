import { type Message } from '../services/gemini';

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  pinned?: boolean;
  archived?: boolean;
  isNaming?: boolean;
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
