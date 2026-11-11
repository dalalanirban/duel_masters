import React, { useEffect } from 'react';
import { Skull, X, Sparkles, Zap, Shield, Check } from 'lucide-react';
import type { CardInstance, PlayerId } from '../../engine/types';
import type { CardDefinition, Civilization } from '../../types/card';
import { CivilizationIcon } from '../card/CivilizationIcon';

export interface GraveyardModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: CardInstance[];
  owner: PlayerId;
  title?: string;
  onHoverCard?: (card: CardDefinition | null) => void;
  onInspectCard?: (card: CardDefinition) => void;
  onSelectCard?: (card: CardInstance) => void;
  selectableCardIds?: string[];
  selectedCardIds?: string[];
}

const getCivBorderColor = (civs: Civilization[]): string => {
  if (!civs || civs.length === 0) return 'border-slate-700';
  if (civs.length > 1) return 'border-amber-400/80';
  switch (civs[0]) {
    case 'Light':
      return 'border-amber-400/70 hover:border-amber-300';
    case 'Water':
      return 'border-sky-400/70 hover:border-sky-300';
    case 'Darkness':
      return 'border-purple-400/70 hover:border-purple-300';
    case 'Fire':
      return 'border-red-400/70 hover:border-red-300';
    case 'Nature':
      return 'border-emerald-400/70 hover:border-emerald-300';
    default:
      return 'border-slate-700 hover:border-slate-500';
  }
};

export const GraveyardModal: React.FC<GraveyardModalProps> = ({
  isOpen,
  onClose,
  cards,
  owner,
  title,
  onHoverCard,
  onInspectCard,
  onSelectCard,
  selectableCardIds,
  selectedCardIds = []
}) => {
  // Listen for Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isOpponent = owner === 'opponent';
  const modalTitle =
    title ||
    `${isOpponent ? "Opponent's" : "Your"} Graveyard (${cards.length} ${
      cards.length === 1 ? 'card' : 'cards'
    })`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={modalTitle}
    >
      <div
        className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/80 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-950/60 border border-purple-500/40 flex items-center justify-center text-purple-400 shadow-inner">
              <Skull className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-cinzel font-bold text-white flex items-center gap-2">
                <span>{modalTitle}</span>
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Destroyed creatures and cast spells sent to the graveyard
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 border border-transparent hover:border-slate-700 transition-colors"
            title="Close Graveyard"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Cards Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin">
          {cards.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center text-slate-500">
              <div className="w-16 h-16 rounded-full bg-slate-800/50 border border-slate-700/60 flex items-center justify-center mb-3 text-slate-600">
                <Skull className="w-8 h-8" />
              </div>
              <h3 className="font-cinzel font-bold text-slate-400 text-sm sm:text-base">
                Graveyard is Empty
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-1 max-w-xs">
                No cards have been discarded, destroyed, or cast into this graveyard yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
              {cards.map((item, idx) => {
                const card = item.card;
                const isSelected = selectedCardIds.includes(item.instanceId);
                const isSelectable = selectableCardIds
                  ? selectableCardIds.includes(item.instanceId)
                  : Boolean(onSelectCard);
                const imageSrc = card.imageAssetPath
                  ? `/${card.imageAssetPath}`
                  : card.imageUrl;
                const borderStyle = getCivBorderColor(card.civilizations);

                return (
                  <div
                    key={item.instanceId || `gy-${idx}`}
                    onMouseEnter={() => onHoverCard?.(card)}
                    onMouseLeave={() => onHoverCard?.(null)}
                    onClick={() => {
                      if (onSelectCard && isSelectable) {
                        onSelectCard(item);
                      }
                      onInspectCard?.(card);
                    }}
                    className={`group relative rounded-xl border-2 bg-slate-950 overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.03] hover:shadow-xl hover:shadow-black/60 flex flex-col ${borderStyle} ${
                      isSelected
                        ? 'ring-2 ring-amber-400 border-amber-400 shadow-lg shadow-amber-500/20'
                        : ''
                    }`}
                  >
                    {/* Card Image Aspect Container (approx 2.5:3.5) */}
                    <div className="relative aspect-[5/7] w-full bg-slate-900 overflow-hidden">
                      <img
                        src={imageSrc}
                        alt={card.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (card.imageUrl && target.src !== card.imageUrl) {
                            target.src = card.imageUrl;
                          }
                        }}
                      />

                      {/* Top Overlay Badges */}
                      <div className="absolute top-1.5 inset-x-1.5 flex items-center justify-between pointer-events-none">
                        {/* Mana Cost */}
                        <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-950/85 backdrop-blur-xs border border-amber-400/40 text-amber-300 font-cinzel font-black text-xs shadow-md">
                          <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                          <span>{card.manaCost}</span>
                        </div>

                        {/* Civ Icons */}
                        <div className="flex items-center gap-1 px-1 py-0.5 rounded-full bg-slate-950/85 backdrop-blur-xs border border-slate-700 shadow-md">
                          {card.civilizations.map((civ) => (
                            <CivilizationIcon
                              key={civ}
                              civilization={civ}
                              className="w-3.5 h-3.5"
                            />
                          ))}
                        </div>
                      </div>

                      {/* Shield Trigger Indicator */}
                      {card.isShieldTrigger && (
                        <div className="absolute top-8 left-1.5 px-1 py-0.5 rounded bg-amber-500/90 text-slate-950 font-bold text-[9px] flex items-center gap-0.5 shadow-md">
                          <Shield className="w-2.5 h-2.5 fill-current" />
                          <span>ST</span>
                        </div>
                      )}

                      {/* Selected Checkmark Badge */}
                      {isSelected && (
                        <div className="absolute inset-0 bg-amber-500/20 backdrop-blur-[1px] flex items-center justify-center">
                          <div className="w-9 h-9 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shadow-lg font-bold">
                            <Check className="w-5 h-5 stroke-[3]" />
                          </div>
                        </div>
                      )}

                      {/* Power Badge if creature */}
                      {card.power !== null && (
                        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-slate-950/90 backdrop-blur-xs border border-slate-700 text-yellow-300 font-mono font-black text-[11px] flex items-center gap-1 shadow-md">
                          <Zap className="w-2.5 h-2.5 text-yellow-400 fill-current" />
                          <span>{card.power.toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Info Strip */}
                    <div className="p-2 bg-gradient-to-t from-slate-950 via-slate-900 to-slate-900/95 border-t border-slate-800 flex flex-col justify-between flex-1">
                      <div>
                        <div className="font-cinzel font-bold text-xs text-white truncate group-hover:text-amber-300 transition-colors" title={card.name}>
                          {card.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                          {card.type}
                          {card.races && card.races.length > 0 && ` • ${card.races.join('/')}`}
                        </div>
                      </div>

                      {/* Action Prompt */}
                      <div className="mt-1.5 pt-1 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span className="text-amber-400/80 group-hover:text-amber-300 transition-colors">
                          {isSelectable ? 'Click to select' : 'Click to inspect'}
                        </span>
                        <span>#{idx + 1}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-2.5 border-t border-slate-800 bg-slate-950/80 text-xs">
          <div className="text-slate-400 font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block animate-pulse" />
            <span>Hover card to preview in left pane inspector. Click to view or select.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors border border-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
