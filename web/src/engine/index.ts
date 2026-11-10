// Types
export * from './types.ts';

// State & Initialization
export * from './state.ts';

// Turn Lifecycle & Mana Rules
export * from './turn.ts';
export * from './mana.ts';

// Main Phase Operations
export * from './evolution.ts';
export * from './spells.ts';

// Combat & Attack Phase Operations
export * from './combat.ts';

// Declarative Effects & Triggers
export * from './effects.ts';

// Explicit re-exports to resolve TS2308 ambiguity between spells.ts and effects.ts
export {
  addShieldFromDeck,
  bounceCreature,
  destroyOpponentShields,
  discardRandomHandCards,
  drawCards,
  rampTopDeckToManaZone
} from './effects.ts';

// Master Reducer
export * from './reducer.ts';

// Intelligent AI Player Agent
export * from './ai.ts';
