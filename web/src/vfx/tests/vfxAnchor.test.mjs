import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  StageAnchorRegistry,
  getAnchorCandidateIds,
  toOrthoCoords
} from '../anchorRegistry.ts';
import { CIV_PALETTE, getCivPalette } from '../civColors.ts';

describe('VFX Anchor Registry & Civilization Palette', () => {
  it('maps container-local CSS coordinates cleanly into right-handed OrthographicCamera coords', () => {
    const ortho = toOrthoCoords({ cx: 320, cy: 180, width: 104, height: 146 }, 900);
    assert.deepEqual(ortho, { x: 320, y: 720, width: 104, height: 146 });
  });

  it('orders anchor candidate IDs from card instance down to zone fallback', () => {
    assert.deepEqual(
      getAnchorCandidateIds({ player: 'opponent', zone: 'shields', instanceId: 'sh-1', shieldIndex: 2 }),
      ['shield-opponent-sh-1', 'shield-opponent-2', 'direct-target-opponent', 'shields-zone-opponent']
    );
    assert.deepEqual(
      getAnchorCandidateIds({ player: 'player', zone: 'battleZone', instanceId: 'bz-99' }),
      ['bz-bz-99', 'battle-zone-player']
    );
  });

  it('resolves cached anchors and defaults cleanly across zones without DOM queries', () => {
    const reg = new StageAnchorRegistry();
    reg.setStageDimensions(1000, 800);
    reg.setCachedEntry('bz-card-1', { cx: 450, cy: 500, width: 104, height: 146 });
    reg.setCachedEntry('shields-zone-opponent', { cx: 500, cy: 120, width: 320, height: 64 });

    assert.deepEqual(reg.resolveOrtho({ player: 'player', zone: 'battleZone', instanceId: 'card-1' }), {
      x: 450,
      y: 300,
      width: 104,
      height: 146
    });
    assert.deepEqual(reg.resolveOrtho({ player: 'opponent', zone: 'shields' }), {
      x: 500,
      y: 680,
      width: 320,
      height: 64
    });
  });

  it('provides palette definitions for all 5 civilizations with fallback', () => {
    for (const civ of ['Fire', 'Water', 'Light', 'Darkness', 'Nature']) {
      assert.ok(CIV_PALETTE[civ], `Palette missing for ${civ}`);
      assert.equal(CIV_PALETTE[civ].primaryRgb.length, 3);
    }
    const multi = getCivPalette(['Water', 'Darkness']);
    assert.equal(multi.primary.primaryHex, CIV_PALETTE.Water.primaryHex);
    assert.equal(multi.secondary.primaryHex, CIV_PALETTE.Darkness.primaryHex);
  });
});
