import type { Civilization } from '../types/card.ts';
import type { PresentationBeat } from '../presentation/types.ts';
import type { UiTickKind } from './audioTypes.ts';
import { CIVILIZATION_AUDIO_PATCHES } from './civilizationPatches.ts';

export const AUDIO_VOLUME_STORAGE_KEY = 'dm_audio_volume';
export const AUDIO_MUTED_STORAGE_KEY = 'dm_audio_muted';
const MAX_CONCURRENT_VOICES = 8;

/**
 * Perceptual logarithmic gain curve (`slider^2`), returning 0 when muted.
 */
export function computeAudioGain(sliderVolume: number, muted: boolean): number {
  if (muted) return 0;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(sliderVolume) ? sliderVolume : 0));
  return clamped * clamped;
}

export interface AudioEngine {
  unlock(): void;
  setMasterVolume(volume: number): void;
  getMasterVolume(): number;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  playUiTick(kind: UiTickKind): void;
  playBeat(beat: PresentationBeat): void;
  getActiveVoiceCount(): number;
  dispose(): void;
}

export function createAudioEngine(initialVolume = 0.75, initialMuted = false): AudioEngine {
  let volume = Math.min(1, Math.max(0, initialVolume));
  let muted = initialMuted;
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let compressor: DynamicsCompressorNode | null = null;
  let sfxGain: GainNode | null = null;
  let uiGain: GainNode | null = null;
  let reverbWet: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let convolver: ConvolverNode | null = null;
  let activeVoices = 0;
  let listenersAttached = false;
  let disposed = false;

  const syncMasterGain = () => {
    if (!ctx || !masterGain) return;
    masterGain.gain.setTargetAtTime(computeAudioGain(volume, muted), ctx.currentTime, 0.015);
  };

  const buildNoiseBuffer = (audioCtx: AudioContext): AudioBuffer => {
    const length = Math.floor(audioCtx.sampleRate * 0.8);
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  };

  const buildImpulseResponse = (audioCtx: AudioContext): AudioBuffer => {
    const duration = 0.42;
    const length = Math.floor(audioCtx.sampleRate * duration);
    const ir = audioCtx.createBuffer(2, length, audioCtx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const channel = ir.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 2.8);
        channel[i] = (Math.random() * 2 - 1) * decay;
      }
    }
    return ir;
  };

  const ensureGraph = (): AudioContext | null => {
    if (disposed || typeof window === 'undefined') return null;
    const AudioCtxCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxCtor) return null;

    if (!ctx) {
      try {
        ctx = new AudioCtxCtor();
        compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-12, ctx.currentTime);
        compressor.knee.setValueAtTime(12, ctx.currentTime);
        compressor.ratio.setValueAtTime(8, ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, ctx.currentTime);
        compressor.release.setValueAtTime(0.15, ctx.currentTime);
        compressor.connect(ctx.destination);

        masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(computeAudioGain(volume, muted), ctx.currentTime);
        masterGain.connect(compressor);

        sfxGain = ctx.createGain();
        sfxGain.gain.setValueAtTime(0.9, ctx.currentTime);
        sfxGain.connect(masterGain);

        uiGain = ctx.createGain();
        uiGain.gain.setValueAtTime(0.65, ctx.currentTime);
        uiGain.connect(masterGain);

        noiseBuffer = buildNoiseBuffer(ctx);
        convolver = ctx.createConvolver();
        convolver.buffer = buildImpulseResponse(ctx);
        reverbWet = ctx.createGain();
        reverbWet.gain.setValueAtTime(0.22, ctx.currentTime);
        convolver.connect(reverbWet);
        reverbWet.connect(masterGain);
      } catch {
        ctx = null;
        return null;
      }
    }

    return ctx;
  };

  const canSynthesizeNow = (): AudioContext | null => {
    if (disposed || muted || computeAudioGain(volume, muted) <= 0) return null;
    if (!ctx || ctx.state !== 'running') return null;
    if (activeVoices >= MAX_CONCURRENT_VOICES) return null;
    return ctx;
  };

  const trackVoice = (node: OscillatorNode | AudioBufferSourceNode) => {
    activeVoices += 1;
    node.addEventListener('ended', () => {
      activeVoices = Math.max(0, activeVoices - 1);
    });
  };

  const spawnTone = (
    audioCtx: AudioContext,
    bus: GainNode,
    opts: {
      type?: OscillatorType;
      freqStart: number;
      freqEnd?: number;
      startOffsetSec?: number;
      attackSec?: number;
      decaySec: number;
      peakGain: number;
      useReverb?: boolean;
    }
  ) => {
    if (activeVoices >= MAX_CONCURRENT_VOICES) return;
    const t0 = audioCtx.currentTime + (opts.startOffsetSec ?? 0);
    const osc = audioCtx.createOscillator();
    const env = audioCtx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(Math.max(20, opts.freqStart), t0);
    if (opts.freqEnd && opts.freqEnd !== opts.freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), t0 + opts.decaySec);
    }

    const att = Math.max(0.002, opts.attackSec ?? 0.006);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(Math.max(0.001, opts.peakGain), t0 + att);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + att + opts.decaySec);

    osc.connect(env);
    env.connect(bus);
    if (opts.useReverb && convolver) {
      env.connect(convolver);
    }
    trackVoice(osc);
    osc.start(t0);
    osc.stop(t0 + att + opts.decaySec + 0.02);
  };

  const spawnNoise = (
    audioCtx: AudioContext,
    bus: GainNode,
    opts: {
      filterType: BiquadFilterType;
      freqStart: number;
      freqEnd?: number;
      q?: number;
      startOffsetSec?: number;
      decaySec: number;
      peakGain: number;
      useReverb?: boolean;
    }
  ) => {
    if (!noiseBuffer || activeVoices >= MAX_CONCURRENT_VOICES) return;
    const t0 = audioCtx.currentTime + (opts.startOffsetSec ?? 0);
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = opts.filterType;
    filter.Q.setValueAtTime(opts.q ?? 1.5, t0);
    filter.frequency.setValueAtTime(Math.max(40, opts.freqStart), t0);
    if (opts.freqEnd && opts.freqEnd !== opts.freqStart) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, opts.freqEnd), t0 + opts.decaySec);
    }

    const env = audioCtx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(Math.max(0.001, opts.peakGain), t0 + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.decaySec);

    src.connect(filter);
    filter.connect(env);
    env.connect(bus);
    if (opts.useReverb && convolver) {
      env.connect(convolver);
    }
    trackVoice(src);
    src.start(t0);
    src.stop(t0 + opts.decaySec + 0.02);
  };

  const playCivSignature = (
    audioCtx: AudioContext,
    civ: Civilization = 'Fire',
    gainScale = 1,
    offsetSec = 0
  ) => {
    if (!sfxGain) return;
    const patch = CIVILIZATION_AUDIO_PATCHES[civ] || CIVILIZATION_AUDIO_PATCHES.Fire;
    const jitter = 1 + (Math.random() - 0.5) * 0.06;

    patch.freqs.slice(0, 2).forEach((f, idx) => {
      spawnTone(audioCtx, sfxGain!, {
        type: patch.oscType,
        freqStart: f * jitter,
        freqEnd: civ === 'Darkness' ? f * 0.65 : f * jitter,
        startOffsetSec: offsetSec + idx * 0.022,
        attackSec: patch.attackSec,
        decaySec: patch.decaySec,
        peakGain: 0.16 * gainScale,
        useReverb: true
      });
    });

    if (patch.noiseLevel > 0) {
      spawnNoise(audioCtx, sfxGain, {
        filterType: patch.filterType,
        freqStart: patch.filterFreq,
        freqEnd: Math.max(120, patch.filterFreq * 0.55),
        q: patch.filterQ,
        startOffsetSec: offsetSec,
        decaySec: patch.decaySec * 0.7,
        peakGain: patch.noiseLevel * gainScale,
        useReverb: true
      });
    }
  };

  const handleVisibilityChange = () => {
    if (!ctx || disposed) return;
    if (typeof document !== 'undefined' && document.hidden) {
      if (ctx.state === 'running') {
        ctx.suspend().catch(() => {});
      }
    } else if (!muted && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  };

  const handleFirstGestureUnlock = () => {
    unlock();
  };

  const attachLifecycleListeners = () => {
    if (listenersAttached || typeof window === 'undefined' || typeof document === 'undefined') return;
    listenersAttached = true;
    window.addEventListener('pointerdown', handleFirstGestureUnlock, { passive: true });
    window.addEventListener('keydown', handleFirstGestureUnlock, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
  };

  attachLifecycleListeners();

  function unlock(): void {
    const audioCtx = ensureGraph();
    if (!audioCtx || disposed) return;
    if (audioCtx.state === 'suspended' && !muted) {
      audioCtx.resume().catch(() => {});
    }
  }

  function setMasterVolume(nextVol: number): void {
    volume = Math.min(1, Math.max(0, Number.isFinite(nextVol) ? nextVol : 0));
    syncMasterGain();
  }

  function getMasterVolume(): number {
    return volume;
  }

  function setMuted(nextMuted: boolean): void {
    muted = nextMuted;
    syncMasterGain();
    if (!muted && ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  function isMuted(): boolean {
    return muted;
  }

  function playUiTick(kind: UiTickKind): void {
    const audioCtx = canSynthesizeNow();
    if (!audioCtx || !uiGain) return;
    const jitter = 1 + (Math.random() - 0.5) * 0.08;

    if (kind === 'tap') {
      spawnTone(audioCtx, uiGain, {
        type: 'triangle',
        freqStart: 620 * jitter,
        freqEnd: 410 * jitter,
        decaySec: 0.055,
        peakGain: 0.14
      });
    } else if (kind === 'untap') {
      spawnTone(audioCtx, uiGain, {
        type: 'sine',
        freqStart: 440 * jitter,
        freqEnd: 680 * jitter,
        decaySec: 0.06,
        peakGain: 0.13
      });
    } else if (kind === 'error') {
      spawnTone(audioCtx, uiGain, {
        type: 'sawtooth',
        freqStart: 190,
        freqEnd: 140,
        decaySec: 0.12,
        peakGain: 0.15
      });
    } else {
      spawnNoise(audioCtx, uiGain, {
        filterType: 'bandpass',
        freqStart: 2400 * jitter,
        freqEnd: 1100,
        q: 2.0,
        decaySec: 0.025,
        peakGain: 0.12
      });
    }
  }

  function playBeat(beat: PresentationBeat): void {
    const audioCtx = canSynthesizeNow();
    if (!audioCtx || !sfxGain) return;

    const { event } = beat;
    const primaryCiv: Civilization = event.civilizations?.[0] || 'Fire';

    switch (event.type) {
      case 'DRAW': {
        spawnNoise(audioCtx, sfxGain, {
          filterType: 'bandpass',
          freqStart: 2700,
          freqEnd: 950,
          q: 1.8,
          decaySec: 0.032,
          peakGain: 0.16
        });
        break;
      }

      case 'CHARGE_MANA': {
        spawnTone(audioCtx, sfxGain, {
          type: 'sine',
          freqStart: 165,
          freqEnd: 72,
          decaySec: 0.06,
          peakGain: 0.18
        });
        playCivSignature(audioCtx, primaryCiv, 0.72, 0.02);
        break;
      }

      case 'SUMMON_CREATURE': {
        const isBoss = (event.card?.power ?? 0) >= 6000;
        spawnTone(audioCtx, sfxGain, {
          type: 'sine',
          freqStart: isBoss ? 155 : 135,
          freqEnd: 42,
          decaySec: isBoss ? 0.24 : 0.16,
          peakGain: isBoss ? 0.34 : 0.24,
          useReverb: true
        });
        spawnNoise(audioCtx, sfxGain, {
          filterType: 'lowpass',
          freqStart: 900,
          freqEnd: 180,
          decaySec: 0.14,
          peakGain: 0.18
        });
        playCivSignature(audioCtx, primaryCiv, isBoss ? 1.1 : 0.85, 0.03);
        break;
      }

      case 'CAST_SPELL': {
        playCivSignature(audioCtx, primaryCiv, 1.0, 0);
        spawnTone(audioCtx, sfxGain, {
          type: 'sine',
          freqStart: 420,
          freqEnd: 1180,
          decaySec: 0.22,
          peakGain: 0.16,
          useReverb: true
        });
        break;
      }

      case 'EVOLVE': {
        spawnTone(audioCtx, sfxGain, {
          type: 'triangle',
          freqStart: 220,
          freqEnd: 880,
          decaySec: 0.35,
          peakGain: 0.22,
          useReverb: true
        });
        playCivSignature(audioCtx, primaryCiv, 1.05, 0.09);
        break;
      }

      case 'BLOCK': {
        spawnTone(audioCtx, sfxGain, {
          type: 'triangle',
          freqStart: 540,
          freqEnd: 382,
          decaySec: 0.18,
          peakGain: 0.24,
          useReverb: true
        });
        spawnNoise(audioCtx, sfxGain, {
          filterType: 'highpass',
          freqStart: 1800,
          decaySec: 0.08,
          peakGain: 0.2
        });
        break;
      }

      case 'DECLARE_ATTACK': {
        spawnTone(audioCtx, sfxGain, {
          type: 'sawtooth',
          freqStart: 290,
          freqEnd: 860,
          decaySec: 0.18,
          peakGain: 0.18
        });
        spawnNoise(audioCtx, sfxGain, {
          filterType: 'bandpass',
          freqStart: 3200,
          freqEnd: 800,
          decaySec: 0.14,
          peakGain: 0.2,
          useReverb: true
        });
        break;
      }

      case 'SHIELD_BROKEN': {
        const count = Math.min(Math.max(1, event.targets?.length ?? 1), 4);
        for (let i = 0; i < count; i++) {
          const offset = i * 0.065; // Stagger multi-shield shatter by 65ms
          spawnNoise(audioCtx, sfxGain, {
            filterType: 'highpass',
            freqStart: 3600,
            decaySec: 0.06,
            startOffsetSec: offset,
            peakGain: 0.2,
            useReverb: true
          });
          spawnTone(audioCtx, sfxGain, {
            type: 'sine',
            freqStart: 2400 + i * 380,
            freqEnd: 1750 + i * 240,
            startOffsetSec: offset,
            decaySec: 0.22,
            peakGain: 0.14,
            useReverb: true
          });
        }
        break;
      }

      case 'SHIELD_TRIGGER': {
        spawnTone(audioCtx, sfxGain, {
          type: 'sawtooth',
          freqStart: 440,
          freqEnd: 1320,
          decaySec: 0.28,
          peakGain: 0.2,
          useReverb: true
        });
        playCivSignature(audioCtx, primaryCiv, 1.0, 0.06);
        break;
      }

      case 'CREATURE_DESTROYED': {
        const count = Math.min(Math.max(1, event.targets?.length ?? 1), 4);
        for (let i = 0; i < count; i++) {
          const offset = i * 0.065; // Stagger multi-wipe hits by 65ms
          spawnTone(audioCtx, sfxGain, {
            type: 'triangle',
            freqStart: 180 - i * 15,
            freqEnd: 46,
            startOffsetSec: offset,
            decaySec: 0.24,
            peakGain: 0.22,
            useReverb: true
          });
          spawnNoise(audioCtx, sfxGain, {
            filterType: 'lowpass',
            freqStart: 1400,
            freqEnd: 220,
            startOffsetSec: offset,
            decaySec: 0.2,
            peakGain: 0.18
          });
        }
        break;
      }

      case 'GAME_OVER': {
        const isWin = event.actor === 'player';
        const chord = isWin ? [523.25, 659.25, 783.99, 1046.5] : [261.63, 233.08, 174.61];
        chord.forEach((f, idx) => {
          spawnTone(audioCtx, sfxGain!, {
            type: 'triangle',
            freqStart: f,
            startOffsetSec: idx * 0.075,
            attackSec: 0.02,
            decaySec: 0.45,
            peakGain: 0.18,
            useReverb: true
          });
        });
        break;
      }
    }
  }

  function getActiveVoiceCount(): number {
    return activeVoices;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && listenersAttached) {
      window.removeEventListener('pointerdown', handleFirstGestureUnlock);
      window.removeEventListener('keydown', handleFirstGestureUnlock);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      listenersAttached = false;
    }
    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
    }
  }

  return {
    unlock,
    setMasterVolume,
    getMasterVolume,
    setMuted,
    isMuted,
    playUiTick,
    playBeat,
    getActiveVoiceCount,
    dispose
  };
}
