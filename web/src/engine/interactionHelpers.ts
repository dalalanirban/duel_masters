import type {
  GameState,
  PendingInteraction,
  PlayerId,
  ZoneCardOption,
  ZoneKind
} from './types.ts';

/**
 * Sets `pendingInteraction` if free, or appends to `pendingInteractionQueue` so nested prompts never overwrite one another.
 */
export function enqueueInteraction(
  state: GameState,
  interaction: PendingInteraction
): GameState {
  if (!state.pendingInteraction) {
    return {
      ...state,
      pendingInteraction: interaction
    };
  }
  return {
    ...state,
    pendingInteractionQueue: [...(state.pendingInteractionQueue || []), interaction]
  };
}

/**
 * Builds ZoneCardOption items for any player's requested zone(s).
 */
export function buildZoneOptions(
  state: GameState,
  owner: PlayerId,
  zones: ZoneKind[],
  filterFn?: (option: ZoneCardOption) => boolean,
  options?: { hideCards?: boolean }
): ZoneCardOption[] {
  const p = state.players[owner];
  const collected: ZoneCardOption[] = [];

  for (const zone of zones) {
    if (zone === 'battleZone') {
      for (const c of p.battleZone) {
        collected.push({
          instanceId: c.instanceId,
          zone: 'battleZone',
          owner,
          card: c.card,
          isTapped: c.isTapped,
          label: `${c.card.name} (${c.card.power ?? 0})`
        });
      }
    } else if (zone === 'hand') {
      for (const h of p.hand) {
        collected.push({
          instanceId: h.instanceId,
          zone: 'hand',
          owner,
          card: h.card,
          isHidden: options?.hideCards,
          label: options?.hideCards ? 'Hidden Hand Card' : h.card.name
        });
      }
    } else if (zone === 'manaZone') {
      for (const m of p.manaZone) {
        collected.push({
          instanceId: m.instanceId,
          zone: 'manaZone',
          owner,
          card: m.card,
          isTapped: m.isTapped,
          label: m.card.name
        });
      }
    } else if (zone === 'shields') {
      p.shields.forEach((s, idx) => {
        if (!s.isBroken) {
          collected.push({
            instanceId: s.id,
            zone: 'shields',
            owner,
            card: s.card,
            isHidden: options?.hideCards ?? true,
            label: `Shield #${idx + 1}`
          });
        }
      });
    } else if (zone === 'graveyard') {
      for (const g of p.graveyard) {
        collected.push({
          instanceId: g.instanceId,
          zone: 'graveyard',
          owner,
          card: g.card,
          label: g.card.name
        });
      }
    } else if (zone === 'deck') {
      for (const d of p.deck) {
        collected.push({
          instanceId: d.instanceId,
          zone: 'deck',
          owner,
          card: d.card,
          label: d.card.name
        });
      }
    }
  }

  return filterFn ? collected.filter(filterFn) : collected;
}
