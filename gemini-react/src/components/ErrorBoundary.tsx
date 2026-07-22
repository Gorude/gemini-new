import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '../services/logger';

interface ErrorBoundaryProps {
  children: ReactNode;
  // Rótulo curto da área protegida (ex.: "LIVE", "Gráfico de memória"). Usado
  // no log e no fallback para o usuário saber o que falhou.
  label?: string;
  // Fallback customizado. Se ausente, usa o fallback padrão de tela cheia.
  fallback?: (error: Error, reset: () => void) => ReactNode;
  // Quando true, mostra um fallback compacto (para blocos internos, não a app toda).
  compact?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Captura erros de render na sub-árvore para evitar que o app inteiro fique em
 * tela branca. Loga no `logger` (mesma trilha da LogWindow) e oferece recuperação.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const where = this.props.label ? ` [${this.props.label}]` : '';
    logger.addLog('error', `Erro de renderização${where}: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  reset = () => this.setState({ error: null });

  private copyDetails = () => {
    const { error } = this.state;
    if (!error) return;
    const text = `${error.message}\n\n${error.stack || ''}`;
    navigator.clipboard?.writeText(text).catch(() => { /* ignora */ });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    const boxStyle: React.CSSProperties = {
      background: 'var(--bg-sidebar)',
      border: '1px solid var(--border-light)',
      color: 'var(--text-primary)',
    };
    const btnStyle: React.CSSProperties = { background: 'var(--accent)', color: '#fff' };

    // Fallback compacto (bloco interno): não ocupa a tela toda.
    if (this.props.compact) {
      return (
        <div className="m-3 p-4 rounded-2xl text-sm" style={boxStyle}>
          <div className="font-bold mb-1">
            Algo deu errado{this.props.label ? ` em "${this.props.label}"` : ''}.
          </div>
          <div className="text-xs opacity-70 mb-3 break-words">{error.message}</div>
          <div className="flex gap-2">
            <button onClick={this.reset} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={btnStyle}>
              Tentar novamente
            </button>
            <button onClick={this.copyDetails} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-(--border-light)">
              Copiar detalhes
            </button>
          </div>
        </div>
      );
    }

    // Fallback de tela cheia (app inteira).
    return (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-6"
        style={{ background: 'var(--bg-main)' }}
      >
        <div className="w-full max-w-md rounded-3xl p-6 shadow-2xl" style={boxStyle}>
          <h1 className="text-lg font-black mb-2" style={{ color: 'var(--accent-text)' }}>
            Ops — algo deu errado
          </h1>
          <p className="text-sm opacity-80 mb-1">
            O aplicativo encontrou um erro inesperado{this.props.label ? ` em "${this.props.label}"` : ''}.
            Você pode tentar recarregar; suas conversas ficam salvas.
          </p>
          <pre className="text-[11px] opacity-60 whitespace-pre-wrap break-words max-h-40 overflow-auto my-3 p-2 rounded-lg" style={{ background: 'var(--bg-main)' }}>
            {error.message}
          </pre>
          <div className="flex gap-2">
            <button onClick={() => window.location.reload()} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold" style={btnStyle}>
              Recarregar
            </button>
            <button onClick={this.copyDetails} className="px-4 py-2.5 rounded-xl text-sm font-bold border border-(--border-light)">
              Copiar detalhes
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
