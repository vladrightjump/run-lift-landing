import type { CSSProperties } from 'react';

/** Numărul de secțiune (01/02…) și titlul — stil comun secțiunilor landing-ului. */
export const sectionNum: CSSProperties = {
  fontFamily: 'Anton, sans-serif',
  fontSize: 15,
  color: 'var(--e3-accent)',
  letterSpacing: 3,
  textTransform: 'uppercase',
};
export const sectionTitle: CSSProperties = {
  margin: 0,
  fontFamily: 'Anton, sans-serif',
  fontWeight: 400,
  fontSize: 'clamp(34px, 6vw, 52px)',
  letterSpacing: 0.5,
  textTransform: 'uppercase',
};
