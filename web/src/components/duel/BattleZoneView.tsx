import React from 'react';
import {
  Shield,
  Zap,
  Moon,
  Crosshair,
  Skull,
  Swords,
  Layers
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

  return (
    <div className="flex flex-col gap-1 select-none w-full shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-xs font-cinzel font-bold text-slate-300">
          <Swords className={`w-3.5 h-3.5 ${isOpponent ? 'text-red-400' : 'text-emerald-400'}`} />
          <span>
            {isOpponent ? "Opponent's" : "Your"} Battle Zone ({battleZone.length} Creatures)
          </span>
        </div>

        {/* Status prompt */}
        {selectedAttackerId && isOpponent && (
          <span className="text-[10px] font-semibold text-red-400 animate-pulse flex items-center gap-1">
            <Crosshair className="w-3 h-3" /> Select tapped creature or shield
          </span>
        )}
      </div>

      {/* Battle Zone Arena Grid */}
      <div className="min-h-24 sm:min-h-28 rounded-xl border border-slate-800/90 bg-gradient-to-b from-slate-950/80 via-slate-900/60 to-slate-950/80 p-1.5 sm:p-2 flex items-center gap-2 overflow-x-auto scrollbar-thin">
        {battleZone.length === 0 ? (
          <div className="w-full text-center py-4 text-xs text-slate-600 font-mono flex flex-col items-center justify-center gap-1">
            <Swords className="w-4 h-4 opacity-40" />
            <span>No creatures in battle zone</span>
          </div>
        ) : (
          battleZone.map((creature) => {
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

            // Can be attacked (opposing creature that is tapped)
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

            const imageSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;

            // Card click handler
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

              // Fallback to inspect
              onInspectCard?.(card);
            };

            return (
              <div
                key={creature.instanceId}
                onClick={handleClick}
                onMouseEnter={() => onHoverCard?.(card)}
                onMouseLeave={() => onHoverCard?.(null)}
                className={`relative shrink-0 w-18 h-24 sm:w-20 sm:h-26 aspect-[491/682] rounded-lg overflow-hidden transition-all duration-200 cursor-pointer shadow-lg group ${
                  isAttacker
                    ? 'ring-4 ring-amber-400 scale-105 shadow-amber-500/50 z-20 animate-pulse'
                    : canBeAttacked
                    ? 'ring-2 ring-red-500 hover:scale-105 shadow-red-500/40 z-10 animate-bounce-subtle'
                    : isBaitCandidate
                    ? 'ring-3 ring-cyan-400 hover:scale-105 shadow-cyan-500/40 z-10'
                    : isSpellTargetCandidate
                    ? 'ring-3 ring-purple-400 hover:scale-105 shadow-purple-500/40 z-10 animate-pulse'
                    : canAttack
                    ? 'ring-2 ring-emerald-400/80 hover:ring-amber-400 hover:scale-105 shadow-emerald-500/20'
                    : isTapped
                    ? 'opacity-65 rotate-90 scale-90 border border-slate-700'
                    : 'border border-slate-700 hover:border-slate-500'
                }`}
                title={`${card.name} - Power: ${effectivePower}`}
              >
                {/* Physical Card Scan */}
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

                {/* Overlays / Badges */}

                {/* Top-Left: Status Badges (Blocker, Slayer, Speed, Evo) */}
                <div className="absolute top-0.5 left-0.5 flex flex-col gap-0.5 z-10">
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
                      title="Speed Attacker: Ignores summoning sickness"
                    >
                      <Zap className="w-2.5 h-2.5 fill-current" />
                    </div>
                  )}
                  {isEvolution && (
                    <div
                      className="px-1 py-0.2 rounded text-[8px] font-black bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 font-cinzel shadow flex items-center gap-0.5"
                      title="Evolution Creature"
                    >
                      <Layers className="w-2 h-2" />
                      {underlyingCount > 0 ? `+${underlyingCount}` : 'EVO'}
                    </div>
                  )}
                </div>

                {/* Top-Right: Summoning Sickness or Attacking indicator */}
                <div className="absolute top-0.5 right-0.5 z-10">
                  {sick ? (
                    <div
                      className="p-0.5 rounded bg-slate-950/85 text-indigo-400 font-bold border border-indigo-500/40 shadow backdrop-blur-xs flex items-center gap-0.5 text-[8px]"
                      title="Summoning Sickness: Cannot attack this turn"
                    >
                      <Moon className="w-2.5 h-2.5" />
                      <span>Zzz</span>
                    </div>
                  ) : isAttacker ? (
                    <div className="px-1 py-0.2 rounded bg-amber-500 text-slate-950 text-[8px] font-black font-cinzel tracking-wider animate-pulse">
                      ATK
                    </div>
                  ) : canAttack ? (
                    <div className="px-1 py-0.2 rounded bg-emerald-500/90 text-slate-950 text-[8px] font-bold font-mono">
                      READY
                    </div>
                  ) : null}
                </div>

                {/* Targetable Action Overlay */}
                {canBeAttacked && (
                  <div className="absolute inset-0 bg-red-950/70 backdrop-blur-xs flex flex-col items-center justify-center p-1 text-center z-10">
                    <Crosshair className="w-5 h-5 text-red-400 animate-spin-slow mb-0.5" />
                    <span className="text-[9px] font-black text-red-200 uppercase tracking-wider font-cinzel">
                      Attack Target
                    </span>
                  </div>
                )}

                {/* Spell Target Candidate Overlay */}
                {isSpellTargetCandidate && (
                  <div className="absolute inset-0 bg-purple-950/75 backdrop-blur-xs flex flex-col items-center justify-center p-1 text-center z-10">
                    <Crosshair className="w-5 h-5 text-purple-300 animate-pulse mb-0.5" />
                    <span className="text-[9px] font-black text-purple-200 uppercase tracking-wider font-cinzel">
                      Select Target
                    </span>
                  </div>
                )}

                {/* Evolution Bait Overlay */}
                {isBaitCandidate && (
                  <div className="absolute inset-0 bg-cyan-950/75 backdrop-blur-xs flex flex-col items-center justify-center p-1 text-center z-10">
                    <Layers className="w-5 h-5 text-cyan-300 animate-pulse mb-0.5" />
                    <span className="text-[9px] font-black text-cyan-200 uppercase tracking-wider font-cinzel">
                      Select Bait
                    </span>
                  </div>
                )}

                {/* Bottom Power Pill */}
                <div className="absolute bottom-0.5 right-0.5 left-0.5 z-10 flex items-center justify-between px-1 py-0.2 rounded bg-slate-950/90 border border-slate-700/80 backdrop-blur-xs">
                  <span className="text-[8px] text-slate-400 font-mono truncate max-w-[50px]">
                    {card.name}
                  </span>
                  <span className="text-[10px] font-mono font-black text-amber-400">
                    {effectivePower}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
