import React from 'react';
import { Trophy, Skull, RotateCcw, Swords, Shield, Layers } from 'lucide-react';
import type { GameState, PlayerId } from '../../engine/types';

interface GameOverModalProps {
  isOpen: boolean;
  winner: PlayerId | null;
  state: GameState;
  onRestart: () => void;
  onChangeDecks?: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isOpen,
  winner,
  state,
  onRestart,
  onChangeDecks
}) => {
  if (!isOpen || !winner) return null;

  const isPlayerWinner = winner === 'player';
  const playerShields = state.players.player.shields.filter((s) => !s.isBroken).length;
  const oppShields = state.players.opponent.shields.filter((s) => !s.isBroken).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in" role="dialog" aria-modal="true">
      <div
        className={`relative max-w-lg w-full bg-slate-900 border-2 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center gap-6 overflow-hidden ${
          isPlayerWinner
            ? 'border-amber-400/90 shadow-amber-500/30'
            : 'border-red-500/90 shadow-red-500/30'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow ambient background */}
        <div
          className={`absolute -top-20 w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-40 ${
            isPlayerWinner ? 'bg-amber-500' : 'bg-red-600'
          }`}
        />

        {/* Icon Emblem */}
        <div
          className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center shadow-2xl ${
            isPlayerWinner
              ? 'border-amber-400 bg-gradient-to-br from-amber-500/30 to-yellow-600/30 text-amber-400'
              : 'border-red-400 bg-gradient-to-br from-red-600/30 to-rose-900/30 text-red-400'
          }`}
        >
          {isPlayerWinner ? (
            <Trophy className="w-10 h-10 animate-bounce-subtle" />
          ) : (
            <Skull className="w-10 h-10 animate-pulse" />
          )}
        </div>

        {/* Title & Headline */}
        <div className="space-y-1.5">
          <h2
            className={`font-cinzel font-black text-2xl sm:text-3xl tracking-wider ${
              isPlayerWinner ? 'text-amber-300' : 'text-red-400'
            }`}
          >
            {isPlayerWinner ? 'DUEL VICTORY!' : 'DUEL DEFEAT'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto">
            {isPlayerWinner
              ? 'Congratulations Duelist! You pierced through the opponent’s shields and delivered the final blow.'
              : 'Your shields have shattered and your defenses were breached. Regroup and duel again!'}
          </p>
        </div>

        {/* Match Statistics Grid */}
        <div className="w-full grid grid-cols-3 gap-2.5 bg-slate-950/80 rounded-xl p-4 border border-slate-800">
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
              Turns
            </span>
            <span className="text-lg font-cinzel font-bold text-white mt-0.5">
              {state.turn}
            </span>
          </div>

          <div className="flex flex-col items-center border-x border-slate-800">
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider flex items-center gap-1">
              <Shield className="w-3 h-3 text-amber-400" /> Shields Left
            </span>
            <span className="text-lg font-cinzel font-bold text-amber-300 mt-0.5">
              {playerShields} vs {oppShields}
            </span>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider flex items-center gap-1">
              <Swords className="w-3 h-3 text-emerald-400" /> Creatures
            </span>
            <span className="text-lg font-cinzel font-bold text-white mt-0.5">
              {state.players.player.battleZone.length}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
          {onChangeDecks && (
            <button
              type="button"
              onClick={onChangeDecks}
              className="w-full sm:w-1/2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
            >
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Change Decks</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRestart}
            className={`w-full ${
              onChangeDecks ? 'sm:w-1/2' : ''
            } flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-black font-cinzel tracking-wider shadow-lg transition-all cursor-pointer ${
              isPlayerWinner
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-amber-500/30'
                : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-red-500/30'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Play Again</span>
          </button>
        </div>
      </div>
    </div>
  );
};
