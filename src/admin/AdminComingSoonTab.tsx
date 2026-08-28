import { useCallback, useEffect, useRef, useState } from 'react';
import { listEventConfig, setComingSoon } from '../lib/adminApi';
import type { AdminEventConfigRow } from '../lib/adminApi';
import { parseEventConfig, type EventConfig } from '../content/eventConfig';
import { useEventConfig, useEditionDates } from '../hooks/useEventConfig';
import { useNow } from '../hooks/useNow';
import { fazaSite } from './stareCurenta';
import { laDatetimeLocal, dinDatetimeLocal, descrieMoment } from './eventConfigFields';

type Props = {
  token: string;
  onAuthError: (err: unknown) => boolean;
  showToast: (t: { kind: 'error' | 'success'; msg: string }) => void;
};

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
export const AdminComingSoonTab = ({ token, onAuthError, showToast }: Props) => {
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
    <section className="admin-table-section">
      <div className="admin-stats">
        <div className="admin-stat">
          <span className="admin-stat-label">Acum vizitatorul vede</span>
          <span className="admin-stat-value accent">
            {faza === 'coming-soon' ? 'Coming Soon' : 'Landing'}
          </span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">Ecranul de pornire e setat pe</span>
          <span className="admin-stat-value">
            {publicat.showComingSoon ? 'Coming Soon' : 'Landing'}
          </span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">Anunțul</span>
          <span className="admin-stat-value">
            {descrieMoment(publicat.launchAt, publicat.tz, acum) || '—'}
          </span>
        </div>
      </div>

      {/* Cazul care derutează: comutatorul e pe „Coming Soon", dar ora
          anunțului a trecut, deci site-ul arată deja landing-ul. Fără nota
          asta, organizatorul apasă degeaba pe comutator. */}
      {publicat.showComingSoon && faza !== 'coming-soon' && (
        <div className="admin-banner" role="status">
          Ecranul de pornire e „Coming Soon", dar <strong>ora anunțului a trecut</strong>, deci
          site-ul arată deja landing-ul. Ca să-l duci înapoi pe Coming Soon, mută ținta anunțului
          în viitor.
        </div>
      )}

      {ciornaAtinge && (
        <div className="admin-banner warn" role="status">
          <strong>Există o ciornă deschisă</strong> (ediția {ciorna?.editie}) care poartă alte
          valori pentru ecranul de pornire și pentru țintele numărătorilor. Dacă o publici din
          tabul „Eveniment", ea <strong>suprascrie</strong> ce setezi aici. Aliniaz-o acolo sau
          publică-o înainte.
        </div>
      )}

      <div className="admin-table-head">
        <h2>Coming Soon</h2>
        <div className="admin-table-actions">
          <a
            className="admin-btn-ghost"
            href="/?preview=soon"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vezi ecranul ↗
          </a>
        </div>
      </div>

      <div className="admin-config-form">
        <fieldset className="admin-config-grup">
          <legend>Ce arată homepage-ul</legend>
          <p className="admin-config-hint">
            „Coming Soon" ține pagina pe numărătoarea spre anunț, fără formular. Comutarea se
            aplică imediat, fără deploy.
          </p>
          <div className="admin-cs-comutator">
            {(
              [
                [true, 'Coming Soon'],
                [false, 'Landing, cu înscrieri'],
              ] as const
            ).map(([val, eticheta]) => (
              <button
                key={eticheta}
                type="button"
                className={`admin-sursa-tab${show === val ? ' activ' : ''}`}
                aria-pressed={show === val}
                onClick={() => setShow(val)}
              >
                {eticheta}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="admin-config-grup">
          <legend>Ținta numărătorii</legend>
          <p className="admin-config-hint">
            Momentul anunțului. Când ceasul îl trece, homepage-ul comută singur pe landing.
          </p>
          <div className="admin-config-camp">
            <label className="admin-config-eticheta" htmlFor="cs-launch">
              Se anunță ediția
            </label>
            <input
              id="cs-launch"
              type="datetime-local"
              autoComplete="off"
              value={laDatetimeLocal(launchAt)}
              onChange={(e) => setLaunchAt(dinDatetimeLocal(e.target.value))}
            />
            <span className="admin-config-ecou">
              {descrieMoment(launchAt, publicat.tz, acum) || 'Alege un moment.'}
            </span>
            <div className="admin-cs-presetari">
              {PRESETARI.map((p) => (
                <button
                  key={p.eticheta}
                  type="button"
                  className="admin-btn-ghost"
                  onClick={() => setLaunchAt(caIsoLocal(p.calc(new Date(acum))))}
                >
                  {p.eticheta}
                </button>
              ))}
            </div>
          </div>

          <div className="admin-config-camp">
            <label className="admin-config-eticheta" htmlFor="cs-next">
              Următorul antrenament
            </label>
            <input
              id="cs-next"
              type="datetime-local"
              autoComplete="off"
              value={laDatetimeLocal(nextAt)}
              onChange={(e) => setNextAt(dinDatetimeLocal(e.target.value))}
            />
            <span className="admin-config-ecou">
              {descrieMoment(nextAt, publicat.tz, acum) || 'Alege un moment.'}
            </span>
            <span className="admin-config-ajutor">
              Ținta numărătorii de DUPĂ cursă. Același ecran pentru vizitator, de asta stă aici.
            </span>
          </div>
        </fieldset>

        <div className="admin-table-actions">
          <button
            type="button"
            className="admin-btn-accent"
            disabled={!schimbat || !formatOk || aplica}
            onClick={() => setConfirma(true)}
          >
            {aplica ? 'Se aplică…' : 'Aplică acum'}
          </button>
          {schimbat && (
            <button
              type="button"
              className="admin-btn-ghost"
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

      {confirma && (
        <div
          className="admin-confirm-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirma(false);
          }}
        >
          <div className="admin-confirm" role="alertdialog" aria-modal="true">
            <h3>Aplici schimbarea acum?</h3>
            <p>
              Site-ul public trece <strong>imediat</strong> pe{' '}
              <strong>{show ? 'Coming Soon' : 'landing-ul cu înscrieri'}</strong>, cu numărătoarea
              spre {descrieMoment(launchAt, publicat.tz, acum) || launchAt}.
            </p>
            <p className="admin-confirm-note">
              Nu trece prin ciornă. Versiunea de acum rămâne salvată, deci o poți întoarce din
              „Versiuni anterioare", în tabul „Eveniment".
            </p>
            <div className="admin-confirm-actions">
              <button
                type="button"
                className="admin-btn-accent"
                disabled={aplica}
                onClick={aplicaAcum}
              >
                {aplica ? 'Se aplică…' : 'Da, aplică'}
              </button>
              <button
                type="button"
                className="admin-confirm-cancel"
                disabled={aplica}
                onClick={() => setConfirma(false)}
              >
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
