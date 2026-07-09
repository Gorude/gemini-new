export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'warn' | 'error' | 'api-request' | 'api-response' | 'api-error';
  message: string;
  details?: any;
}

type LogListener = (logs: LogEntry[]) => void;

class Logger {
  private logs: LogEntry[] = [];
  private listeners: Set<LogListener> = new Set();

  addLog(type: LogEntry['type'], message: string, details?: any) {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      details
    };
    this.logs.push(entry);
    
    // Limit log stack to prevent memory issues
    if (this.logs.length > 500) {
      this.logs.shift();
    }

    // Notifica os ouvintes fora do ciclo de render atual. Como console.* é
    // interceptado e roteado para cá, uma chamada de log durante o render de um
    // componente dispararia setState em outro (LogWindow) no meio do render,
    // gerando o aviso "Cannot update a component while rendering...".
    const snapshot = [...this.logs];
    queueMicrotask(() => {
      this.listeners.forEach(listener => listener(snapshot));
    });
  }

  subscribe(listener: LogListener) {
    this.listeners.add(listener);
    listener([...this.logs]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getLogs() {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
    this.listeners.forEach(listener => listener([]));
  }
}

export const logger = new Logger();
