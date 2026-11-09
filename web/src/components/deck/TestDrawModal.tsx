import React, { useState, useEffect, useCallback } from 'react';
import { CardDefinition, DeckItem } from '../../types/card';
import { DuelCard } from '../card/DuelCard';
import { X, RefreshCw, Plus, Shield, Eye } from 'lucide-react';

interface Props {
  items: DeckItem[];
  isOpen: boolean;
  onClose: () => void;
}

export const TestDrawModal: React.FC<Props> = ({ items, isOpen, onClose }) => {
  const [shields, setShields] = useState<{ card: CardDefinition; revealed: boolean }[]>([]);
  const [hand, setHand] = useState<CardDefinition[]>([]);
  const [remainingDeck, setRemainingDeck] = useState<CardDefinition[]>([]);
  const [turnCount, setTurnCount] = useState(1);

  // Shuffle & deal 5 shields, 5 hand cards
  const dealNewGame = useCallback(() => {
    // Expand DeckItems into 40 cards
    const pool: CardDefinition[] = [];
    items.forEach(({ card, count }) => {
      for (let i = 0; i < count; i++) {
        pool.push(card);
      }
    });

    // Fisher-Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    // 5 shields
    const initialShields = pool.slice(0, 5).map(card => ({ card, revealed: false }));
    // 5 hand cards
    const initialHand = pool.slice(5, 10);
    // Remaining deck
    const rest = pool.slice(10);

    setShields(initialShields);
    setHand(initialHand);
    setRemainingDeck(rest);
    setTurnCount(1);
  }, [items]);

  useEffect(() => {
    if (isOpen) {
      dealNewGame();
    }
  }, [isOpen, dealNewGame]);

  if (!isOpen) return null;

  const toggleShield = (index: number) => {
    setShields(prev =>
      prev.map((s, i) => (i === index ? { ...s, revealed: !s.revealed } : s))
    );
  };

  const drawCard = () => {
    if (remainingDeck.length === 0) return;
    const nextCard = remainingDeck[0];
    setHand(prev => [...prev, nextCard]);
    setRemainingDeck(prev => prev.slice(1));
    setTurnCount(prev => prev + 1);
  };

  const totalCardsInDeck = items.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col max-w-5xl w-full max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl shadow-black overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div>
            <h3 className="text-xl font-cinzel font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-400" />
              Opening Hand & Shield Test Simulator
            </h3>
            <p className="text-xs text-slate-400">
              Simulates real duel start: 5 face-down Shields, 5 Starting Hand cards ({remainingDeck.length} remaining in deck).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={dealNewGame}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Re-deal / Shuffle
            </button>

            <button
              onClick={drawCard}
              disabled={remainingDeck.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" /> Turn {turnCount} Draw
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {totalCardsInDeck < 40 && (
          <div className="p-3 mb-4 rounded-lg bg-amber-950/40 border border-amber-600/40 text-xs text-amber-300">
            Note: Your active deck has {totalCardsInDeck} cards (40 cards required for official rules). Test results may vary.
          </div>
        )}

        {/* 1. Shield Zone (5 cards) */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Shield Zone (5 Shields)
            </h4>
            <span className="text-[11px] text-slate-400">Click a shield to peek/break</span>
          </div>

          <div className="grid grid-cols-5 gap-3">
            {shields.map((s, index) => (
              <div
                key={index}
                onClick={() => toggleShield(index)}
                className="relative cursor-pointer group"
              >
                {s.revealed ? (
                  <div className="transform scale-95 origin-top">
                    <DuelCard card={s.card} compact={true} />
                  </div>
                ) : (
                  <div className="w-full h-44 rounded-xl border-2 border-amber-500/50 bg-gradient-to-br from-amber-950/60 via-slate-950 to-amber-900/40 shadow-lg flex flex-col items-center justify-center p-3 text-center transition-transform hover:scale-105">
                    <div className="w-10 h-10 rounded-full border border-amber-400/60 bg-amber-500/10 flex items-center justify-center mb-2 shadow-[0_0_10px_rgba(245,158,11,0.3)]">
                      <Shield className="w-5 h-5 text-amber-400" />
                    </div>
                    <span className="font-cinzel font-bold text-xs text-amber-200">
                      Shield #{index + 1}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Eye className="w-3 h-3" /> Click to peek
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 2. Hand (5+ cards) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400">
              Player Hand ({hand.length} Cards)
            </h4>
            <span className="text-[11px] text-slate-400 font-mono">
              Mana costs: {hand.map(c => c.manaCost).sort((a,b)=>a-b).join(', ')}
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            {hand.map((card, i) => (
              <div key={i} className="transform hover:-translate-y-2 transition-transform">
                <DuelCard card={card} compact={true} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
