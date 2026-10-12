import type { ReactNode } from 'react';
import { INSTAGRAM_URL, INSTAGRAM_HANDLE } from '../lib/config';
import styles from './CadruScurt.module.css';

/**
 * Cadrul paginilor scurte: fundalul, antetul cu logo și o linie de context,
 * conținutul centrat și, opțional, subsolul cu Instagram.
 *
 * Era copiat în fiecare pagină din linkurile de email și pe `/antrenament`.
 * Clasele `.cs-*` sunt încă globale: ecranul de așteptare (`ComingSoon`) le
 * folosește și el, iar stilul lor se mută într-un modul odată cu el.
 */
export const CadruScurt = ({
  meta,
  subsol = true,
  children,
}: {
  /** Linia din dreapta antetului, de exemplu „Run + Lift · Ediția 7”. */
  meta: ReactNode;
  subsol?: boolean;
  children: ReactNode;
}) => (
  <div className="cs-root">
    <div className="cs-bg" aria-hidden="true" />

    <header className="cs-topbar">
      <a className="cs-logo" href="/">
        R<span className="cs-accent">+</span>L
      </a>
      <span className="cs-brand-meta">{meta}</span>
    </header>

    <main className="cs-main">{children}</main>

    {subsol && (
      <footer className="cs-footer">
        <span>Run + Lift · Chișinău</span>
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
          Instagram {INSTAGRAM_HANDLE}
        </a>
      </footer>
    )}
  </div>
);

/** Titlul mare al unei pagini scurte. */
export const TitluScurt = ({ children }: { children: ReactNode }) => (
  <h1 className={styles.titlu}>{children}</h1>
);
