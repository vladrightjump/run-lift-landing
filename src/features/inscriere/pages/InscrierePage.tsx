import shared3 from '../../../shared/ui/PublicControls.module.css';
import shared1 from '../../../shared/ui/PublicSurface.module.css';
import styles from './InscrierePage.module.css';
import { useEffect, useRef, useState } from 'react';
import {
  useEventConfig,
  useEditionStrings,
  useEditionDates,
  useEventConfigSettled,
} from '../../../shared/lib/useEventConfig';
import { useCountdown } from '../../../shared/lib/useCountdown';
import { usePagePhase } from '../../../shared/lib/usePagePhase';
import { useStats } from '../hooks/useStats';
import { useNow } from '../../../shared/lib/useNow';
import { useRegistration } from '../hooks/useRegistration';
import type { ToastKind } from '../../../shared/lib/useToast';

import { RegistrationForm } from '../components/RegistrationForm';

/**
 * `/inscriere` — pagina „un singur link": doar formularul, cu strictul necesar de
 * context (countdown, locuri, dată/locație). E linkul de pus în bio-ul de
 * Instagram, în story și în WhatsApp: se deschide direct pe primul câmp, fără
 * scroll și fără să treci prin hero + format + locație.
 *
 * Aceleași hookuri ca landing-ul (`useStats`, `useRegistration`) — deci aceleași
 * validări, aceeași listă de așteptare, același email de confirmare.
 */

const SUMMARY_ITEMS = [
  'Cursă în stil HYROX: alergare + stații funcționale',
  'Stațiile și greutățile se adaptează nivelului tău',
  'Deschis oricui, indiferent de nivel',
  'Adu cu tine: apă pentru hidratare și bună dispoziție',
];

export const InscrierePage = () => {
  const { showComingSoon: SHOW_COMING_SOON } = useEventConfig();
  const { EVENT_META, EVENT_START_TIME } = useEditionStrings();
  const { EVENT_DATE, LAUNCH_DATE } = useEditionDates();
  const cd = useCountdown(EVENT_DATE);
  const launch = useCountdown(LAUNCH_DATE);
  const phase = usePagePhase();
  const { stats } = useStats();
  const now = useNow(30_000);
  const [openSummary, setOpenSummary] = useState(false);

  // Aceeași poartă ca în `App.tsx`: cât timp landing-ul e ascuns în spatele
  // Coming Soon, /inscriere nu are voie să servească formularul pe ușa din dos.
  // Azi e inertă (showComingSoon: false), dar la o ediție viitoare care repune
  // poarta, linkul direct ar scurge înscrierile înainte de lansare.
  const comingSoon = SHOW_COMING_SOON && !launch.done;
  // După ce se termină cursa, teaserul pentru următorul antrenament trăiește
  // într-un singur loc — homepage-ul. Linkul direct trimite acolo.
  //
  // Atenție: NU redirectăm în faza „leaderboard". Homepage-ul ascunde formularul
  // cu o oră înainte de start, dar linkul direct rămâne viu până la deadline-ul
  // real (07:00) — e linkul de dat la fața locului. Îl închide `useRegistration`,
  // pe deadline, nu faza.
  const dupaCursa = phase === 'next';
  // Redirectul e ireversibil, deci așteaptă configul live: un instantaneu de build
  // rămas pe ediția trecută ar vedea „după cursă" și ar trimite pe toți acasă.
  const settled = useEventConfigSettled();
  const deRedirectat = comingSoon || dupaCursa;
  const redirect = deRedirectat && settled;
  useEffect(() => {
    if (redirect) window.location.replace('/');
  }, [redirect]);

  const [toast, setToast] = useState<{ kind: ToastKind; msg: string } | null>(null);
  const toastTimerRef = useRef<number | undefined>(undefined);
  const showToast = (kind: ToastKind, msg: string) => {
    window.clearTimeout(toastTimerRef.current);
    setToast({ kind, msg });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  };
  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  const reg = useRegistration({ stats, now, showToast });

  // Ieșirea stă DUPĂ toate hookurile, ca ordinea lor să nu se schimbe între
  // randări (regulile hookurilor). Redirectul de mai sus face restul.
  // Nici formularul nu apare cât timp verdictul e în așteptare: s-ar putea să fie închis.
  if (deRedirectat) return null;

  return (
    <div className={shared1['e3-root']} data-css={"e3-root"}>
      {toast && (
        <div
          role="status"
          className={styles.layout1 + ' ' + (toast.kind === 'error' ? styles.layout1On0 : styles.layout1Off0) + ' ' + (toast.kind === 'error' ? styles.layout1On1 : styles.layout1Off1)}
        >
          <span className={styles.text2}>{toast.kind === 'error' ? '!' : '✓'}</span>
          {toast.msg}
        </div>
      )}

      {/* Antet compact: brand + countdown pe un rând. Fără nav, fără CTA — ești deja aici. */}
      <header
        className={styles.header3}
      >
        <a href="/" className={styles.link4}>
          <div
            className={styles.layout5}
          >
            RL
          </div>
          <span className={styles.text6}>
            Run + Lift
          </span>
        </a>
        <div className={styles.layout7} role="timer" aria-label="Timp rămas până la start">
          <span className={styles.text8}>Start în</span>
          <span className={styles.text9}>
            {cd.zile}z {cd.ore}h {cd.minute}m
          </span>
        </div>
      </header>

      <main className={styles.main10}>
        <div className={styles.layout11}>
          <h1 className={styles['e3-page-title']} data-css={"e3-page-title"}>Înscrie-te</h1>
          <p className={styles.copy12}>
            {EVENT_META} · ora {EVENT_START_TIME}. Completezi 5 câmpuri și primești confirmarea pe email.
          </p>
        </div>

        <RegistrationForm
          reg={reg}
          stats={stats}
          redirect
          autoFocus
          footerSlot={
            <div className={styles.layout13}>
              <button
                type="button"
                onClick={() => setOpenSummary((v) => !v)}
                aria-expanded={openSummary}
                className={styles.button14}
              >
                Pe scurt: ce e Hyrox Trial
                <span className={styles.text15}>{openSummary ? '–' : '+'}</span>
              </button>
              {openSummary && (
                <ul className={styles.list16}>
                  {SUMMARY_ITEMS.map((item) => (
                    <li key={item} className={styles.item17}>
                      <span className={styles.text18}>→</span>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
              <a href="/" className={shared3['e3-link'] + ' ' + styles.link19} data-css={"e3-link"} >
                Vezi tot despre eveniment →
              </a>
            </div>
          }
        />
      </main>
    </div>
  );
};
