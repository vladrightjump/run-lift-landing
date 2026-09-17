import { describe, it, expect } from 'vitest';
import {
  cheieAdresa,
  destinatariRamasi,
  caDestinatar,
  variabileNesuportate,
  ultimulAnunt,
  motivEroareAnunt,
} from '../../src/admin/anunt';
import { fillTemplate } from '../../src/admin/emailAudience';
import { AnuntError, InvalidTokenError } from '../../src/lib/adminApi';
import type { AdminEmailLogEntry, DestinatarAnunt } from '../../src/lib/adminApi';

/**
 * Anunțul către toți participanții de până acum — partea care rulează în client.
 *
 * Lista propriu-zisă o rezolvă serverul; aici se păzește ce face clientul cu ea:
 * cum scoate oameni, cum arată previzualizarea, și ce spune când ceva nu merge.
 */

const d = (email: string, nume = 'Ana Popescu', ultima_editie = 5): DestinatarAnunt => ({
  email,
  nume,
  ultima_editie,
});

const log = (over: Partial<AdminEmailLogEntry>): AdminEmailLogEntry => ({
  id: Math.random().toString(36).slice(2),
  created_at: '2026-09-17T10:00:00Z',
  email: 'ana@exemplu.ro',
  nume: 'Ana',
  subiect: 'Ne vedem din nou? Hyrox, 3 octombrie',
  text_email: '',
  mod: 'anunt',
  audienta: 'istoric',
  sablon: 'bulk_participant_anunt',
  status: 'trimis',
  provider_status: 200,
  eroare: null,
  editie: 7,
  ...over,
});

describe('destinatariRamasi — debifarea doar scoate', () => {
  const lista = [d('ana@exemplu.ro'), d('Ion@Exemplu.ro', 'Ion Rusu'), d('vio@exemplu.ro')];

  it('fără debifări, rămân toți, în ordinea de la server', () => {
    expect(destinatariRamasi(lista, new Set()).map((x) => x.email)).toEqual([
      'ana@exemplu.ro',
      'Ion@Exemplu.ro',
      'vio@exemplu.ro',
    ]);
  });

  it('o adresă debifată iese', () => {
    expect(destinatariRamasi(lista, new Set(['vio@exemplu.ro']))).toHaveLength(2);
  });

  /** Serverul compară adresele normalizate; clientul trebuie să facă la fel. */
  it('potrivirea ignoră majusculele și spațiile', () => {
    const excluse = new Set([cheieAdresa('  ION@exemplu.RO ')]);
    expect(destinatariRamasi(lista, excluse).map((x) => x.nume)).not.toContain('Ion Rusu');
  });

  it('o adresă debifată care nu e în listă nu schimbă nimic', () => {
    expect(destinatariRamasi(lista, new Set(['altcineva@exemplu.ro']))).toHaveLength(3);
  });
});

describe('caDestinatar — previzualizarea arată ce trimite serverul', () => {
  it('{prenume} e primul cuvânt din nume, ca pe server', () => {
    const r = caDestinatar(d('ana@exemplu.ro', 'Ana Maria Popescu'));
    expect(fillTemplate('Salut, {prenume}!', r, '')).toBe('Salut, Ana!');
  });

  /**
   * Nimeni din audiență n-are loc la ediția anunțată, deci serverul nu are ce
   * pune în `{link_renunt}` și scoate paragraful. Previzualizarea trebuie să
   * arate același text, nu unul cu variabila literală.
   */
  it('paragraful cu {link_renunt} cade, exact ca la trimitere', () => {
    const r = caDestinatar(d('ana@exemplu.ro'));
    const text = fillTemplate('Salut!\n\nEliberează-ți locul:\n{link_renunt}\n\nPe curând', r, '');
    expect(text).not.toContain('{link_renunt}');
    expect(text).toContain('Pe curând');
  });
});

describe('variabileNesuportate', () => {
  it('un anunț cu variabile de persoană și de eveniment e în regulă', () => {
    expect(variabileNesuportate('Salut, {prenume}', '{numele_cursei} pe {data_cursei}')).toEqual([]);
  });

  /** `{data_inscrierii}` ar pleca LITERAL — serverul nu știe data. */
  it('semnalează variabilele pe care serverul nu le completează', () => {
    expect(
      variabileNesuportate('Subiect', 'Te-ai înscris pe {data_inscrierii}. Sună la {telefon}.')
    ).toEqual(['{data_inscrierii}', '{telefon}']);
  });

  it('se uită și în subiect', () => {
    expect(variabileNesuportate('{link_renunt}', 'text')).toEqual(['{link_renunt}']);
  });
});

describe('ultimulAnunt — a mai fost anunțată ediția?', () => {
  it('niciun anunț → null', () => {
    expect(ultimulAnunt([log({ mod: 'confirm' })], 7)).toBeNull();
  });

  /**
   * Jurnalul reține subiectul cu variabilele completate, iar formularul le are
   * încă între acolade. O potrivire pe subiect n-ar găsi niciodată nimic.
   */
  it('găsește anunțul indiferent de subiect', () => {
    expect(ultimulAnunt([log({ subiect: 'Cu totul alt subiect' })], 7)).not.toBeNull();
  });

  it('doar în ediția cerută', () => {
    expect(ultimulAnunt([log({ editie: 6 })], 7)).toBeNull();
  });

  it('un test către operator nu contează ca anunț', () => {
    expect(ultimulAnunt([log({ mod: 'anunt_test' })], 7)).toBeNull();
  });

  it('numără oamenii distincți din ultimul lot', () => {
    const r = ultimulAnunt(
      [
        log({ email: 'ana@exemplu.ro', created_at: '2026-09-17T10:00:10Z' }),
        log({ email: 'ANA@exemplu.ro', created_at: '2026-09-17T10:00:20Z' }),
        log({ email: 'ion@exemplu.ro', created_at: '2026-09-17T10:00:30Z' }),
        // Un lot mai vechi nu se adună la cel nou.
        log({ email: 'vio@exemplu.ro', created_at: '2026-09-16T09:00:00Z' }),
      ],
      7
    );
    expect(r?.catreCati).toBe(2);
    expect(r?.cand).toBe('2026-09-17T10:00:30Z');
  });
});

describe('motivEroareAnunt — problemele de deploy au nume proprii', () => {
  it('funcția din producție e mai veche decât codul', () => {
    expect(motivEroareAnunt(new AnuntError(400, 'unknown_mode'))).toContain('redeployată');
  });

  it('migrarea nu e aplicată', () => {
    expect(motivEroareAnunt(new AnuntError(500, 'recipients_failed'))).toContain('migrarea');
  });

  it('sesiunea expirată', () => {
    expect(motivEroareAnunt(new InvalidTokenError())).toContain('Sesiune expirată');
  });

  it('orice altceva cade pe mesajul generic', () => {
    expect(motivEroareAnunt(new Error('boom'))).toContain('încearcă din nou');
  });
});
