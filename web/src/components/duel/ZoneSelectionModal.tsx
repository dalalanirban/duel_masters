import React, { useEffect, useMemo, useState } from 'react';
import { Shield, Eye, Layers, Sparkles, Check, X } from 'lucide-react';
import type { CardDefinition } from '../../types/card';
import type { ZoneKind, ZoneSelectionInteraction } from '../../engine/types';

interface ZoneSelectionModalProps {
  isOpen: boolean;
  interaction: ZoneSelectionInteraction | null;
  onConfirm: (selectedIds: string[], selectedRace?: string) => void;
  onInspectCard?: (card: CardDefinition) => void;
}

const ZONE_LABELS: Record<ZoneKind, { label: string; badgeClass: string }> = {
  battleZone: { label: 'Battle Zone', badgeClass: 'bg-red-900/70 text-red-200 border-red-500/40' },
  hand: { label: 'Hand', badgeClass: 'bg-sky-900/70 text-sky-200 border-sky-500/40' },
  manaZone: { label: 'Mana Zone', badgeClass: 'bg-emerald-900/70 text-emerald-200 border-emerald-500/40' },
  shields: { label: 'Shields', badgeClass: 'bg-amber-900/70 text-amber-200 border-amber-500/40' },
  graveyard: { label: 'Graveyard', badgeClass: 'bg-purple-900/70 text-purple-200 border-purple-500/40' },
  deck: { label: 'Deck', badgeClass: 'bg-indigo-900/70 text-indigo-200 border-indigo-500/40' }
};

export const ZoneSelectionModal: React.FC<ZoneSelectionModalProps> = ({
  isOpen,
  interaction,
  onConfirm,
  onInspectCard
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedRace, setSelectedRace] = useState<string>('');

  useEffect(() => {
    setSelectedIds([]);
    setSelectedRace(interaction?.raceOptions?.[0] || '');
  }, [interaction]);

  const maxTotalPower = interaction?.contextData?.maxTotalPower as number | undefined;
  const currentTotalPower = useMemo(() => {
    if (!interaction || maxTotalPower === undefined) return 0;
    const byId = new Map(interaction.options.map((o) => [o.instanceId, o]));
    return selectedIds.reduce((sum, id) => sum + (byId.get(id)?.card.power ?? 0), 0);
  }, [interaction, selectedIds, maxTotalPower]);

  if (!isOpen || !interaction) return null;

  const isRaceMode = interaction.actionKind === 'TAP_CHOOSE_RACE';
  const powerExceeded = maxTotalPower !== undefined && currentTotalPower > maxTotalPower;
  const validSelectionCount =
    selectedIds.length >= interaction.minSelections &&
    selectedIds.length <= interaction.maxSelections;
  const canConfirm = isRaceMode
    ? Boolean(selectedRace)
    : validSelectionCount && !powerExceeded;

  const toggleOption = (id: string) => {
    if (interaction.maxSelections === 1) {
      setSelectedIds((prev) => (prev[0] === id ? [] : [id]));
      return;
    }
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= interaction.maxSelections) return prev;
      return [...prev, id];
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3">
      <div className="w-full max-w-2xl rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/40 shadow-2xl shadow-amber-950/50 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-900/90 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-400/30">
              <Layers className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="font-cinzel font-bold text-sm sm:text-base text-amber-300 tracking-wide">
                {interaction.sourceCardName}
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">{interaction.prompt}</p>
            </div>
          </div>

          {!isRaceMode && (
            <div className="shrink-0 text-right">
              <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-slate-800 border border-slate-700 text-amber-300">
                {selectedIds.length} / {interaction.maxSelections}
              </span>
              {interaction.minSelections > 0 && (
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Min: {interaction.minSelections}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
          {powerExceeded && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-950/70 border border-red-500/50 text-red-200 text-xs">
              Selected total power ({currentTotalPower}) exceeds allowed max ({maxTotalPower}). Deselect a creature.
            </div>
          )}

          {isRaceMode ? (
            <div className="flex flex-wrap gap-2">
              {(interaction.raceOptions || []).map((race) => {
                const active = selectedRace === race;
                return (
                  <button
                    key={race}
                    type="button"
                    onClick={() => setSelectedRace(race)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      active
                        ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold shadow-lg shadow-amber-500/20'
                        : 'bg-slate-800/80 text-slate-200 border-slate-700 hover:border-amber-400/50 hover:bg-slate-800'
                    }`}
                  >
                    {race}
                  </button>
                );
              })}
            </div>
          ) : interaction.options.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              No eligible cards available in the target zone.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {interaction.options.map((opt) => {
                const selectedIdx = selectedIds.indexOf(opt.instanceId);
                const isSelected = selectedIdx !== -1;
                const zoneMeta = ZONE_LABELS[opt.zone];
                const imgSrc = opt.card.imageAssetPath
                  ? `/${opt.card.imageAssetPath}`
                  : opt.card.imageUrl;

                return (
                  <div
                    key={opt.instanceId}
                    onClick={() => toggleOption(opt.instanceId)}
                    className={`relative rounded-xl border p-2 cursor-pointer transition-all select-none flex flex-col gap-1.5 ${
                      isSelected
                        ? 'bg-amber-950/40 border-amber-400 ring-2 ring-amber-400/60 shadow-lg shadow-amber-500/20 scale-[1.01]'
                        : 'bg-slate-900/90 border-slate-800 hover:border-slate-600 hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border ${zoneMeta.badgeClass}`}
                      >
                        {zoneMeta.label}
                      </span>
                      <span className="text-[9px] font-mono uppercase text-slate-400">
                        {opt.owner === 'player' ? 'Yours' : 'Opp'}
                      </span>
                    </div>

                    {opt.isHidden ? (
                      <div className="aspect-[5/7] w-full rounded-lg bg-gradient-to-br from-slate-800 via-indigo-950/70 to-slate-900 border border-slate-700 flex flex-col items-center justify-center gap-1.5 p-2">
                        <Shield className="w-7 h-7 text-amber-400/80" />
                        <span className="text-[11px] font-cinzel font-bold text-slate-200 text-center">
                          {opt.label || 'Hidden Card'}
                        </span>
                      </div>
                    ) : (
                      <div className="relative aspect-[5/7] w-full rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
                        {imgSrc ? (
                          <img
                            src={imgSrc}
                            alt={opt.card.name}
                            className={`w-full h-full object-cover ${opt.isTapped ? 'opacity-75' : ''}`}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center p-1 text-center text-[10px] text-slate-300">
                            {opt.card.name}
                          </div>
                        )}
                        {opt.isTapped && (
                          <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-slate-950/85 border border-slate-600 text-[9px] font-mono font-bold text-amber-300">
                            TAPPED
                          </span>
                        )}
                        {onInspectCard && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onInspectCard(opt.card);
                            }}
                            title="Inspect card"
                            className="absolute bottom-1 right-1 p-1 rounded bg-slate-950/80 hover:bg-slate-800 border border-slate-700 text-slate-200"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}

                    {!opt.isHidden && (
                      <div className="text-[11px] font-semibold text-slate-100 leading-tight truncate">
                        {opt.card.name}
                      </div>
                    )}
                    {!opt.isHidden && opt.card.power !== undefined && (
                      <div className="text-[10px] font-mono text-slate-400">
                        {opt.card.power} Power &bull; {opt.card.manaCost} Mana
                      </div>
                    )}

                    {isSelected && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center shadow-md">
                        {interaction.actionKind === 'GARATYANO_TOP3' ? selectedIdx + 1 : <Check className="w-3.5 h-3.5" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800/80 bg-slate-900/90 flex items-center justify-end gap-2.5">
          {!isRaceMode && interaction.minSelections === 0 && (
            <button
              type="button"
              onClick={() => onConfirm([], undefined)}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              Skip / None
            </button>
          )}

          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(selectedIds, isRaceMode ? selectedRace : undefined)}
            className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Confirm Selection
          </button>
        </div>
      </div>
    </div>
  );
};
