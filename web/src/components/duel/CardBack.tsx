import React from 'react';

export interface CardBackProps {
  variant?: 'default' | 'shield' | 'compact';
  className?: string;
  title?: string;
  'data-vfx-id'?: string;
  children?: React.ReactNode;
}

/**
 * Bespoke ornate SVG Duel Masters card back replacing generic text placeholders.
 * Renders razor-sharp at miniature opponent hand scale through full deck/modal scale.
 */
export const CardBack: React.FC<CardBackProps> = ({
  variant = 'default',
  className = '',
  title,
  'data-vfx-id': vfxId,
  children
}) => {
  const isShield = variant === 'shield';
  const isCompact = variant === 'compact';

  const frameGradient = isShield
    ? 'from-slate-950 via-cyan-950/90 to-slate-950 border-cyan-400/50'
    : 'from-[#0d1326] via-[#131a35] to-[#080c19] border-amber-500/45';

  const ringColor = isShield ? '#38bdf8' : '#f59e0b';
  const coreColor = isShield ? '#0284c7' : '#d97706';

  return (
    <div
      data-vfx-id={vfxId}
      title={title}
      className={`relative aspect-[491/682] rounded-md overflow-hidden bg-gradient-to-br border shadow-md select-none flex items-center justify-center ${frameGradient} ${className}`}
    >
      {/* Ornate Filigree Card Back Vector Artwork */}
      <svg
        viewBox="0 0 100 140"
        className="absolute inset-0 w-full h-full pointer-events-none"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={isShield ? 'dm-back-shield' : 'dm-back-core'} cx="50%" cy="50%" r="52%">
            <stop offset="0%" stopColor={coreColor} stopOpacity="0.45" />
            <stop offset="55%" stopColor="#1e1b4b" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#050814" stopOpacity="0.95" />
          </radialGradient>
        </defs>

        <rect width="100" height="140" fill={isShield ? 'url(#dm-back-shield)' : 'url(#dm-back-core)'} />

        {/* Inner gold/cyan hairline filigree frame */}
        <rect
          x="5"
          y="5"
          width="90"
          height="130"
          rx="5"
          fill="none"
          stroke={ringColor}
          strokeOpacity="0.45"
          strokeWidth="1.2"
        />
        {!isCompact && (
          <rect
            x="9"
            y="9"
            width="82"
            height="122"
            rx="3"
            fill="none"
            stroke={ringColor}
            strokeOpacity="0.22"
            strokeWidth="0.7"
            strokeDasharray="3 2"
          />
        )}

        {/* Corner runes */}
        <path d="M5 18 L18 5 M82 5 L95 18 M5 122 L18 135 M82 135 L95 122" stroke={ringColor} strokeOpacity="0.55" strokeWidth="1" />

        {/* Central Astrolabe Vortex */}
        <circle cx="50" cy="70" r="28" fill="none" stroke={ringColor} strokeOpacity="0.45" strokeWidth="1.2" />
        <circle cx="50" cy="70" r="21" fill="none" stroke="#38bdf8" strokeOpacity="0.3" strokeWidth="0.8" strokeDasharray="2 2" />
        <polygon
          points="50,36 58,62 84,70 58,78 50,104 42,78 16,70 42,62"
          fill={ringColor}
          fillOpacity="0.18"
          stroke={ringColor}
          strokeOpacity="0.75"
          strokeWidth="1"
        />
        <circle cx="50" cy="70" r="8" fill={coreColor} fillOpacity="0.65" stroke="#fde68a" strokeOpacity="0.8" strokeWidth="1" />

        {/* 5 Civilization Star Pips around outer orbit (omitted on miniature hand backs to stay crisp) */}
        {!isCompact && (
          <>
            <circle cx="50" cy="24" r="3" fill="#facc15" fillOpacity="0.85" />
            <circle cx="80" cy="54" r="3" fill="#38bdf8" fillOpacity="0.85" />
            <circle cx="71" cy="103" r="3" fill="#c084fc" fillOpacity="0.85" />
            <circle cx="29" cy="103" r="3" fill="#f87171" fillOpacity="0.85" />
            <circle cx="20" cy="54" r="3" fill="#4ade80" fillOpacity="0.85" />
          </>
        )}
      </svg>

      {children}
    </div>
  );
};
