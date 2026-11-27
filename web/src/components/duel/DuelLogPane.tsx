import React, { useRef, useEffect, useMemo, useState } from 'react';
import {
  Swords,
  RotateCcw,
  Bot,
  ScrollText,
  LogOut,
  Zap,
  ArrowRight,
  History,
  X,
  PanelRightClose,
  PanelRightOpen
} from 'lucide-react';
import type { CardDefinition } from '../../types/card';
import {
  parseLogTextWithCards,
  classifyLogSeverity,
  type LogToken,
  type LogSeverity
} from './duelLogParser';

export { parseLogTextWithCards, classifyLogSeverity, type LogToken, type LogSeverity };

const SEVERITY_ROW_CLASSES: Record<LogSeverity, string> = {
  muted: 'p-1.5 rounded-md bg-slate-950/35 border border-slate-800/45 text-slate-500 text-[11px] hover:border-slate-700/60',
  mana: 'p-2 rounded-lg bg-emerald-950/20 border border-emerald-500/25 border-l-2 border-l-emerald-400/80 text-emerald-100/90 hover:border-emerald-400/50',
  summon: 'p-2 rounded-lg bg-sky-950/25 border border-sky-500/30 border-l-2 border-l-sky-400 text-slate-200 hover:border-sky-400/60',
  combat: 'p-2 rounded-lg bg-rose-950/30 border border-rose-500/35 border-l-2 border-l-rose-400 text-rose-100 hover:border-rose-400/60',
  trigger: 'p-2 rounded-lg bg-amber-950/35 border border-amber-500/45 border-l-2 border-l-amber-400 text-amber-100 shadow-sm shadow-amber-950/25 hover:border-amber-400/75',
  critical: 'p-2 rounded-lg bg-red-950/50 border border-red-500/60 border-l-2 border-l-red-400 text-white font-semibold shadow-md shadow-red-950/35 hover:border-red-400'
};

const SEVERITY_INDEX_CLASSES: Record<LogSeverity, string> = {
  muted: 'text-slate-600',
  mana: 'text-emerald-400/90',
  summon: 'text-sky-400',
  combat: 'text-rose-400',
  trigger: 'text-amber-400',
  critical: 'text-red-400'
};

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
  onPassPhase?: () => void;
  onEndTurn?: () => void;
  onPlayOpponentMove?: () => void;
  onInspectCard?: (card: CardDefinition) => void;
  onHoverCard?: (card: CardDefinition | null) => void;
  onClose?: () => void;
  onCollapse?: () => void;
  isCollapsed?: boolean;
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
  onPassPhase,
  onEndTurn,
  onPlayOpponentMove,
  onInspectCard,
  onHoverCard,
  onClose,
  onCollapse,
  isCollapsed = false,
  className = ''
}) => {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [seenCount, setSeenCount] = useState<number>(actionLog.length);

  // Sync seen cursor when log is visible or match resets
  useEffect(() => {
    if (!isCollapsed || actionLog.length < seenCount) {
      setSeenCount(actionLog.length);
    }
  }, [isCollapsed, actionLog.length, seenCount]);

  // Automatically scroll to latest log message whenever new actions arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [actionLog.length]);

  // Memoize parsed logs and severity classification
  const parsedLogs = useMemo(() => {
    return actionLog.map((log) => ({
      severity: classifyLogSeverity(log),
      tokens: parseLogTextWithCards(log)
    }));
  }, [actionLog]);

  // Highest-priority unread signal (trigger / combat / critical only; ignores muted/routine)
  const unreadHighSeverity = useMemo<Extract<LogSeverity, 'trigger' | 'combat' | 'critical'> | null>(() => {
    if (!isCollapsed || seenCount >= parsedLogs.length) return null;
    let highest: Extract<LogSeverity, 'trigger' | 'combat' | 'critical'> | null = null;
    for (let i = seenCount; i < parsedLogs.length; i++) {
      const sev = parsedLogs[i].severity;
      if (sev === 'critical') return 'critical';
      if (sev === 'trigger') highest = 'trigger';
      else if (sev === 'combat' && highest === null) highest = 'combat';
    }
    return highest;
  }, [isCollapsed, seenCount, parsedLogs]);

  if (isCollapsed) {
    const badgeRingClass =
      unreadHighSeverity === 'critical'
        ? 'border-red-400/75 text-red-300 shadow-red-950/50'
        : unreadHighSeverity === 'trigger'
        ? 'border-amber-400/75 text-amber-300 shadow-amber-950/50'
        : unreadHighSeverity === 'combat'
        ? 'border-rose-400/70 text-rose-300'
        : 'border-slate-800 text-amber-400';

    const dotColorClass =
      unreadHighSeverity === 'critical'
        ? 'bg-red-500 ring-red-300/70'
        : unreadHighSeverity === 'trigger'
        ? 'bg-amber-400 ring-amber-200/70'
        : 'bg-rose-500 ring-rose-300/70';

    return (
      <aside
        className={`h-full w-11 shrink-0 flex flex-col items-center justify-between py-2.5 bg-[#080b11] border-l border-slate-800/70 text-slate-100 select-none ${className}`}
        aria-label="Collapsed Duel Log Rail"
      >
        <div className="flex flex-col items-center gap-2">
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title="Expand Duel Log & Controls (L)"
              aria-label="Expand Duel Log"
              className={`relative p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 hover:text-amber-300 border transition-colors cursor-pointer ${badgeRingClass}`}
            >
              <PanelRightOpen className="w-4 h-4" />
              {unreadHighSeverity && (
                <span
                  data-testid="collapsed-log-unread-dot"
                  data-severity={unreadHighSeverity}
                  className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ring-2 animate-pulse ${dotColorClass}`}
                />
              )}
            </button>
          )}
          <span className="px-1 py-0.5 rounded bg-slate-900 border border-slate-800 text-[9px] font-mono font-bold text-amber-300 tabular-nums">
            #{actionLog.length}
          </span>
          <button
            type="button"
            onClick={onToggleAutoPlay}
            title={isAutoPlayOpponent ? 'AI Auto-Play ON (click to pause)' : 'AI Auto-Play OFF (click to enable)'}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isAutoPlayOpponent
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="writing-mode-vertical text-[9px] font-cinzel tracking-[0.2em] uppercase text-slate-500 pointer-events-none">
          DUEL LOG
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onRestart}
            title="Restart Duel"
            aria-label="Restart Duel"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-800 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`h-full flex flex-col bg-slate-900/95 border-l border-slate-800 text-slate-100 select-none overflow-hidden ${className || 'w-80 shrink-0'}`}
      aria-label="Duel Event Log and Action Controls"
    >
      {/* ================= 1. TOP CONTROLS HEADER ================= */}
      <header className="shrink-0 bg-slate-950/80 border-b border-slate-800/90 px-2.5 py-2 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6.5 h-6.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <ScrollText className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[11px] font-cinzel font-bold text-slate-200 tracking-wide whitespace-nowrap">
              Duel Controls
            </h2>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
              <span>Log #{actionLog.length}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons: Auto-Play, Restart, Exit, Drawer Close */}
        <div className="flex items-center gap-1 shrink-0">
          {/* AI Auto-Play Toggle */}
          <button
            type="button"
            onClick={onToggleAutoPlay}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10.5px] font-bold transition-all border cursor-pointer ${
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
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                <Bot className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span className="font-mono text-[10px] whitespace-nowrap">Auto: ON</span>
              </>
            ) : (
              <>
                <Bot className="w-3 h-3 text-slate-500" />
                <span className="font-mono text-[10px] whitespace-nowrap">Auto: OFF</span>
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

          {onCollapse && !onClose && (
            <button
              type="button"
              onClick={onCollapse}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
              title="Collapse Log Rail (L)"
              aria-label="Collapse Duel Log Rail"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
              title="Close Panel"
              aria-label="Close Controls & Log"
            >
              <X className="w-3.5 h-3.5" />
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
          parsedLogs.map(({ severity, tokens }, logIndex) => (
            <div
              key={logIndex}
              data-log-severity={severity}
              className={`${SEVERITY_ROW_CLASSES[severity]} leading-relaxed transition-colors`}
            >
              <span className={`${SEVERITY_INDEX_CLASSES[severity]} font-bold mr-1.5 select-none text-[10px]`}>
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
