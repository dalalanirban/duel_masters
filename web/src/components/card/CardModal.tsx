import React from 'react';
import { CardDefinition } from '../../types/card';
import { SETS } from '../../data/cardLoader';
import { X, Plus, Minus, Info, Sparkles } from 'lucide-react';

interface Props {
  card: CardDefinition | null;
  deckCount: number;
  onClose: () => void;
  onAdd: (card: CardDefinition) => void;
  onRemove: (card: CardDefinition) => void;
}

export const CardModal: React.FC<Props> = ({
  card,
  deckCount,
  onClose,
  onAdd,
  onRemove
}) => {
  if (!card) return null;

  const imageSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;
  const setDef = SETS.find(s => s.code === card.set || s.id === card.set);
  const isEvolution = Boolean(card.isEvolution || card.type === 'Evolution Creature');
  const isMultiCiv = Boolean(card.isMultiCiv || card.civilizations.length > 1);

  // Determine evolution requirement text
  const evoMatch = card.rulesText.match(/Evolution[—\-]([^\n\.]+)/i);
  const evoRequirement = (card.evolutionRaces && card.evolutionRaces.length > 0)
    ? `Put on one of your ${card.evolutionRaces.join(' or ')}.`
    : evoMatch
      ? `${evoMatch[1].trim()}.`
      : (card.races && card.races.length > 0)
        ? `Put on one of your ${card.races.join(' or ')}.`
        : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col md:flex-row gap-6 max-w-3xl w-full max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl shadow-black overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors z-10 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Full Physical Card Image Scan */}
        <div className="flex justify-center items-center shrink-0">
          <div className="w-64 sm:w-72 aspect-[491/682] rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-700 bg-slate-950">
            <img
              src={imageSrc}
              alt={card.name}
              className="w-full h-full object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (card.imageUrl && target.src !== card.imageUrl) {
                  target.src = card.imageUrl;
                }
              }}
            />
          </div>
        </div>

        {/* Extended Details & Lore Panel */}
        <div className="flex-1 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700 font-bold">
                {card.id}
              </span>
              <span className="text-xs text-slate-300 font-medium bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/60">
                Set: <strong className="text-amber-300">{card.set}</strong>{setDef ? ` (${setDef.name})` : ''} · #{card.collectorNumber}
              </span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {card.rarity}
              </span>
            </div>

            <h2 className="text-2xl font-cinzel font-bold text-white tracking-wide">
              {card.name}
            </h2>

            <div className="flex flex-wrap gap-2 mt-2.5 text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                Type: <strong className="text-white">{card.type}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                Civilization: <strong className="text-amber-300">{card.civilizations.join(', ')}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                Mana Cost: <strong className="text-white">{card.manaCost}</strong>
              </span>
              {card.power !== null && (
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                  Power: <strong className="text-amber-400">{card.power}</strong>
                  {card.powerAttackerBonus > 0 && (
                    <span className="text-red-400 font-semibold ml-1">+{card.powerAttackerBonus}</span>
                  )}
                </span>
              )}
              {card.races.length > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 italic">
                  {card.races.join(' / ')}
                </span>
              )}
            </div>

            {/* Mechanic Badges */}
            {(isEvolution || card.isSurvivor || card.isCharger || isMultiCiv || card.isShieldTrigger || card.isBlocker || card.isSlayer || card.isSpeedAttacker || card.breakerCount >= 2) && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {isEvolution && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/50">
                    ⚡ Evolution Creature
                  </span>
                )}
                {card.isSurvivor && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-teal-500/20 text-teal-300 border border-teal-400/50">
                    👥 Survivor
                  </span>
                )}
                {card.isCharger && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/50">
                    🔋 Charger
                  </span>
                )}
                {isMultiCiv && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-gradient-to-r from-amber-500/20 to-sky-500/20 text-amber-200 border border-amber-400/50">
                    🌐 Multi-Civilization
                  </span>
                )}
                {card.isShieldTrigger && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    ⚡ Shield Trigger
                  </span>
                )}
                {card.isBlocker && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/30">
                    🛡 Blocker
                  </span>
                )}
                {card.isSlayer && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/30">
                    ☠ Slayer
                  </span>
                )}
                {card.isSpeedAttacker && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/30">
                    💨 Speed Attacker
                  </span>
                )}
                {card.breakerCount >= 2 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
                    ⚔ {card.breakerCount}x Breaker
                  </span>
                )}
              </div>
            )}

            {/* Evolution Requirement Callout */}
            {isEvolution && evoRequirement && (
              <div className="mt-2.5 flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                <span className="font-bold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 whitespace-nowrap">
                  Evolution Requirement
                </span>
                <span>{evoRequirement}</span>
              </div>
            )}
          </div>

          {/* Rules & Effects */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm leading-relaxed text-slate-200">
            <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              <Info className="w-3.5 h-3.5 text-amber-400" /> Rules & Abilities
            </h4>
            <p className="whitespace-pre-line">{card.rulesText || 'None (Vanilla creature).'}</p>
          </div>

          {/* Flavor Text / Lore */}
          {card.flavorText && (
            <div className="p-3 rounded-xl bg-slate-950/50 border border-white/5 text-xs italic text-slate-400 leading-relaxed">
              <span className="flex items-center gap-1 not-italic font-bold text-[10px] uppercase text-slate-500 mb-1">
                <Sparkles className="w-3 h-3 text-amber-400/80" /> Flavor Quote
              </span>
              "{card.flavorText}"
            </div>
          )}

          {/* Illustrator */}
          {card.illustrator && (
            <p className="text-[11px] text-slate-500">
              Illustrator: <span className="text-slate-400">{card.illustrator}</span>
            </p>
          )}

          {/* Deck Builder Controls in Modal */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">In Active Deck:</span>
              <span className="text-sm font-bold text-amber-400 font-mono">{deckCount} / 4</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onRemove(card)}
                disabled={deckCount <= 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" /> Remove
              </button>

              <button
                type="button"
                onClick={() => onAdd(card)}
                disabled={deckCount >= 4}
                className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-950 transition-colors shadow-md shadow-amber-500/20 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add to Deck
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
