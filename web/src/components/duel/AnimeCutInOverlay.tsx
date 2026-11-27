import React from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import type { CutInSpec, VisualMode } from '../../presentation/types.ts';
import { getCivPalette } from '../../vfx/civColors.ts';
import { CivilizationIcon } from '../card/CivilizationIcon.tsx';

export interface AnimeCutInOverlayProps {
  cutIn: CutInSpec | null;
  beatId: string | null;
  visualMode: VisualMode;
}

/**
 * Dramatic anime-era cut-in slash overlay shown strictly in `Drama` mode during
 * Evolutions, >=6000 power summons, Shield Triggers, and Final Blows.
 */
export const AnimeCutInOverlay: React.FC<AnimeCutInOverlayProps> = ({
  cutIn,
  beatId,
  visualMode
}) => {
  const prefersReducedMotion = useReducedMotion();

  if (visualMode !== 'drama') return null;

  const palette = cutIn ? getCivPalette(cutIn.civilizations) : null;
  const imageSrc = cutIn
    ? cutIn.card.imageAssetPath
      ? `/${cutIn.card.imageAssetPath}`
      : cutIn.card.imageUrl
    : undefined;

  return (
    <AnimatePresence>
      {cutIn && beatId && palette && (
        <m.div
          key={beatId}
          data-testid="anime-cutin-overlay"
          data-cutin-kind={cutIn.kind}
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-0 z-[34] flex items-center justify-center overflow-hidden"
        >
          {/* Scrim Flash */}
          <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1.5px]" />

          {/* Diagonal Anime Energy Band */}
          <m.div
            initial={prefersReducedMotion ? { opacity: 0 } : { x: '-14%', skewX: -8 }}
            animate={{ x: '0%', skewX: -8 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { x: '16%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="relative w-[112%] py-3 sm:py-4 px-6 border-y-2 border-white/80 shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden"
            style={{
              boxShadow: `0 0 42px ${palette.primary.glowRgba}, inset 0 0 28px rgba(0,0,0,0.65)`
            }}
          >
            {/* Gradient Backdrop */}
            <div
              className={`absolute inset-0 bg-gradient-to-r ${palette.primary.gradientClass} opacity-95`}
            />

            {/* Procedural SVG Speed Lines */}
            <svg
              aria-hidden="true"
              viewBox="0 0 800 180"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full opacity-35 mix-blend-screen"
            >
              <g stroke="#ffffff" strokeLinecap="round">
                <line x1="-20" y1="22" x2="820" y2="22" strokeWidth="3" strokeDasharray="110 45 60 30" />
                <line x1="-40" y1="48" x2="820" y2="48" strokeWidth="1.5" strokeDasharray="70 30 140 50" />
                <line x1="0" y1="74" x2="820" y2="74" strokeWidth="4" strokeDasharray="160 65 80 40" />
                <line x1="-10" y1="108" x2="820" y2="108" strokeWidth="2" strokeDasharray="90 35 120 45" />
                <line x1="-30" y1="138" x2="820" y2="138" strokeWidth="3.5" strokeDasharray="130 55 70 35" />
                <line x1="20" y1="162" x2="820" y2="162" strokeWidth="1.5" strokeDasharray="85 40 95 25" />
              </g>
            </svg>

            {/* Un-skewed Content Row */}
            <div className="relative z-10 mx-auto max-w-3xl flex items-center justify-center gap-4 sm:gap-6 skew-x-[8deg]">
              {/* Real Card Scan Artwork Frame */}
              <m.div
                initial={prefersReducedMotion ? { opacity: 0 } : { x: -24, scale: 0.9 }}
                animate={{ x: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 460, damping: 28 }}
                className="relative w-20 h-28 sm:w-24 sm:h-[134px] aspect-[491/682] rounded-lg overflow-hidden border-2 border-white/90 shadow-2xl shrink-0 bg-slate-950"
              >
                {imageSrc && (
                  <img
                    src={imageSrc}
                    alt={cutIn.card.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (cutIn.card.imageUrl && target.src !== cutIn.card.imageUrl) {
                        target.src = cutIn.card.imageUrl;
                      }
                    }}
                  />
                )}
              </m.div>

              {/* Typography & Civilization Crest */}
              <div className="flex flex-col items-start text-left min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  {cutIn.civilizations.map((civ) => (
                    <span
                      key={civ}
                      className="p-1 rounded-full bg-slate-950/80 border border-white/40 shadow"
                    >
                      <CivilizationIcon civilization={civ} className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </span>
                  ))}
                  <span className="px-2 py-0.5 rounded bg-slate-950/80 border border-white/30 text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-amber-200">
                    {cutIn.kind.replace('_', ' ')}
                  </span>
                </div>

                <h2 className="font-cinzel font-black text-xl sm:text-3xl tracking-wider text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.85)] uppercase leading-tight">
                  {cutIn.title}
                </h2>

                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="font-cinzel font-bold text-sm sm:text-lg text-amber-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] truncate max-w-[260px] sm:max-w-[380px]">
                    {cutIn.subtitle}
                  </span>
                  {typeof cutIn.card.power === 'number' && (
                    <span className="px-2 py-0.5 rounded bg-slate-950/85 border border-amber-300/60 font-mono font-black text-xs sm:text-sm text-amber-300 tabular-nums shadow">
                      {cutIn.card.power} PWR
                    </span>
                  )}
                </div>
              </div>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
};
