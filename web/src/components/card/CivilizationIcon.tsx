import React from 'react';
import { Civilization } from '../../types/card';

interface Props {
  civilization: Civilization;
  className?: string;
}

export const CivilizationIcon: React.FC<Props> = ({ civilization, className = 'w-4 h-4' }) => {
  switch (civilization) {
    case 'Light':
      // Radiant Sunburst
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={`${className} text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]`}>
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'Water':
      // Oceanic Water Droplet & Waves
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={`${className} text-sky-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.8)]`}>
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
          <path d="M8 14c1 1.5 3 2 4.5 1" stroke="#0369a1" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
      );
    case 'Darkness':
      // Abyssal Skull / Moon Crest
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={`${className} text-purple-400 drop-shadow-[0_0_6px_rgba(192,132,252,0.8)]`}>
          <path d="M12 2a9 9 0 0 0-9 9c0 3.2 1.7 6 4.3 7.6.3.2.7.4.7.8v1.6c0 .5.5 1 1 1h6c.5 0 1-.5 1-1v-1.6c0-.4.4-.6.7-.8 2.6-1.6 4.3-4.4 4.3-7.6a9 9 0 0 0-9-9z" />
          <circle cx="9" cy="11" r="1.5" fill="#18181b" />
          <circle cx="15" cy="11" r="1.5" fill="#18181b" />
        </svg>
      );
    case 'Fire':
      // Raging Flame Crest
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={`${className} text-red-500 drop-shadow-[0_0_6px_rgba(239,68,68,0.8)]`}>
          <path d="M12 2c.5 3-1.5 5-1.5 7.5 0 2.5 2 4.5 4.5 4.5 1.5 0 3-1 3.5-2.5 1 4-1 8-5 10.5C9.5 21 6 18.5 6 14.5c0-4 3.5-7 6-12.5z" />
          <path d="M12 14c0 1.5 1 2.5 2 2.5.5 0 1-.3 1.2-.8.5 1.5 0 3.3-1.2 4.3-1.5-1-2-2.5-2-4.5 0-.5 0-1 0-1.5z" fill="#fef08a" />
        </svg>
      );
    case 'Nature':
      // Wild Emerald Leaf Crest
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={`${className} text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]`}>
          <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.5-11 4.5" />
          <path d="M11.5 12.5C9 14 7 17 6 19" stroke="#065f46" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
      );
    default:
      return null;
  }
};
