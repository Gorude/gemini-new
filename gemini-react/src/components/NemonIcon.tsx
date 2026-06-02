import React from 'react';

interface NemonIconProps {
  className?: string;
  size?: number | string;
}

const NemonIcon: React.FC<NemonIconProps> = ({ className = '', size = 24 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`nemon-icon ${className}`}
    >
      {/* Antenna Bulb */}
      <circle
        cx="50"
        cy="18"
        r="11"
        fill="var(--nemon-logo-fill, currentColor)"
      />

      {/* Antenna Shaft */}
      <rect
        x="46"
        y="24"
        width="8"
        height="20"
        fill="var(--nemon-logo-fill, currentColor)"
      />

      {/* Head Rect */}
      <rect
        x="18"
        y="42"
        width="64"
        height="50"
        stroke="var(--nemon-logo-stroke, currentColor)"
        strokeWidth="6"
        fill="var(--nemon-logo-bg, transparent)"
      />

      {/* Eyes */}
      <circle
        cx="36"
        cy="67"
        r="14"
        fill="var(--nemon-logo-fill, currentColor)"
      />
      <circle
        cx="64"
        cy="67"
        r="14"
        fill="var(--nemon-logo-fill, currentColor)"
      />
    </svg>
  );
};

export default NemonIcon;
