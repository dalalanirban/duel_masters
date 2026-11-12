import React from 'react';
import { Sparkles, Check, X, HelpCircle } from 'lucide-react';
import type { CardDefinition } from '../../types/card';

interface OptionalChoiceModalProps {
  isOpen: boolean;
  abilityName: string;
  prompt: string;
  sourceCard?: CardDefinition | null;
  onAccept: () => void;
  onDecline: () => void;
}

export const OptionalChoiceModal: React.FC<OptionalChoiceModalProps> = ({
  isOpen,
  abilityName,
  prompt,
  sourceCard,
  onAccept,
  onDecline
}) => {
  if (!isOpen) return null;

  const imageSrc = sourceCard
    ? (sourceCard.imageAssetPath ? `/${sourceCard.imageAssetPath}` : sourceCard.imageUrl)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="optional-modal-title"
    >
      <div className="relative w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-2xl p-5 shadow-2xl shadow-black overflow-hidden flex flex-col gap-4">
        {/* Subtle decorative glow */}
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              Optional Ability Trigger
            </div>
            <h3
              id="optional-modal-title"
              className="text-sm font-cinzel font-bold text-white tracking-wide truncate"
            >
              {abilityName}
            </h3>
          </div>
        </div>

        {/* Body content with card thumbnail & prompt */}
        <div className="flex items-center gap-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
          {imageSrc && (
            <div className="w-14 aspect-[491/682] rounded-md overflow-hidden border border-slate-700/80 shrink-0 shadow-md">
              <img
                src={imageSrc}
                alt={sourceCard?.name || 'Card'}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1.5 text-xs text-slate-200 leading-relaxed font-sans">
              <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>{prompt}</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 italic">
              This ability is optional (&quot;may&quot;). You can choose whether to activate it now.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-700/80 bg-slate-800 hover:bg-slate-700/90 text-slate-300 hover:text-white font-cinzel font-bold text-xs transition-colors cursor-pointer shadow-xs"
          >
            <X className="w-3.5 h-3.5 text-slate-400" />
            <span>Skip / Don&apos;t Use</span>
          </button>

          <button
            type="button"
            onClick={onAccept}
            className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-cinzel font-black text-xs transition-all shadow-md shadow-amber-500/20 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5 text-slate-950" />
            <span>Use Ability</span>
          </button>
        </div>
      </div>
    </div>
  );
};
