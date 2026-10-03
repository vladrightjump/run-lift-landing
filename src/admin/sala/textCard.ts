import type { SalaRezumat } from '../../lib/salaApi';
import { urmatorulSondaj, ziSiData } from './sondaj';

/**
 * Ce spune cardul grupului de pe ecranul de pornire (R4, AE4).
 *
 * O propoziție despre antrenamentul următor, citibilă fără să intri în ecran.
 * Patru stări, fiecare cu adevărul ei: „0 vin" ar fi o minciună când sondajul
 * încă n-a plecat, iar „sondajul pleacă luni" ar fi una când botul e oprit.
 */

type StareCard = 'oprit' | 'anulat' | 'cu-raspunsuri' | 'asteapta-sondajul' | 'fara-orar';

export type TextCard = {
  stare: StareCard;
  /** Rândul mare: antrenamentul sau starea botului. */
  titlu: string;
  /** Rândul mic: cifrele sau când pleacă sondajul. */
  detaliu: string;
};

const pluralVin = (n: number) => `${n} ${n === 1 ? 'vine' : 'vin'}`;

export const textCard = (r: SalaRezumat, acum: Date): TextCard => {
  const u = r.urmatorul;

  if (u && u.status === 'cancelled') {
    return {
      stare: 'anulat',
      titlu: `${ziSiData(u.session_date) ?? u.session_date} — anulat`,
      detaliu: 'Botul nu trimite sondaj pentru o zi anulată.',
    };
  }

  if (r.pornit === false) {
    return {
      stare: 'oprit',
      titlu: 'Botul e oprit',
      detaliu: 'Sondajele programate nu pleacă până nu-l pornești din „Botul de Telegram".',
    };
  }

  if (u) {
    return {
      stare: 'cu-raspunsuri',
      titlu: `${ziSiData(u.session_date) ?? u.session_date}, ${u.starts_at}`,
      detaliu: `${pluralVin(u.vin)} · ${u.nu_vin} nu`,
    };
  }

  const sondaj = urmatorulSondaj(r.poll_days, r.poll_time, acum);
  if (sondaj) {
    return {
      stare: 'asteapta-sondajul',
      titlu: `Următorul: ${ziSiData(sondaj.antrenament) ?? sondaj.antrenament}`,
      detaliu: `Sondajul pleacă ${(ziSiData(sondaj.data) ?? sondaj.data).split(',')[0].toLowerCase()} la ${sondaj.ora}.`,
    };
  }

  return {
    stare: 'fara-orar',
    titlu: 'Niciun sondaj programat',
    detaliu: 'Alege zilele sondajului în „Botul de Telegram".',
  };
};
