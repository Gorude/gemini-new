import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Send, X, ShieldCheck } from 'lucide-react';

interface SelectionPopupProps {
  text: string;
  position: { x: number; y: number };
  onClose: () => void;
  onFactCheck: (text: string) => void;
  onAsk: (text: string, question: string) => void;
  theme: string;
  isChecking?: boolean;
}

const SelectionPopup: React.FC<SelectionPopupProps> = ({ 
  text, 
  position, 
  onClose, 
  onFactCheck, 
  onAsk,
  theme,
  isChecking = false
}) => {
  const [question, setQuestion] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 200);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim()) {
      onAsk(text, question.trim());
      handleClose();
    }
  };

  // Ajustar posição para não sair da tela
  const adjustedX = Math.min(position.x, window.innerWidth - 380);
  const adjustedY = Math.min(position.y, window.innerHeight - 100);

  return createPortal(
    <div 
      ref={popupRef}
      className={`fixed z-[9999] rounded-full border border-[var(--border-light)] shadow-2xl backdrop-blur-xl transition-all duration-200 animate-in zoom-in-95 fade-in duration-200 ${
        isClosing ? 'animate-out zoom-out-95 fade-out' : ''
      }`}
      style={{ 
        left: adjustedX, 
        top: adjustedY,
        background: theme === 'claro' 
          ? 'rgba(255, 255, 255, 0.95)' 
          : 'rgba(15, 15, 15, 0.9)',
      }}
    >
      <div className="flex items-center gap-1.5 p-1 pb-1 pl-4 pr-1">
        <form onSubmit={handleSubmit} className="flex items-center gap-0.5 min-w-[220px]">
          <input 
            autoFocus
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Perguntar ao Nemon..."
            className="bg-transparent border-none text-[11px] text-[var(--text-primary)] focus:ring-0 placeholder:text-[var(--text-placeholder)] py-1.5 w-full"
          />
          <div className="flex items-center gap-0.5">
            <button 
              type="button"
              onClick={() => { onFactCheck(text); handleClose(); }}
              className="p-1.5 text-[var(--accent-text)] hover:bg-[var(--accent-bg)] rounded-full transition-all group"
              title="Checar Fato"
            >
              <ShieldCheck className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </button>
            <button 
              type="submit"
              disabled={!question.trim() || isChecking}
              className="p-1.5 text-[var(--accent-text)] hover:bg-[var(--accent-bg)] rounded-full disabled:opacity-30 transition-all"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        <div className="w-px h-4 bg-[var(--border-light)] opacity-20 mx-0.5"></div>

        <button 
          onClick={handleClose} 
          className="p-1.5 hover:bg-white/5 rounded-full transition-colors text-[var(--text-placeholder)]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>,
    document.body
  );
};

export default SelectionPopup;
