import type { ReactNode } from 'react';
import type { SalaComanda } from '../../lib/salaApi';

/** Clasa fiecărei stări, scrisă întreg — garda de stil caută clasele literal. */
const CLASA: Record<SalaComanda['status'], string> = {
  pending: 'admin-sala-comanda admin-sala-comanda--pending',
  done: 'admin-sala-comanda admin-sala-comanda--done',
  failed: 'admin-sala-comanda admin-sala-comanda--failed',
};

/** Starea unei comenzi pentru bot, colorată: în așteptare, făcută, eșuată. */
export const StareComanda = ({ comanda, children }: { comanda: SalaComanda; children: ReactNode }) => (
  <span className={CLASA[comanda.status]}>{children}</span>
);
