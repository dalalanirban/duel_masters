import React from 'react';
import type { CardDefinition, Civilization, Deck } from '../../types/card';
import type { CreatureInstance } from '../../engine/types';
import { isSurvivor, getSurvivorSharedAbilities } from '../../engine/effects';
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
  friendlyBattleZone?: CreatureInstance[];
  turn: number;
  activePlayer: 'player' | 'opponent';
  phase: string;
  opponentDeck?: Deck;
  availableOpponentDecks?: Deck[];
  onSelectOpponentDeck?: (deckId: string) => void;
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
  friendlyBattleZone = [],
  turn,
  activePlayer,
  phase,
  opponentDeck,
  availableOpponentDecks = [],
  onSelectOpponentDeck,
  className = ''
}) => {
  const isPlayerTurn = activePlayer === 'player';
  const phaseInfo = getPhaseBadgeInfo(phase);

  const isEvolution = Boolean(
    inspectedCard?.isEvolution || inspectedCard?.type === 'Evolution Creature'
  );

  const survivorAbilities = friendlyBattleZone && inspectedCard && isSurvivor(inspectedCard)
    ? getSurvivorSharedAbilities(friendlyBattleZone)
    : null;

  const sharedPowerBonus = survivorAbilities ? survivorAbilities.powerBonus : 0;
  const hasSharedBlocker = Boolean(survivorAbilities?.hasBlocker);
  const hasSharedSlayer = Boolean(survivorAbilities?.hasSlayer);
  const hasSharedSpeedAttacker = Boolean(survivorAbilities?.hasSpeedAttacker);
  const hasSharedUntap = Boolean(survivorAbilities?.hasUntapAtEndTurn);
  const hasSharedUnblockable = Boolean(survivorAbilities?.isUnblockable);
  const sharedBreakerCount = survivorAbilities?.minBreakerCount || 1;

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
      className={`h-full flex flex-col bg-[#080b11] border-r border-slate-800/60 text-slate-100 select-none overflow-hidden ${className || 'w-72 shrink-0'}`}
      aria-label="Card Inspector & Match Status"
    >
      {/* Match Status Header */}
      <section className="shrink-0 bg-slate-950/80 border-b border-slate-800/80 p-1.5 space-y-1">
        {/* Turn, Active Player, and Phase Status */}
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

        {/* AI Battle Deck Selector */}
        {availableOpponentDecks.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900/90 border border-slate-800/80 text-[11px] shadow-xs">
            <div className="flex items-center gap-1 text-slate-400 shrink-0 font-medium font-sans">
              <Bot className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="text-[9.5px] uppercase font-bold tracking-wider text-slate-400 font-cinzel">AI Deck:</span>
            </div>
            <select
              value={opponentDeck?.id || availableOpponentDecks[0]?.id || ''}
              onChange={(e) => onSelectOpponentDeck?.(e.target.value)}
              className="flex-1 min-w-0 bg-slate-950 text-indigo-200 border border-indigo-500/30 rounded px-1.5 py-0.5 text-[10.5px] font-sans font-medium focus:outline-hidden focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/50 cursor-pointer transition-colors truncate"
              title="Select AI opponent battle deck"
            >
              {availableOpponentDecks.map((d) => (
                <option key={d.id} value={d.id} className="bg-slate-950 text-slate-200 py-1">
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* Card Inspector Body */}
      {inspectedCard ? (
        <section className="flex-1 min-h-0 flex flex-col p-2 space-y-1.5 overflow-hidden">
          {/* Proportional Card Artwork Preview: Expands to match pane width, shrinks proportionally if details need space */}
          <div
            style={{ containerType: 'size' }}
            className="flex-1 min-h-[80px] w-full flex items-center justify-center overflow-hidden"
          >
            <div
              style={{
                width: 'min(100cqw, calc(100cqh * (491 / 682)), 255px)',
                aspectRatio: '491 / 682',
                maxHeight: '100%',
                maxWidth: '255px',
                height: 'auto',
              }}
              className="relative rounded-md overflow-hidden shadow-xl border border-slate-700/60 bg-slate-950 flex items-center justify-center transition-all duration-150"
            >
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
          <div className="text-center px-1 shrink-0">
            <h3
              className="text-xs sm:text-[13px] font-cinzel font-black text-white tracking-wide leading-tight truncate"
              title={inspectedCard.name}
            >
              {inspectedCard.name}
            </h3>
          </div>

          {/* Consolidated Stats & Attributes Bar */}
          <div className="shrink-0 bg-slate-900/70 border border-slate-800/80 rounded-lg p-1.5 space-y-1 text-[10px]">
            {/* Primary Tactical Stats: Cost | Power | Type */}
            <div className="flex items-center justify-between gap-1 text-[10.5px] font-mono border-b border-slate-800/60 pb-1">
              {/* Cost */}
              <div className="flex items-center gap-1 font-semibold text-slate-300">
                <span className="text-[9px] uppercase tracking-wider text-slate-500 font-sans">Cost:</span>
                <span className="text-amber-400 font-bold">{inspectedCard.manaCost}</span>
              </div>

              {/* Power (if creature) */}
              {inspectedCard.power !== null ? (
                <div className="flex items-center gap-1 font-semibold text-slate-300">
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-sans">PWR:</span>
                  <span className="text-amber-300 font-bold">
                    {inspectedCard.power + sharedPowerBonus}
                    {sharedPowerBonus > 0 && (
                      <span className="text-emerald-400 text-[8.5px] ml-0.5 font-bold" title="Survivor Power Buff">
                        (+{sharedPowerBonus})
                      </span>
                    )}
                    {inspectedCard.powerAttackerBonus > 0 && (
                      <span className="text-red-400 text-[8.5px] ml-0.5">+{inspectedCard.powerAttackerBonus}</span>
                    )}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-slate-500 text-[9.5px]">
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-sans">Type:</span>
                  <span className="text-slate-300 font-medium font-sans">Spell</span>
                </div>
              )}

              {/* Type (if creature) */}
              {inspectedCard.power !== null && (
                <div className="flex items-center gap-1 text-slate-300 truncate max-w-[75px]" title={inspectedCard.type}>
                  <span className="text-[9.5px] font-medium font-sans text-slate-400 truncate">
                    {inspectedCard.type.replace(' Creature', '')}
                  </span>
                </div>
              )}
            </div>

            {/* Badges Strip: Civilizations, Keywords & Race */}
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              {/* Civilizations */}
              {inspectedCard.civilizations.map((civ) => (
                <span
                  key={civ}
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.25 rounded text-[9px] font-medium border ${getCivilizationBadgeStyle(civ)}`}
                >
                  <CivilizationIcon civilization={civ} className="w-2.5 h-2.5" />
                  <span>{civ}</span>
                </span>
              ))}

              {/* Keywords */}
              {inspectedCard.isShieldTrigger && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.25 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40">
                  <Zap className="w-2.5 h-2.5 text-amber-400" /> Trigger
                </span>
              )}

              {(inspectedCard.isBlocker || hasSharedBlocker) && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.25 rounded text-[9px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/40"
                  title={hasSharedBlocker && !inspectedCard.isBlocker ? 'Shared via Survivor Link' : undefined}
                >
                  <Shield className="w-2.5 h-2.5 text-sky-400" /> Blocker
                </span>
              )}

              {(inspectedCard.isSlayer || hasSharedSlayer) && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.25 rounded text-[9px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/40"
                  title={hasSharedSlayer && !inspectedCard.isSlayer ? 'Shared via Survivor Link' : undefined}
                >
                  <Skull className="w-2.5 h-2.5 text-purple-400" /> Slayer
                </span>
              )}

              {(inspectedCard.isSpeedAttacker || hasSharedSpeedAttacker) && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.25 rounded text-[9px] font-semibold bg-red-500/15 text-red-300 border border-red-500/40"
                  title={hasSharedSpeedAttacker && !inspectedCard.isSpeedAttacker ? 'Shared via Survivor Link' : undefined}
                >
                  <Zap className="w-2.5 h-2.5 text-red-400" /> Speed Atk
                </span>
              )}

              {hasSharedUntap && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.25 rounded text-[9px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/40"
                  title="Untaps at end of turn (Survivor ability: Ballus)"
                >
                  🔄 End Untap
                </span>
              )}

              {hasSharedUnblockable && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.25 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
                  title="Unblockable (Survivor ability: Spikestrike Ichthys)"
                >
                  ⚡ Unblockable
                </span>
              )}

              {isEvolution && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.25 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/50">
                  <Layers className="w-2.5 h-2.5 text-amber-400" /> Evolution
                </span>
              )}

              {(inspectedCard.breakerCount >= 2 || sharedBreakerCount >= 2) && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.25 rounded text-[9px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/40">
                  ⚔ {Math.max(inspectedCard.breakerCount || 1, sharedBreakerCount) === 2 ? 'Double' : 'Triple'} Breaker
                </span>
              )}

              {/* Compact Race Pill */}
              {inspectedCard.races && inspectedCard.races.length > 0 && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.25 rounded text-[9px] bg-slate-800/80 text-amber-200/90 border border-slate-700/60 font-cinzel font-medium">
                  <span className="text-[8px] text-slate-400 font-sans mr-0.5">Race:</span>
                  {inspectedCard.races.join(' / ')}
                </span>
              )}
            </div>

            {/* Evolution Bait (compact) */}
            {isEvolution && evoRequirement && (
              <div className="pt-0.5 text-[9.5px] text-amber-300 flex items-center gap-1 border-t border-slate-800/60">
                <span className="text-[8px] font-bold uppercase tracking-wider text-amber-400 shrink-0">Bait:</span>
                <span className="truncate">{evoRequirement}</span>
              </div>
            )}
          </div>

          {/* Rules & Abilities Text (Takes required height up to max-h, ensuring no overflow) */}
          <div className="shrink-0 max-h-[50%] flex flex-col p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs text-slate-200">
            <div className="text-[8.5px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-1 shrink-0">
              <Info className="w-2.5 h-2.5 text-amber-400" /> Abilities & Effects
            </div>

            {inspectedCard.rulesText ? (
              <div className="overflow-y-auto pr-0.5 space-y-1.5 text-[10px] sm:text-[11px] text-slate-200 leading-relaxed font-sans break-words custom-scrollbar">
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
