import React, { useEffect, useState } from 'react';
import { Sparkles, Check, X, HelpCircle, Eye, Maximize2 } from 'lucide-react';
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
  const [isPeeking, setIsPeeking] = useState<boolean>(false);

  useEffect(() => {
    setIsPeeking(false);
  }, [isOpen, abilityName, prompt]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[data-modal="graveyard"]')) return;
      e.preventDefault();
      e.stopPropagation();
      setIsPeeking((prev) => !prev);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  if (isPeeking) {
    return (
      <div className="fixed top-12 lg:top-14 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-16px)]">
        <button
          type="button"
          data-testid="peek-restore-pill"
          onClick={() => setIsPeeking(false)}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-950/95 hover:bg-slate-900 border-2 border-amber-400/75 text-amber-100 shadow-2xl backdrop-blur-md text-xs font-cinzel font-bold whitespace-nowrap cursor-pointer transition-transform active:scale-95"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate max-w-[220px] sm:max-w-xs">
            {abilityName} &mdash; Restore
          </span>
          <Maximize2 className="w-3 h-3 text-sky-300 shrink-0" />
        </button>
      </div>
    );
  }

  const imageSrc = sourceCard
    ? (sourceCard.imageAssetPath ? `/${sourceCard.imageAssetPath}` : sourceCard.imageUrl)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px] animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="optional-modal-title"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="relative w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-2xl p-5 shadow-2xl shadow-black overflow-hidden flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle decorative glow */}
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Header + Peek Board */}
        <div className="flex items-center justify-between gap-2.5 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
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

          <button
            type="button"
            data-testid="peek-board-button"
            onClick={() => setIsPeeking(true)}
            title="Minimize modal to inspect the battlefield (Esc)"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600/80 text-sky-300 hover:text-white text-[10.5px] font-cinzel font-bold transition-colors cursor-pointer shrink-0"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Peek Board</span>
          </button>
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
