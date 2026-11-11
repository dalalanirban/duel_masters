import React, { useRef, useEffect, useMemo } from 'react';
import {
  Swords,
  RotateCcw,
  Bot,
  ScrollText,
  LogOut,
  Zap,
  ArrowRight,
  History,
  Undo2
} from 'lucide-react';
import type { CardDefinition } from '../../types/card';
import { parseLogTextWithCards, type LogToken } from './duelLogParser';

export { parseLogTextWithCards, type LogToken };

export interface DuelLogPaneProps {
  actionLog: string[];
  activePlayer: 'player' | 'opponent';
  phase: string;
  isAutoPlayOpponent: boolean;
  onToggleAutoPlay: () => void;
  onRestart: () => void;
  onExit?: () => void;
  isPlayerTurn: boolean;
  canDirectAttack: boolean;
  onDirectAttack?: () => void;
  canUndoMana?: boolean;
  onUndoMana?: () => void;
  onPassPhase?: () => void;
  onEndTurn?: () => void;
  onPlayOpponentMove?: () => void;
  onInspectCard?: (card: CardDefinition) => void;
  onHoverCard?: (card: CardDefinition | null) => void;
  className?: string;
}

export const DuelLogPane: React.FC<DuelLogPaneProps> = ({
  actionLog,
  activePlayer: _activePlayer,
  phase,
  isAutoPlayOpponent,
  onToggleAutoPlay,
  onRestart,
  onExit,
  isPlayerTurn,
  canDirectAttack,
  onDirectAttack,
  canUndoMana = false,
  onUndoMana,
  onPassPhase,
  onEndTurn,
  onPlayOpponentMove,
  onInspectCard,
  onHoverCard,
  className = ''
}) => {
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Automatically scroll to latest log message whenever new actions arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [actionLog.length]);

  // Memoize parsed logs to prevent recalculating across non-log renders
  const parsedLogs = useMemo(() => {
    return actionLog.map((log) => parseLogTextWithCards(log));
  }, [actionLog]);

  return (
    <aside
      className={`w-full h-full flex flex-col bg-slate-900/95 border-l border-slate-800 text-slate-100 select-none overflow-hidden ${className}`}
      aria-label="Duel Event Log and Action Controls"
    >
      {/* ================= 1. TOP CONTROLS HEADER ================= */}
      <header className="shrink-0 bg-slate-950/80 border-b border-slate-800/90 px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <ScrollText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-cinzel font-bold text-slate-200 tracking-wider truncate">
              Duel Controls
            </h2>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
              <span>Log #{actionLog.length}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons: Auto-Play, Restart, Exit */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* AI Auto-Play Toggle */}
          <button
            type="button"
            onClick={onToggleAutoPlay}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
              isAutoPlayOpponent
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm hover:bg-emerald-500/25'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80'
            }`}
            title={
              isAutoPlayOpponent
                ? 'AI Auto-Play is ON (Click to disable)'
                : 'AI Auto-Play is OFF (Click to enable)'
            }
          >
            {isAutoPlayOpponent ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <Bot className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span className="font-mono text-[11px] hidden sm:inline">Auto: ON</span>
              </>
            ) : (
              <>
                <Bot className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-mono text-[11px] hidden sm:inline">Auto: OFF</span>
              </>
            )}
          </button>

          {/* Restart Match Button */}
          <button
            type="button"
            onClick={onRestart}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-amber-400 border border-slate-700 transition-colors cursor-pointer"
            title="Restart Duel"
            aria-label="Restart Duel"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Exit Match Button (if onExit provided) */}
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-red-950/40 text-slate-300 hover:text-red-400 border border-slate-700 hover:border-red-800/50 transition-colors cursor-pointer"
              title="Exit to Deck Explorer"
              aria-label="Exit to Deck Explorer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* ================= 2. SCROLLABLE DUEL EVENT LOG ================= */}
      <div
        ref={logContainerRef}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 space-y-1.5 font-mono text-xs"
        role="log"
        aria-live="polite"
      >
        {actionLog.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-4 text-center text-slate-500 font-mono text-xs">
            <History className="w-8 h-8 mb-2 opacity-30 text-amber-500" />
            <p className="font-semibold text-slate-400">Duel initialized.</p>
            <p className="text-[11px] text-slate-600 mt-1">Actions and events will appear here in real-time.</p>
          </div>
        ) : (
          parsedLogs.map((tokens, logIndex) => (
            <div
              key={logIndex}
              className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 text-slate-300 leading-relaxed hover:border-slate-700/80 transition-colors"
            >
              <span className="text-amber-500/80 font-bold mr-1.5 select-none text-[10px]">
                #{logIndex + 1}
              </span>
              {tokens.map((token, tokenIdx) => {
                if (token.card) {
                  const card = token.card;
                  return (
                    <span
                      key={tokenIdx}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onInspectCard?.(card);
                        onHoverCard?.(card);
                      }}
                      onMouseEnter={() => onHoverCard?.(card)}
                      onMouseLeave={() => onHoverCard?.(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onInspectCard?.(card);
                          onHoverCard?.(card);
                        }
                      }}
                      className="cursor-pointer underline decoration-amber-500/50 hover:text-amber-400 hover:decoration-amber-400 font-semibold text-amber-300 transition-colors inline-block"
                      title={`Inspect ${card.name}`}
                    >
                      {token.text}
                    </span>
                  );
                }
                return <span key={tokenIdx}>{token.text}</span>;
              })}
            </div>
          ))
        )}
      </div>

      {/* ================= 3. TURN & PHASE ACTION CONTROLS ================= */}
      <footer className="shrink-0 border-t border-slate-800 p-2.5 bg-slate-950/80 space-y-2">
        {/* Glowing Direct Attack to Win Button */}
        {isPlayerTurn && canDirectAttack && (
          <button
            type="button"
            onClick={onDirectAttack}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-cinzel font-black text-xs tracking-wider shadow-lg shadow-red-500/40 animate-pulse transition-all cursor-pointer"
          >
            <Zap className="w-4 h-4 fill-current animate-bounce" />
            <span>DIRECT ATTACK TO WIN!</span>
          </button>
        )}

        {isPlayerTurn ? (
          <>
            {phase === 'MANA_CHARGE' && (
              <div className="flex items-center gap-2">
                {canUndoMana && (
                  <button
                    type="button"
                    onClick={onUndoMana}
                    title="Undo mana charge"
                    className="flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-amber-300 font-mono text-xs font-semibold transition-colors cursor-pointer border border-amber-400/30 shadow-sm shrink-0"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Undo</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onPassPhase}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-cinzel font-bold text-xs tracking-wider shadow-md transition-colors cursor-pointer"
                >
                  <span>Pass to Main</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onEndTurn}
                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-mono text-xs font-semibold transition-colors cursor-pointer shrink-0"
                >
                  <span>End Turn</span>
                </button>
              </div>
            )}

            {phase === 'MAIN' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onPassPhase}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-cinzel font-bold text-xs tracking-wider shadow-md transition-all cursor-pointer"
                >
                  <Swords className="w-3.5 h-3.5" />
                  <span>Attack Phase</span>
                </button>
                <button
                  type="button"
                  onClick={onEndTurn}
                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-mono text-xs font-semibold transition-colors cursor-pointer"
                >
                  <span>End Turn</span>
                </button>
              </div>
            )}

            {phase === 'ATTACK' && (
              <button
                type="button"
                onClick={onEndTurn}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-cinzel font-bold text-xs tracking-wider transition-colors cursor-pointer"
              >
                <span>End Turn</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Other phases (e.g. START_OF_TURN, DRAW, END_OF_TURN) when not direct attack */}
            {phase !== 'MANA_CHARGE' && phase !== 'MAIN' && phase !== 'ATTACK' && !canDirectAttack && (
              <div className="flex items-center justify-center gap-2 py-1.5 text-slate-400 text-xs font-mono bg-slate-900/60 rounded-xl border border-slate-800/80">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>Resolving {phase.replace(/_/g, ' ')}...</span>
              </div>
            )}
          </>
        ) : (
          <>
            {!isAutoPlayOpponent ? (
              <button
                type="button"
                onClick={onPlayOpponentMove}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-cinzel font-bold text-xs tracking-wider shadow-md transition-all cursor-pointer animate-pulse"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Play Opponent Move</span>
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 py-2 text-slate-400 text-xs font-mono bg-slate-900/60 rounded-xl border border-slate-800/80">
                <Bot className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                <span className="text-slate-300">Opponent thinking...</span>
                <span className="flex gap-1 ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-bounce" />
                </span>
              </div>
            )}
          </>
        )}
      </footer>
    </aside>
  );
};
