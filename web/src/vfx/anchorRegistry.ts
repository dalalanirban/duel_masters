import type { PresentationAnchorRef } from '../presentation/types.ts';

export interface MeasuredAnchorRect {
  /** Center X relative to WebGL stage container's left edge (CSS px). */
  cx: number;
  /** Center Y relative to WebGL stage container's top edge (CSS px). */
  cy: number;
  width: number;
  height: number;
}

export interface OrthoAnchorCoords {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Maps container-local CSS coordinates (top-left origin) to right-handed
 * OrthographicCamera(0, width, height, 0, -500, 500) world coordinates (bottom-left origin).
 */
export function toOrthoCoords(
  rect: MeasuredAnchorRect,
  stageHeight: number
): OrthoAnchorCoords {
  return {
    x: rect.cx,
    y: stageHeight - rect.cy,
    width: rect.width,
    height: rect.height
  };
}

/**
 * Generates ordered `[data-vfx-id]` lookup keys from most-specific card slot
 * to zone-level fallback.
 */
export function getAnchorCandidateIds(ref: PresentationAnchorRef): string[] {
  const candidates: string[] = [];

  switch (ref.zone) {
    case 'deck':
      candidates.push(`deck-${ref.player}`);
      break;
    case 'graveyard':
      candidates.push(`gy-${ref.player}`);
      break;
    case 'hand':
      if (ref.instanceId) candidates.push(`hand-card-${ref.instanceId}`);
      candidates.push(`hand-${ref.player}`);
      break;
    case 'manaZone':
      if (ref.instanceId) candidates.push(`mana-${ref.instanceId}`);
      candidates.push(`mana-zone-${ref.player}`);
      break;
    case 'shields':
      if (ref.instanceId) candidates.push(`shield-${ref.player}-${ref.instanceId}`);
      if (ref.shieldIndex !== undefined) candidates.push(`shield-${ref.player}-${ref.shieldIndex}`);
      candidates.push(`direct-target-${ref.player}`);
      candidates.push(`shields-zone-${ref.player}`);
      break;
    case 'battleZone':
      if (ref.instanceId) candidates.push(`bz-${ref.instanceId}`);
      candidates.push(`battle-zone-${ref.player}`);
      break;
  }

  return candidates;
}

/**
 * Cached anchor registry measuring `[data-vfx-id]` bounds relative to the
 * WebGL stage container outside `requestAnimationFrame` (ResizeObserver / beat-start).
 */
export class StageAnchorRegistry {
  private container: HTMLElement | null = null;
  private cache = new Map<string, MeasuredAnchorRect>();
  private stageWidth = 0;
  private stageHeight = 0;

  setContainer(el: HTMLElement | null): void {
    this.container = el;
    if (!el) {
      this.cache.clear();
      this.stageWidth = 0;
      this.stageHeight = 0;
    }
  }

  setCachedEntry(vfxId: string, rect: MeasuredAnchorRect): void {
    this.cache.set(vfxId, rect);
  }

  setStageDimensions(width: number, height: number): void {
    this.stageWidth = width;
    this.stageHeight = height;
  }

  getStageDimensions(): { width: number; height: number } {
    return { width: this.stageWidth, height: this.stageHeight };
  }

  measureSlots(): void {
    if (!this.container) return;
    const rootRect = this.container.getBoundingClientRect();
    this.stageWidth = rootRect.width;
    this.stageHeight = rootRect.height;

    const nextCache = new Map<string, MeasuredAnchorRect>();
    const nodes = this.container.querySelectorAll<HTMLElement>('[data-vfx-id]');
    nodes.forEach((node) => {
      const id = node.dataset.vfxId;
      if (!id) return;
      const r = node.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      nextCache.set(id, {
        cx: r.left - rootRect.left + r.width * 0.5,
        cy: r.top - rootRect.top + r.height * 0.5,
        width: r.width,
        height: r.height
      });
    });

    this.cache = nextCache;
  }

  resolve(ref?: PresentationAnchorRef): MeasuredAnchorRect | null {
    if (!ref) return null;
    const candidates = getAnchorCandidateIds(ref);
    for (const id of candidates) {
      const hit = this.cache.get(id);
      if (hit) return hit;
    }
    if (this.stageWidth > 0 && this.stageHeight > 0) {
      return {
        cx: this.stageWidth * 0.5,
        cy: ref.player === 'opponent' ? this.stageHeight * 0.25 : this.stageHeight * 0.75,
        width: 80,
        height: 100
      };
    }
    return null;
  }

  resolveOrtho(ref?: PresentationAnchorRef): OrthoAnchorCoords | null {
    const rect = this.resolve(ref);
    if (!rect) return null;
    return toOrthoCoords(rect, this.stageHeight);
  }
}
