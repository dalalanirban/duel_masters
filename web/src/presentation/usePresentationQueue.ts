import { useRef, useState, useCallback, useEffect } from 'react';
import type { GameState } from '../engine/types.ts';
import type { PresentationBeat, VisualMode } from './types.ts';
import { compilePresentationBeats } from './compilePresentationBeats.ts';

export interface PresentationQueueControls<TAction extends { type: string }> {
  canonicalState: GameState;
  canonicalStateRef: React.MutableRefObject<GameState>;
  viewState: GameState;
  activeBeat: PresentationBeat | null;
  isPresenting: boolean;
  dispatchWithPresentation: (action: TAction) => void;
  fastForward: () => void;
  flush: () => void;
}

export interface UsePresentationQueueOptions<TAction extends { type: string }> {
  initialState: () => GameState;
  reducer: (state: GameState, action: TAction) => GameState;
  visualMode: VisualMode;
  onBeatStart?: (beat: PresentationBeat) => void;
  onInstantUiTick?: (action: TAction, nextState: GameState) => void;
}

/**
 * Ref-backed atomic presentation queue middleware decoupling canonical `step()` state
 * from time-sequenced animations (`viewState`). Immune to React StrictMode double-invokes.
 */
export function usePresentationQueue<TAction extends { type: string }>({
  initialState,
  reducer,
  visualMode,
  onBeatStart,
  onInstantUiTick
}: UsePresentationQueueOptions<TAction>): PresentationQueueControls<TAction> {
  const initialRef = useRef<GameState | null>(null);
  if (initialRef.current === null) {
    initialRef.current = initialState();
  }

  const canonicalStateRef = useRef<GameState>(initialRef.current);
  const [canonicalState, setCanonicalState] = useState<GameState>(initialRef.current);
  const [viewState, setViewState] = useState<GameState>(initialRef.current);
  const [activeBeat, setActiveBeat] = useState<PresentationBeat | null>(null);

  const queueRef = useRef<PresentationBeat[]>([]);
  const activeBeatRef = useRef<PresentationBeat | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<VisualMode>(visualMode);
  modeRef.current = visualMode;

  const onBeatStartRef = useRef(onBeatStart);
  onBeatStartRef.current = onBeatStart;
  const onInstantUiTickRef = useRef(onInstantUiTick);
  onInstantUiTickRef.current = onInstantUiTick;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stepQueue = useCallback(() => {
    clearTimer();
    const nextBeat = queueRef.current.shift() ?? null;
    activeBeatRef.current = nextBeat;

    if (!nextBeat) {
      setActiveBeat(null);
      setViewState(canonicalStateRef.current);
      return;
    }

    setActiveBeat(nextBeat);
    setViewState(nextBeat.displayState);
    onBeatStartRef.current?.(nextBeat);

    const ms =
      modeRef.current === 'lite' ? nextBeat.durationMs.lite : nextBeat.durationMs.drama;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      stepQueue();
    }, ms);
  }, [clearTimer]);

  const flush = useCallback(() => {
    clearTimer();
    queueRef.current = [];
    activeBeatRef.current = null;
    setActiveBeat(null);
    setViewState(canonicalStateRef.current);
  }, [clearTimer]);

  const fastForward = useCallback(() => {
    if (!activeBeatRef.current && queueRef.current.length === 0) return;
    flush();
  }, [flush]);

  const dispatchWithPresentation = useCallback(
    (action: TAction) => {
      const prev = canonicalStateRef.current;
      const next = reducer(prev, action);
      canonicalStateRef.current = next;
      setCanonicalState(next);

      if (action.type === 'RESET_GAME') {
        clearTimer();
        queueRef.current = [];
        activeBeatRef.current = null;
        setActiveBeat(null);
        setViewState(next);
        return;
      }

      if (action.type === 'TOGGLE_MANA_TAP' || action.type === 'UNDO_CHARGE_MANA') {
        setViewState(next);
        onInstantUiTickRef.current?.(action, next);
        return;
      }

      const beats = compilePresentationBeats(
        prev,
        action as Parameters<typeof compilePresentationBeats>[1],
        next
      );

      if (beats.length === 0) {
        if (!activeBeatRef.current && queueRef.current.length === 0) {
          setViewState(next);
        }
        return;
      }

      queueRef.current.push(...beats);
      if (!activeBeatRef.current) {
        stepQueue();
      }
    },
    [reducer, clearTimer, stepQueue]
  );

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return {
    canonicalState,
    canonicalStateRef,
    viewState,
    activeBeat,
    isPresenting: activeBeat !== null,
    dispatchWithPresentation,
    fastForward,
    flush
  };
}
