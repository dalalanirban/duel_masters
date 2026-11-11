import React from 'react';
import {
  Shield,
  Zap,
  Moon,
  Crosshair,
  Skull,
  Layers,
  Sparkles
} from 'lucide-react';
import type { CreatureInstance, PlayerId, Phase } from '../../engine/types';
import type { CardDefinition } from '../../types/card';
import { getCreatureEffectivePower } from '../../engine/combat';
import { isSummoningSick } from '../../engine/evolution';

interface BattleZoneViewProps {
  battleZone: CreatureInstance[];
  owner: PlayerId;
  turn: number;
  phase: Phase;
  activePlayer: PlayerId;
  selectedAttackerId?: string | null;
  onSelectAttacker?: (creatureId: string) => void;
  onSelectTargetCreature?: (creatureId: string) => void;
  onInspectCard?: (card: CardDefinition) => void;
  onHoverCard?: (card: CardDefinition | null) => void;
  // Evolution mode
  evolutionSelectionMode?: boolean;
  validBaitIds?: string[];
  onSelectBait?: (creatureId: string) => void;
  // Spell targeting mode
  spellTargetMode?: boolean;
  validSpellTargetIds?: string[];
  onSelectSpellTarget?: (creatureId: string) => void;
}

export const BattleZoneView: React.FC<BattleZoneViewProps> = ({
  battleZone,
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
  onSelectSpellTarget
}) => {
  const isOpponent = owner === 'opponent';
  const isPlayerTurn = activePlayer === 'player';

  if (battleZone.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center select-none shrink-0 pointer-events-none min-h-[3rem]">
        <span className="text-[9.5px] font-cinzel text-slate-600/70 tracking-[0.25em] uppercase">
          {isOpponent ? '— Opponent Battlefield —' : '— Your Battlefield —'}
        </span>
      </div>
    );
  }

  return (
    <div className="w-full flex-1 min-h-0 flex items-center justify-center gap-2 sm:gap-3 py-1.5 sm:py-2 px-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden relative select-none">
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
        const sick = isSummoningSick(creature, turn);
        const isAttacker = selectedAttackerId === creature.instanceId;
        const effectivePower = getCreatureEffectivePower(creature, isAttacker);
        const isBlocker = Boolean(card.isBlocker);
        const isSlayer = Boolean(card.isSlayer);
        const isSpeedAttacker = Boolean(card.isSpeedAttacker);
        const isEvolution = Boolean(creature.evolvedOn && creature.evolvedOn.length > 0) || card.type === 'Evolution Creature';
        const underlyingCount = creature.evolvedOn ? creature.evolvedOn.length : 0;

        // Attack eligibility
        const canAttack =
          !isOpponent &&
          isPlayerTurn &&
          (phase === 'MAIN' || phase === 'ATTACK') &&
          !isTapped &&
          !sick;

        // Targetable by current attacker
        const canBeAttacked =
          isOpponent &&
          isPlayerTurn &&
          selectedAttackerId !== null &&
          isTapped;

        // Bait eligibility
        const isBaitCandidate =
          evolutionSelectionMode &&
          !isOpponent &&
          validBaitIds.includes(creature.instanceId);

        // Spell target eligibility
        const isSpellTargetCandidate =
          spellTargetMode &&
          validSpellTargetIds.includes(creature.instanceId);

        // Disabled/untargetable during specific targeting modes
        const isActionDisabled =
          (spellTargetMode && !isSpellTargetCandidate) ||
          (evolutionSelectionMode && !isOpponent && !isBaitCandidate) ||
          (selectedAttackerId && isOpponent && !canBeAttacked);

        const imageSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;

        const handleClick = (e: React.MouseEvent) => {
          e.stopPropagation();

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

          if (canAttack && onSelectAttacker) {
            onSelectAttacker(creature.instanceId);
            return;
          }

          onInspectCard?.(card);
        };

        return (
          <div
            key={creature.instanceId}
            onClick={handleClick}
            onMouseEnter={() => {
              onHoverCard?.(card);
            }}
            onMouseLeave={() => onHoverCard?.(null)}
            className={`relative shrink-0 w-15 h-21 sm:w-17 sm:h-24 md:w-18 md:h-25 aspect-[491/682] rounded-md overflow-hidden transition-all duration-200 cursor-pointer shadow-lg group ${
              isTapped ? 'rotate-90 scale-90' : ''
            } ${
              isAttacker
                ? 'ring-2 ring-amber-400 shadow-amber-500/50 z-20 animate-pulse'
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
                : isTapped
                ? 'opacity-75 border border-slate-700 hover:border-slate-500'
                : selectedAttackerId && !isOpponent
                ? 'opacity-75 border border-slate-800'
                : 'border border-slate-800 hover:border-slate-600'
            }`}
            title={`${card.name} - Power: ${effectivePower}${isTapped ? ' (Tapped)' : ''}`}
          >
            {/* Card Scan Image */}
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

            {/* Top-Left: Status Badges (Blocker, Slayer, Speed, Evo) */}
            <div className="absolute top-1 left-1 flex flex-col gap-0.5 z-10">
              {isBlocker && (
                <div
                  className="p-0.5 rounded bg-amber-500/90 text-slate-950 font-bold shadow"
                  title="Blocker: Can intercept attacks"
                >
                  <Shield className="w-2.5 h-2.5 fill-current" />
                </div>
              )}
              {isSlayer && (
                <div
                  className="p-0.5 rounded bg-purple-700/90 text-white font-bold shadow"
                  title="Slayer: Destroys opposing creature when defeated in battle"
                >
                  <Skull className="w-2.5 h-2.5" />
                </div>
              )}
              {isSpeedAttacker && (
                <div
                  className="p-0.5 rounded bg-red-600/90 text-yellow-300 font-bold shadow"
                  title="Speed Attacker"
                >
                  <Zap className="w-2.5 h-2.5 fill-current" />
                </div>
              )}
              {isEvolution && (
                <div
                  className="px-1 py-0.2 rounded text-[7px] font-black bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 font-cinzel shadow flex items-center gap-0.5"
                  title="Evolution Creature"
                >
                  <Layers className="w-2 h-2" />
                  {underlyingCount > 0 ? `+${underlyingCount}` : 'EVO'}
                </div>
              )}
            </div>

            {/* Top-Right: Sickness / Ready / Tapped indicator */}
            <div className="absolute top-1 right-1 z-10">
              {sick ? (
                <div
                  className="p-0.5 rounded bg-slate-950/85 text-indigo-400 font-bold border border-indigo-500/40 shadow flex items-center gap-0.5 text-[8px]"
                  title="Summoning Sickness"
                >
                  <Moon className="w-2.5 h-2.5" />
                  <span>Zzz</span>
                </div>
              ) : isAttacker ? (
                <div className="px-1 py-0.2 rounded bg-amber-500 text-slate-950 text-[8px] font-black font-cinzel tracking-wider animate-pulse">
                  ATK
                </div>
              ) : canAttack ? (
                <div className="px-1.5 py-0.2 rounded-full bg-emerald-500/90 text-slate-950 text-[8px] font-bold font-mono">
                  READY
                </div>
              ) : isTapped ? (
                <div
                  className="px-1 py-0.2 rounded bg-amber-950/90 text-amber-300 border border-amber-600/60 shadow text-[8px] font-mono font-bold tracking-wider"
                  title="Tapped creature"
                >
                  TAPPED
                </div>
              ) : null}
            </div>

            {/* Targetable Action Overlay */}
            {canBeAttacked && (
              <div className="absolute inset-0 bg-red-950/70 backdrop-blur-xs flex flex-col items-center justify-center p-1 text-center z-10 pointer-events-none">
                <Crosshair className="w-5 h-5 text-red-400 animate-spin-slow mb-0.5" />
                <span className="text-[9px] font-black text-red-200 uppercase tracking-wider font-cinzel">
                  Attack Target
                </span>
              </div>
            )}

            {/* Spell Target Overlay */}
            {isSpellTargetCandidate && (
              <div className="absolute inset-0 bg-purple-950/60 backdrop-blur-xs flex flex-col items-center justify-center p-1 text-center z-10 pointer-events-none">
                <Sparkles className="w-4 h-4 text-purple-300 animate-pulse mb-0.5" />
                <span className="text-[8.5px] font-black text-purple-200 uppercase tracking-wider font-cinzel">
                  Spell Target
                </span>
              </div>
            )}

            {/* Bottom Power Pill */}
            <div className="absolute bottom-1 right-1 left-1 z-10 flex items-center justify-between px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-700/80 backdrop-blur-xs">
              <span className="text-[8px] text-slate-300 font-mono truncate max-w-[55px]">
                {card.name}
              </span>
              <span className="text-[10px] font-mono font-black text-amber-400 tabular-nums">
                {effectivePower}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
