import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, MessageSquare, Send, X, ShieldCheck, Loader2 } from 'lucide-react';

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
      <div className="flex items-center gap-1.5 p-1.5 pl-3">
        {/* Fact Check Button */}
        <button 
          onClick={() => { onFactCheck(text); handleClose(); }}
          className="flex items-center gap-2 px-3 py-2 rounded-full transition-all group hover:bg-blue-500/10 text-blue-400"
          title="Checar Fato"
        >
          <ShieldCheck className="w-4 h-4 group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-bold uppercase tracking-wider">
            Checar Fato
          </span>
        </button>

        {/* Separator */}
        <div className="w-px h-6 bg-[var(--border-light)] mx-1"></div>

        {/* Ask Input */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 pr-2 min-w-[180px]">
          <input 
            autoFocus
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Perguntar ao Gemoro..."
            className="bg-transparent border-none text-[11px] text-[var(--text-primary)] focus:ring-0 placeholder:text-[var(--text-placeholder)] py-1.5 w-full"
          />
          <button 
            type="submit"
            disabled={!question.trim() || isChecking}
            className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-full disabled:opacity-30 transition-all"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>

        {/* Close */}
        <button 
          onClick={handleClose} 
          className="p-1.5 mr-1 hover:bg-white/5 rounded-full transition-colors text-[var(--text-placeholder)]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>,
    document.body
  );
};

export default SelectionPopup;
