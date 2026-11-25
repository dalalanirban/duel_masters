import React from 'react';
import { Eye, Moon, RefreshCw, Sparkles } from 'lucide-react';
import type { CardDefinition } from '../../types/card';
import type { SilentSkillChoiceInteraction } from '../../engine/types';

interface SilentSkillModalProps {
  isOpen: boolean;
  interaction: SilentSkillChoiceInteraction | null;
  onResolve: (activate: boolean) => void;
  onInspectCard?: (card: CardDefinition) => void;
}

export const SilentSkillModal: React.FC<SilentSkillModalProps> = ({
  isOpen,
  interaction,
  onResolve,
  onInspectCard
}) => {
  if (!isOpen || !interaction) return null;

  const { card, remainingCreatureIds } = interaction;
  const imgSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3">
      <div className="w-full max-w-md rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-violet-500/45 shadow-2xl shadow-violet-950/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-violet-500/15 border border-violet-400/30">
              <Moon className="w-4 h-4 text-violet-300" />
            </div>
            <div>
              <h3 className="font-cinzel font-bold text-sm sm:text-base text-violet-200 tracking-wide">
                Silent Skill Activation
              </h3>
              <p className="text-[11px] text-slate-400">
                Start of Turn &bull; Before Untap &amp; Draw
              </p>
            </div>
          </div>
          {remainingCreatureIds.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
              +{remainingCreatureIds.length} queued
            </span>
          )}
        </div>

        <div className="p-5 flex gap-4 items-start">
          <div className="relative w-28 shrink-0 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 shadow-lg">
            {imgSrc ? (
              <img src={imgSrc} alt={card.name} className="w-full h-auto object-cover" />
            ) : (
              <div className="aspect-[5/7] flex items-center justify-center p-2 text-center text-xs text-slate-300">
                {card.name}
              </div>
            )}
            {onInspectCard && (
              <button
                type="button"
                onClick={() => onInspectCard(card)}
                className="absolute bottom-1.5 right-1.5 p-1 rounded bg-slate-950/85 hover:bg-slate-800 border border-slate-700 text-slate-200"
                title="Inspect card"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-white">{card.name}</h4>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              This creature is tapped at the start of your turn. Instead of untapping it, you may keep it tapped to activate its Silent Skill:
            </p>
            <div className="mt-2.5 p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-violet-200/90 whitespace-pre-line">
              {card.rulesText}
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-800/80 bg-slate-900/90 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => onResolve(false)}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Untap Normally
          </button>

          <button
            type="button"
            onClick={() => onResolve(true)}
            className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-violet-500 hover:bg-violet-400 text-white flex items-center gap-1.5 shadow-lg shadow-violet-500/20"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Keep Tapped &amp; Activate
          </button>
        </div>
      </div>
    </div>
  );
};
