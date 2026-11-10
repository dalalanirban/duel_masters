import React, { useState } from 'react';
import { Zap, ShieldAlert, Crosshair, ArrowRight } from 'lucide-react';
import type { GameState, ShieldTriggerChoiceInteraction } from '../../engine/types';
import { CivilizationIcon } from '../card/CivilizationIcon';

interface TriggerModalProps {
  isOpen: boolean;
  interaction: ShieldTriggerChoiceInteraction | null;
  state: GameState;
  onResolve: (shieldId: string, activate: boolean, targets?: string[]) => void;
}

export const TriggerModal: React.FC<TriggerModalProps> = ({
  isOpen,
  interaction,
  state,
  onResolve
}) => {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  if (!isOpen || !interaction) return null;

  const triggers = interaction.triggers || [];
  if (triggers.length === 0) return null;

  // Resolve one trigger at a time
  const currentTrigger = triggers[0];
  const card = currentTrigger.card;
  const isCreature = card.type.includes('Creature');
  const isSpell = card.type.includes('Spell');

  const imageSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;

  // Check if spell targets creatures in battlefield
  // Friendly player is defending player (interaction.player)
  const defendingPlayer = interaction.player;
  const attackingPlayer = defendingPlayer === 'player' ? 'opponent' : 'player';
  const opponentCreatures = state.players[attackingPlayer].battleZone;
  const allCreatures = [
    ...state.players.player.battleZone,
    ...state.players.opponent.battleZone
  ];

  // Simple heuristic for target candidates based on spell rules
  const rulesLower = (card.rulesText || '').toLowerCase();
  const nameLower = card.name.toLowerCase();

  let candidateTargets = opponentCreatures;
  const needsTarget =
    isSpell &&
    (nameLower.includes('terror pit') ||
      nameLower.includes('spiral gate') ||
      nameLower.includes('death smoke') ||
      nameLower.includes('natural snare') ||
      nameLower.includes('solar ray') ||
      nameLower.includes('critical blade') ||
      nameLower.includes('tornado flame') ||
      rulesLower.includes('destroy 1 of your opponent') ||
      rulesLower.includes('choose a creature in the battle zone'));

  if (nameLower.includes('spiral gate') || rulesLower.includes('choose a creature in the battle zone')) {
    candidateTargets = allCreatures;
  } else if (nameLower.includes('death smoke')) {
    candidateTargets = opponentCreatures.filter((c) => !c.isTapped);
  } else if (nameLower.includes('critical blade')) {
    candidateTargets = opponentCreatures.filter((c) => c.card.isBlocker);
  } else if (nameLower.includes('tornado flame')) {
    candidateTargets = opponentCreatures.filter(
      (c) => (c.card.power || 0) + c.powerModifier <= 4000
    );
  }

  const handleActivate = () => {
    const targets = selectedTargetId ? [selectedTargetId] : undefined;
    onResolve(currentTrigger.shieldId, true, targets);
    setSelectedTargetId(null);
  };

  const handleSkip = () => {
    onResolve(currentTrigger.shieldId, false);
    setSelectedTargetId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div
        className="relative max-w-xl w-full bg-slate-900 border-2 border-amber-500/80 rounded-2xl p-6 shadow-2xl shadow-amber-500/20 flex flex-col gap-5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow corner element */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Header Alert Banner */}
        <div className="flex items-center gap-3 border-b border-amber-500/30 pb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-400 shadow-md">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-cinzel font-extrabold text-lg sm:text-xl text-amber-300 tracking-wider">
                SHIELD TRIGGER ACTIVATED!
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] tracking-wider uppercase font-mono">
                Free Cast
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              A broken shield revealed a Shield Trigger! You can cast or summon it immediately for 0 mana.
            </p>
          </div>
        </div>

        {/* Trigger Card Display */}
        <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start bg-slate-950/70 rounded-xl p-4 border border-slate-800">
          <div className="w-28 sm:w-32 aspect-[491/682] rounded-lg overflow-hidden shrink-0 border border-amber-400/80 shadow-lg">
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

          <div className="flex-1 space-y-2 text-left">
            <div className="flex items-center gap-2">
              <CivilizationIcon civilization={card.civilizations[0]} className="w-4 h-4" />
              <h4 className="font-cinzel font-bold text-base text-white">{card.name}</h4>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-slate-400 font-mono">
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                {card.type}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300">
                Cost: {card.manaCost} (0 now)
              </span>
              {card.power && (
                <span className="px-2 py-0.5 rounded bg-slate-800 text-red-400">
                  Power: {card.power}
                </span>
              )}
            </div>

            <p className="text-xs text-slate-300 italic bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
              {card.rulesText || 'No effect text.'}
            </p>
          </div>
        </div>

        {/* Target Selection if needed */}
        {needsTarget && candidateTargets.length > 0 && (
          <div className="space-y-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                Select Target Creature:
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {selectedTargetId ? '1 target selected' : 'Choose 1 target below'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto">
              {candidateTargets.map((creature) => {
                const isSelected = selectedTargetId === creature.instanceId;
                return (
                  <button
                    key={creature.instanceId}
                    type="button"
                    onClick={() =>
                      setSelectedTargetId(isSelected ? null : creature.instanceId)
                    }
                    className={`p-2 rounded-lg border text-left flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/20 text-white'
                        : 'border-slate-800 bg-slate-900 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <span className="text-xs truncate font-medium">{creature.card.name}</span>
                    <span className="text-[10px] font-mono text-amber-400 ml-1">
                      {creature.card.power}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleSkip}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            Keep in Hand / Skip
          </button>

          <button
            type="button"
            disabled={needsTarget && candidateTargets.length > 0 && !selectedTargetId}
            onClick={handleActivate}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-black font-cinzel tracking-wider bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-lg shadow-amber-500/30 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>{isCreature ? 'Summon for Free' : 'Cast Spell for Free'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
