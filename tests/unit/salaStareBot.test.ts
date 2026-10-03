import { describe, it, expect } from 'vitest';
import { stareBot } from '../../src/admin/sala/stareBot';
import type { SalaComanda } from '../../src/lib/salaApi';

const ACUM = new Date('2026-10-07T12:00:00Z');

const comanda = (minuteInUrma: number, status: SalaComanda['status'] = 'pending'): SalaComanda => ({
  id: `c-${minuteInUrma}-${status}`,
  action: 'send_poll',
  member_id: null,
  status,
  result: null,
  created_at: new Date(ACUM.getTime() - minuteInUrma * 60_000).toISOString(),
  processed_at: null,
});

describe('stareBot', () => {
  it('o comandă în așteptare de 4 minute → botul nu răspunde', () => {
    const s = stareBot(true, [comanda(4)], ACUM);
    expect(s).toEqual({ tip: 'nu-raspunde', comanda: comanda(4), minute: 4 });
  });

  it('o comandă de 1 minut → normal (botul n-a apucat încă tic-ul)', () => {
    expect(stareBot(true, [comanda(1)], ACUM)).toEqual({ tip: 'normal' });
  });

  it('coada goală → normal', () => {
    expect(stareBot(true, [], ACUM)).toEqual({ tip: 'normal' });
  });

  it('o comandă veche dar deja făcută sau eșuată nu contează', () => {
    expect(stareBot(true, [comanda(60, 'done'), comanda(30, 'failed')], ACUM)).toEqual({ tip: 'normal' });
  });

  it('botul oprit din setări, cu coada golită → oprit', () => {
    expect(stareBot(false, [], ACUM)).toEqual({ tip: 'oprit' });
  });

  it('o comandă blocată bate comutatorul: procesul nu rulează, oricum ar fi setat', () => {
    expect(stareBot(false, [comanda(10)], ACUM).tip).toBe('nu-raspunde');
  });

  it('numește cea mai veche comandă blocată', () => {
    const s = stareBot(true, [comanda(5), comanda(20)], ACUM);
    expect(s.tip === 'nu-raspunde' && s.minute).toBe(20);
  });
});
