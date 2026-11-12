import React, { useState, useEffect, useRef } from 'react';
import { Zap, ShieldAlert, ArrowRight, Clock, X } from 'lucide-react';
import type { GameState, ShieldTriggerChoiceInteraction, CreatureInstance, PlayerId } from '../../engine/types';
import type { CardDefinition } from '../../types/card';
import { CivilizationIcon } from '../card/CivilizationIcon';
import { getCreatureEffectivePower } from '../../engine/combat';

interface TriggerModalProps {
  isOpen: boolean;
  interaction: ShieldTriggerChoiceInteraction | null;
  state: GameState;
  onResolve: (shieldId: string, activate: boolean, targets?: string[]) => void;
  onStartArenaTargetSelect: (shieldId: string, card: CardDefinition, validTargetIds: string[]) => void;
}

/**
 * Helper to determine if a Shield Trigger card requires creature target selection on the battlefield.
 */
export function getTriggerTargetCandidates(
  card: CardDefinition,
  state: GameState,
  defendingPlayer: PlayerId
): CreatureInstance[] {
  const opponent: PlayerId = defendingPlayer === 'player' ? 'opponent' : 'player';
  const oppCreatures = state.players[opponent].battleZone;
  const allCreatures = [
    ...state.players.player.battleZone,
    ...state.players.opponent.battleZone
  ];

  const rules = (card.rulesText || '').toLowerCase();
  const name = card.name.toLowerCase();

  // 1. Destroy 1 opponent creature (e.g. Terror Pit)
  if (name.includes('terror pit') || (/destroy (?:one|1) of your opponent's creatures/i.test(rules) && !/power \d+ or less/i.test(rules))) {
    return oppCreatures;
  }

  // 2. Put opponent creature into mana zone (e.g. Natural Snare)
  if (name.includes('natural snare') || /put (?:it|that creature|one of your opponent's creatures) into (?:his|their) mana zone/i.test(rules)) {
    return oppCreatures;
  }

  // 3. Return creature to hand (e.g. Spiral Gate, Aqua Surfer)
  if (name.includes('spiral gate') || name.includes('aqua surfer') || /return (?:a|one|1) creature.*to (?:its|their) owner's hand/i.test(rules)) {
    return allCreatures;
  }

  // 4. Power threshold destroy (e.g. Tornado Flame <= 4000, Crimson Hammer / Phantom Dragon <= 2000, Hurlosaur <= 1000)
  const powerMatch = rules.match(/power (\d+) or less/i);
  if (powerMatch || name.includes('tornado flame') || name.includes('phantom dragon') || name.includes('hurlosaur')) {
    const maxPower = powerMatch
      ? parseInt(powerMatch[1], 10)
      : name.includes('tornado flame')
      ? 4000
      : name.includes('hurlosaur')
      ? 1000
      : 2000;
    return oppCreatures.filter(
      (c) => getCreatureEffectivePower(c, false, state.players[opponent], state.players[defendingPlayer]) <= maxPower
    );
  }

  // 5. Blocker destroy (e.g. Critical Blade)
  if (name.includes('critical blade') || (/destroy.*blocker/i.test(rules) && oppCreatures.length > 0)) {
    return oppCreatures.filter((c) => c.card.isBlocker);
  }

  // 6. Tap 1 opponent creature (e.g. Solar Ray)
  if (name.includes('solar ray') || /choose (?:one|1) of your opponent's creatures.*and tap it/i.test(rules)) {
    return oppCreatures.filter((c) => !c.isTapped);
  }

  return [];
}

export const TriggerModal: React.FC<TriggerModalProps> = ({
  isOpen,
  interaction,
  state,
  onResolve,
  onStartArenaTargetSelect
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(20);
  const onResolveRef = useRef(onResolve);
  onResolveRef.current = onResolve;

  const triggers = interaction?.triggers || [];
  const currentTrigger = triggers[0];
  const currentShieldId = currentTrigger?.shieldId;

  // 20-Second Countdown Timer
  useEffect(() => {
    if (!isOpen || !interaction || !currentShieldId) return;

    setTimeLeft(20);
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, currentShieldId]);

  // Handle timeout expiration purely in effect
  useEffect(() => {
    if (timeLeft === 0 && isOpen && interaction && currentShieldId) {
      onResolveRef.current(currentShieldId, false);
    }
  }, [timeLeft, isOpen, interaction, currentShieldId]);

  if (!isOpen || !interaction || !currentTrigger) return null;

  const card = currentTrigger.card;
  const isCreature = card.type.includes('Creature');
  const imageSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;
  const defendingPlayer = interaction.player;

  const candidateTargets = getTriggerTargetCandidates(card, state, defendingPlayer);
  const needsTargetOnArena = candidateTargets.length > 0;

  const handleUseTrigger = () => {
    if (needsTargetOnArena) {
      // Transition to Battle Arena target selection so user can see all tapped/untapped cards and battlefield
      onStartArenaTargetSelect(currentTrigger.shieldId, card, candidateTargets.map((c) => c.instanceId));
    } else {
      // Resolves immediately for non-targeted triggers
      onResolve(currentTrigger.shieldId, true);
    }
  };

  const handleSkip = () => {
    onResolve(currentTrigger.shieldId, false);
  };

  const progressPercent = Math.max(0, Math.min(100, (timeLeft / 20) * 100));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative max-w-lg w-full bg-slate-900/95 border-2 border-amber-500/80 rounded-2xl p-5 shadow-2xl shadow-amber-500/20 flex flex-col gap-3.5 overflow-hidden backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow corner element */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* 20-Second Countdown Progress Bar */}
        <div className="w-full space-y-1">
          <div className="flex items-center justify-between text-xs font-mono font-bold">
            <span className="flex items-center gap-1.5 text-amber-400">
              <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
              Shield Trigger Window:
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                timeLeft <= 5 ? 'bg-red-500/30 text-red-300 animate-pulse' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {timeLeft}s remaining
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                timeLeft <= 5 ? 'bg-red-500' : timeLeft <= 10 ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Header Alert Banner */}
        <div className="flex items-center gap-3 border-b border-amber-500/30 pb-2.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-400 shadow-md shrink-0">
            <ShieldAlert className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-cinzel font-extrabold text-base sm:text-lg text-amber-300 tracking-wider">
                SHIELD TRIGGER ACTIVATED!
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[9.5px] tracking-wider uppercase font-mono">
                Free Cast (0 Mana)
              </span>
            </div>
            <p className="text-[11.5px] text-slate-300 mt-0.5">
              A broken shield revealed a Shield Trigger! You can cast or summon it immediately for no cost.
            </p>
          </div>
        </div>

        {/* Trigger Card Display */}
        <div className="flex gap-3.5 items-center bg-slate-950/80 rounded-xl p-3 border border-slate-800">
          <div className="w-20 sm:w-24 aspect-[491/682] rounded-lg overflow-hidden shrink-0 border border-amber-400/80 shadow-lg">
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
          </div>

          <div className="flex-1 space-y-1.5 text-left min-w-0">
            <div className="flex items-center gap-1.5">
              <CivilizationIcon civilization={card.civilizations[0]} className="w-3.5 h-3.5 shrink-0" />
              <h4 className="font-cinzel font-bold text-sm text-white truncate">{card.name}</h4>
            </div>

            <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-400 font-mono">
              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-200">
                {card.type}
              </span>
              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 font-bold">
                Cost: 0 (Normal: {card.manaCost})
              </span>
              {card.power && (
                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-red-400 font-bold">
                  Power: {card.power}
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-300 bg-slate-900/90 p-2 rounded-lg border border-slate-800/80 line-clamp-3">
              {card.rulesText || 'No effect text.'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-2.5">
          <span className="text-[10.5px] text-slate-400">
            Skipping will put this card into your hand.
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSkip}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Skip (Keep in Hand)</span>
            </button>

            <button
              type="button"
              onClick={handleUseTrigger}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black font-cinzel tracking-wider bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-lg shadow-amber-500/30 transition-all cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>
                {needsTargetOnArena
                  ? 'Yes, Choose Target on Arena'
                  : isCreature
                  ? 'Yes, Summon Creature'
                  : 'Yes, Cast Spell'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
