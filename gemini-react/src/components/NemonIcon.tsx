import React from 'react';

interface NemonIconProps {
  className?: string;
  size?: number | string;
  /**
   * Quando true (padrão), usa as cores de marca do tema (--nemon-logo-*).
   * Quando false, herda a cor do contexto (currentColor) — ideal para os
   * ícones pequenos espalhados pela interface, que acompanham a cor do texto.
   */
  themed?: boolean;
}

const NemonIcon: React.FC<NemonIconProps> = ({ className = '', size = 24, themed = true }) => {
  const fill = themed ? 'var(--nemon-logo-fill, currentColor)' : 'currentColor';
  const stroke = themed ? 'var(--nemon-logo-stroke, currentColor)' : 'currentColor';
  const headFill = themed ? 'var(--nemon-logo-bg, transparent)' : 'transparent';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`nemon-icon ${className}`}
    >
      {/* Antena */}
      <circle cx="50" cy="12" r="7" fill={fill} />
      <rect x="46.5" y="17" width="7" height="15" rx="3.5" fill={fill} />

      {/* Cabeça arredondada */}
      <rect
        x="17"
        y="30"
        width="66"
        height="57"
        rx="17"
        ry="17"
        stroke={stroke}
        strokeWidth="7"
        strokeLinejoin="round"
        fill={headFill}
      />

      {/* Olhos */}
      <circle cx="37" cy="55" r="8.5" fill={fill} />
      <circle cx="63" cy="55" r="8.5" fill={fill} />

      {/* Boca / visor */}
      <rect x="38" y="71" width="24" height="6" rx="3" fill={fill} />
    </svg>
  );
};

export default NemonIcon;
