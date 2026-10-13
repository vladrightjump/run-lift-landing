import shared1 from '../../components/AdminStyles.module.css';
import adminRoot from '../../components/RadacinaAdmin.module.css';
import styles from './AdminComingSoonTab.module.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { listEventConfig } from '../evenimente/api';
import { setComingSoon } from './api';
import type { AdminEventConfigRow } from '../evenimente/api';
import { parseEventConfig, type EventConfig } from '../../../../shared/content/eventConfig';
import { useEventConfig, useEditionDates } from '../../../../shared/lib/useEventConfig';
import { useNow } from '../../../../shared/lib/useNow';
import { useSesiuneAdmin } from '../../data/adminSession';
import { fazaSite } from '../../data/stareCurenta';
import { laDatetimeLocal, dinDatetimeLocal, descrieMoment } from '../evenimente/eventConfigFields';
import { Dialog } from '../../../../shared/ui/Dialog';
import { AdminOrdineHomepage } from './AdminOrdineHomepage';

/** „2026-08-19T12:00:00" — local, fără fus. Aceeași formă ca în document. */
const LOCAL_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

/** Momentul local, ca ISO fără fus — forma pe care o cere documentul. */
const caIsoLocal = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
};

/** Presetările. Pornesc de la ACUM, nu de la valoarea din câmp: „+1 zi" trebuie
 *  să însemne „mâine", nu „cu o zi după data pe care am uitat-o acolo". */
const PRESETARI: { eticheta: string; calc: (acum: Date) => Date }[] = [
  {
    eticheta: 'Mâine la 12:00',
    calc: (acum) => {
      const d = new Date(acum);
      d.setDate(d.getDate() + 1);
      d.setHours(12, 0, 0, 0);
      return d;
    },
  },
  {
    eticheta: 'Peste o săptămână',
    calc: (acum) => {
      const d = new Date(acum);
      d.setDate(d.getDate() + 7);
      d.setHours(12, 0, 0, 0);
      return d;
    },
  },
  {
    eticheta: 'Acum (anunță imediat)',
    calc: (acum) => new Date(acum.getTime() - 60_000),
  },
];

const mesajRefuz = (err: unknown): string => {
  const text = err instanceof Error ? err.message : String(err);
  if (text.includes('no_published')) {
    return 'Nu există un config publicat de peticit. Publică o ediție întâi, din tabul „Eveniment".';
  }
  const invalid = /config_invalid:\s*(.+)/.exec(text);
  if (invalid) return `Serverul a refuzat: ${invalid[1]}`;
  return 'Nu am putut aplica schimbarea. Încearcă din nou.';
};

/**
 * Panoul „Coming Soon": comutatorul ecranului de dinainte de lansare și țintele
 * numărătorilor, într-un singur loc, cu efect imediat pe site.
 *
 * De ce un tab separat, când cele două câmpuri existau deja în „Eveniment":
 * acolo stăteau în grupuri diferite (data într-unul, comutatorul în altul) și
 * amândouă cereau ciornă → publică. Comutarea e însă o operație de un singur
 * gest, făcută de regulă sub presiune. Ciorna e potrivită pentru o ediție
 * întreagă; asta e o manetă.
 *
 * Scurtătura e de PAȘI, nu de verificări: serverul revalidează documentul
 * peticit prin aceeași poartă ca publicarea, și scrie un rând nou, deci
 * „Versiuni anterioare" din tabul „Eveniment" poate întoarce orice apăsare.
 */
export const AdminComingSoonTab = () => {
  const { token, onAuthError, showToast } = useSesiuneAdmin();
  const publicat = useEventConfig();
  const dates = useEditionDates();
  const acum = useNow(30_000);
  const faza = fazaSite(publicat, dates, acum);

  // Ce e în câmpuri. Pornește de la publicat și se resincronizează când
  // publicatul se schimbă (inclusiv după propriul nostru petic).
  const [show, setShow] = useState(publicat.showComingSoon);
  const [launchAt, setLaunchAt] = useState(publicat.launchAt);
  const [nextAt, setNextAt] = useState(publicat.nextEditionAt);
  const [confirma, setConfirma] = useState(false);
  const [aplica, setAplica] = useState(false);
  const [ciorne, setCiorne] = useState<AdminEventConfigRow[] | null>(null);

  const publicatKey = `${publicat.showComingSoon}|${publicat.launchAt}|${publicat.nextEditionAt}`;
  useEffect(() => {
    setShow(publicat.showComingSoon);
    setLaunchAt(publicat.launchAt);
    setNextAt(publicat.nextEditionAt);
    // Cheia, nu obiectul: `useEventConfig` întoarce un obiect nou la fiecare
    // refresh de 15s, iar o dependență pe el ar rescrie câmpurile din care
    // tocmai edita cineva.
  }, [publicatKey, publicat.showComingSoon, publicat.launchAt, publicat.nextEditionAt]);

  // Ciorna deschisă, dacă există: publicarea ei ulterioară ar suprascrie exact
  // cheile pe care le petice panoul ăsta. Vezi bannerul de mai jos.
  const incarcaCiorne = useCallback(() => {
    listEventConfig(token)
      .then(setCiorne)
      .catch((err) => {
        if (!onAuthError(err)) setCiorne([]);
      });
  }, [token, onAuthError]);
  useEffect(incarcaCiorne, [incarcaCiorne]);

  const ciorna = ciorne?.find((r) => r.status === 'draft') ?? null;
  const ciornaConfig: EventConfig | null = ciorna ? parseEventConfig(ciorna.config) : null;
  // Bannerul e util doar dacă ciorna chiar ar schimba ceva din ce ținem aici.
  const ciornaAtinge =
    ciornaConfig !== null &&
    (ciornaConfig.showComingSoon !== show ||
      ciornaConfig.launchAt !== launchAt ||
      ciornaConfig.nextEditionAt !== nextAt);

  const formatOk = LOCAL_ISO_RE.test(launchAt) && LOCAL_ISO_RE.test(nextAt);
  const schimbat =
    show !== publicat.showComingSoon ||
    launchAt !== publicat.launchAt ||
    nextAt !== publicat.nextEditionAt;

  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const aplicaAcum = async () => {
    setAplica(true);
    try {
      await setComingSoon(token, show, launchAt, nextAt);
      setConfirma(false);
      showToast({ kind: 'success', msg: 'Gata. Site-ul public arată deja starea nouă.' });
      incarcaCiorne();
    } catch (err) {
      if (!onAuthError(err)) showToast({ kind: 'error', msg: mesajRefuz(err) });
      setConfirma(false);
    } finally {
      setAplica(false);
    }
  };

  return (
    <section className={shared1['admin-table-section']} data-css="admin-table-section">
      <div className={shared1['admin-stats']} data-css="admin-stats">
        <div className={shared1['admin-stat']} data-css="admin-stat">
          <span className={shared1['admin-stat-label']} data-css="admin-stat-label">Acum vizitatorul vede</span>
          <span className={`${shared1['admin-stat-value']} ${shared1['accent']}`} data-css="admin-stat-value accent">
            {faza === 'coming-soon' ? 'Coming Soon' : 'Landing'}
          </span>
        </div>
        <div className={shared1['admin-stat']} data-css="admin-stat">
          <span className={shared1['admin-stat-label']} data-css="admin-stat-label">Ecranul de pornire e setat pe</span>
          <span className={shared1['admin-stat-value']} data-css="admin-stat-value">
            {publicat.showComingSoon ? 'Coming Soon' : 'Landing'}
          </span>
        </div>
        <div className={shared1['admin-stat']} data-css="admin-stat">
          <span className={shared1['admin-stat-label']} data-css="admin-stat-label">Anunțul</span>
          <span className={shared1['admin-stat-value']} data-css="admin-stat-value">
            {descrieMoment(publicat.launchAt, publicat.tz, acum) || '—'}
          </span>
        </div>
      </div>

      {/* Cazul care derutează: comutatorul e pe „Coming Soon", dar ora
          anunțului a trecut, deci site-ul arată deja landing-ul. Fără nota
          asta, organizatorul apasă degeaba pe comutator. */}
      {publicat.showComingSoon && faza !== 'coming-soon' && (
        <div className={shared1['admin-banner']} data-css="admin-banner" role="status">
          Ecranul de pornire e „Coming Soon", dar <strong>ora anunțului a trecut</strong>, deci
          site-ul arată deja landing-ul. Ca să-l duci înapoi pe Coming Soon, mută ținta anunțului
          în viitor.
        </div>
      )}

      {ciornaAtinge && (
        <div className={`${shared1['admin-banner']} warn`} data-css="admin-banner warn" role="status">
          <strong>Există o ciornă deschisă</strong> (ediția {ciorna?.editie}) care poartă alte
          valori pentru ecranul de pornire și pentru țintele numărătorilor. Dacă o publici din
          tabul „Eveniment", ea <strong>suprascrie</strong> ce setezi aici. Aliniaz-o acolo sau
          publică-o înainte.
        </div>
      )}

      <div className={shared1['admin-table-head']} data-css="admin-table-head">
        <div className={shared1['admin-invelis-titlu']} data-css={"admin-invelis-titlu"}>
          <h2>Coming Soon</h2>
          {/* Excepția se SCRIE, nu se deduce din lipsa unui buton „Publică".
              Celelalte ecrane de conținut au ciornă și publicare; ăsta e o
              manetă, iar o manetă cu un pas de publicare ar însemna s-o
              armezi și apoi s-o tragi. */}
          <p className={shared1['admin-config-hint']} data-css="admin-config-hint">
            <strong>Ecranul ăsta are efect imediat.</strong> Spre deosebire de „Evenimentul",
            „Clipuri" sau „Antrenamente", aici nu există ciornă: ce schimbi se vede pe site de
            îndată ce salvezi. E o manetă, nu un document.
          </p>
        </div>
        <div className={shared1['admin-table-actions']} data-css="admin-table-actions">
          <a
            className={adminRoot['admin-btn-ghost']} data-css="admin-btn-ghost"
            href="/?preview=soon"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vezi ecranul ↗
          </a>
        </div>
      </div>

      <div className={shared1['admin-config-form']} data-css="admin-config-form">
        <fieldset className={shared1['admin-config-grup']} data-css="admin-config-grup">
          <legend>Ce arată homepage-ul</legend>
          <p className={shared1['admin-config-hint']} data-css="admin-config-hint">
            „Coming Soon" ține pagina pe numărătoarea spre anunț, fără formular. Comutarea se
            aplică imediat, fără deploy.
          </p>
          <div className={shared1['admin-cs-comutator']} data-css="admin-cs-comutator">
            {(
              [
                [true, 'Coming Soon'],
                [false, 'Landing, cu înscrieri'],
              ] as const
            ).map(([val, eticheta]) => (
              <button
                key={eticheta}
                type="button"
                className={`${shared1['admin-sursa-tab']}${show === val ? ' activ' : ''}`} data-css={`admin-sursa-tab${show === val ? ' activ' : ''}`}
                aria-pressed={show === val}
                onClick={() => setShow(val)}
              >
                {eticheta}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={shared1['admin-config-grup']} data-css="admin-config-grup">
          <legend>Ținta numărătorii</legend>
          <p className={shared1['admin-config-hint']} data-css="admin-config-hint">
            Momentul anunțului. Când ceasul îl trece, homepage-ul comută singur pe landing.
          </p>
          <div className={shared1['admin-config-camp']} data-css="admin-config-camp">
            <label className={shared1['admin-config-eticheta']} data-css="admin-config-eticheta" htmlFor="cs-launch">
              Se anunță ediția
            </label>
            <input
              id="cs-launch"
              type="datetime-local"
              autoComplete="off"
              value={laDatetimeLocal(launchAt)}
              onChange={(e) => setLaunchAt(dinDatetimeLocal(e.target.value))}
            />
            <span className={shared1['admin-config-ecou']} data-css="admin-config-ecou">
              {descrieMoment(launchAt, publicat.tz, acum) || 'Alege un moment.'}
            </span>
            <div className={styles['admin-cs-presetari']} data-css={"admin-cs-presetari"}>
              {PRESETARI.map((p) => (
                <button
                  key={p.eticheta}
                  type="button"
                  className={adminRoot['admin-btn-ghost']} data-css="admin-btn-ghost"
                  onClick={() => setLaunchAt(caIsoLocal(p.calc(new Date(acum))))}
                >
                  {p.eticheta}
                </button>
              ))}
            </div>
          </div>

          <div className={shared1['admin-config-camp']} data-css="admin-config-camp">
            <label className={shared1['admin-config-eticheta']} data-css="admin-config-eticheta" htmlFor="cs-next">
              Următorul antrenament
            </label>
            <input
              id="cs-next"
              type="datetime-local"
              autoComplete="off"
              value={laDatetimeLocal(nextAt)}
              onChange={(e) => setNextAt(dinDatetimeLocal(e.target.value))}
            />
            <span className={shared1['admin-config-ecou']} data-css="admin-config-ecou">
              {descrieMoment(nextAt, publicat.tz, acum) || 'Alege un moment.'}
            </span>
            <span className={shared1['admin-config-ajutor']} data-css="admin-config-ajutor">
              Ținta numărătorii de DUPĂ cursă. Același ecran pentru vizitator, de asta stă aici.
            </span>
          </div>
        </fieldset>

        <div className={shared1['admin-table-actions']} data-css="admin-table-actions">
          <button
            type="button"
            className={shared1['admin-btn-accent']} data-css="admin-btn-accent"
            disabled={!schimbat || !formatOk || aplica}
            onClick={() => setConfirma(true)}
          >
            {aplica ? 'Se aplică…' : 'Aplică acum'}
          </button>
          {schimbat && (
            <button
              type="button"
              className={adminRoot['admin-btn-ghost']} data-css="admin-btn-ghost"
              disabled={aplica}
              onClick={() => {
                setShow(publicat.showComingSoon);
                setLaunchAt(publicat.launchAt);
                setNextAt(publicat.nextEditionAt);
              }}
            >
              Anulează modificările
            </button>
          )}
        </div>
      </div>

      {/* Separat de formularul de mai sus: nu trece prin „Aplică acum", fiecare
          alegere pleacă singură. */}
      <AdminOrdineHomepage />

      {confirma && (
        <Dialog titlu="Aplici schimbarea acum?" rol="alertdialog" clasa={shared1['admin-confirm--neutru']} onInchide={() => setConfirma(false)}>
          <p>
            Site-ul public trece <strong>imediat</strong> pe{' '}
            <strong>{show ? 'Coming Soon' : 'landing-ul cu înscrieri'}</strong>, cu numărătoarea
            spre {descrieMoment(launchAt, publicat.tz, acum) || launchAt}.
          </p>
          <p className={shared1['admin-confirm-note']} data-css="admin-confirm-note">
            Nu trece prin ciornă. Versiunea de acum rămâne salvată, deci o poți întoarce din
            „Versiuni anterioare", în tabul „Eveniment".
          </p>
          <div className={shared1['admin-confirm-actions']} data-css="admin-confirm-actions">
            <button
              type="button"
              className={shared1['admin-btn-accent']} data-css="admin-btn-accent"
              disabled={aplica}
              onClick={aplicaAcum}
            >
              {aplica ? 'Se aplică…' : 'Da, aplică'}
            </button>
            <button
              type="button"
              className={shared1['admin-confirm-cancel']} data-css="admin-confirm-cancel"
              disabled={aplica}
              onClick={() => setConfirma(false)}
            >
              Anulează
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
};
