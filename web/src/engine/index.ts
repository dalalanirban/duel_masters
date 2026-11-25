// Types
export * from './types.ts';

// Shared Card Utilities & Replacements
export * from './cardUtils.ts';
export * from './replacements.ts';
export * from './targeting.ts';

// State & Initialization
export * from './state.ts';

// Turn Lifecycle & Mana Rules
export * from './turn.ts';
export * from './mana.ts';

// Continuous Rules, Zones, Triggers & Advanced Mechanics
export * from './continuous.ts';
export * from './zones.ts';
export * from './interactionHelpers.ts';
export * from './zoneSelection.ts';
export * from './triggers.ts';
export * from './advancedMechanics.ts';
export * from './tapAbilities.ts';

// Main Phase & Combat Operations
export * from './evolution.ts';
export * from './spells.ts';
export * from './combat.ts';

// Explicit backward-compatible exports from effects facade
export {
  findCreature,
  drawCards,
  discardHandCardsByIndices,
  discardRandomHandCards,
  rampTopDeckToManaZone,
  addShieldFromDeck,
  destroyOpponentShields,
  breakOpponentShields,
  searchDeckForCard,
  salvageFromGraveyard,
  destroyCreature,
  destroyCreaturesBatch,
  bounceCreature,
  sendCreatureToManaZone,
  sendCreatureToTopOfDeck,
  sendCreatureToShields
} from './zones.ts';

// Master Reducer
export * from './reducer.ts';

// Intelligent AI Player Agent
export * from './ai.ts';
