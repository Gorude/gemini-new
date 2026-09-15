import React from 'react';

export interface NemonIconProps {
  className?: string;
  size?: number | string;
  /**
   * Quando true, ativa a animação contínua de geração:
   * A fatia laranja se afasta e volta, e então o anel gira 90° no sentido horário em loop.
   */
  animated?: boolean;
  /**
   * Quando true (padrão), usa o visual original oficial da marca:
   * corpo maior branco e fatia solta laranja vivo.
   * Quando false, a parte maior acompanha currentColor (útil se o ícone for exibido em texto/botão colorido).
   */
  themed?: boolean;
}

const NemonIcon: React.FC<NemonIconProps> = ({
  className = '',
  size = 24,
  animated = false,
  themed = true,
}) => {
  const mainFill = themed ? 'var(--nemon-logo-main, #FFFFFF)' : 'currentColor';
  const detachedFill = 'var(--nemon-logo-accent, #FF5500)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`nemon-icon ${animated ? 'nemon-icon-animated' : ''} ${className}`}
      style={{ overflow: 'visible' }}
    >
      <g className={`nemon-ring-group ${animated ? 'nemon-ring-spinning' : ''}`}>
        {/* Parte maior do círculo (270 graus): Branca */}
        <path
          className="nemon-main-arc"
          d="M 89.95 52 A 40 40 0 1 1 48 10.05 L 48 28.09 A 22 22 0 1 0 71.91 52 Z"
          fill={mainFill}
        />
        {/* Sessão solta (90 graus): Laranja vivo */}
        <g className={`nemon-detached-group ${animated ? 'nemon-detached-pulsing' : ''}`}>
          <path
            className="nemon-detached-arc"
            d="M 52 10.05 A 40 40 0 0 1 89.95 48 L 71.91 48 A 22 22 0 0 0 52 28.09 Z"
            fill={detachedFill}
          />
        </g>
      </g>
    </svg>
  );
};

export default NemonIcon;
