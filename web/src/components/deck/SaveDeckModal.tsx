import React, { useState, useEffect, useRef } from 'react';
import { X, Save, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  deckName: string;
  totalCards: number;
  onClose: () => void;
  onSave: (name: string) => void;
}

export const SaveDeckModal: React.FC<Props> = ({
  isOpen,
  deckName,
  totalCards,
  onClose,
  onSave
}) => {
  const [name, setName] = useState(deckName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal name state and select input when modal opens
  useEffect(() => {
    if (isOpen) {
      setName(deckName);
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, deckName]);

  // Listen to Escape key to close modal
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

  const trimmedName = name.trim();
  const isNameValid = trimmedName.length > 0;
  const isLegalSize = totalCards === 40;
  const canSave = isNameValid && isLegalSize;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    onSave(trimmedName);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-deck-title"
        className="relative flex flex-col max-w-md w-full bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl shadow-black"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Save className="w-4 h-4" />
            </div>
            <div>
              <h3 id="save-deck-title" className="text-lg font-cinzel font-bold text-white tracking-wide">
                Save Custom Deck
              </h3>
              <p className="text-xs text-slate-400">
                Save your deck build to local browser storage
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Badge */}
        {isLegalSize ? (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>40 / 40 Cards - Ready to save</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-amber-950/40 border border-amber-600/40 text-amber-300 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {totalCards} / 40 Cards - {totalCards < 40
                ? `${40 - totalCards} more card${40 - totalCards === 1 ? '' : 's'} needed (40 cards required to save)`
                : `Exceeds 40 cards by ${totalCards - 40} (40 cards required to save)`}
            </span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="save-deck-name-input"
              className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5"
            >
              Deck Name
            </label>
            <input
              id="save-deck-name-input"
              ref={inputRef}
              type="text"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onFocus={e => e.target.select()}
              placeholder="Enter deck name..."
              maxLength={60}
              className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border text-sm text-white placeholder-slate-500 focus:outline-none transition-colors ${
                !isNameValid
                  ? 'border-red-500/70 focus:border-red-400'
                  : 'border-slate-700 focus:border-amber-400'
              }`}
            />
            {!isNameValid && (
              <p className="text-xs text-red-400 flex items-center gap-1 mt-1.5 font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Deck name cannot be empty
              </p>
            )}
          </div>

          {/* Action Buttons in Footer */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!canSave}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-bold hover:brightness-110 shadow-lg shadow-amber-500/20 text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Save Deck
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
