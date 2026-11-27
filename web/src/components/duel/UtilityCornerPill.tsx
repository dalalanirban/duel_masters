import React, { useState, useRef, useEffect } from 'react';
import {
  Layers,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
  PanelLeft,
  ScrollText,
  SlidersHorizontal
} from 'lucide-react';
import type { VisualMode } from '../../presentation/types.ts';

export interface UtilityCornerPillProps {
  visualMode: VisualMode;
  supportsWebGL2: boolean;
  onToggleVisualMode: (next: VisualMode) => void;
  audioMuted: boolean;
  onToggleAudioMute: () => void;
  audioVolume?: number;
  onAudioVolumeChange?: (nextVolume: number) => void;
  onRestart: () => void;
  onNavigateToBuilder?: () => void;
  isInspectorCollapsed?: boolean;
  onToggleInspectorRail?: () => void;
  isLogExpanded?: boolean;
  onToggleLogRail?: () => void;
  logCount?: number;
  className?: string;
}

export const UtilityCornerPill: React.FC<UtilityCornerPillProps> = ({
  visualMode,
  supportsWebGL2,
  onToggleVisualMode,
  audioMuted,
  onToggleAudioMute,
  audioVolume = 0.75,
  onAudioVolumeChange,
  onRestart,
  onNavigateToBuilder,
  isInspectorCollapsed,
  onToggleInspectorRail,
  isLogExpanded,
  onToggleLogRail,
  logCount = 0,
  className = ''
}) => {
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const volumePopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isVolumeOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (volumePopoverRef.current && !volumePopoverRef.current.contains(e.target as Node)) {
        setIsVolumeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isVolumeOpen]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-full bg-slate-950/90 border border-slate-700/80 shadow-xl backdrop-blur-md text-[11px] select-none ${className}`}
    >
      {onNavigateToBuilder && (
        <button
          type="button"
          onClick={onNavigateToBuilder}
          title="Back to Card Explorer & Deck Builder"
          aria-label="Deck Builder"
          className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-300 border border-slate-800 transition-colors cursor-pointer"
        >
          <Layers className="w-3 h-3 text-amber-400" />
          <span className="hidden xl:inline font-cinzel font-bold text-[10px]">Decks</span>
        </button>
      )}

      {/* Desktop Left Inspector Rail Toggle */}
      {onToggleInspectorRail && (
        <button
          type="button"
          onClick={onToggleInspectorRail}
          title={isInspectorCollapsed ? 'Expand Card Inspector' : 'Collapse Card Inspector'}
          aria-label={isInspectorCollapsed ? 'Expand Card Inspector' : 'Collapse Card Inspector'}
          className={`hidden lg:flex items-center gap-1 px-2 py-1 rounded-full border transition-colors cursor-pointer ${
            !isInspectorCollapsed
              ? 'bg-sky-500/15 border-sky-400/50 text-sky-300'
              : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <PanelLeft className="w-3 h-3" />
        </button>
      )}

      {/* Instant In-Match Lite / Drama Switch */}
      <div
        role="group"
        aria-label="Visual Effect Mode"
        className="flex items-center p-0.5 rounded-full bg-slate-900 border border-slate-800"
      >
        <button
          type="button"
          onClick={() => onToggleVisualMode('lite')}
          title="Ultra-Fast Lite Mode (zero heavy WebGL rendering)"
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-cinzel font-bold transition-all cursor-pointer ${
            visualMode === 'lite'
              ? 'bg-emerald-500 text-slate-950 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Zap className="w-2.5 h-2.5" />
          <span>Lite</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleVisualMode('drama')}
          title={
            supportsWebGL2
              ? 'Anime Drama Mode (cut-ins, trauma impact & lazy Three.js VFX)'
              : 'Drama VFX unavailable (WebGL2 disabled; will use Lite fallback)'
          }
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-cinzel font-bold transition-all cursor-pointer ${
            visualMode === 'drama'
              ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 shadow-sm'
              : 'text-slate-400 hover:text-amber-300'
          }`}
        >
          <Sparkles className="w-2.5 h-2.5" />
          <span>Drama</span>
        </button>
      </div>

      {/* Audio Mute & Volume Popover */}
      <div ref={volumePopoverRef} className="relative flex items-center gap-0.5">
        <button
          type="button"
          onClick={onToggleAudioMute}
          title={audioMuted ? 'Unmute Duel Audio' : 'Mute Duel Audio'}
          aria-label={audioMuted ? 'Unmute Duel Audio' : 'Mute Duel Audio'}
          className={`flex items-center justify-center p-1.5 rounded-full border transition-colors cursor-pointer ${
            audioMuted
              ? 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-200'
              : 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
          }`}
        >
          {audioMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
        </button>

        {onAudioVolumeChange && (
          <button
            type="button"
            onClick={() => setIsVolumeOpen((v) => !v)}
            title="Adjust Duel Audio Volume"
            aria-label="Audio Volume"
            aria-expanded={isVolumeOpen}
            className={`flex items-center justify-center p-1 rounded-full border transition-colors cursor-pointer ${
              isVolumeOpen
                ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-2.5 h-2.5" />
          </button>
        )}

        {onAudioVolumeChange && isVolumeOpen && (
          <div className="absolute right-0 top-full mt-2 w-44 p-2.5 rounded-xl bg-slate-950/95 border border-slate-700/90 shadow-2xl backdrop-blur-md z-50 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-cinzel font-bold text-slate-300 uppercase tracking-wider">
                SFX Volume
              </span>
              <span className="font-mono font-bold text-amber-300 tabular-nums">
                {audioMuted ? 'Muted' : `${Math.round(audioVolume * 100)}%`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audioVolume}
              onChange={(e) => onAudioVolumeChange(Number(e.target.value))}
              aria-label="Duel Audio Volume Slider"
              data-testid="audio-volume-slider"
              className="w-full h-1.5 accent-amber-400 cursor-pointer bg-slate-800 rounded-lg"
            />
          </div>
        )}
      </div>

      {/* Desktop Log Drawer Toggle */}
      {onToggleLogRail && (
        <button
          type="button"
          onClick={onToggleLogRail}
          title={isLogExpanded ? 'Collapse Duel Log (L)' : 'Expand Duel Log (L)'}
          aria-label={isLogExpanded ? 'Collapse Duel Log' : 'Expand Duel Log'}
          className={`hidden lg:flex items-center gap-1 px-2 py-1 rounded-full border transition-colors cursor-pointer ${
            isLogExpanded
              ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
              : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300 hover:text-white'
          }`}
        >
          <ScrollText className="w-3 h-3 text-amber-400" />
          <span className="font-mono text-[9.5px] tabular-nums">#{logCount}</span>
        </button>
      )}

      {/* Restart Match */}
      <button
        type="button"
        onClick={onRestart}
        title="Restart Duel"
        aria-label="Restart Duel"
        className="flex items-center justify-center p-1.5 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
      >
        <RotateCcw className="w-3 h-3" />
      </button>
    </div>
  );
};
