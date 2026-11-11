import React from 'react';
import { ShieldsRow, type ShieldsRowProps } from './ShieldsRow';
import { GraveyardModal, type GraveyardModalProps } from './GraveyardModal';

export { ShieldsRow, GraveyardModal };
export type { ShieldsRowProps, GraveyardModalProps };

/**
 * GraveyardDeckZone is an alias/wrapper for the cohesive ShieldsRow
 * component (`[Graveyard Pile] | [5 Shield Slots] | [Deck Pile]`).
 */
export const GraveyardDeckZone: React.FC<ShieldsRowProps> = (props) => {
  return <ShieldsRow {...props} />;
};
