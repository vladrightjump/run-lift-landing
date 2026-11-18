import adminStyles from '../../components/AdminStyles.module.css';
import adminRoot from '../../components/RadacinaAdmin.module.css';
import styles from './EcranGiveaway.module.css';
import { useCallback, useRef, useState } from 'react';
import { toCsv } from '../../../../shared/lib/csv';
import { momentComplet, ziLunaOra } from '../../../../shared/lib/formatare';
import { Dialog } from '../../../../shared/ui/Dialog';
import { useSesiuneAdmin } from '../../data/adminSession';
import { useAdminMutation } from '../../data/useAdminMutation';
import { useAdminResource } from '../../data/useAdminResource';
import {
  confirmaGiveaway,
  extrageGiveaway,
  incheieGiveaway,
  loadGiveaway,
  mesajRefuzGiveaway,
  opresteInscrierile,
  stergeParticipare,
  type DateGiveaway,
  type GiveawayAdmin,
  type ParticipareGiveaway,
  type StareGiveaway,
} from './giveawayApi';

/**
 * Giveaway-ul de pe Instagram, în admin: câți s-au înscris și cine, ștergerea,
 * exportul, extragerea câștigătorului și încheierea.
 *
 * Regulile nu sunt aici. Perioada, dublurile, alegerea la întâmplare și ce se
 * șterge la încheiere le decide baza de date; ecranul arată starea primită și
 * oferă doar pașii pe care starea îi permite. După orice refuz se reîncarcă:
 * aproape toate refuzurile înseamnă că ecranul rămăsese în urmă.
 *
 * Planul: docs/plans/2026-11-14-0736-feat-giveaway-instagram-plan.md (U5, U6).
 */

const STARE: Record<StareGiveaway, string> = {
  programat: 'Programat',
  deschis: 'Înscrieri deschise',
  inchis: 'Înscrieri închise',
  extras: 'Persoană extrasă, de confirmat',
  confirmat: 'Câștigător confirmat',
  incheiat: 'Încheiat',
};

/** Ce cere confirmare înainte să plece spre server. */
type Confirmare =
  | { fel: 'stergere'; participare: ParticipareGiveaway }
  | { fel: 'oprire'; id: string; titlu: string }
  | { fel: 'reextragere'; nume: string; confirmat: boolean }
  | { fel: 'incheiere'; faraAcord: number; cuAcord: number };

const profilInstagram = (cont: string) => `https://www.instagram.com/${cont}/`;

/** Persoana extrasă acum: extrasă și neînlocuită. */
const extrasaAcum = (participari: ParticipareGiveaway[]) =>
  participari.find((p) => p.extrasa_la !== null && p.inlocuita_la === null) ?? null;

export const EcranGiveaway = () => {
  const { token, onAuthError, showToast } = useSesiuneAdmin();
  // `null` = giveaway-ul curent, ales de server. Selectorul apare abia când există două.
  const [ales, setAles] = useState<string | null>(null);
  const incarca = useCallback(
    (t: string, signal: AbortSignal) => loadGiveaway(t, ales, signal),
    [ales]
  );
  // Lista vine cu toate contactele: un minut între citiri e destul pentru un număr.
  const { date, eroare, reincarca } = useAdminResource<DateGiveaway>(incarca, 60_000, {
    queryKey: ['site', 'giveaway', ales],
  });
  const scrie = useAdminMutation((lucru: (t: string) => Promise<unknown>) => lucru(token));
  const [ocupat, setOcupat] = useState(false);
  const blocat = useRef(false);
  const [confirmare, setConfirmare] = useState<Confirmare | null>(null);

  const fa = async (lucru: (t: string) => Promise<unknown>, reusit: string) => {
    if (blocat.current) return;
    blocat.current = true;
    setOcupat(true);
    try {
      await scrie(lucru);
      await reincarca();
      showToast({ kind: 'success', msg: reusit });
    } catch (err) {
      if (!onAuthError(err)) showToast({ kind: 'error', msg: mesajRefuzGiveaway(err) });
      await reincarca();
    } finally {
      blocat.current = false;
      setOcupat(false);
    }
  };

  if (!date) {
    return (
      <p role="status">
        {eroare ? 'Nu s-a putut încărca giveaway-ul.' : 'Se încarcă…'}{' '}
        {eroare && (
          <button className={adminRoot['admin-btn-ghost']} data-css="admin-btn-ghost" onClick={() => void reincarca()}>
            Reîncearcă
          </button>
        )}
      </p>
    );
  }

  const { giveaway, giveaways, participari } = date;
  if (!giveaway) {
    return (
      <p className={styles['admin-giveaway-gol']} data-css="admin-giveaway-gol">
        Niciun giveaway încă. Apare aici după ce e lansat primul.
      </p>
    );
  }

  const cuAcord = participari.filter((p) => p.acord_contact).length;
  const extrasa = extrasaAcum(participari);

  const exportCsv = () => {
    const antet = ['Nr', 'Nume', 'Telefon', 'Email', 'Instagram', 'Înscris la', 'Acord de contact', 'Extragere'];
    const randuri = participari.map((p, i) => [
      String(i + 1),
      p.nume,
      p.telefon,
      p.email,
      p.instagram,
      new Date(p.created_at).toLocaleString('ro-RO'),
      p.acord_contact ? 'da' : 'nu',
      semnExtragere(p, giveaway) ?? '',
    ]);
    const blob = new Blob(['﻿' + toCsv([antet, ...randuri])], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `run-lift-giveaway-${giveaway.slug}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const confirma = (c: Confirmare) => {
    setConfirmare(null);
    if (c.fel === 'stergere') {
      void fa((t) => stergeParticipare(t, c.participare.id), 'Participarea a fost ștearsă.');
    } else if (c.fel === 'oprire') {
      void fa((t) => opresteInscrierile(t, c.id), 'Înscrierile au fost închise.');
    } else if (c.fel === 'reextragere') {
      void fa((t) => extrageGiveaway(t, giveaway.id), 'Extragerea s-a făcut.');
    } else {
      void fa((t) => incheieGiveaway(t, giveaway.id), 'Giveaway-ul a fost încheiat.');
    }
  };

  return (
    <div className={styles['admin-giveaway']} data-css="admin-giveaway">
      {giveaways.length > 1 && (
        <label className={adminStyles['admin-config-camp']} data-css="admin-config-camp">
          Giveaway
          <select value={giveaway.id} onChange={(e) => setAles(e.target.value)}>
            {giveaways.map((g) => (
              <option key={g.id} value={g.id}>
                {g.titlu} · {STARE[g.stare]}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className={adminStyles['admin-stats']} data-css="admin-stats">
        <div className={adminStyles['admin-stat']} data-css="admin-stat">
          <span className={adminStyles['admin-stat-label']} data-css="admin-stat-label">Participări</span>
          <span className={`${adminStyles['admin-stat-value']} ${adminStyles['accent']}`} data-css="admin-stat-value accent" key={participari.length}>
            {participari.length}
          </span>
        </div>
        <div className={adminStyles['admin-stat']} data-css="admin-stat">
          <span className={adminStyles['admin-stat-label']} data-css="admin-stat-label">Cu acord de contact</span>
          <span className={adminStyles['admin-stat-value']} data-css="admin-stat-value">{cuAcord}</span>
        </div>
        <div className={adminStyles['admin-stat']} data-css="admin-stat">
          <span className={adminStyles['admin-stat-label']} data-css="admin-stat-label">{giveaway.titlu}</span>
          <span className={styles['admin-giveaway-stare']} data-css="admin-giveaway-stare">{STARE[giveaway.stare]}</span>
        </div>
      </div>

      <section className={styles['admin-giveaway-panou']} data-css="admin-giveaway-panou" aria-label="Extragere">
        <PanouExtragere
          giveaway={giveaway}
          extrasa={extrasa}
          ramase={participari.length}
          ocupat={ocupat}
          onOpreste={() => setConfirmare({ fel: 'oprire', id: giveaway.id, titlu: giveaway.titlu })}
          onExtrage={() => void fa((t) => extrageGiveaway(t, giveaway.id), 'Extragerea s-a făcut.')}
          onReextrage={(nume) => setConfirmare({ fel: 'reextragere', nume, confirmat: giveaway.stare === 'confirmat' })}
          onConfirma={() => void fa((t) => confirmaGiveaway(t, giveaway.id), 'Câștigătorul a fost confirmat.')}
          onIncheie={() => setConfirmare({ fel: 'incheiere', faraAcord: participari.length - cuAcord, cuAcord })}
        />
      </section>

      <section className={adminStyles['admin-table-section']} data-css="admin-table-section">
        <div className={adminStyles['admin-table-head']} data-css="admin-table-head">
          <h2>Lista participărilor</h2>
          <div className={adminStyles['admin-table-actions']} data-css="admin-table-actions">
            <button type="button" className={adminStyles['admin-btn-accent']} data-css="admin-btn-accent" onClick={exportCsv}>
              Export CSV
            </button>
          </div>
        </div>
        <div className={adminStyles['admin-table-wrap']} data-css="admin-table-wrap">
          <div className={`${adminStyles['admin-table']} ${styles['admin-giveaway-tabel']}`} data-css="admin-table admin-giveaway-tabel">
            <div className={`${adminStyles['admin-row']} ${styles['admin-giveaway-row']} ${styles['admin-giveaway-row-head']}`} data-css="admin-row admin-giveaway-row admin-giveaway-row-head">
              <span>#</span>
              <span>Nume</span>
              <span>Telefon</span>
              <span>Email</span>
              <span>Instagram</span>
              <span>Înscris</span>
              <span>Acord</span>
              <span>Extragere</span>
              <span />
            </div>
            {participari.map((p, i) => {
              const semn = semnExtragere(p, giveaway);
              return (
                <div key={p.id} className={`${adminStyles['admin-row']} ${styles['admin-giveaway-row']}`} data-css="admin-row admin-giveaway-row">
                  <span className={adminStyles['admin-cell-date']} data-css="admin-cell-date">{String(i + 1).padStart(2, '0')}</span>
                  <span className={adminStyles['admin-cell-name']} data-css="admin-cell-name">{p.nume}</span>
                  <a className={styles['admin-giveaway-link']} data-css="admin-giveaway-link" href={`tel:${p.telefon}`}>{p.telefon}</a>
                  <a className={styles['admin-giveaway-link']} data-css="admin-giveaway-link" href={`mailto:${p.email}`}>{p.email}</a>
                  <a className={styles['admin-giveaway-link']} data-css="admin-giveaway-link" href={profilInstagram(p.instagram)} target="_blank" rel="noopener noreferrer">
                    @{p.instagram}
                  </a>
                  <span className={adminStyles['admin-cell-date']} data-css="admin-cell-date">{ziLunaOra(p.created_at)}</span>
                  <span>{p.acord_contact ? 'Da' : 'Nu'}</span>
                  <span className={p.inlocuita_la ? styles['admin-giveaway-semn-vechi'] : styles['admin-giveaway-semn']} data-css="admin-giveaway-semn">
                    {semn}
                  </span>
                  <button
                    type="button"
                    className={styles['admin-giveaway-sterge']}
                    data-css="admin-btn-delete admin-giveaway-sterge"
                    disabled={ocupat}
                    aria-label={`Șterge participarea lui ${p.nume}`}
                    onClick={() => setConfirmare({ fel: 'stergere', participare: p })}
                  >
                    Șterge
                  </button>
                </div>
              );
            })}
            {participari.length === 0 && (
              <div className={styles['admin-giveaway-gol']} data-css="admin-giveaway-gol">
                {giveaway.stare === 'incheiat' ? 'Nu a rămas niciun contact cu acord.' : 'Nicio participare încă.'}
              </div>
            )}
          </div>
        </div>
      </section>

      {confirmare && (
        <DialogConfirmare
          confirmare={confirmare}
          onRenunta={() => setConfirmare(null)}
          onConfirma={() => confirma(confirmare)}
        />
      )}
    </div>
  );
};

/** Ce scrie pe rând despre extragere, sau `null` când persoana n-a fost extrasă. */
const semnExtragere = (p: ParticipareGiveaway, giveaway: GiveawayAdmin): string | null => {
  if (p.extrasa_la === null) return null;
  if (p.inlocuita_la !== null) return 'Extrasă anterior';
  return giveaway.castigator ? 'Câștigător' : 'Extrasă';
};

type PropsPanou = {
  giveaway: GiveawayAdmin;
  extrasa: ParticipareGiveaway | null;
  /** Câte participări sunt acum în listă. */
  ramase: number;
  ocupat: boolean;
  onOpreste: () => void;
  onExtrage: () => void;
  onReextrage: (nume: string) => void;
  onConfirma: () => void;
  onIncheie: () => void;
};

/**
 * Starea giveaway-ului și doar pașii pe care starea îi permite. Tabelul de
 * stări e în plan (High-Level Technical Design).
 */
const PanouExtragere = ({ giveaway, extrasa, ramase, ocupat, onOpreste, onExtrage, onReextrage, onConfirma, onIncheie }: PropsPanou) => {
  const { stare, castigator } = giveaway;

  if (stare === 'programat') {
    return <p>Înscrierile încep pe {momentComplet(giveaway.starts_at)}.</p>;
  }
  if (stare === 'deschis') {
    if (giveaway.ends_at === 'infinity') {
      return (
        <>
          <p>Înscrierile sunt deschise până când le închizi. După aceea poți extrage câștigătorul.</p>
          <div className={adminStyles['admin-table-actions']} data-css="admin-table-actions">
            <button type="button" className={adminRoot['admin-btn-ghost']} data-css="admin-btn-ghost" disabled={ocupat} onClick={onOpreste}>
              Închide înscrierile
            </button>
          </div>
        </>
      );
    }
    return (
      <p>
        Înscrierile se închid pe {momentComplet(giveaway.ends_at)}. Extragerea devine disponibilă după aceea.
      </p>
    );
  }
  if (stare === 'inchis') {
    return (
      <>
        <p>Înscrierile s-au închis pe {momentComplet(giveaway.ends_at)}. Șterge întâi participările nevalide, apoi extrage.</p>
        <div className={adminStyles['admin-table-actions']} data-css="admin-table-actions">
          <button type="button" className={adminStyles['admin-btn-accent']} data-css="admin-btn-accent" disabled={ocupat} onClick={onExtrage}>
            Extrage câștigătorul
          </button>
        </div>
      </>
    );
  }
  if (stare === 'extras' && extrasa) {
    return (
      <>
        <h3>Persoană extrasă</h3>
        <Persoana nume={extrasa.nume} instagram={extrasa.instagram} telefon={extrasa.telefon} email={extrasa.email} />
        <p>Extrasă pe {momentComplet(extrasa.extrasa_la ?? '')}. Verifică pe Instagram condițiile și contacteaz-o înainte să confirmi.</p>
        <div className={adminStyles['admin-table-actions']} data-css="admin-table-actions">
          <button type="button" className={adminStyles['admin-btn-accent']} data-css="admin-btn-accent" disabled={ocupat} onClick={onConfirma}>
            Confirmă câștigătorul
          </button>
          <button type="button" className={adminRoot['admin-btn-ghost']} data-css="admin-btn-ghost" disabled={ocupat} onClick={() => onReextrage(extrasa.nume)}>
            Reextrage
          </button>
        </div>
      </>
    );
  }
  if (stare === 'confirmat' && castigator) {
    return (
      <>
        <h3>Câștigător confirmat</h3>
        <Persoana nume={castigator.nume} instagram={castigator.instagram} telefon={extrasa?.telefon} email={extrasa?.email} />
        <p>Extras pe {momentComplet(castigator.extras_la)}. Încheie giveaway-ul după ce ai predat premiul.</p>
        <div className={adminStyles['admin-table-actions']} data-css="admin-table-actions">
          <button type="button" className={adminStyles['admin-btn-accent']} data-css="admin-btn-accent" disabled={ocupat} onClick={onIncheie}>
            Încheie giveaway-ul
          </button>
          <button type="button" className={adminRoot['admin-btn-ghost']} data-css="admin-btn-ghost" disabled={ocupat} onClick={() => onReextrage(castigator.nume)}>
            Reextrage
          </button>
        </div>
      </>
    );
  }
  if (stare === 'incheiat') {
    return (
      <>
        <h3>Giveaway încheiat</h3>
        <p>
          Încheiat pe {momentComplet(giveaway.incheiat_la ?? '')}. Au participat {giveaway.total_participari ?? 0} persoane; au rămas{' '}
          {ramase} contacte cu acord.
        </p>
        {castigator && (
          <p>
            Câștigător: {castigator.nume} (@{castigator.instagram}), extras pe {momentComplet(castigator.extras_la)}.
          </p>
        )}
      </>
    );
  }
  // Starea și datele nu se potrivesc doar o clipă, între o scriere și reîncărcare.
  return <p>{STARE[stare]}</p>;
};

const Persoana = ({ nume, instagram, telefon, email }: { nume: string; instagram: string; telefon?: string; email?: string }) => (
  <div className={styles['admin-giveaway-persoana']} data-css="admin-giveaway-persoana">
    <strong>{nume}</strong>
    <a className={styles['admin-giveaway-link']} data-css="admin-giveaway-link" href={profilInstagram(instagram)} target="_blank" rel="noopener noreferrer">
      @{instagram}
    </a>
    {telefon && <a className={styles['admin-giveaway-link']} data-css="admin-giveaway-link" href={`tel:${telefon}`}>{telefon}</a>}
    {email && <a className={styles['admin-giveaway-link']} data-css="admin-giveaway-link" href={`mailto:${email}`}>{email}</a>}
  </div>
);

const TEXTE = {
  stergere: { renunta: 'Păstrează', confirma: 'Șterge definitiv' },
  oprire: { titlu: 'Închizi înscrierile?', renunta: 'Renunță', confirma: 'Închide acum' },
  reextragere: { titlu: 'Reextragi?', renunta: 'Renunță', confirma: 'Reextrage acum' },
  incheiere: { titlu: 'Închei giveaway-ul?', renunta: 'Nu încă', confirma: 'Încheie definitiv' },
};

/** Acțiunile ireversibile cer confirmare. */
const DialogConfirmare = ({ confirmare: c, onRenunta, onConfirma }: { confirmare: Confirmare; onRenunta: () => void; onConfirma: () => void }) => {
  const titlu = c.fel === 'stergere' ? `Ștergi participarea lui ${c.participare.nume}?` : TEXTE[c.fel].titlu;
  return (
    <Dialog titlu={titlu} rol="alertdialog" onInchide={onRenunta}>
      {c.fel === 'stergere' && (
        <p>Ștergerea e definitivă. Persoana se poate înscrie din nou cât timp înscrierile sunt deschise.</p>
      )}
      {c.fel === 'oprire' && (
        <p>Formularul pentru {c.titlu} se închide imediat. Participările existente rămân în listă pentru extragere.</p>
      )}
      {c.fel === 'reextragere' && (
        <p>
          {c.confirmat
            ? `Reextragerea anulează confirmarea lui ${c.nume}, care nu mai poate fi ales după aceea.`
            : `${c.nume} nu mai poate fi ales după aceea.`}{' '}
          Se alege altă persoană, la întâmplare, dintre cele care n-au fost încă extrase.
        </p>
      )}
      {c.fel === 'incheiere' && (
        <p>
          Ștergem definitiv cele {c.faraAcord} participări fără acord de contact. Rămân {c.cuAcord} contacte cu acord și
          înregistrarea câștigătorului. După încheiere nu mai poți reextrage. Pasul e ireversibil: încheie doar după ce ai
          predat premiul.
        </p>
      )}
      <div className={adminStyles['admin-table-actions']} data-css="admin-table-actions">
        <button type="button" className={adminRoot['admin-btn-ghost']} data-css="admin-btn-ghost" onClick={onRenunta}>
          {TEXTE[c.fel].renunta}
        </button>
        <button type="button" className={adminStyles['admin-btn-accent']} data-css="admin-btn-accent" onClick={onConfirma}>
          {TEXTE[c.fel].confirma}
        </button>
      </div>
    </Dialog>
  );
};
