import React from 'react';
import {
  Shield,
  Zap,
  Moon,
  Crosshair,
  Skull,
  Layers,
  Sparkles,
  Swords
} from 'lucide-react';
import { m } from 'motion/react';
import type { CreatureInstance, GameState, PlayerId, Phase, PlayerState } from '../../engine/types';
import type { CardDefinition } from '../../types/card';
import type { PresentationEvent } from '../../presentation/types.ts';
import {
  getCreatureEffectivePower,
  getCreatureBreakerCount,
  hasCreatureBlocker,
  hasCreatureSlayer,
  hasCreatureSpeedAttacker,
  canCreatureAttackUntapped,
  canCreatureBeAttackedBy,
  isCreatureSummoningSick
} from '../../engine/combat';
import { hasTapAbility } from '../../engine/tapAbilities';

interface BattleZoneViewProps {
  battleZone: CreatureInstance[];
  opponentBattleZone?: CreatureInstance[];
  playerState?: PlayerState;
  opponentState?: PlayerState;
  gameState?: GameState;
  owner: PlayerId;
  turn: number;
  phase: Phase;
  activePlayer: PlayerId;
  selectedAttackerId?: string | null;
  onSelectAttacker?: (creatureId: string) => void;
  onSelectTargetCreature?: (creatureId: string) => void;
  onInspectCard?: (card: CardDefinition, creature?: CreatureInstance) => void;
  onHoverCard?: (card: CardDefinition | null, creature?: CreatureInstance | null) => void;
  evolutionSelectionMode?: boolean;
  validBaitIds?: string[];
  onSelectBait?: (creatureId: string) => void;
  spellTargetMode?: boolean;
  validSpellTargetIds?: string[];
  onSelectSpellTarget?: (creatureId: string) => void;
  blockerSelectionMode?: boolean;
  validBlockerIds?: string[];
  onSelectBlocker?: (creatureId: string) => void;
  combatAttackerId?: string | null;
  activeBeatEvent?: PresentationEvent | null;
  disableAttackSelection?: boolean;
}

export const BattleZoneView: React.FC<BattleZoneViewProps> = ({
  battleZone,
  opponentBattleZone,
  playerState,
  opponentState,
  gameState,
  owner,
  turn,
  phase,
  activePlayer,
  selectedAttackerId = null,
  onSelectAttacker,
  onSelectTargetCreature,
  onInspectCard,
  onHoverCard,
  evolutionSelectionMode = false,
  validBaitIds = [],
  onSelectBait,
  spellTargetMode = false,
  validSpellTargetIds = [],
  onSelectSpellTarget,
  blockerSelectionMode = false,
  validBlockerIds = [],
  onSelectBlocker,
  combatAttackerId = null,
  activeBeatEvent = null,
  disableAttackSelection = false
}) => {
  const isOpponent = owner === 'opponent';
  const isPlayerTurn = activePlayer === 'player';

  if (battleZone.length === 0) {
    return (
      <div
        data-vfx-id={`battle-zone-${owner}`}
        className="w-full h-full flex items-center justify-center select-none shrink-0 pointer-events-none min-h-[3.5rem]"
      >
        <span className="text-[10px] font-cinzel text-slate-600/70 tracking-[0.25em] uppercase">
          {isOpponent ? '— Opponent Battlefield —' : '— Your Battlefield —'}
        </span>
      </div>
    );
  }

  // Dynamic card sizing: generous 104x146px on desktop <=5 creatures, fluidly scaling down at 6+
  const cardSizeClass =
    battleZone.length <= 5
      ? 'w-[64px] h-[90px] sm:w-[88px] sm:h-[124px] lg:w-[104px] lg:h-[146px]'
      : battleZone.length <= 8
      ? 'w-[58px] h-[82px] sm:w-[76px] sm:h-[108px] lg:w-[86px] lg:h-[120px]'
      : 'w-[52px] h-[74px] sm:w-[66px] sm:h-[92px] lg:w-[74px] lg:h-[104px]';

  return (
    <m.div
      layoutScroll
      data-vfx-id={`battle-zone-${owner}`}
      className="w-full flex-1 min-h-0 flex items-center justify-center gap-2.5 sm:gap-3.5 py-2 px-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden relative select-none"
    >
      {/* Floating targeting alert overlay */}
      {selectedAttackerId && isOpponent && (
        <div className="absolute top-1 right-2 z-20 flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-950/90 border border-red-500/50 text-[9px] font-semibold text-red-300 animate-pulse pointer-events-none shadow-md">
          <Crosshair className="w-2.5 h-2.5" />
          <span>Select attack target</span>
        </div>
      )}

      {battleZone.map((creature) => {
          const card = creature.card;
          const isTapped = creature.isTapped;
          const sick = isCreatureSummoningSick(creature, turn, battleZone, gameState, owner);
          const isAttacker = selectedAttackerId === creature.instanceId || combatAttackerId === creature.instanceId;
          const isBeatAttacker = Boolean(
            activeBeatEvent?.type === 'DECLARE_ATTACK' &&
              activeBeatEvent.source?.instanceId === creature.instanceId
          );
          const isBeatBlocker = Boolean(
            activeBeatEvent?.type === 'BLOCK' &&
              activeBeatEvent.source?.instanceId === creature.instanceId
          );
          const isBeatVictim = Boolean(
            activeBeatEvent?.type === 'CREATURE_DESTROYED' &&
              activeBeatEvent.targets?.some((targetRef) => targetRef.instanceId === creature.instanceId)
          );
        const friendlyState = playerState || ({ battleZone } as PlayerState);
        const oppState = opponentState || ({ battleZone: opponentBattleZone || [] } as PlayerState);
        const oppBZ = opponentBattleZone || oppState.battleZone || [];
        const isOpponentsTurn = activePlayer !== owner;
        const effectivePower = getCreatureEffectivePower(
          creature,
          isAttacker,
          friendlyState,
          oppState,
          isOpponentsTurn,
          gameState
        );
        const basePower = card.power ?? 0;
        const powerBoosted = effectivePower > basePower;
        const breakerCount = getCreatureBreakerCount(creature, battleZone, oppBZ, gameState, owner);
        const isBlocker = hasCreatureBlocker(creature, battleZone, oppBZ, friendlyState);
        const isSlayer = hasCreatureSlayer(creature, battleZone, oppBZ, friendlyState);
        const isSpeedAttacker = hasCreatureSpeedAttacker(creature, battleZone, gameState, owner);
        const countStack = (items?: typeof creature.evolvedOn): number =>
          !items || items.length === 0
            ? 0
            : items.reduce((s, it) => s + 1 + countStack(it.evolvedOn), 0);
        const isEvolution = Boolean(creature.evolvedOn && creature.evolvedOn.length > 0) || card.type === 'Evolution Creature';
        const underlyingCount = countStack(creature.evolvedOn);

        const rulesLower = (card.rulesText || '').toLowerCase();
        const cantAttack = /this creature can't attack(?!\s+players)/i.test(rulesLower) || Boolean(creature.tempCantAttack);
        const narielBlocks = [...battleZone, ...oppBZ].some((c) => c.card.name.toLowerCase().includes('nariel')) && effectivePower >= 3000;
        const canTapAbility =
          !disableAttackSelection &&
          !isOpponent &&
          isPlayerTurn &&
          (phase === 'MAIN' || phase === 'ATTACK') &&
          !isTapped &&
          (!sick || Boolean(friendlyState.tempIgnoreAttackPrevention)) &&
          !cantAttack &&
          hasTapAbility(card);
        const canAttack =
          !disableAttackSelection &&
          !isOpponent &&
          isPlayerTurn &&
          (phase === 'MAIN' || phase === 'ATTACK') &&
          !isTapped &&
          (!sick || Boolean(friendlyState.tempIgnoreAttackPrevention)) &&
          !cantAttack &&
          !narielBlocks;
        const canActivateAction = canAttack || canTapAbility;

        const currentAttacker =
          isOpponent && selectedAttackerId
            ? oppBZ.find((c) => c.instanceId === selectedAttackerId)
            : undefined;
        const canBeAttacked =
          isOpponent &&
          isPlayerTurn &&
          Boolean(currentAttacker) &&
          canCreatureBeAttackedBy(creature, currentAttacker!).allowed &&
          (isTapped ||
            canCreatureAttackUntapped(
              currentAttacker!,
              creature,
              oppBZ,
              battleZone,
              gameState,
              oppState,
              friendlyState
            ));

        const isBaitCandidate =
          evolutionSelectionMode &&
          !isOpponent &&
          validBaitIds.includes(creature.instanceId);

        const isSpellTargetCandidate =
          spellTargetMode &&
          validSpellTargetIds.includes(creature.instanceId);

        const isBlockerCandidate =
          blockerSelectionMode &&
          !isOpponent &&
          validBlockerIds.includes(creature.instanceId);

        const isActionDisabled =
          (blockerSelectionMode && !isBlockerCandidate) ||
          (spellTargetMode && !isSpellTargetCandidate) ||
          (evolutionSelectionMode && !isOpponent && !isBaitCandidate) ||
          (selectedAttackerId && isOpponent && !canBeAttacked);

        const imageSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;

        const handleClick = (e: React.MouseEvent) => {
          e.stopPropagation();

          if (blockerSelectionMode && isBlockerCandidate && onSelectBlocker) {
            onSelectBlocker(creature.instanceId);
            return;
          }
          if (isSpellTargetCandidate && onSelectSpellTarget) {
            onSelectSpellTarget(creature.instanceId);
            return;
          }
          if (isBaitCandidate && onSelectBait) {
            onSelectBait(creature.instanceId);
            return;
          }
          if (canBeAttacked && onSelectTargetCreature) {
            onSelectTargetCreature(creature.instanceId);
            return;
          }
          if (canActivateAction && onSelectAttacker) {
            onInspectCard?.(card, creature);
            onSelectAttacker(creature.instanceId);
            return;
          }
          onInspectCard?.(card, creature);
        };

        return (
          <m.div
            key={creature.instanceId}
            layout="position"
            layoutId={`card-${creature.instanceId}`}
            initial={{ scale: 1.14, opacity: 0.72 }}
            animate={
              isBeatAttacker
                ? { scale: 1.07, opacity: 1, y: isOpponent ? 14 : -14 }
                : isBeatBlocker
                ? { scale: 1.06, opacity: 1, y: isOpponent ? 10 : -10 }
                : isBeatVictim
                ? { scale: 0.86, opacity: 0.45, y: 0 }
                : { scale: 1, opacity: 1, y: 0 }
            }
            transition={{ type: 'spring', stiffness: 360, damping: 26 }}
            data-vfx-id={`bz-${creature.instanceId}`}
            className={`relative shrink-0 overflow-visible ${cardSizeClass} ${
              isTapped ? 'mx-3 sm:mx-4 lg:mx-5' : ''
            } ${isBeatAttacker || isBeatBlocker ? 'z-30' : ''}`}
          >
            {/* Staggered Evolution Bait Pips underneath top card */}
            {underlyingCount >= 2 && (
              <div
                aria-hidden="true"
                className={`absolute inset-0 -translate-x-1.5 translate-y-1.5 rounded-md border border-cyan-500/60 bg-slate-900 shadow-md ${
                  isTapped ? 'rotate-90 scale-90' : ''
                }`}
              />
            )}
            {underlyingCount >= 1 && (
              <div
                aria-hidden="true"
                className={`absolute inset-0 -translate-x-1 translate-y-1 rounded-md border border-amber-500/70 bg-slate-900 shadow-md ${
                  isTapped ? 'rotate-90 scale-90' : ''
                }`}
              />
            )}

            {/* Main Creature Card Frame */}
            <m.div
              initial={false}
              animate={{
                rotate: isTapped ? 90 : 0,
                scale: isTapped ? 0.9 : 1
              }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              onClick={handleClick}
              onMouseEnter={() => onHoverCard?.(card, creature)}
              onMouseLeave={() => onHoverCard?.(null, null)}
              className={`relative w-full h-full aspect-[491/682] rounded-md overflow-hidden transition-colors duration-150 cursor-pointer shadow-lg group ${
                isBeatAttacker
                  ? 'ring-2 ring-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.75)] z-20'
                  : isBeatVictim
                  ? 'ring-2 ring-rose-500 brightness-75 z-20'
                  : isBeatBlocker
                  ? 'ring-2 ring-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.75)] z-20'
                  : isAttacker
                  ? 'ring-2 ring-amber-400 shadow-amber-500/50 z-20 animate-pulse'
                  : isBlockerCandidate
                  ? 'ring-2 ring-sky-400 shadow-sky-500/60 z-20 animate-pulse hover:scale-105 hover:brightness-125'
                  : canBeAttacked
                  ? 'ring-2 ring-red-500 shadow-red-500/50 z-20 animate-pulse cursor-crosshair hover:brightness-110'
                  : isActionDisabled
                  ? 'opacity-35 grayscale border border-slate-800 cursor-not-allowed pointer-events-none'
                  : isBaitCandidate
                  ? 'ring-2 ring-cyan-400 shadow-cyan-500/40 z-10 hover:brightness-110'
                  : isSpellTargetCandidate
                  ? 'ring-2 ring-purple-400 shadow-purple-500/50 z-20 animate-pulse hover:brightness-110'
                  : canAttack
                  ? 'ring-1 ring-emerald-400/90 hover:ring-amber-400 hover:scale-105 shadow-emerald-500/20'
                  : canTapAbility
                  ? 'ring-1 ring-violet-400/90 hover:ring-amber-400 hover:scale-105 shadow-violet-500/20'
                  : isTapped
                  ? 'opacity-80 border border-slate-700 hover:border-slate-500'
                  : selectedAttackerId && !isOpponent
                  ? 'opacity-75 border border-slate-800'
                  : 'border border-slate-700/80 hover:border-slate-500'
              }`}
              title={`${card.name} - Power: ${effectivePower}${isTapped ? ' (Tapped)' : ''}`}
            >
              <img
                src={imageSrc}
                alt={card.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (card.imageUrl && target.src !== card.imageUrl) {
                    target.src = card.imageUrl;
                  }
                }}
              />

              {/* Top-Left: Keyword Micro-Icons (Blocker, Slayer, Speed, Evo Stack) */}
              <div className="absolute top-1 left-1 flex flex-col gap-0.5 z-10 pointer-events-none">
                {isBlocker && (
                  <div className="p-0.5 rounded bg-amber-500/90 text-slate-950 font-bold shadow" title="Blocker">
                    <Shield className="w-2.5 h-2.5 fill-current" />
                  </div>
                )}
                {isSlayer && (
                  <div className="p-0.5 rounded bg-purple-700/90 text-white font-bold shadow" title="Slayer">
                    <Skull className="w-2.5 h-2.5" />
                  </div>
                )}
                {isSpeedAttacker && (
                  <div className="p-0.5 rounded bg-red-600/90 text-yellow-300 font-bold shadow" title="Speed Attacker">
                    <Zap className="w-2.5 h-2.5 fill-current" />
                  </div>
                )}
                {isEvolution && (
                  <div className="px-1 py-[1px] rounded text-[7px] font-black bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 font-cinzel shadow flex items-center gap-0.5">
                    <Layers className="w-2 h-2" />
                    {underlyingCount > 0 ? `+${underlyingCount}` : 'EVO'}
                  </div>
                )}
              </div>

              {/* Top-Right: Sickness / Ready / Tapped / Dual Action */}
              <div className="absolute top-1 right-1 z-10 pointer-events-none">
                {sick ? (
                  <div className="p-0.5 rounded bg-slate-950/90 text-indigo-400 font-bold border border-indigo-500/40 shadow flex items-center gap-0.5 text-[7.5px]">
                    <Moon className="w-2.5 h-2.5" />
                    <span className="hidden sm:inline">Zzz</span>
                  </div>
                ) : isAttacker ? (
                  <div className="px-1.5 py-[1px] rounded bg-amber-500 text-slate-950 text-[7.5px] font-black font-cinzel tracking-wider animate-pulse flex items-center gap-0.5">
                    <Swords className="w-2.5 h-2.5" />
                    <span>ATK</span>
                  </div>
                ) : canTapAbility && canAttack ? (
                  <div className="px-1 py-[1px] rounded-full bg-gradient-to-r from-emerald-500/95 to-violet-500/95 text-white text-[7px] font-bold font-mono">
                    ATK/$TAP
                  </div>
                ) : canTapAbility ? (
                  <div className="px-1.5 py-[1px] rounded-full bg-violet-500/95 text-white text-[7.5px] font-bold font-mono">
                    $TAP
                  </div>
                ) : canAttack ? (
                  <div className="px-1.5 py-[1px] rounded-full bg-emerald-500/95 text-slate-950 text-[7.5px] font-black font-mono">
                    READY
                  </div>
                ) : isTapped ? (
                  <div className="px-1 py-[1px] rounded bg-amber-950/95 text-amber-300 border border-amber-600/60 shadow text-[7px] font-mono font-bold tracking-wider">
                    TAPPED
                  </div>
                ) : null}
              </div>

              {/* Target Overlays */}
              {canBeAttacked && (
                <div className="absolute inset-0 bg-red-950/70 backdrop-blur-sm flex flex-col items-center justify-center p-1 text-center z-10 pointer-events-none">
                  <Crosshair className="w-4 h-4 sm:w-5 sm:h-5 text-red-400 animate-spin-slow mb-0.5" />
                  <span className="text-[8.5px] font-black text-red-200 uppercase tracking-wider font-cinzel">
                    Attack
                  </span>
                </div>
              )}

              {isSpellTargetCandidate && (
                <div className="absolute inset-0 bg-purple-950/60 backdrop-blur-sm flex flex-col items-center justify-center p-1 text-center z-10 pointer-events-none">
                  <Sparkles className="w-4 h-4 text-purple-300 animate-pulse mb-0.5" />
                  <span className="text-[8px] font-black text-purple-200 uppercase tracking-wider font-cinzel">
                    Target
                  </span>
                </div>
              )}

              {isBlockerCandidate && (
                <div className="absolute inset-0 bg-sky-950/70 backdrop-blur-sm flex flex-col items-center justify-center p-1 text-center z-10 pointer-events-none">
                  <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400 animate-bounce mb-0.5" />
                  <span className="text-[8.5px] font-black text-sky-200 uppercase tracking-wider font-cinzel">
                    Block
                  </span>
                </div>
              )}

              {/* Separated Two-Tier Telemetry Footer Plate (Name cleanly above Power) */}
              <div className="absolute bottom-0.5 inset-x-0.5 z-10 flex flex-col gap-0.5 px-1 py-0.5 rounded bg-slate-950/95 border border-slate-700/80 backdrop-blur-sm pointer-events-none">
                <span className="text-[7.5px] sm:text-[8.5px] text-slate-200 font-medium leading-tight truncate text-center">
                  {card.name}
                </span>
                <div className="flex items-center justify-between gap-1 border-t border-slate-800/80 pt-0.5">
                  {breakerCount >= 2 ? (
                    <span className="px-1 rounded bg-rose-500/20 border border-rose-400/50 text-[7px] font-mono font-bold text-rose-300 leading-tight">
                      {breakerCount}x
                    </span>
                  ) : (
                    <span className="text-[7px] font-mono text-slate-500 leading-tight">PWR</span>
                  )}
                  <span
                    className={`text-[9px] sm:text-[10.5px] font-mono font-black tabular-nums leading-none ${
                      powerBoosted ? 'text-emerald-300' : 'text-amber-300'
                    }`}
                  >
                    {effectivePower}
                  </span>
                </div>
              </div>
            </m.div>
          </m.div>
        );
        })}
    </m.div>
  );
};
