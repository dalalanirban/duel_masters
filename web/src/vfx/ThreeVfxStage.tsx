import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { PresentationBeat } from '../presentation/types.ts';
import type { StageAnchorRegistry, OrthoAnchorCoords } from './anchorRegistry.ts';
import { getCivPalette } from './civColors.ts';
import {
  createSummonPortalMaterial,
  createEnergyBeamMaterial,
  createFresnelShieldMaterial,
  createParticleGlowMaterial
} from './shaders.ts';

export interface ThreeVfxStageProps {
  activeBeat: PresentationBeat | null;
  anchorRegistry: StageAnchorRegistry;
  clearSignal: number;
  onWebglFallback: (reason: string) => void;
}

const PORTAL_POOL_SIZE = 5;
const BEAM_POOL_SIZE = 6;
const SHARD_POOL_SIZE = 28;
const DOME_POOL_SIZE = 3;
const MAX_PARTICLES = 360;

interface PortalEffect {
  kind: 'portal';
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  x: number;
  y: number;
  baseSize: number;
  maxScale: number;
  spinSpeed: number;
  age: number;
  duration: number;
}

interface BeamEffect {
  kind: 'beam';
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  age: number;
  duration: number;
  width: number;
}

interface ShardEffect {
  kind: 'shard';
  mesh: THREE.Mesh<THREE.OctahedronGeometry, THREE.ShaderMaterial>;
  vx: number;
  vy: number;
  vz: number;
  rxSpeed: number;
  rySpeed: number;
  rzSpeed: number;
  gravity: number;
  baseScale: number;
  age: number;
  duration: number;
}

interface DomeEffect {
  kind: 'dome';
  mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  baseScale: number;
  age: number;
  duration: number;
}

type ActiveMeshEffect = PortalEffect | BeamEffect | ShardEffect | DomeEffect;

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  sizeStart: number;
  sizeEnd: number;
  r: number;
  g: number;
  b: number;
  age: number;
  duration: number;
}

/**
 * Lazy-loaded Three.js WebGL2 overlay stage rendering GLSL ES 3.00 summoning circles,
 * energy strike beams, 3D Fresnel shield shatters, and pooled civilization particles.
 * Zero Three.js code is bundled into Lite mode builds.
 */
export const ThreeVfxStage: React.FC<ThreeVfxStageProps> = ({
  activeBeat,
  anchorRegistry,
  clearSignal,
  onWebglFallback
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fallbackRef = useRef(onWebglFallback);
  fallbackRef.current = onWebglFallback;

  const anchorRegistryRef = useRef(anchorRegistry);
  anchorRegistryRef.current = anchorRegistry;

  const lastBeatIdRef = useRef<string | null>(null);
  const lastClearSignalRef = useRef<number>(clearSignal);
  const runtimeRef = useRef<{
    spawnBeat: (beat: PresentationBeat) => void;
    clearAll: () => void;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let canvas: HTMLCanvasElement | null = null;

    const disposableGeometries: THREE.BufferGeometry[] = [];
    const disposableMaterials: THREE.Material[] = [];

    try {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true
      });
      const gl = renderer.getContext();
      if (!gl || gl.isContextLost()) {
        throw new Error('WebGL2 context unavailable');
      }

      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(pixelRatio);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      canvas = renderer.domElement;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.pointerEvents = 'none';
      canvas.dataset.testid = 'three-vfx-canvas';
      container.appendChild(canvas);

      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(0, width, height, 0, -500, 500);
      camera.position.set(0, 0, 200);
      camera.lookAt(0, 0, 0);

      // Shared base geometries (disposed cleanly on unmount)
      const planeGeo = new THREE.PlaneGeometry(1, 1);
      const shardGeo = new THREE.OctahedronGeometry(1, 0);
      const domeGeo = new THREE.CylinderGeometry(1, 0.85, 0.42, 6, 1);
      domeGeo.rotateX(Math.PI * 0.5);
      disposableGeometries.push(planeGeo, shardGeo, domeGeo);

      // Pooled Meshes
      const portalPool: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
      for (let i = 0; i < PORTAL_POOL_SIZE; i++) {
        const mat = createSummonPortalMaterial();
        disposableMaterials.push(mat);
        const mesh = new THREE.Mesh(planeGeo, mat);
        mesh.visible = false;
        mesh.frustumCulled = false;
        scene.add(mesh);
        portalPool.push(mesh);
      }

      const beamPool: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
      for (let i = 0; i < BEAM_POOL_SIZE; i++) {
        const mat = createEnergyBeamMaterial();
        disposableMaterials.push(mat);
        const mesh = new THREE.Mesh(planeGeo, mat);
        mesh.visible = false;
        mesh.frustumCulled = false;
        scene.add(mesh);
        beamPool.push(mesh);
      }

      const shardPool: THREE.Mesh<THREE.OctahedronGeometry, THREE.ShaderMaterial>[] = [];
      for (let i = 0; i < SHARD_POOL_SIZE; i++) {
        const mat = createFresnelShieldMaterial();
        disposableMaterials.push(mat);
        const mesh = new THREE.Mesh(shardGeo, mat);
        mesh.visible = false;
        mesh.frustumCulled = false;
        scene.add(mesh);
        shardPool.push(mesh);
      }

      const domePool: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>[] = [];
      for (let i = 0; i < DOME_POOL_SIZE; i++) {
        const mat = createFresnelShieldMaterial();
        disposableMaterials.push(mat);
        const mesh = new THREE.Mesh(domeGeo, mat);
        mesh.visible = false;
        mesh.frustumCulled = false;
        scene.add(mesh);
        domePool.push(mesh);
      }

      // Pooled Particle Points System (single draw call)
      const positions = new Float32Array(MAX_PARTICLES * 3);
      const colors = new Float32Array(MAX_PARTICLES * 3);
      const sizes = new Float32Array(MAX_PARTICLES);
      const alphas = new Float32Array(MAX_PARTICLES);

      const posAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
      const colorAttr = new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage);
      const sizeAttr = new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage);
      const alphaAttr = new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage);

      const particleGeo = new THREE.BufferGeometry();
      particleGeo.setAttribute('position', posAttr);
      particleGeo.setAttribute('aColor', colorAttr);
      particleGeo.setAttribute('aSize', sizeAttr);
      particleGeo.setAttribute('aAlpha', alphaAttr);
      particleGeo.setDrawRange(0, 0);
      disposableGeometries.push(particleGeo);

      const particleMat = createParticleGlowMaterial(pixelRatio);
      disposableMaterials.push(particleMat);

      const particlePoints = new THREE.Points(particleGeo, particleMat);
      particlePoints.frustumCulled = false;
      scene.add(particlePoints);

      const particles: ParticleSlot[] = Array.from({ length: MAX_PARTICLES }, () => ({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        gravity: 0,
        drag: 1,
        sizeStart: 8,
        sizeEnd: 2,
        r: 1,
        g: 1,
        b: 1,
        age: 0,
        duration: 0.5
      }));

      const activeEffects: ActiveMeshEffect[] = [];
      let isLoopRunning = false;
      let lastTimeMs = performance.now();
      let hitStopRemainingSec = 0;
      let hitStopDelaySec = 0;
      let particleCursor = 0;

      const updateLoopDataset = (running: boolean, activeCount: number) => {
        container.dataset.vfxLoop = running ? 'running' : 'idle';
        container.dataset.vfxActiveCount = String(activeCount);
      };
      updateLoopDataset(false, 0);

      const acquireMesh = <T extends THREE.Object3D>(pool: T[]): T | null => {
        for (const item of pool) {
          if (!item.visible) return item;
        }
        return null;
      };

      const emitParticles = (opts: {
        x: number;
        y: number;
        count: number;
        speedMin: number;
        speedMax: number;
        angleMin?: number;
        angleMax?: number;
        gravity?: number;
        drag?: number;
        sizeStart?: number;
        sizeEnd?: number;
        duration?: number;
        primaryRgb: [number, number, number];
        secondaryRgb: [number, number, number];
      }) => {
        const aMin = opts.angleMin ?? 0;
        const aMax = opts.angleMax ?? Math.PI * 2;
        for (let i = 0; i < opts.count; i++) {
          let chosen: ParticleSlot | null = null;
          for (let tries = 0; tries < MAX_PARTICLES; tries++) {
            const idx = (particleCursor + tries) % MAX_PARTICLES;
            if (!particles[idx].active) {
              chosen = particles[idx];
              particleCursor = (idx + 1) % MAX_PARTICLES;
              break;
            }
          }
          if (!chosen) {
            chosen = particles[particleCursor % MAX_PARTICLES];
            particleCursor = (particleCursor + 1) % MAX_PARTICLES;
          }

          const theta = aMin + Math.random() * (aMax - aMin);
          const spd = opts.speedMin + Math.random() * (opts.speedMax - opts.speedMin);
          const mixT = Math.random();

          chosen.active = true;
          chosen.x = opts.x + (Math.random() - 0.5) * 18;
          chosen.y = opts.y + (Math.random() - 0.5) * 18;
          chosen.z = 25 + Math.random() * 20;
          chosen.vx = Math.cos(theta) * spd;
          chosen.vy = Math.sin(theta) * spd;
          chosen.gravity = opts.gravity ?? -180;
          chosen.drag = opts.drag ?? 2.2;
          chosen.sizeStart = opts.sizeStart ?? 18;
          chosen.sizeEnd = opts.sizeEnd ?? 4;
          chosen.r = opts.primaryRgb[0] * (1 - mixT) + opts.secondaryRgb[0] * mixT;
          chosen.g = opts.primaryRgb[1] * (1 - mixT) + opts.secondaryRgb[1] * mixT;
          chosen.b = opts.primaryRgb[2] * (1 - mixT) + opts.secondaryRgb[2] * mixT;
          chosen.age = 0;
          chosen.duration = (opts.duration ?? 0.55) * (0.75 + Math.random() * 0.45);
        }
      };

      const spawnPortal = (
        x: number,
        y: number,
        baseSize: number,
        duration: number,
        primaryHex: string,
        secondaryHex: string,
        opts?: { maxScale?: number; spinSpeed?: number; z?: number }
      ) => {
        const mesh = acquireMesh(portalPool);
        if (!mesh) return;
        mesh.visible = true;
        mesh.position.set(x, y, opts?.z ?? 15);
        mesh.scale.set(baseSize, baseSize, 1);
        mesh.rotation.set(0, 0, Math.random() * Math.PI);
        mesh.material.uniforms.uTime.value = 0;
        mesh.material.uniforms.uProgress.value = 0;
        mesh.material.uniforms.uOpacity.value = 1;
        mesh.material.uniforms.uPrimaryColor.value.set(primaryHex);
        mesh.material.uniforms.uSecondaryColor.value.set(secondaryHex);

        activeEffects.push({
          kind: 'portal',
          mesh,
          x,
          y,
          baseSize,
          maxScale: opts?.maxScale ?? 1.25,
          spinSpeed: opts?.spinSpeed ?? 1.4,
          age: 0,
          duration
        });
      };

      const spawnBeam = (
        src: OrthoAnchorCoords,
        dst: OrthoAnchorCoords,
        widthPx: number,
        duration: number,
        primaryHex: string,
        secondaryHex: string
      ) => {
        const mesh = acquireMesh(beamPool);
        if (!mesh) return;
        const dx = dst.x - src.x;
        const dy = dst.y - src.y;
        const length = Math.max(40, Math.hypot(dx, dy));
        const angle = Math.atan2(dy, dx);

        mesh.visible = true;
        mesh.position.set((src.x + dst.x) * 0.5, (src.y + dst.y) * 0.5, 22);
        mesh.rotation.set(0, 0, angle);
        mesh.scale.set(length, widthPx, 1);
        mesh.material.uniforms.uTime.value = 0;
        mesh.material.uniforms.uProgress.value = 0;
        mesh.material.uniforms.uOpacity.value = 1;
        mesh.material.uniforms.uPrimaryColor.value.set(primaryHex);
        mesh.material.uniforms.uSecondaryColor.value.set(secondaryHex);

        activeEffects.push({
          kind: 'beam',
          mesh,
          age: 0,
          duration,
          width: widthPx
        });
      };

      const spawnShieldShatter = (
        pos: OrthoAnchorCoords,
        primaryHex: string,
        secondaryHex: string,
        primaryRgb: [number, number, number],
        secondaryRgb: [number, number, number]
      ) => {
        const shardCount = 6;
        for (let i = 0; i < shardCount; i++) {
          const mesh = acquireMesh(shardPool);
          if (!mesh) break;
          const angle = (i / shardCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
          const speed = 150 + Math.random() * 190;
          const baseScale = 12 + Math.random() * 10;

          mesh.visible = true;
          mesh.position.set(pos.x + (Math.random() - 0.5) * 14, pos.y + (Math.random() - 0.5) * 16, 42);
          mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
          mesh.scale.set(baseScale * 0.65, baseScale * 1.15, baseScale * 0.55);
          mesh.material.uniforms.uTime.value = 0;
          mesh.material.uniforms.uProgress.value = 0;
          mesh.material.uniforms.uOpacity.value = 1;
          mesh.material.uniforms.uPrimaryColor.value.set(primaryHex);
          mesh.material.uniforms.uSecondaryColor.value.set(secondaryHex);

          activeEffects.push({
            kind: 'shard',
            mesh,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed + 70,
            vz: (Math.random() - 0.5) * 40,
            rxSpeed: (Math.random() - 0.5) * 14,
            rySpeed: (Math.random() - 0.5) * 14,
            rzSpeed: (Math.random() - 0.5) * 12,
            gravity: -420,
            baseScale,
            age: 0,
            duration: 0.68
          });
        }

        spawnPortal(pos.x, pos.y, Math.max(pos.width * 2.2, 110), 0.48, '#e0f2fe', primaryHex, {
          maxScale: 1.5,
          spinSpeed: 2.2
        });

        emitParticles({
          x: pos.x,
          y: pos.y,
          count: 24,
          speedMin: 90,
          speedMax: 320,
          gravity: -280,
          sizeStart: 16,
          sizeEnd: 3,
          duration: 0.58,
          primaryRgb,
          secondaryRgb
        });
      };

      const spawnBlockBarrier = (pos: OrthoAnchorCoords) => {
        const mesh = acquireMesh(domePool);
        if (!mesh) return;
        const baseScale = Math.max(pos.width * 0.8, 68);
        mesh.visible = true;
        mesh.position.set(pos.x, pos.y, 48);
        mesh.rotation.set(0.18, 0.15, 0);
        mesh.scale.set(baseScale, baseScale, baseScale);
        mesh.material.uniforms.uTime.value = 0;
        mesh.material.uniforms.uProgress.value = 0;
        mesh.material.uniforms.uOpacity.value = 1;
        mesh.material.uniforms.uPrimaryColor.value.set('#38bdf8');
        mesh.material.uniforms.uSecondaryColor.value.set('#bae6fd');

        activeEffects.push({
          kind: 'dome',
          mesh,
          baseScale,
          age: 0,
          duration: 0.45
        });
      };

      const clearAll = () => {
        hitStopRemainingSec = 0;
        hitStopDelaySec = 0;
        activeEffects.length = 0;
        for (const m of portalPool) m.visible = false;
        for (const m of beamPool) m.visible = false;
        for (const m of shardPool) m.visible = false;
        for (const m of domePool) m.visible = false;
        for (const p of particles) p.active = false;
        particleGeo.setDrawRange(0, 0);

        if (renderer && !disposed) {
          renderer.render(scene, camera);
          renderer.setAnimationLoop(null);
        }
        isLoopRunning = false;
        updateLoopDataset(false, 0);
      };

      const tickFrame = () => {
        if (disposed || !renderer) return;
        const now = performance.now();
        const rawDt = Math.min(Math.max((now - lastTimeMs) / 1000, 0), 0.1);
        lastTimeMs = now;

        // Pause Three.js effect advancement cleanly during Hit-Stop peak impact frames
        let effectDt = rawDt;
        if (hitStopDelaySec > 0) {
          hitStopDelaySec = Math.max(0, hitStopDelaySec - rawDt);
        } else if (hitStopRemainingSec > 0) {
          hitStopRemainingSec = Math.max(0, hitStopRemainingSec - rawDt);
          effectDt = 0;
        }

        // Advance pooled mesh effects
        for (let i = activeEffects.length - 1; i >= 0; i--) {
          const eff = activeEffects[i];
          eff.age += effectDt;
          const t = Math.min(1, eff.age / eff.duration);

          if (eff.kind === 'portal') {
            const easeOut = 1 - Math.pow(1 - t, 3);
            const scale = eff.baseSize * (0.45 + (eff.maxScale - 0.45) * easeOut);
            eff.mesh.scale.set(scale, scale, 1);
            eff.mesh.rotation.z += eff.spinSpeed * effectDt;
            eff.mesh.material.uniforms.uTime.value = eff.age;
            eff.mesh.material.uniforms.uProgress.value = t;
            eff.mesh.material.uniforms.uOpacity.value = 1 - Math.pow(t, 2.2);
          } else if (eff.kind === 'beam') {
            const beamPulse = Math.sin(t * Math.PI);
            eff.mesh.scale.y = eff.width * (0.65 + 0.55 * beamPulse);
            eff.mesh.material.uniforms.uTime.value = eff.age;
            eff.mesh.material.uniforms.uProgress.value = t;
            eff.mesh.material.uniforms.uOpacity.value = 1 - Math.pow(t, 2.4);
          } else if (eff.kind === 'shard') {
            eff.vy += eff.gravity * effectDt;
            eff.mesh.position.x += eff.vx * effectDt;
            eff.mesh.position.y += eff.vy * effectDt;
            eff.mesh.position.z += eff.vz * effectDt;
            eff.mesh.rotation.x += eff.rxSpeed * effectDt;
            eff.mesh.rotation.y += eff.rySpeed * effectDt;
            eff.mesh.rotation.z += eff.rzSpeed * effectDt;
            eff.mesh.material.uniforms.uTime.value = eff.age;
            eff.mesh.material.uniforms.uProgress.value = t;
            eff.mesh.material.uniforms.uOpacity.value = 1 - Math.pow(t, 2.0);
          } else if (eff.kind === 'dome') {
            const s = eff.baseScale * (0.8 + 0.35 * Math.sin(t * Math.PI * 0.5));
            eff.mesh.scale.set(s, s, s);
            eff.mesh.rotation.z += 1.6 * effectDt;
            eff.mesh.material.uniforms.uTime.value = eff.age;
            eff.mesh.material.uniforms.uProgress.value = t;
            eff.mesh.material.uniforms.uOpacity.value = 1 - Math.pow(t, 1.8);
          }

          if (eff.age >= eff.duration) {
            eff.mesh.visible = false;
            activeEffects.splice(i, 1);
          }
        }

        // Advance and pack active particles into dynamic vertex buffer
        let drawCount = 0;
        for (let i = 0; i < MAX_PARTICLES; i++) {
          const p = particles[i];
          if (!p.active) continue;
          p.age += effectDt;
          if (p.age >= p.duration) {
            p.active = false;
            continue;
          }

          const pt = p.age / p.duration;
          const damp = Math.exp(-p.drag * effectDt);
          p.vx *= damp;
          p.vy = (p.vy + p.gravity * effectDt) * damp;
          p.x += p.vx * effectDt;
          p.y += p.vy * effectDt;

          const vIdx3 = drawCount * 3;
          positions[vIdx3] = p.x;
          positions[vIdx3 + 1] = p.y;
          positions[vIdx3 + 2] = p.z;

          colors[vIdx3] = p.r;
          colors[vIdx3 + 1] = p.g;
          colors[vIdx3 + 2] = p.b;

          sizes[drawCount] = p.sizeStart * (1 - pt) + p.sizeEnd * pt;
          alphas[drawCount] = 1 - pt * pt;
          drawCount += 1;
        }

        if (drawCount > 0) {
          posAttr.needsUpdate = true;
          colorAttr.needsUpdate = true;
          sizeAttr.needsUpdate = true;
          alphaAttr.needsUpdate = true;
        }
        particleGeo.setDrawRange(0, drawCount);

        renderer.render(scene, camera);
        updateLoopDataset(true, activeEffects.length + (drawCount > 0 ? 1 : 0));

        // Put GPU render loop cleanly to sleep when no effects or particles remain active
        if (activeEffects.length === 0 && drawCount === 0) {
          renderer.setAnimationLoop(null);
          isLoopRunning = false;
          updateLoopDataset(false, 0);
        }
      };

      const startLoop = () => {
        if (disposed || !renderer || isLoopRunning) return;
        isLoopRunning = true;
        lastTimeMs = performance.now();
        updateLoopDataset(true, activeEffects.length);
        renderer.setAnimationLoop(tickFrame);
      };

      const spawnBeat = (beat: PresentationBeat) => {
        const reg = anchorRegistryRef.current;
        reg.measureSlots();
        const dims = reg.getStageDimensions();
        if (dims.width <= 0 || dims.height <= 0) return;

        const { event } = beat;
        const { primary, secondary } = getCivPalette(event.civilizations);
        const src = reg.resolveOrtho(event.source) ?? {
          x: dims.width * 0.5,
          y: event.actor === 'opponent' ? dims.height * 0.25 : dims.height * 0.75,
          width: 90,
          height: 120
        };
        const firstTarget =
          reg.resolveOrtho(event.targets?.[0]) ?? {
            x: dims.width * 0.5,
            y: dims.height * 0.5,
            width: 90,
            height: 120
          };

        if (beat.hitStopMs > 0) {
          hitStopDelaySec = 0.04;
          hitStopRemainingSec = beat.hitStopMs / 1000;
        } else {
          hitStopDelaySec = 0;
          hitStopRemainingSec = 0;
        }

        switch (event.type) {
          case 'CHARGE_MANA': {
            spawnBeam(src, firstTarget, 36, 0.42, primary.primaryHex, secondary.secondaryHex);
            spawnPortal(firstTarget.x, firstTarget.y, 92, 0.45, primary.primaryHex, secondary.secondaryHex, {
              maxScale: 1.25
            });
            emitParticles({
              x: firstTarget.x,
              y: firstTarget.y,
              count: 18,
              speedMin: 50,
              speedMax: 160,
              gravity: 90,
              sizeStart: 14,
              sizeEnd: 3,
              duration: 0.45,
              primaryRgb: primary.primaryRgb,
              secondaryRgb: secondary.secondaryRgb
            });
            break;
          }

          case 'SUMMON_CREATURE': {
            const target = firstTarget;
            const size = Math.max(target.width * 1.9, 150);
            spawnPortal(target.x, target.y, size, 0.62, primary.primaryHex, secondary.secondaryHex, {
              maxScale: 1.45,
              spinSpeed: 2.2
            });
            emitParticles({
              x: target.x,
              y: target.y,
              count: 28,
              speedMin: 60,
              speedMax: 230,
              gravity: 160,
              sizeStart: 18,
              sizeEnd: 3,
              duration: 0.58,
              primaryRgb: primary.primaryRgb,
              secondaryRgb: secondary.secondaryRgb
            });
            break;
          }

          case 'EVOLVE': {
            const target = firstTarget;
            const size = Math.max(target.width * 2.2, 185);
            spawnPortal(target.x, target.y, size, 0.82, '#38bdf8', primary.primaryHex, {
              maxScale: 1.55,
              spinSpeed: 3.1
            });
            spawnPortal(target.x, target.y, size * 0.72, 0.78, primary.primaryHex, '#fde047', {
              maxScale: 1.35,
              spinSpeed: -3.4
            });
            emitParticles({
              x: target.x,
              y: target.y,
              count: 42,
              speedMin: 80,
              speedMax: 290,
              gravity: 130,
              sizeStart: 20,
              sizeEnd: 4,
              duration: 0.74,
              primaryRgb: primary.primaryRgb,
              secondaryRgb: [0.22, 0.74, 0.97]
            });
            break;
          }

          case 'CAST_SPELL': {
            spawnPortal(src.x, src.y, 120, 0.52, primary.primaryHex, secondary.secondaryHex, {
              maxScale: 1.4,
              spinSpeed: 2.5
            });
            const spellTargets = event.targets?.length ? event.targets : [{ player: event.actor, zone: 'battleZone' as const }];
            for (const tref of spellTargets) {
              const dst = reg.resolveOrtho(tref) ?? firstTarget;
              spawnBeam(src, dst, 48, 0.48, primary.primaryHex, '#ffffff');
              spawnPortal(dst.x, dst.y, 115, 0.52, primary.primaryHex, secondary.secondaryHex, {
                maxScale: 1.35
              });
              emitParticles({
                x: dst.x,
                y: dst.y,
                count: 20,
                speedMin: 70,
                speedMax: 240,
                gravity: 60,
                sizeStart: 16,
                sizeEnd: 3,
                duration: 0.52,
                primaryRgb: primary.primaryRgb,
                secondaryRgb: secondary.secondaryRgb
              });
            }
            break;
          }

          case 'DECLARE_ATTACK': {
            spawnPortal(src.x, src.y, 105, 0.36, primary.primaryHex, secondary.secondaryHex, {
              maxScale: 1.35
            });
            const strikeTargets = event.targets?.length ? event.targets : [];
            for (const tref of strikeTargets) {
              const dst = reg.resolveOrtho(tref) ?? firstTarget;
              spawnBeam(src, dst, 64, 0.48, primary.primaryHex, '#fef08a');
              spawnPortal(dst.x, dst.y, 110, 0.44, '#f87171', primary.primaryHex, {
                maxScale: 1.45,
                spinSpeed: 3.0
              });
              emitParticles({
                x: dst.x,
                y: dst.y,
                count: 24,
                speedMin: 90,
                speedMax: 300,
                gravity: -90,
                sizeStart: 18,
                sizeEnd: 3,
                duration: 0.46,
                primaryRgb: primary.primaryRgb,
                secondaryRgb: [1, 0.94, 0.54]
              });
            }
            break;
          }

          case 'BLOCK': {
            spawnBlockBarrier(src);
            emitParticles({
              x: src.x,
              y: src.y,
              count: 22,
              speedMin: 80,
              speedMax: 240,
              gravity: -60,
              sizeStart: 16,
              sizeEnd: 3,
              duration: 0.45,
              primaryRgb: [0.22, 0.74, 0.97],
              secondaryRgb: [0.98, 0.85, 0.35]
            });
            break;
          }

          case 'SHIELD_BROKEN': {
            const shieldTargets = event.targets?.length ? event.targets : [];
            for (const tref of shieldTargets) {
              const sPos = reg.resolveOrtho(tref);
              if (sPos) {
                spawnShieldShatter(sPos, '#38bdf8', '#fbbf24', [0.22, 0.74, 0.97], [0.98, 0.75, 0.14]);
              }
            }
            break;
          }

          case 'SHIELD_TRIGGER': {
            const zoneCenter = {
              x: dims.width * 0.5,
              y: event.actor === 'opponent' ? dims.height * 0.22 : dims.height * 0.78,
              width: 140,
              height: 140
            };
            spawnPortal(zoneCenter.x, zoneCenter.y, 210, 0.72, '#fbbf24', primary.primaryHex, {
              maxScale: 1.55,
              spinSpeed: 3.4
            });
            emitParticles({
              x: zoneCenter.x,
              y: zoneCenter.y,
              count: 34,
              speedMin: 95,
              speedMax: 320,
              gravity: 140,
              sizeStart: 20,
              sizeEnd: 4,
              duration: 0.65,
              primaryRgb: [0.98, 0.75, 0.14],
              secondaryRgb: primary.primaryRgb
            });
            break;
          }

          case 'CREATURE_DESTROYED': {
            const victims = event.targets?.length ? event.targets : [];
            for (const vref of victims) {
              const vPos = reg.resolveOrtho(vref);
              if (!vPos) continue;
              spawnPortal(vPos.x, vPos.y, Math.max(vPos.width * 1.4, 120), 0.48, '#ef4444', '#7e22ce', {
                maxScale: 1.4,
                spinSpeed: -2.6
              });
              emitParticles({
                x: vPos.x,
                y: vPos.y,
                count: 30,
                speedMin: 40,
                speedMax: 190,
                gravity: 220,
                sizeStart: 19,
                sizeEnd: 2,
                duration: 0.56,
                primaryRgb: [0.94, 0.27, 0.27],
                secondaryRgb: [0.98, 0.55, 0.1]
              });
            }
            break;
          }

          case 'GAME_OVER': {
            const cx = dims.width * 0.5;
            const cy = dims.height * 0.5;
            spawnPortal(cx, cy, Math.min(dims.width, dims.height) * 0.55, 0.88, primary.primaryHex, '#fbbf24', {
              maxScale: 1.4,
              spinSpeed: 2.0
            });
            emitParticles({
              x: cx,
              y: cy,
              count: 64,
              speedMin: 110,
              speedMax: 380,
              gravity: -80,
              sizeStart: 22,
              sizeEnd: 4,
              duration: 0.85,
              primaryRgb: primary.primaryRgb,
              secondaryRgb: [0.98, 0.75, 0.14]
            });
            break;
          }

          case 'DRAW': {
            spawnBeam(src, firstTarget, 22, 0.24, primary.primaryHex, '#e2e8f0');
            break;
          }
        }

        if (activeEffects.length > 0 || particles.some((p) => p.active)) {
          startLoop();
        }
      };

      runtimeRef.current = { spawnBeat, clearAll };

      // Replay activeBeat cleanly if stage mounted during a live Drama beat
      if (activeBeat) {
        lastBeatIdRef.current = activeBeat.id;
        spawnBeat(activeBeat);
      }

      const handleResize = () => {
        if (disposed || !renderer || !container) return;
        const w = Math.max(1, container.clientWidth);
        const h = Math.max(1, container.clientHeight);
        renderer.setSize(w, h, false);
        camera.right = w;
        camera.top = h;
        camera.updateProjectionMatrix();
        anchorRegistryRef.current.measureSlots();
        if (!isLoopRunning) {
          renderer.render(scene, camera);
        }
      };

      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
      window.addEventListener('resize', handleResize);

      const handleContextLost = (e: Event) => {
        e.preventDefault();
        clearAll();
        fallbackRef.current('webglcontextlost');
      };
      canvas.addEventListener('webglcontextlost', handleContextLost);

      return () => {
        disposed = true;
        runtimeRef.current = null;
        resizeObserver.disconnect();
        window.removeEventListener('resize', handleResize);
        canvas?.removeEventListener('webglcontextlost', handleContextLost);

        renderer?.setAnimationLoop(null);
        for (const g of disposableGeometries) g.dispose();
        for (const m of disposableMaterials) m.dispose();
        scene.clear();

        if (renderer) {
          renderer.dispose();
          try {
            renderer.forceContextLoss();
          } catch {
            // Ignore errors if context is already lost
          }
        }
        if (canvas && canvas.parentNode === container) {
          container.removeChild(canvas);
        }
      };
    } catch (err) {
      if (renderer) {
        try {
          renderer.dispose();
        } catch {
          // Ignore disposal error
        }
      }
      if (canvas && canvas.parentNode === container) {
        container.removeChild(canvas);
      }
      fallbackRef.current(err instanceof Error ? err.message : 'WebGL initialization error');
      return () => {
        disposed = true;
      };
    }
  }, []);

  useEffect(() => {
    if (clearSignal !== lastClearSignalRef.current) {
      lastClearSignalRef.current = clearSignal;
      runtimeRef.current?.clearAll();
    }
  }, [clearSignal]);

  useEffect(() => {
    if (!activeBeat) {
      lastBeatIdRef.current = null;
      return;
    }
    if (activeBeat.id === lastBeatIdRef.current) return;
    lastBeatIdRef.current = activeBeat.id;
    runtimeRef.current?.spawnBeat(activeBeat);
  }, [activeBeat]);

  return (
    <div
      ref={containerRef}
      data-testid="three-vfx-stage"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[32] overflow-hidden"
    />
  );
};

export default ThreeVfxStage;
