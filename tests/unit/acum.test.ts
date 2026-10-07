import { describe, it, expect } from 'vitest';
import {
  saptamana,
  evenimenteleSaptamanii,
  cardAntrenament,
  deRezolvat,
  ultimulRaspuns,
} from '../../src/admin/acum';
import type { SalaDate, SalaMembru } from '../../src/lib/salaApi';
import { SNAPSHOT_CONFIG, type EventConfig } from '../../src/content/eventConfig';

/**
 * Ecranul Acum (U8), partea de calcul: ce stă în fiecare zi a săptămânii, ce
 * spune cardul antrenamentului și ce intră la „De rezolvat" (R8, R9, R37).
 *
 * Săptămâna fixată e cea din prototip: azi e miercuri, 7 octombrie 2026, 20:15
 * la Chișinău; sondajul pleacă luni și miercuri la 12:00, antrenamentele sunt
 * marți și joi la 06:30.
 */

const ACUM = new Date('2026-10-07T17:15:00Z'); // 20:15 la Chișinău (+03:00)

const membru = (i: number): SalaMembru => ({
  id: `m${i}`,
  full_name: `Membru ${String(i).padStart(2, '0')}`,
  status: 'active',
  is_admin: false,
  telegram_user_id: 1000 + i,
  telegram_username: null,
  bot_dm_enabled: true,
  join_date: '2026-06-01',
});

const raspuns = (sesiune: string, i: number, response: 'yes' | 'no', la = '2026-10-07T09:30:00Z') => ({
  session_id: sesiune,
  member_id: `m${i}`,
  response,
  is_first_training: false,
  responded_at: la,
});

const sala = (over: Partial<SalaDate> = {}): SalaDate => ({
  azi: '2026-10-07',
  config: {
    enabled: true,
    poll_days: [1, 3],
    poll_time: '12:00',
    summary_days: [2, 4],
    summary_time: '06:00',
    training_time: '06:30',
    location: 'Parcul Dumitru Râșcanu',
    auto_reminder_enabled: true,
    reminder_threshold: 6,
  } as SalaDate['config'],
  membri: Array.from({ length: 18 }, (_, i) => membru(i + 1)),
  antrenamente: [
    { id: 's-jo', session_date: '2026-10-08', starts_at: '06:30', location: 'Parcul Dumitru Râșcanu', status: 'scheduled', poll_sent: true },
    { id: 's-ma', session_date: '2026-10-06', starts_at: '06:30', location: 'Parcul Dumitru Râșcanu', status: 'done', poll_sent: true },
  ],
  raspunsuri: [
    ...Array.from({ length: 14 }, (_, i) => raspuns('s-ma', i + 1, 'yes', '2026-10-05T10:00:00Z')),
    ...Array.from({ length: 12 }, (_, i) => raspuns('s-jo', i + 1, 'yes')),
    ...[13, 14, 15].map((i) => raspuns('s-jo', i, 'no')),
  ],
  necunoscuti: [],
  comenzi: [],
  scoateri: [],
  ...over,
});

const config: EventConfig = {
  ...SNAPSHOT_CONFIG,
  number: 8,
  eventName: 'Hyrox Trial',
  tz: '+03:00',
  launchAt: '2026-09-20T12:00:00',
  registrationDeadline: '2026-10-09T18:00:00',
  start: '2026-10-10T07:00:00',
  durationHours: 1,
  nextEditionAt: '2026-10-17T07:00:00',
  slots: { ...SNAPSHOT_CONFIG.slots, total: 30 },
};

const editie = { config, inscrisi: 22, asteptare: 4 };

describe('săptămâna', () => {
  it('merge de luni până duminică, cu ziua de azi marcată', () => {
    const s = saptamana('2026-10-07');
    expect(s.zile.map((z) => z.numar)).toEqual([5, 6, 7, 8, 9, 10, 11]);
    expect(s.zile.map((z) => z.scurt)).toEqual(['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du']);
    expect(s.zile.find((z) => z.azi)?.data).toBe('2026-10-07');
    expect(s.numar).toBe(41);
    expect(s.interval).toBe('5–11 octombrie');
  });

  it('o săptămână peste două luni le scrie pe amândouă', () => {
    expect(saptamana('2026-10-01').interval).toBe('28 septembrie – 4 octombrie');
  });
});

describe('ce stă în fiecare zi (R8)', () => {
  const zi = (data: string) =>
    evenimenteleSaptamanii(saptamana('2026-10-07'), sala(), editie, ACUM).find((z) => z.data === data)!.evenimente;

  it('antrenamentul trecut spune câți au venit', () => {
    expect(zi('2026-10-06')).toContainEqual(
      expect.objectContaining({ tip: 'trecut', titlu: 'Antrenament', detaliu: '14 au venit' })
    );
  });

  it('ziua sondajului spune că a plecat și pentru ce zi', () => {
    expect(zi('2026-10-07')).toContainEqual(
      expect.objectContaining({ tip: 'sondaj', titlu: 'Sondaj trimis', detaliu: '12:00 · pentru joi' })
    );
  });

  it('antrenamentul următor arată răspunsurile și duce la listă', () => {
    expect(zi('2026-10-08')).toContainEqual(
      expect.objectContaining({ tip: 'antrenament', titlu: 'Antrenament 06:30', detaliu: '12 vin · 3 fără răspuns', ecran: 'grup-prezente' })
    );
  });

  it('termenul de înscriere și cursa ediției stau pe zilele lor', () => {
    expect(zi('2026-10-09')).toContainEqual(
      expect.objectContaining({ tip: 'termen', titlu: 'Se închid înscrierile', detaliu: '18:00 · Ediția 8' })
    );
    expect(zi('2026-10-10')).toContainEqual(
      expect.objectContaining({ tip: 'cursa', titlu: 'Hyrox Trial · Ed. 8', detaliu: '22/30 · start 07:00', ecran: 'participanti' })
    );
  });

  it('Covers R37: înainte să plece sondajul, ziua spune când pleacă, nu „fără răspuns"', () => {
    const inainte = sala({
      azi: '2026-10-07',
      antrenamente: [
        { id: 's-jo', session_date: '2026-10-08', starts_at: '06:30', location: 'Parc', status: 'scheduled', poll_sent: false },
      ],
      raspunsuri: [],
    });
    const dimineata = new Date('2026-10-07T06:00:00Z'); // 09:00, sondajul pleacă la 12:00
    const ev = evenimenteleSaptamanii(saptamana('2026-10-07'), inainte, editie, dimineata).find(
      (z) => z.data === '2026-10-08'
    )!.evenimente;
    const antr = ev.find((e) => e.tip === 'antrenament')!;
    expect(antr.detaliu).toBe('Sondajul pleacă miercuri la 12:00');
    expect(antr.detaliu).not.toMatch(/fără răspuns/);
  });

  it('fără datele grupului, săptămâna arată tot ediția', () => {
    const ev = evenimenteleSaptamanii(saptamana('2026-10-07'), null, editie, ACUM);
    expect(ev.find((z) => z.data === '2026-10-10')!.evenimente[0].tip).toBe('cursa');
  });
});

describe('cardul antrenamentului', () => {
  it('cu sondajul plecat, numără vin / nu pot / fără răspuns și dă numele celor fără răspuns', () => {
    const c = cardAntrenament(sala(), ACUM);
    if (c.stare !== 'cu-raspunsuri') throw new Error(`stare neașteptată: ${c.stare}`);
    expect(c).toMatchObject({ data: '2026-10-08', ora: '06:30', vin: 12, nu: 3, fara: 3 });
    expect(c.numeFara).toEqual(['Membru 16', 'Membru 17', 'Membru 18']);
  });

  it('Covers R37: înainte de sondaj nu numără pe nimeni „fără răspuns"', () => {
    const c = cardAntrenament(
      sala({ antrenamente: [], raspunsuri: [] }),
      new Date('2026-10-07T06:00:00Z')
    );
    if (c.stare !== 'asteapta-sondajul') throw new Error(`stare neașteptată: ${c.stare}`);
    expect(c.fraza).toBe('Sondajul pleacă miercuri la 12:00.');
    expect(c.fara).toBe(0);
  });

  it('cu botul oprit, spune asta în loc de cifre', () => {
    const c = cardAntrenament(
      sala({ config: { ...sala().config!, enabled: false }, antrenamente: [], raspunsuri: [] }),
      ACUM
    );
    expect(c.stare).toBe('oprit');
  });
});

describe('„De rezolvat" (R9)', () => {
  const semnale = { nelivrate: 1, asteptare: 4, ciornaNepublicata: false, metaInUrma: false, arhiva: false };

  it('emailurile nelivrate au acțiunea lor, care duce la Livrare', () => {
    const lista = deRezolvat(semnale, 'landing', sala(), ACUM);
    expect(lista).toContainEqual(
      expect.objectContaining({ cheie: 'nelivrate', titlu: '1 email nelivrat', actiune: expect.objectContaining({ ecran: 'livrare', eticheta: 'Vezi' }) })
    );
  });

  it('o comandă a botului eșuată azi se poate relua pe loc', () => {
    const cuEsec = sala({
      comenzi: [
        { id: 'c1', action: 'send_summary', member_id: null, status: 'failed', result: 'Telegram n-a răspuns la timp', created_at: '2026-10-07T03:00:00Z', processed_at: '2026-10-07T03:00:40Z' },
      ],
    });
    const lista = deRezolvat(semnale, 'landing', cuEsec, ACUM);
    expect(lista).toContainEqual(
      expect.objectContaining({ cheie: 'comanda-c1', titlu: 'Rezumatul de azi, 06:00, n-a plecat', actiune: expect.objectContaining({ reia: 'send_summary', eticheta: 'Reîncearcă' }) })
    );
  });

  it.each(['send_poll', 'send_summary', 'send_reminder'] as const)('%s: eșec → reluare în coadă → succes, cu eșecul păstrat în jurnal', (action) => {
    const esec = { id: 'c1', action, member_id: null, status: 'failed' as const, result: 'Rețea', created_at: '2026-10-07T17:13:00Z', processed_at: '2026-10-07T17:13:10Z' };
    const reluare = { ...esec, id: 'c2', status: 'pending' as const, created_at: '2026-10-07T17:14:00Z', processed_at: null };
    const lista = (comenzi: SalaDate['comenzi']) => deRezolvat({ ...semnale, nelivrate: 0, asteptare: 0 }, 'landing', sala({ comenzi }), ACUM);
    expect(lista([esec])[0].actiune).toMatchObject({ reia: action, inAsteptare: false });
    expect(lista([reluare, esec])[0].actiune).toMatchObject({ reia: action, inAsteptare: true });
    expect(lista([esec, { ...reluare, status: 'done' }])).toEqual([]);
    // Dacă și reluarea eșuează, rămâne o singură acțiune pentru ultima încercare.
    expect(lista([esec, { ...reluare, status: 'failed' }]).map((c) => c.cheie)).toEqual(['comanda-c2']);
    // Succesul altei comenzi nu ascunde eșecul acesteia.
    expect(lista([esec, { ...reluare, action: 'send_message', status: 'done' }])).toHaveLength(1);
  });

  it('o scoatere eșuată dispare după ce scoaterea aceluiași membru reușește', () => {
    const esec = { id: 'k1', action: 'kick_member' as const, member_id: 'm1', status: 'failed' as const, result: 'Fără drepturi', created_at: '2026-10-07T17:13:00Z', processed_at: '2026-10-07T17:13:10Z' };
    const lista = (comenzi: SalaDate['comenzi']) => deRezolvat({ ...semnale, nelivrate: 0, asteptare: 0 }, 'landing', sala({ comenzi }), ACUM);
    expect(lista([{ ...esec, id: 'k2', status: 'done', created_at: '2026-10-07T17:20:00Z' }, esec])).toEqual([]);
    // Alt membru scos între timp nu rezolvă eșecul primului.
    expect(lista([{ ...esec, id: 'k2', member_id: 'm2', status: 'done', created_at: '2026-10-07T17:20:00Z' }, esec]).map((c) => c.cheie)).toEqual(['comanda-k1']);
  });

  it('o acțiune a zilei de antrenament eșuată azi duce la jurnalul botului, cu motivul', () => {
    const esec = { id: 't1', action: 'cancel_session' as const, member_id: null, status: 'failed' as const, result: 'anunțul: chat not found', created_at: '2026-10-07T17:13:00Z', processed_at: '2026-10-07T17:13:00Z', sursa: 'telegram', organizator: 'Vlad', data: '2026-10-08' };
    const [x] = deRezolvat({ ...semnale, nelivrate: 0, asteptare: 0 }, 'landing', sala({ comenzi: [esec] }), ACUM);
    expect(x.titlu).toMatch(/^Anunțul anulării de azi/);
    expect(x.detaliu).toBe('anunțul: chat not found');
    expect(x.actiune).toEqual({ eticheta: 'Vezi', ecran: 'grup-bot' });
  });

  it('o comandă eșuată ieri nu mai stă la „De rezolvat"', () => {
    const veche = sala({
      comenzi: [
        { id: 'c0', action: 'send_poll', member_id: null, status: 'failed', result: null, created_at: '2026-10-05T09:00:00Z', processed_at: '2026-10-05T09:00:30Z' },
      ],
    });
    expect(deRezolvat(semnale, 'landing', veche, ACUM).some((x) => x.cheie === 'comanda-c0')).toBe(false);
  });

  it('o comandă blocată spune că botul nu răspunde', () => {
    const blocat = sala({
      comenzi: [
        { id: 'c2', action: 'send_poll', member_id: null, status: 'pending', result: null, created_at: '2026-10-07T17:00:00Z', processed_at: null },
      ],
    });
    expect(deRezolvat(semnale, 'landing', blocat, ACUM)).toContainEqual(
      expect.objectContaining({ cheie: 'bot', titlu: 'Botul nu răspunde de 15 minute' })
    );
  });

  it('fără nimic de rezolvat, lista e goală', () => {
    expect(deRezolvat({ ...semnale, nelivrate: 0, asteptare: 0 }, 'landing', sala(), ACUM)).toEqual([]);
  });
});

describe('ultimul răspuns la sondaj', () => {
  it('se arată doar dacă a venit în ultimele 10 minute', () => {
    const proaspat = sala({
      raspunsuri: [...sala().raspunsuri, raspuns('s-jo', 16, 'yes', '2026-10-07T17:12:00Z')],
    });
    expect(ultimulRaspuns(proaspat, ACUM)).toBe('Acum: Membru 16 a răspuns „vin”');
    expect(ultimulRaspuns(sala(), ACUM)).toBeNull();
  });
});
