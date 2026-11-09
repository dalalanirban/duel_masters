import React from 'react';
import { CardDefinition, Civilization } from '../../types/card';
import { CivilizationIcon } from './CivilizationIcon';
import { Shield, Swords, Zap, Plus, Check } from 'lucide-react';

interface Props {
  card: CardDefinition;
  deckCount?: number;
  onAdd?: (card: CardDefinition) => void;
  onClick?: (card: CardDefinition) => void;
  compact?: boolean;
}

const CIV_CONFIG: Record<Civilization, {
  border: string;
  headerBg: string;
  bodyBg: string;
  orbBg: string;
  orbRing: string;
  glow: string;
  artGradient: string;
}> = {
  Light: {
    border: 'border-amber-400/80',
    headerBg: 'from-amber-500/30 via-yellow-400/20 to-amber-600/30 text-amber-100',
    bodyBg: 'bg-gradient-to-b from-amber-950/40 via-slate-900/90 to-amber-950/60',
    orbBg: 'bg-gradient-to-br from-amber-300 to-yellow-500 text-slate-950',
    orbRing: 'ring-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.8)]',
    glow: 'hover:shadow-[0_0_20px_rgba(245,158,11,0.35)]',
    artGradient: 'from-amber-600/20 via-yellow-500/10 to-transparent'
  },
  Water: {
    border: 'border-sky-400/80',
    headerBg: 'from-sky-500/30 via-cyan-400/20 to-blue-600/30 text-sky-100',
    bodyBg: 'bg-gradient-to-b from-sky-950/40 via-slate-900/90 to-sky-950/60',
    orbBg: 'bg-gradient-to-br from-sky-300 to-cyan-500 text-slate-950',
    orbRing: 'ring-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.8)]',
    glow: 'hover:shadow-[0_0_20px_rgba(14,165,233,0.35)]',
    artGradient: 'from-sky-600/20 via-cyan-500/10 to-transparent'
  },
  Darkness: {
    border: 'border-purple-500/80',
    headerBg: 'from-purple-900/40 via-violet-800/30 to-zinc-900 text-purple-100',
    bodyBg: 'bg-gradient-to-b from-zinc-950/60 via-slate-900/90 to-purple-950/60',
    orbBg: 'bg-gradient-to-br from-purple-400 to-violet-700 text-purple-950',
    orbRing: 'ring-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.8)]',
    glow: 'hover:shadow-[0_0_20px_rgba(147,51,234,0.35)]',
    artGradient: 'from-purple-900/30 via-violet-950/20 to-transparent'
  },
  Fire: {
    border: 'border-red-500/80',
    headerBg: 'from-red-600/40 via-orange-500/30 to-red-950 text-red-100',
    bodyBg: 'bg-gradient-to-b from-red-950/50 via-slate-900/90 to-red-950/70',
    orbBg: 'bg-gradient-to-br from-red-400 to-orange-600 text-slate-950',
    orbRing: 'ring-red-400 shadow-[0_0_10px_rgba(239,68,68,0.8)]',
    glow: 'hover:shadow-[0_0_20px_rgba(220,38,38,0.35)]',
    artGradient: 'from-red-600/20 via-orange-600/10 to-transparent'
  },
  Nature: {
    border: 'border-emerald-500/80',
    headerBg: 'from-emerald-600/40 via-green-500/30 to-emerald-950 text-emerald-100',
    bodyBg: 'bg-gradient-to-b from-emerald-950/50 via-slate-900/90 to-emerald-950/70',
    orbBg: 'bg-gradient-to-br from-emerald-300 to-green-600 text-slate-950',
    orbRing: 'ring-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.8)]',
    glow: 'hover:shadow-[0_0_20px_rgba(16,185,129,0.35)]',
    artGradient: 'from-emerald-600/20 via-green-600/10 to-transparent'
  }
};

const RARITY_COLORS: Record<string, string> = {
  'Common': 'text-slate-400 border-slate-600 bg-slate-800/40',
  'Uncommon': 'text-emerald-400 border-emerald-600 bg-emerald-950/40',
  'Rare': 'text-sky-400 border-sky-600 bg-sky-950/40',
  'Very Rare': 'text-purple-300 border-purple-500 bg-purple-950/40 shadow-[0_0_8px_rgba(168,85,247,0.4)]',
  'Super Rare': 'text-amber-300 border-amber-400 bg-amber-950/50 shadow-[0_0_12px_rgba(245,158,11,0.6)] font-bold'
};

export const DuelCard: React.FC<Props> = ({
  card,
  deckCount = 0,
  onAdd,
  onClick,
  compact = false
}) => {
  const primaryCiv = card.civilizations[0] || 'Fire';
  const theme = CIV_CONFIG[primaryCiv] || CIV_CONFIG.Fire;

  const isMaxCopies = deckCount >= 4;

  const highlightRulesText = (text: string) => {
    // Bold keywords
    const keywords = ['Blocker', 'Shield trigger', 'Double breaker', 'Triple breaker', 'Slayer', 'Speed attacker'];
    let formatted = text;
    keywords.forEach(kw => {
      const reg = new RegExp(`(${kw})`, 'gi');
      formatted = formatted.replace(reg, '<strong class="text-amber-300 font-semibold">$1</strong>');
    });
    // Power attacker +X
    formatted = formatted.replace(/(Power attacker \+?\d+)/gi, '<strong class="text-red-300 font-semibold">$1</strong>');
    return formatted;
  };

  return (
    <div
      onClick={() => onClick?.(card)}
      className={`group relative flex flex-col rounded-xl border-2 ${theme.border} ${theme.bodyBg} ${theme.glow} transition-all duration-200 cursor-pointer select-none overflow-hidden backdrop-blur-sm ${
        compact ? 'p-2 w-48 h-64' : 'p-2.5 w-60 h-[340px]'
      }`}
    >
      {/* Top Header: Mana Orb + Name + Shield Trigger */}
      <div className={`relative flex items-center justify-between px-2 py-1.5 rounded-lg bg-gradient-to-r ${theme.headerBg} border border-white/10 mb-1.5`}>
        {/* Mana Cost Orb */}
        <div className="flex items-center gap-1.5">
          <div className={`flex items-center justify-center w-7 h-7 rounded-full ${theme.orbBg} ring-2 ${theme.orbRing} font-cinzel font-black text-sm shadow-md`}>
            {card.manaCost}
          </div>
          <CivilizationIcon civilization={primaryCiv} className="w-4 h-4 ml-0.5" />
        </div>

        {/* Card Name */}
        <div className="flex-1 px-1.5 text-center truncate">
          <span className="font-cinzel font-bold text-xs tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {card.name}
          </span>
        </div>

        {/* Shield Trigger Indicator */}
        {card.isShieldTrigger && (
          <div className="flex items-center gap-0.5 bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter shadow-sm animate-pulse" title="Shield Trigger">
            <Zap className="w-3 h-3 fill-current" />
            <span>ST</span>
          </div>
        )}
      </div>

      {/* Sub-header: Card Type & Race */}
      <div className="flex items-center justify-between px-1 text-[10px] text-slate-300 font-medium tracking-wide mb-1">
        <span className="uppercase text-slate-400">{card.type}</span>
        {card.races.length > 0 && (
          <span className="text-amber-200/90 truncate max-w-[140px] italic">
            {card.races.join(' / ')}
          </span>
        )}
      </div>

      {/* Card Visual Illustration Frame */}
      <div className={`relative flex-1 rounded-md border border-white/10 overflow-hidden bg-gradient-to-br ${theme.artGradient} bg-slate-950 flex items-center justify-center`}>
        {/* Procedural Artwork Crest Background */}
        <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
          <CivilizationIcon civilization={primaryCiv} className="w-24 h-24" />
        </div>

        {/* Creature Power Shield Badge (Bottom-Left of Art) */}
        {card.power !== null && (
          <div className="absolute bottom-1 left-1.5 flex items-center gap-1 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-amber-400/70 px-2 py-0.5 rounded shadow-lg text-amber-300 font-cinzel font-extrabold text-xs">
            <Swords className="w-3.5 h-3.5 text-amber-400" />
            <span>{card.power}</span>
            {card.powerAttackerBonus > 0 && (
              <span className="text-[10px] text-red-400 font-normal">
                +{card.powerAttackerBonus}
              </span>
            )}
          </div>
        )}

        {/* Keyword Tags on Art */}
        <div className="absolute top-1 right-1 flex flex-col gap-1 items-end">
          {card.isBlocker && (
            <span className="flex items-center gap-0.5 bg-sky-950/80 border border-sky-400/80 text-sky-200 text-[9px] font-bold px-1.5 py-0.5 rounded">
              <Shield className="w-2.5 h-2.5" /> Blocker
            </span>
          )}
          {card.isSlayer && (
            <span className="bg-purple-950/80 border border-purple-400/80 text-purple-200 text-[9px] font-bold px-1.5 py-0.5 rounded">
              ☠ Slayer
            </span>
          )}
          {card.breakerCount >= 2 && (
            <span className="bg-red-950/80 border border-red-400/80 text-red-200 text-[9px] font-bold px-1.5 py-0.5 rounded">
              2x Breaker
            </span>
          )}
        </div>
      </div>

      {/* Rules Text Box */}
      <div className="mt-1.5 p-1.5 rounded-md bg-slate-950/85 border border-white/10 min-h-[64px] max-h-[80px] overflow-y-auto text-[11px] leading-relaxed text-slate-200">
        <div
          dangerouslySetInnerHTML={{ __html: highlightRulesText(card.rulesText || 'No text.') }}
        />
      </div>

      {/* Footer: Collector Number, Rarity & Quick Add */}
      <div className="mt-1.5 pt-1 border-t border-white/10 flex items-center justify-between text-[10px]">
        <span className="text-slate-400 font-mono text-[9px]">{card.id}</span>
        
        <span className={`px-1.5 py-0.2 rounded border text-[9px] font-semibold ${RARITY_COLORS[card.rarity] || 'text-slate-300'}`}>
          {card.rarity}
        </span>

        {/* Quick Add Button or Deck Count */}
        {onAdd && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isMaxCopies) onAdd(card);
            }}
            disabled={isMaxCopies}
            className={`flex items-center gap-0.5 px-2 py-0.5 rounded font-bold text-[10px] transition-all shadow-sm ${
              isMaxCopies
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-not-allowed'
                : deckCount > 0
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 border border-slate-700'
            }`}
            title={isMaxCopies ? 'Maximum 4 copies reached' : 'Add to Deck'}
          >
            {isMaxCopies ? (
              <>MAX (4)</>
            ) : deckCount > 0 ? (
              <>
                <Check className="w-3 h-3" /> {deckCount}
              </>
            ) : (
              <>
                <Plus className="w-3 h-3" /> Add
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
