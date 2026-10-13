import styles from './StareComanda.module.css';
import type { ReactNode } from 'react';
import type { SalaComanda } from './api';

/** Clasa fiecărei stări, scrisă întreg — garda de stil caută clasele literal. */
const CLASA: Record<SalaComanda['status'], string> = {
  pending: styles['admin-sala-comanda'] + ' ' + styles['admin-sala-comanda--pending'],
  done: styles['admin-sala-comanda'] + ' ' + styles['admin-sala-comanda--done'],
  failed: styles['admin-sala-comanda'] + ' ' + styles['admin-sala-comanda--failed'],
};

/** Starea unei comenzi pentru bot, colorată: în așteptare, făcută, eșuată. */
export const StareComanda = ({ comanda, children }: { comanda: SalaComanda; children: ReactNode }) => (
  <span className={CLASA[comanda.status]}>{children}{comanda.reviewed_at && ' · verificat de admin'}</span>
);
