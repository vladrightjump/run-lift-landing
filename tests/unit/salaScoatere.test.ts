import { describe, it, expect } from 'vitest';
import { motivFaraScoatere, ultimeleScoateri } from '../../src/admin/sala/DialogScoatere';
import { comandaSala, membruSala } from './helpers/salaFixtures';

/** Când se poate scoate cineva din grup (R9, AE2, AE3). */
describe('motivFaraScoatere', () => {
  it('Covers AE2. adminii nu se scot', () => {
    expect(motivFaraScoatere(membruSala('roma', { is_admin: true }))).toBe('Adminii grupului nu se scot.');
  });

  it('fără cont de Telegram, botul n-are pe cine scoate', () => {
    expect(motivFaraScoatere(membruSala('x', { telegram_user_id: null }))).toBe('N-are cont de Telegram legat.');
  });

  it('un membru ieșit nu se scoate a doua oară', () => {
    expect(motivFaraScoatere(membruSala('ion', { status: 'cancelled' }))).toBe('E deja ieșit.');
    expect(
      motivFaraScoatere(membruSala('ion', { status: 'cancelled' }), comandaSala({ action: 'kick_member', status: 'done' }))
    ).toBe('E deja ieșit.');
  });

  it('Covers AE3. după o scoatere eșuată, omul e tot în grup: se poate reîncerca', () => {
    expect(
      motivFaraScoatere(membruSala('ion', { status: 'cancelled' }), comandaSala({ action: 'kick_member', status: 'failed' }))
    ).toBeNull();
  });
});

describe('ultimeleScoateri', () => {
  it('ține doar cea mai nouă scoatere a fiecărui membru (comenzile vin cea mai nouă prima)', () => {
    const m = ultimeleScoateri([
      comandaSala({ id: 'nou', action: 'kick_member', member_id: 'ion', status: 'failed' }),
      comandaSala({ id: 'vechi', action: 'kick_member', member_id: 'ion', status: 'done' }),
      comandaSala({ id: 'sondaj', action: 'send_poll' }),
    ]);
    expect([...m.entries()].map(([k, c]) => [k, c.id])).toEqual([['ion', 'nou']]);
  });
});
