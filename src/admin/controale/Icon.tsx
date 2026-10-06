/**
 * Iconițele adminului: un singur set, același contur (1.8), desenate pe grila
 * de 24. Sunt decor pe lângă text — `aria-hidden` — deci nicio iconiță nu e
 * singurul nume al unui buton; numele vine din `aria-label` sau din text.
 */

const CAI = {
  acum: <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />,
  antrenamente: (
    <>
      <circle cx="12" cy="13.5" r="7" />
      <path d="M12 13.5V10M9.5 3h5M18.3 7.2l1.4-1.4" />
    </>
  ),
  evenimente: <path d="M5 21V4M5 4h11.5l-2.2 4 2.2 4H5" />,
  site: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M3 9.5h18M6.5 7.3h.01M9.3 7.3h.01" />
    </>
  ),
  cauta: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  mai: (
    <>
      <circle cx="5.5" cy="12" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.3" fill="currentColor" />
    </>
  ),
  bifa: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  ceas: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  loc: (
    <>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  jos: <path d="m6 9 6 6 6-6" />,
  sus: <path d="m6 15 6-6 6 6" />,
  dreapta: <path d="m9 6 6 6-6 6" />,
  stanga: <path d="m15 6-6 6 6 6" />,
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="1.5" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
    </>
  ),
  bot: (
    <>
      <rect x="4.5" y="8" width="15" height="11" rx="2" />
      <path d="M12 4.5V8M9 13h.01M15 13h.01M2.5 12.5v3M21.5 12.5v3" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  copiaza: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="1.5" />
      <path d="M15.5 8.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5" />
    </>
  ),
  telefon: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  persoana: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5" />
    </>
  ),
  sageata: <path d="M5 12h14M13 6l6 6-6 6" />,
  camp: (
    <>
      <path d="M4 4h7l9 9-7 7-9-9V4z" />
      <circle cx="8" cy="8" r="1.3" />
    </>
  ),
  atentie: (
    <>
      <path d="M12 3 2.5 20h19L12 3z" />
      <path d="M12 10v4.5M12 17.5h.01" />
    </>
  ),
  sterge: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />,
} as const;

export type NumeIcon = keyof typeof CAI;

export const Icon = ({ nume, marime = 20 }: { nume: NumeIcon; marime?: number }) => (
  <svg
    className="admin-icon"
    width={marime}
    height={marime}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {CAI[nume]}
  </svg>
);
