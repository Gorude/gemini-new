import React, { useState, useEffect, useRef } from 'react';

interface ChatRulerProps {
  margin: number;
  onMarginChange: (margin: number) => void;
}

const ChatRuler: React.FC<ChatRulerProps> = ({ margin, onMarginChange }) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const [activeHandle, setActiveHandle] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!activeHandle || !rulerRef.current) return;

      const rect = rulerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let percentage = (x / rect.width) * 100;
      
      let finalMargin = 0;
      if (activeHandle === 'left') {
        finalMargin = Math.max(0, Math.min(45, percentage));
      } else {
        const rightPercentage = 100 - percentage;
        finalMargin = Math.max(0, Math.min(45, rightPercentage));
      }
      
      onMarginChange(parseFloat(finalMargin.toFixed(2)));
    };

    const handleMouseUp = () => {
      setActiveHandle(null);
    };

    if (activeHandle) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeHandle, onMarginChange]);

  return (
    <div className="w-full flex justify-center bg-[var(--bg-main)]">
      <div 
        ref={rulerRef}
        className="relative h-6 w-full flex items-center opacity-30 hover:opacity-100 transition-opacity duration-300 select-none cursor-default group"
      >
        {/* The Ruler Line and Ticks */}
        <div className="absolute inset-x-0 bottom-1 h-[1px] bg-[var(--border-light)] mx-1"></div>
        {Array.from({ length: 51 }).map((_, i) => (
          <div 
            key={i} 
            className={`absolute bottom-1 w-[1px] bg-[var(--border-light)] ${i % 5 === 0 ? 'h-2' : 'h-1'}`}
            style={{ left: `${i * 2}%` }}
          >
            {i % 10 === 0 && i !== 0 && i !== 50 && (
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] text-[var(--text-placeholder)] font-mono">
                {i}
              </span>
            )}
          </div>
        ))}

        {/* Left Handle */}
        <div 
          onMouseDown={() => setActiveHandle('left')}
          className="absolute bottom-0 z-10 cursor-col-resize flex flex-col items-center transition-transform hover:scale-110 active:scale-95"
          style={{ left: `${margin}%`, transform: 'translateX(-50%)' }}
        >
          <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-indigo-500 mb-0.5 shadow-sm"></div>
          <div className="w-[2px] h-3 bg-indigo-500/50"></div>
        </div>

        {/* Right Handle */}
        <div 
          onMouseDown={() => setActiveHandle('right')}
          className="absolute bottom-0 z-10 cursor-col-resize flex flex-col items-center transition-transform hover:scale-110 active:scale-95"
          style={{ right: `${margin}%`, transform: 'translateX(50%)' }}
        >
          <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-indigo-500 mb-0.5 shadow-sm"></div>
          <div className="w-[2px] h-3 bg-indigo-500/50"></div>
        </div>
      </div>
    </div>
  );
};

export default ChatRuler;
