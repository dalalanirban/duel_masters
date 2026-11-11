import React, { useState, useEffect, useRef } from 'react';
import { Shield, Swords, AlertTriangle, ShieldCheck, X, Clock, ArrowLeft } from 'lucide-react';
import type { GameState, BlockerChoiceInteraction } from '../../engine/types';
import { getCreatureEffectivePower } from '../../engine/combat';

interface BlockerModalProps {
  isOpen: boolean;
  interaction: BlockerChoiceInteraction | null;
  state: GameState;
  onDeclareBlock: (blockerId: string | null) => void;
}

export const BlockerModal: React.FC<BlockerModalProps> = ({
  isOpen,
  interaction,
  state,
  onDeclareBlock
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(20);
  const [modalStep, setModalStep] = useState<'PROMPT' | 'SELECT'>('PROMPT');
  const onDeclareBlockRef = useRef(onDeclareBlock);
  onDeclareBlockRef.current = onDeclareBlock;

  // 20-Second Countdown timer
  useEffect(() => {
    if (!isOpen || !interaction) return;

    setTimeLeft(20);
    setModalStep('PROMPT');

    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, interaction?.attackerId]);

  // Handle timeout expiration purely in effect
  useEffect(() => {
    if (timeLeft === 0 && isOpen && interaction) {
      onDeclareBlockRef.current(null);
    }
  }, [timeLeft, isOpen, interaction]);

  if (!isOpen || !interaction) return null;

  const defendingPlayer = interaction.defendingPlayer;
  const attackingPlayer = defendingPlayer === 'player' ? 'opponent' : 'player';

  const attacker = state.players[attackingPlayer].battleZone.find(
    (c) => c.instanceId === interaction.attackerId
  );
  const attackerPower = attacker ? getCreatureEffectivePower(attacker, true) : 0;
  const attackerImage = attacker
    ? attacker.card.imageAssetPath
      ? `/${attacker.card.imageAssetPath}`
      : attacker.card.imageUrl
    : '';

  const validBlockers = state.players[defendingPlayer].battleZone.filter((c) =>
    interaction.validBlockerIds.includes(c.instanceId)
  );

  const handleInterceptClick = () => {
    if (validBlockers.length === 1) {
      // Auto-select single blocker
      onDeclareBlock(validBlockers[0].instanceId);
    } else {
      // Multiple blockers: transition to blocker selection
      setModalStep('SELECT');
    }
  };

  const progressPercent = Math.max(0, Math.min(100, (timeLeft / 20) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in" role="dialog" aria-modal="true">
      <div
        className="relative max-w-xl w-full bg-slate-900 border-2 border-red-500/80 rounded-2xl p-6 shadow-2xl shadow-red-500/20 flex flex-col gap-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow corner */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* 20-Second Countdown Progress Bar */}
        <div className="w-full space-y-1">
          <div className="flex items-center justify-between text-xs font-mono font-bold">
            <span className="flex items-center gap-1.5 text-amber-400">
              <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
              Action Window:
            </span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
              timeLeft <= 5 ? 'bg-red-500/30 text-red-300 animate-pulse' : 'bg-slate-800 text-slate-300'
            }`}>
              {timeLeft}s remaining
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                timeLeft <= 5 ? 'bg-red-500' : timeLeft <= 10 ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Header Alert */}
        <div className="flex items-center gap-3 border-b border-red-500/30 pb-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-400 flex items-center justify-center text-red-400 shadow-md shrink-0">
            <Swords className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-cinzel font-extrabold text-lg sm:text-xl text-red-300 tracking-wider">
                INCOMING ATTACK!
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-red-500 text-white font-black text-[10px] tracking-wider uppercase font-mono">
                Block Step
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Opponent declared an attack. Choose whether to intercept with one of your Blockers!
            </p>
          </div>
        </div>

        {/* Incoming Attacker Banner */}
        {attacker && (
          <div className="flex items-center gap-3 bg-slate-950/80 rounded-xl p-3 border border-slate-800">
            <div className="w-14 aspect-[491/682] rounded overflow-hidden shrink-0 border border-slate-700">
              <img
                src={attackerImage}
                alt={attacker.card.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1">
              <div className="text-xs font-cinzel font-bold text-white">
                {attacker.card.name}
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                Effective Attacking Power:{' '}
                <span className="text-red-400 font-bold">{attackerPower}</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Target:{' '}
                <span className="text-slate-300 capitalize">
                  {state.combatState?.target.type || 'Shield / Player'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Prompt whether to block */}
        {modalStep === 'PROMPT' && (
          <div className="space-y-4 py-2">
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div className="text-xs text-slate-200">
                {validBlockers.length === 1 ? (
                  <>
                    You have <span className="font-bold text-amber-300">1 Blocker</span> ready to intercept: <strong className="text-white">{validBlockers[0].card.name}</strong>.
                  </>
                ) : (
                  <>
                    You have <span className="font-bold text-amber-300">{validBlockers.length} Blockers</span> ready to intercept.
                  </>
                )}
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Do you want to intercept this attack with a blocker?
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleInterceptClick}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-cinzel font-bold text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-950/50 transition-all border border-emerald-400/50"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {validBlockers.length === 1 ? 'Yes, Block Attack' : 'Yes, Choose Blocker'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onDeclareBlock(null)}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-cinzel font-bold text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700"
              >
                <X className="w-4 h-4" />
                <span>Pass / Do Not Block</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Select Blocker (When multiple blockers exist) */}
        {modalStep === 'SELECT' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                Select Your Intercepting Blocker ({validBlockers.length}):
              </span>
              <button
                type="button"
                onClick={() => setModalStep('PROMPT')}
                className="text-slate-400 hover:text-slate-200 flex items-center gap-1 text-[11px]"
              >
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {validBlockers.map((blocker) => {
                const blockerPower = getCreatureEffectivePower(blocker, false);
                const blockerImg = blocker.card.imageAssetPath
                  ? `/${blocker.card.imageAssetPath}`
                  : blocker.card.imageUrl;

                let outcomeBadge = (
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-950/80 border border-red-700 text-red-300 flex items-center gap-1 font-mono">
                    <AlertTriangle className="w-2.5 h-2.5" /> Defeated
                  </span>
                );

                if (blockerPower > attackerPower) {
                  outcomeBadge = (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-950/80 border border-emerald-700 text-emerald-300 flex items-center gap-1 font-mono">
                      <ShieldCheck className="w-2.5 h-2.5" /> Survives & Destroys
                    </span>
                  );
                } else if (blockerPower === attackerPower) {
                  outcomeBadge = (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-950/80 border border-amber-700 text-amber-300 flex items-center gap-1 font-mono">
                      Mutual Destruction
                    </span>
                  );
                }

                return (
                  <button
                    key={blocker.instanceId}
                    type="button"
                    onClick={() => onDeclareBlock(blocker.instanceId)}
                    className="p-2 rounded-xl border border-slate-700 hover:border-amber-400 bg-slate-950/60 hover:bg-slate-800/80 transition-all flex items-center gap-2.5 text-left group"
                  >
                    <div className="w-10 aspect-[491/682] rounded overflow-hidden shrink-0 border border-slate-700">
                      <img
                        src={blockerImg}
                        alt={blocker.card.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate group-hover:text-amber-300">
                        {blocker.card.name}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        Power: <span className="font-bold text-amber-400">{blockerPower}</span>
                      </div>
                      <div className="mt-1">{outcomeBadge}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 pt-2.5">
              <span className="text-[11px] text-slate-500">
                Click any blocker to intercept.
              </span>

              <button
                type="button"
                onClick={() => onDeclareBlock(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Pass / Do Not Block</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
