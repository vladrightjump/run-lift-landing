import type { CSSProperties } from 'react';

/**
 * Stilurile câmpurilor de formular, comune celor două suprafețe de înscriere
 * (secțiunea 03 de pe landing și formularul de sine stătător) plus câmpului de
 * dată de naștere. Erau definite identic în toate trei; o schimbare de padding
 * sau de culoare trebuia făcută în trei locuri, iar a treia se uita.
 */
export const label: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: 'var(--e3-muted)',
};

export const inputStyle: CSSProperties = {
  background: 'var(--e3-bg)',
  border: '1px solid var(--e3-border)',
  color: 'var(--e3-text)',
  fontFamily: 'Archivo, sans-serif',
  // 16px, nu 15: sub 16 Safari pe iOS face zoom la focus și aruncă layoutul
  // în lateral la jumătatea formularului.
  fontSize: 16,
  padding: '13px 14px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

export const fieldErr: CSSProperties = { fontSize: 13, color: 'var(--e3-danger)' };

/** Butonul mic de acțiune (calendar, distribuire, reîncercare, contact). */
export const ctaSmall: CSSProperties = {
  background: 'var(--e3-accent)',
  color: 'var(--e3-bg)',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'Anton, sans-serif',
  fontSize: 15,
  letterSpacing: 1,
  textTransform: 'uppercase',
  padding: '12px 22px',
};
