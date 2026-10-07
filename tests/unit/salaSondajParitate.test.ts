import { describe, it, expect } from 'vitest';
import { antetSondaj, corpSondaj, textEfectiv } from '../../src/admin/sala/sondaj';
import {
  buildPollText,
  effectiveWording,
  pollHeader,
} from '../../bot/src/lib/poll-text.ts';

/**
 * Previzualizarea din admin și botul trebuie să scrie ACELAȘI mesaj: organizatorul
 * decide pe previzualizare ce pleacă în grup. Testul compară cele două
 * implementări pe aceleași intrări, fără să copieze textul așteptat.
 */
const cazuri = [
  {
    nume: 'fără text salvat',
    text: { titlu: null, da: null, nu: null },
    data: '2026-10-08',
    ora: '06:30',
    loc: 'Parcul Dumitru Râșcanu',
    vin: [] as string[],
    nuVin: [] as string[],
  },
  {
    nume: 'titlu propriu cu caractere HTML',
    text: { titlu: '  Vii <mâine> & alergi?  ', da: 'Da!', nu: '  ' },
    data: '2026-10-08',
    ora: '07:15:00',
    loc: 'Valea <Morilor>',
    vin: ['Ana', 'V<lad'],
    nuVin: [],
  },
  {
    nume: 'fără dată și fără loc, cu ambele liste',
    text: { titlu: 'Alergăm!', da: null, nu: 'Nu' },
    data: '',
    ora: '',
    loc: '',
    vin: ['Ana'],
    nuVin: ['Ion & Co'],
  },
];

describe('textul sondajului: adminul și botul coincid', () => {
  it.each(cazuri)('$nume', ({ text, data, ora, loc, vin, nuVin }) => {
    const admin = textEfectiv(text);
    const bot = effectiveWording({ title: text.titlu, yes: text.da, no: text.nu });
    expect(bot).toEqual({ title: admin.titlu, yes: admin.da, no: admin.nu });

    const dinAdmin = corpSondaj(antetSondaj(data, ora, loc, admin.titlu), vin, nuVin);
    const dinBot = buildPollText(pollHeader(data, ora, loc, bot.title), vin, nuVin);
    expect(dinBot).toBe(dinAdmin);
  });
});
