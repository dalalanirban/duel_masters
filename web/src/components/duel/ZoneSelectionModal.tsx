import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Layers, Sparkles, Check, X, Maximize2 } from 'lucide-react';
import type { CardDefinition } from '../../types/card';
import type { ZoneKind, ZoneSelectionInteraction } from '../../engine/types';
import { CardBack } from './CardBack.tsx';

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
  const [isPeeking, setIsPeeking] = useState<boolean>(false);

  useEffect(() => {
    setSelectedIds([]);
    setSelectedRace(interaction?.raceOptions?.[0] || '');
    setIsPeeking(false);
  }, [isOpen, interaction]);

  useEffect(() => {
    if (!isOpen || !interaction) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[data-modal="graveyard"]')) return;
      e.preventDefault();
      e.stopPropagation();
      setIsPeeking((prev) => !prev);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, interaction]);

  const maxTotalPower = interaction?.contextData?.maxTotalPower as number | undefined;
  const currentTotalPower = useMemo(() => {
    if (!interaction || maxTotalPower === undefined) return 0;
    const byId = new Map(interaction.options.map((o) => [o.instanceId, o]));
    return selectedIds.reduce((sum, id) => sum + (byId.get(id)?.card.power ?? 0), 0);
  }, [interaction, selectedIds, maxTotalPower]);

  if (!isOpen || !interaction) return null;

  if (isPeeking) {
    return (
      <div className="fixed top-12 lg:top-14 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-16px)]">
        <button
          type="button"
          data-testid="peek-restore-pill"
          onClick={() => setIsPeeking(false)}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-950/95 hover:bg-slate-900 border-2 border-amber-400/75 text-amber-100 shadow-2xl backdrop-blur-md text-xs font-cinzel font-bold whitespace-nowrap cursor-pointer transition-transform active:scale-95"
        >
          <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate max-w-[220px] sm:max-w-xs">
            {interaction.sourceCardName} Selection &mdash; Restore
          </span>
          <Maximize2 className="w-3 h-3 text-sky-300 shrink-0" />
        </button>
      </div>
    );
  }

  const isRaceMode =
    interaction.actionKind === 'TAP_CHOOSE_RACE' ||
    interaction.actionKind === 'SPELL_CHOOSE_RACE' ||
    interaction.actionKind === 'CIP_CHOOSE_RACE' ||
    interaction.actionKind === 'CHOOSE_NUMBER';
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
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/40 shadow-2xl shadow-amber-950/50 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-900/90 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-400/30 shrink-0">
              <Layers className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-cinzel font-bold text-sm sm:text-base text-amber-300 tracking-wide truncate">
                {interaction.sourceCardName}
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">{interaction.prompt}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isRaceMode && (
              <div className="text-right">
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
            <button
              type="button"
              data-testid="peek-board-button"
              onClick={() => setIsPeeking(true)}
              title="Minimize modal to inspect the battlefield (Esc)"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600/80 text-sky-300 hover:text-white text-[11px] font-cinzel font-bold transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Peek Board</span>
            </button>
          </div>
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
                      <CardBack
                        variant={opt.zone === 'shields' ? 'shield' : 'default'}
                        className="w-full"
                        title={opt.label || 'Hidden Card'}
                      >
                        <div className="absolute inset-x-1 bottom-1.5 z-10 px-1.5 py-0.5 rounded bg-slate-950/85 border border-cyan-400/35 text-[10px] font-cinzel font-bold text-slate-100 text-center truncate backdrop-blur-xs">
                          {opt.label || 'Hidden Card'}
                        </div>
                      </CardBack>
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
                    {!opt.isHidden && (
                      <div className="text-[10px] font-mono text-slate-400">
                        {opt.card.power !== null && opt.card.power !== undefined
                          ? `${opt.card.power} Power \u2022 `
                          : ''}
                        {opt.card.manaCost} Mana
                      </div>
                    )}

                    {isSelected && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center shadow-md">
                        {interaction.actionKind === 'GARATYANO_TOP3' || interaction.actionKind === 'REORDER_TOP_N'
                          ? selectedIdx + 1
                          : <Check className="w-3.5 h-3.5" />}
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
