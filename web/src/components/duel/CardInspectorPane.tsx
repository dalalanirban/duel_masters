import React from 'react';
import type { CardDefinition, Civilization } from '../../types/card';
import { CivilizationIcon } from '../card/CivilizationIcon';
import {
  Swords,
  User,
  Bot,
  Sparkles,
  Info,
  Eye
} from 'lucide-react';

export interface CardInspectorPaneProps {
  inspectedCard: CardDefinition | null;
  turn: number;
  activePlayer: 'player' | 'opponent';
  phase: string;
  playerDeckName: string;
  opponentDeckName: string;
  className?: string;
}

const getCivilizationBadgeStyle = (civ: Civilization): string => {
  switch (civ) {
    case 'Light':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
    case 'Water':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/40';
    case 'Darkness':
      return 'bg-purple-500/15 text-purple-300 border-purple-500/40';
    case 'Fire':
      return 'bg-red-500/15 text-red-300 border-red-500/40';
    case 'Nature':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
    default:
      return 'bg-slate-800 text-slate-300 border-slate-700';
  }
};

const getPhaseBadgeInfo = (phase: string) => {
  switch (phase) {
    case 'START_OF_TURN':
      return { label: 'START', className: 'bg-slate-800 text-slate-300 border-slate-700' };
    case 'DRAW':
      return { label: 'DRAW', className: 'bg-blue-500/15 text-blue-300 border-blue-500/40' };
    case 'MANA_CHARGE':
      return { label: 'MANA CHARGE', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' };
    case 'MAIN':
      return { label: 'MAIN PHASE', className: 'bg-sky-500/15 text-sky-300 border-sky-500/40' };
    case 'ATTACK':
      return { label: 'ATTACK PHASE', className: 'bg-red-500/15 text-red-300 border-red-500/40' };
    case 'END_OF_TURN':
      return { label: 'END TURN', className: 'bg-slate-800 text-slate-300 border-slate-700' };
    default:
      return { label: phase.replace(/_/g, ' '), className: 'bg-slate-800 text-slate-300 border-slate-700' };
  }
};

export const CardInspectorPane: React.FC<CardInspectorPaneProps> = ({
  inspectedCard,
  turn,
  activePlayer,
  phase,
  playerDeckName,
  opponentDeckName,
  className = ''
}) => {
  const isPlayerTurn = activePlayer === 'player';
  const phaseInfo = getPhaseBadgeInfo(phase);

  const isEvolution = Boolean(
    inspectedCard?.isEvolution || inspectedCard?.type === 'Evolution Creature'
  );
  const isMultiCiv = Boolean(
    inspectedCard?.isMultiCiv || (inspectedCard?.civilizations && inspectedCard.civilizations.length > 1)
  );

  const imageSrc = inspectedCard
    ? (inspectedCard.imageAssetPath ? `/${inspectedCard.imageAssetPath}` : inspectedCard.imageUrl)
    : null;

  // Extract evolution bait rule if applicable
  const evoMatch = inspectedCard?.rulesText?.match(/Evolution[—\-]([^\n\.]+)/i);
  const evoRequirement = inspectedCard
    ? (inspectedCard.evolutionRaces && inspectedCard.evolutionRaces.length > 0)
      ? `Put on one of your ${inspectedCard.evolutionRaces.join(' or ')}.`
      : evoMatch
        ? `${evoMatch[1].trim()}.`
        : (inspectedCard.races && inspectedCard.races.length > 0)
          ? `Put on one of your ${inspectedCard.races.join(' or ')}.`
          : null
    : null;

  return (
    <aside
      className={`w-full h-full flex flex-col bg-slate-900/95 border-r border-slate-800 text-slate-100 select-none overflow-hidden ${className}`}
      aria-label="Card Inspector & Match Status"
    >
      {/* ================= 1. TOP MATCH STATUS CARD ================= */}
      <section className="shrink-0 bg-slate-950/80 border-b border-slate-800/90 p-3 space-y-2.5">
        {/* Match Header: Turn number & Active Player indicator */}
        <div className="flex items-center justify-between gap-2">
          {/* Stylized Turn Badge */}
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-400 font-cinzel font-black text-xs tracking-wider shadow-sm">
              T{turn}
            </span>
            <span className="text-[11px] font-mono text-slate-400 font-medium">
              Turn {turn}
            </span>
          </div>

          {/* Active Player Indicator */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border shadow-sm transition-colors ${
              isPlayerTurn
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isPlayerTurn ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400 animate-pulse'
              }`}
            />
            {isPlayerTurn ? (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" /> Player's Turn
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Bot className="w-3 h-3" /> Opponent's Turn
              </span>
            )}
          </div>
        </div>

        {/* Phase Badge */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
            Current Phase
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border ${phaseInfo.className}`}
          >
            {phaseInfo.label}
          </span>
        </div>

        {/* Decks Matchup Summary */}
        <div className="flex items-center justify-between text-xs bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-800">
          <div className="flex items-center gap-1.5 min-w-0 max-w-[44%]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span
              className="font-medium text-slate-200 truncate text-[11px]"
              title={playerDeckName}
            >
              {playerDeckName}
            </span>
          </div>

          <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-mono font-bold text-amber-500/90 px-1 shrink-0">
            <Swords className="w-3 h-3 text-amber-400" />
            <span>VS</span>
          </div>

          <div className="flex items-center gap-1.5 min-w-0 max-w-[44%] justify-end">
            <span
              className="font-medium text-slate-200 truncate text-[11px] text-right"
              title={opponentDeckName}
            >
              {opponentDeckName}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
          </div>
        </div>
      </section>

      {/* ================= 2. CARD INSPECTOR BODY ================= */}
      {inspectedCard ? (
        <section className="flex-1 min-h-0 flex flex-col overflow-hidden animate-fade-in">
          {/* Section Header */}
          <div className="shrink-0 px-3 py-1.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="font-cinzel font-bold text-amber-400 flex items-center gap-1.5 tracking-wider">
              <Eye className="w-3.5 h-3.5" /> CARD INSPECTION
            </span>
            <span className="font-mono text-[10px] text-slate-500 font-medium">
              #{inspectedCard.collectorNumber}
            </span>
          </div>

          {/* Scrollable Card Details */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
            {/* Card Artwork Image */}
            <div className="flex justify-center items-center">
              <div className="relative w-full aspect-[491/682] max-w-[190px] rounded-xl overflow-hidden shadow-2xl border-2 border-slate-700/80 bg-slate-950 transition-transform">
                <img
                  src={imageSrc || ''}
                  alt={inspectedCard.name}
                  loading="lazy"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (inspectedCard.imageUrl && target.src !== inspectedCard.imageUrl) {
                      target.src = inspectedCard.imageUrl;
                    }
                  }}
                />
              </div>
            </div>

            {/* Card Title & Meta Header */}
            <div>
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700 font-bold">
                  {inspectedCard.id}
                </span>
                <span className="text-[10px] text-slate-300 font-mono bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700">
                  {inspectedCard.set}
                </span>
                <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {inspectedCard.rarity}
                </span>
              </div>

              <h3 className="text-base font-cinzel font-bold text-white tracking-wide leading-snug">
                {inspectedCard.name}
              </h3>
            </div>

            {/* Civilizations Badges with Icons */}
            <div className="flex flex-wrap gap-1.5 items-center">
              {inspectedCard.civilizations.map((civ) => (
                <span
                  key={civ}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${getCivilizationBadgeStyle(
                    civ
                  )}`}
                >
                  <CivilizationIcon civilization={civ} className="w-3.5 h-3.5" />
                  <span>{civ}</span>
                </span>
              ))}
            </div>

            {/* Key Mechanics Badges */}
            {(inspectedCard.isShieldTrigger ||
              inspectedCard.isBlocker ||
              inspectedCard.isSlayer ||
              inspectedCard.isSpeedAttacker ||
              isEvolution ||
              inspectedCard.isSurvivor ||
              inspectedCard.isCharger ||
              inspectedCard.breakerCount >= 2 ||
              isMultiCiv) && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {inspectedCard.isShieldTrigger && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40">
                    ⚡ Shield Trigger
                  </span>
                )}
                {inspectedCard.isBlocker && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/40">
                    🛡 Blocker
                  </span>
                )}
                {inspectedCard.isSlayer && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/40">
                    ☠ Slayer
                  </span>
                )}
                {inspectedCard.isSpeedAttacker && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/15 text-red-300 border border-red-500/40">
                    💨 Speed Attacker
                  </span>
                )}
                {isEvolution && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-400/50">
                    ⚡ Evolution
                  </span>
                )}
                {inspectedCard.isSurvivor && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-500/15 text-teal-300 border border-teal-500/40">
                    👥 Survivor
                  </span>
                )}
                {inspectedCard.isCharger && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/40">
                    🔋 Charger
                  </span>
                )}
                {inspectedCard.breakerCount >= 2 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/40">
                    ⚔ {inspectedCard.breakerCount === 2
                      ? 'Double Breaker'
                      : inspectedCard.breakerCount === 3
                      ? 'Triple Breaker'
                      : `${inspectedCard.breakerCount}x Breaker`}
                  </span>
                )}
                {isMultiCiv && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-gradient-to-r from-amber-500/20 to-sky-500/20 text-amber-200 border border-amber-400/40">
                    🌐 Multi-Civ
                  </span>
                )}
              </div>
            )}

            {/* Quick Stats Grid: Cost, Type, Power */}
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {/* Mana Cost */}
              <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800 flex flex-col justify-center">
                <span className="text-[9px] uppercase font-bold tracking-wider text-slate-500">
                  Cost
                </span>
                <span className="text-sm font-bold text-amber-400 font-mono mt-0.5">
                  {inspectedCard.manaCost}
                </span>
              </div>

              {/* Type */}
              <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800 flex flex-col justify-center">
                <span className="text-[9px] uppercase font-bold tracking-wider text-slate-500">
                  Type
                </span>
                <span
                  className="text-[11px] font-semibold text-slate-200 truncate mt-0.5"
                  title={inspectedCard.type}
                >
                  {inspectedCard.type === 'Evolution Creature' ? 'Evolution' : inspectedCard.type}
                </span>
              </div>

              {/* Power (if creature/evolution or power is present) */}
              <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800 flex flex-col justify-center">
                <span className="text-[9px] uppercase font-bold tracking-wider text-slate-500">
                  Power
                </span>
                <span className="text-sm font-bold text-amber-300 font-mono mt-0.5">
                  {inspectedCard.power !== null ? (
                    <>
                      {inspectedCard.power}
                      {inspectedCard.powerAttackerBonus > 0 && (
                        <span className="text-red-400 text-[10px] ml-0.5 font-sans font-bold">
                          +{inspectedCard.powerAttackerBonus}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-600 text-xs">—</span>
                  )}
                </span>
              </div>
            </div>

            {/* Race(s) */}
            {inspectedCard.races && inspectedCard.races.length > 0 && (
              <div className="bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800/80 flex items-center gap-1.5 text-xs">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Race:
                </span>
                <span className="text-amber-200/90 italic truncate text-[11px] font-medium">
                  {inspectedCard.races.join(' / ')}
                </span>
              </div>
            )}

            {/* Evolution Requirement Callout */}
            {isEvolution && evoRequirement && (
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 space-y-0.5">
                <div className="text-[9px] font-bold uppercase tracking-wider text-amber-400">
                  Evolution Bait
                </div>
                <div className="leading-snug">{evoRequirement}</div>
              </div>
            )}

            {/* Rules & Abilities Text */}
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <Info className="w-3 h-3 text-amber-400" /> Abilities & Text
              </div>

              {inspectedCard.rulesText ? (
                <div className="space-y-1.5 text-[11px] text-slate-200 leading-relaxed font-sans">
                  {inspectedCard.rulesText
                    .split('\n')
                    .map((l) => l.trim())
                    .filter(Boolean)
                    .map((line, idx) => {
                      const isBullet =
                        line.startsWith('■') ||
                        line.startsWith('•') ||
                        line.startsWith('-');
                      const cleanLine = isBullet
                        ? line.replace(/^[■•\-]\s*/, '')
                        : line;
                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-1.5 ${
                            isBullet ? 'pl-0.5' : ''
                          }`}
                        >
                          {isBullet ? (
                            <span className="text-amber-400 text-[10px] shrink-0 select-none mt-0.5 font-bold">
                              ◆
                            </span>
                          ) : null}
                          <span className="flex-1">{cleanLine}</span>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">
                  No abilities (Vanilla creature).
                </p>
              )}
            </div>

            {/* Flavor Text Lore */}
            {inspectedCard.flavorText && (
              <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80 text-[11px] italic text-slate-400 leading-relaxed">
                <div className="flex items-center gap-1 text-[9px] font-bold uppercase not-italic tracking-wider text-slate-500 mb-1">
                  <Sparkles className="w-2.5 h-2.5 text-amber-400/80" /> Flavor
                </div>
                "{inspectedCard.flavorText}"
              </div>
            )}

            {/* Illustrator note */}
            {inspectedCard.illustrator && (
              <div className="text-[10px] text-slate-500 pt-1 text-center font-mono">
                Illus. {inspectedCard.illustrator}
              </div>
            )}
          </div>
        </section>
      ) : (
        /* ================= 3. EMPTY PLACEHOLDER ================= */
        <section className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 text-center text-slate-400 overflow-y-auto custom-scrollbar">
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-amber-500/10 rounded-full blur-xl scale-150 animate-pulse pointer-events-none" />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-amber-500/30 flex items-center justify-center shadow-xl shadow-black/80">
              <Eye className="w-7 h-7 text-amber-400/80" />
            </div>
          </div>

          <h3 className="font-cinzel font-bold text-sm text-slate-200 tracking-wide mb-2">
            Card Inspector
          </h3>

          <p className="text-xs text-slate-400 leading-relaxed max-w-[210px]">
            Hover over any card or click a card name in the duel log to inspect its full details, power, and abilities.
          </p>

          <div className="mt-6 flex flex-col gap-2 w-full max-w-[210px] text-[11px] text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 text-left">
            <div className="flex items-center gap-1.5 text-slate-300 font-bold text-[10px] uppercase tracking-wider">
              <Info className="w-3 h-3 text-amber-400/80 shrink-0" />
              <span>Inspection Tips</span>
            </div>
            <div className="flex items-start gap-1.5 text-slate-400 text-[10px]">
              <span className="text-amber-400 font-bold">•</span>
              <span>Hover cards in hand, battle zone, or mana zone for instant preview</span>
            </div>
            <div className="flex items-start gap-1.5 text-slate-400 text-[10px]">
              <span className="text-amber-400 font-bold">•</span>
              <span>Click card tags in action history to view full mechanics</span>
            </div>
          </div>
        </section>
      )}
    </aside>
  );
};
