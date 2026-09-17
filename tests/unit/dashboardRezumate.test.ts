import { describe, it, expect } from 'vitest';
import {
  rezumaAcoperire,
  motivUndoEsuat,
  activitateVizibila,
} from '../../src/admin/dashboardRezumate';
import type { StareCelula } from '../../src/admin/deliveryLog';
import type { AdminEvent } from '../../src/lib/adminApi';
import { SubmitHttpError } from '../../src/lib/supabase';

/**
 * Funcțiile care decid ce scrie pe ecranul de participanți. Erau prinse într-un
 * fișier de 1100 de linii, deci ca să verifici ce spune insigna trebuia montat
 * tot backoffice-ul; acum se cheamă direct.
 */

const celule = (over: Record<string, StareCelula> = {}): Record<string, StareCelula> => over;

describe('rezumaAcoperire — insigna de comunicări', () => {
  it('fără nicio comunicare, spune „niciunul", nu „0"', () => {
    const r = rezumaAcoperire(celule());
    expect(r.clasa).toBe('niciunul');
    expect(r.eticheta).toBe('— niciunul');
  });

  it('cu toate trimise, spune „complet"', () => {
    const r = rezumaAcoperire(celule({ confirmare: 'trimis', reminder: 'trimis' }));
    expect(r.clasa).toBe('trimis');
    expect(r.eticheta).toBe('✓ complet');
  });

  it('cu una lipsă, arată fracția — nu „complet"', () => {
    const r = rezumaAcoperire(celule({ confirmare: 'trimis' }));
    expect(r.clasa).toBe('partial');
    expect(r.eticheta).toBe('1/2');
  });

  it('un eșec bate orice reușită de după el', () => {
    // Regula care contează: o comunicare eșuată rămâne vizibilă chiar dacă alta
    // a plecat cu bine ulterior. Altfel un eșec real dispare din ecran.
    const r = rezumaAcoperire(celule({ confirmare: 'esuat', reminder: 'trimis' }));
    expect(r.clasa).toBe('esuat');
    expect(r.eticheta).toContain('✕');
  });

  it('detaliul enumeră fiecare comunicare cu starea ei', () => {
    const r = rezumaAcoperire(celule({ confirmare: 'trimis' }));
    expect(r.detaliu).toContain('trimis');
    expect(r.detaliu).toContain('lipsă');
  });
});

describe('motivUndoEsuat — de ce n-a mers reversarea', () => {
  it('locul ocupat între timp e numit ca atare', () => {
    const msg = motivUndoEsuat(new SubmitHttpError(400, '{"message":"event_full"}'), 'Ana');
    expect(msg).toContain('Ana');
    expect(msg).toMatch(/plină/i);
  });

  it('adresa re-înscrisă e numită ca atare', () => {
    const msg = motivUndoEsuat(new SubmitHttpError(400, '{"message":"duplicate_email"}'), 'Ana');
    expect(msg).toMatch(/re-înscrisă/i);
  });

  it('timeout-ul cere verificarea listei, nu raportează o ștergere pierdută', () => {
    const msg = motivUndoEsuat(new DOMException('timeout', 'TimeoutError'), 'Ana');
    expect(msg).toMatch(/răspunde greu/i);
  });

  it('rețeaua blocată e numită separat de o eroare de server', () => {
    const msg = motivUndoEsuat(new TypeError('Failed to fetch'), 'Ana');
    expect(msg).toMatch(/conexiune/i);
  });

  it('orice altceva primește mesajul generic', () => {
    expect(motivUndoEsuat(new Error('ceva'), 'Ana')).toBe('Nu am putut anula ștergerea.');
  });
});

describe('activitateVizibila — ce intră în feed', () => {
  const ev = (tip: string): AdminEvent => ({ tip }) as AdminEvent;

  it.each(['renuntare', 'auto_promote', 'editie_noua'])(
    'lasă „%s" să treacă — s-a întâmplat fără organizator',
    (tip) => {
      expect(activitateVizibila(ev(tip))).toBe(true);
    }
  );

  it.each(['admin_delete', 'config_publish'])(
    'oprește „%s" — a făcut-o chiar cel care se uită la feed',
    (tip) => {
      expect(activitateVizibila(ev(tip))).toBe(false);
    }
  );
});
