import React from 'react';
import type { CardDefinition, Civilization } from '../../types/card';
import { CivilizationIcon } from '../card/CivilizationIcon';
import {
  User,
  Bot,
  Zap,
  Shield,
  Skull,
  Layers,
  Eye,
  Info
} from 'lucide-react';

export interface CardInspectorPaneProps {
  inspectedCard: CardDefinition | null;
  turn: number;
  activePlayer: 'player' | 'opponent';
  phase: string;
  playerDeckName?: string;
  opponentDeckName?: string;
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
      return { label: 'MANA', className: 'bg-amber-500/15 text-amber-300 border-amber-500/40' };
    case 'MAIN':
      return { label: 'MAIN', className: 'bg-sky-500/15 text-sky-300 border-sky-500/40' };
    case 'ATTACK':
      return { label: 'ATTACK', className: 'bg-red-500/15 text-red-300 border-red-500/40' };
    case 'END_OF_TURN':
      return { label: 'END', className: 'bg-slate-800 text-slate-300 border-slate-700' };
    default:
      return { label: phase.replace(/_/g, ' '), className: 'bg-slate-800 text-slate-300 border-slate-700' };
  }
};

export const CardInspectorPane: React.FC<CardInspectorPaneProps> = ({
  inspectedCard,
  turn,
  activePlayer,
  phase,
  className = ''
}) => {
  const isPlayerTurn = activePlayer === 'player';
  const phaseInfo = getPhaseBadgeInfo(phase);

  const isEvolution = Boolean(
    inspectedCard?.isEvolution || inspectedCard?.type === 'Evolution Creature'
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
      className={`w-full h-full flex flex-col bg-[#080b11] border-r border-slate-800/60 text-slate-100 select-none overflow-hidden ${className}`}
      aria-label="Card Inspector & Match Status"
    >
      {/* Match Status Header */}
      <section className="shrink-0 bg-slate-950/80 border-b border-slate-800/80 p-2">
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          {/* Turn Badge */}
          <span
            className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 font-cinzel font-bold text-xs tracking-wider shrink-0"
            title={`Turn ${turn}`}
          >
            TURN {turn}
          </span>

          {/* Active Player Indicator */}
          <div
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink min-w-0 truncate ${
              isPlayerTurn
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
            title={isPlayerTurn ? "Player's Turn" : "Opponent's Turn"}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isPlayerTurn ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400 animate-pulse'
              }`}
            />
            {isPlayerTurn ? (
              <span className="flex items-center gap-1 truncate">
                <User className="w-2.5 h-2.5 shrink-0" />
                <span>Your Turn</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 truncate">
                <Bot className="w-2.5 h-2.5 shrink-0" />
                <span>Opponent</span>
              </span>
            )}
          </div>

          {/* Phase Badge */}
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider uppercase border shrink-0 ${phaseInfo.className}`}
            title={`Current Phase: ${phaseInfo.label}`}
          >
            {phaseInfo.label}
          </span>
        </div>
      </section>

      {/* Card Inspector Body */}
      {inspectedCard ? (
        <section className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Scrollable Gameplay-Only Card Details */}
          <div className="flex-1 overflow-y-auto p-2 sm:p-2.5 space-y-2.5 custom-scrollbar">
            {/* Clean Card Artwork Preview */}
            <div className="flex justify-center items-center pt-0.5">
              <div className="relative w-full aspect-[491/682] max-w-[130px] sm:max-w-[145px] rounded-lg overflow-hidden shadow-2xl border border-slate-700/60 bg-slate-950">
                <img
                  src={imageSrc || ''}
                  alt={inspectedCard.name}
                  loading="lazy"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (inspectedCard.imageUrl && target.src !== inspectedCard.imageUrl) {
                      target.src = inspectedCard.imageUrl;
                    }
                  }}
                />
              </div>
            </div>

            {/* Card Name */}
            <div className="text-center px-1">
              <h3 className="text-xs sm:text-sm font-cinzel font-black text-white tracking-wide leading-tight break-words">
                {inspectedCard.name}
              </h3>
            </div>

            {/* Quick Tactical Stats: Cost | Type | Power */}
            <div className="grid grid-cols-3 gap-1 text-center font-mono">
              <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800/80 flex flex-col justify-center">
                <span className="text-[8px] uppercase tracking-wider text-slate-500 font-semibold font-sans">
                  Cost
                </span>
                <span className="text-xs font-bold text-amber-400 tabular-nums">
                  {inspectedCard.manaCost}
                </span>
              </div>

              <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800/80 flex flex-col justify-center min-w-0">
                <span className="text-[8px] uppercase tracking-wider text-slate-500 font-semibold font-sans">
                  Type
                </span>
                <span
                  className="text-[9px] font-semibold text-slate-200 truncate"
                  title={inspectedCard.type}
                >
                  {inspectedCard.type.replace(' Creature', '')}
                </span>
              </div>

              <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800/80 flex flex-col justify-center">
                <span className="text-[8px] uppercase tracking-wider text-slate-500 font-semibold font-sans">
                  Power
                </span>
                <span className="text-xs font-bold text-amber-300 tabular-nums">
                  {inspectedCard.power !== null ? (
                    <>
                      {inspectedCard.power}
                      {inspectedCard.powerAttackerBonus > 0 && (
                        <span className="text-red-400 text-[8px] ml-0.5">
                          +{inspectedCard.powerAttackerBonus}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </span>
              </div>
            </div>

            {/* Civilizations & Key Keywords */}
            <div className="flex flex-wrap gap-1 justify-center items-center">
              {inspectedCard.civilizations.map((civ) => (
                <span
                  key={civ}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border ${getCivilizationBadgeStyle(
                    civ
                  )}`}
                >
                  <CivilizationIcon civilization={civ} className="w-2.5 h-2.5" />
                  <span>{civ}</span>
                </span>
              ))}

              {inspectedCard.isShieldTrigger && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40">
                  <Zap className="w-2.5 h-2.5 text-amber-400" /> Trigger
                </span>
              )}

              {inspectedCard.isBlocker && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/40">
                  <Shield className="w-2.5 h-2.5 text-sky-400" /> Blocker
                </span>
              )}

              {inspectedCard.isSlayer && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/40">
                  <Skull className="w-2.5 h-2.5 text-purple-400" /> Slayer
                </span>
              )}

              {inspectedCard.isSpeedAttacker && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-500/15 text-red-300 border border-red-500/40">
                  <Zap className="w-2.5 h-2.5 text-red-400" /> Speed Atk
                </span>
              )}

              {isEvolution && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/50">
                  <Layers className="w-2.5 h-2.5 text-amber-400" /> Evolution
                </span>
              )}

              {inspectedCard.breakerCount >= 2 && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/40">
                  ⚔ {inspectedCard.breakerCount === 2 ? 'Double' : 'Triple'} Breaker
                </span>
              )}
            </div>

            {/* Race (if creature) */}
            {inspectedCard.races && inspectedCard.races.length > 0 && (
              <div className="bg-slate-900/40 px-2 py-1 rounded-md border border-slate-800/60 text-center text-[10px]">
                <span className="text-slate-400 font-sans mr-1">Race:</span>
                <span className="text-amber-200 font-medium font-cinzel">
                  {inspectedCard.races.join(' / ')}
                </span>
              </div>
            )}

            {/* Evolution Requirement Callout */}
            {isEvolution && evoRequirement && (
              <div className="p-1.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-[10px] text-amber-200">
                <div className="text-[8px] font-bold uppercase tracking-wider text-amber-400 mb-0.5">
                  Evolution Bait
                </div>
                <div className="leading-snug">{evoRequirement}</div>
              </div>
            )}

            {/* Rules & Abilities Text */}
            <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs text-slate-200 space-y-1">
              <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-1">
                <Info className="w-2.5 h-2.5 text-amber-400" /> Abilities & Effects
              </div>

              {inspectedCard.rulesText ? (
                <div className="space-y-1.5 text-[10px] sm:text-[11px] text-slate-200 leading-relaxed font-sans break-words">
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
                          <span className="text-amber-400 text-[10px] shrink-0 select-none mt-0.5">
                            ◆
                          </span>
                          <span className="flex-1 break-words">{cleanLine}</span>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-[10px] text-slate-500 italic">
                  No abilities (Vanilla creature).
                </p>
              )}
            </div>
          </div>
        </section>
      ) : (
        /* Minimalist Empty State */
        <section className="flex-1 min-h-0 flex flex-col items-center justify-center p-3 text-center text-slate-500">
          <div className="w-10 h-10 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-center mb-2 text-slate-600">
            <Eye className="w-5 h-5 text-amber-500/50" />
          </div>
          <h3 className="font-cinzel font-bold text-xs text-slate-300 tracking-wider mb-1">
            Card Inspector
          </h3>
          <p className="text-[10px] text-slate-500 max-w-[150px] leading-relaxed">
            Hover or tap any card in hand or on the battlefield to inspect.
          </p>
        </section>
      )}
    </aside>
  );
};
