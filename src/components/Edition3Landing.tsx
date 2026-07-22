import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import '../edition3.css';
import {
  EVENT_DATE,
  EVENT_END_DATE,
  OCCUPIED_SLOTS,
  REGISTRATION_DEADLINE,
  TOTAL_SLOTS,
  WAITLIST_SLOTS,
  INSTAGRAM_URL,
  isBackendConfigured,
} from '../lib/config';
import {
  submitRegistration,
  submitWaitlist,
  sendConfirmationEmail,
  isTimeoutError,
  isAbortError,
  isDuplicateError,
  isWaitlistFullError,
} from '../lib/supabase';
import { validate, errorMessage, firstErrorField, dataNasteriiError } from '../lib/validation';
import type { FieldName, FieldErrors, FormData } from '../lib/validation';
import { rememberMySignup, getMySignups } from '../lib/mySignups';
import { useCountdown } from '../hooks/useCountdown';
import { useStats } from '../hooks/useStats';
import { useNow } from '../hooks/useNow';

type Phase = 'form' | 'loading' | 'success' | 'error';
type ToastKind = 'success' | 'error';

const MIN_LOADING_MS = 700;
const SIM_LOADING_MS = 1800;
const delay = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

const EVENT_META = '25 iulie 2026 · Parcul Râșcani';
const HERO_KICKER = 'Sâmbătă, 25 iulie 2026 · Parcul Râșcani, Chișinău · Ediția a treia';

// Aceeași locație ca edițiile anterioare — pinul „Новая спортплощадка" din
// Parcul Râșcani. Butonul de direcții folosește link-ul scurt al organizatorului.
const MAP_SRC =
  'https://maps.google.com/maps?q=%D0%9D%D0%BE%D0%B2%D0%B0%D1%8F%20%D1%81%D0%BF%D0%BE%D1%80%D1%82%D0%BF%D0%BB%D0%BE%D1%89%D0%B0%D0%B4%D0%BA%D0%B0%20Chi%C8%99in%C4%83u&z=16&hl=ro&output=embed';
const DIRECTIONS_URL = 'https://share.google/EO25izjX5nIyQgwsa';

const SUMMARY_ITEMS = [
  'Sâmbătă, 25 iulie 2026, ora 07:00 — Parcul Râșcani, Str. Braniștii',
  'Cursă în stil HYROX: urcare, coborâre, alergare + stații funcționale',
  'Stațiile și greutățile se adaptează nivelului tău',
  'Deschis oricui, indiferent de nivel',
  'Adu cu tine: apă pentru hidratare și bună dispoziție',
];

const FORMAT_CARDS = [
  { t: 'RUN', d: 'Segmente de alergare prin parc între stații — același traseu pentru toți.' },
  { t: 'LIFT', d: 'Stații de exerciții funcționale — forță, împins, tras, cărat.' },
  { t: 'REPEAT', d: 'Alternezi alergarea cu stațiile până la finish — contra cronometru.' },
];

const MONTHS = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];
// Ani permiși: de la 14 ani (2012) în urmă până la 100 (1926). Validarea fină
// (min. 14 ani la data evenimentului) rămâne în `validate`/`dataNasteriiError`.
const BIRTH_YEARS = Array.from({ length: 2012 - 1926 + 1 }, (_, i) => 2012 - i);
const pad2 = (n: number | string) => String(n).padStart(2, '0');

const label: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: '#9BA08F',
};
const inputStyle: CSSProperties = {
  background: '#121410',
  border: '1px solid #2A2E25',
  color: '#F1EFE6',
  fontFamily: 'Archivo, sans-serif',
  fontSize: 15,
  padding: '13px 14px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};
const selectStyle: CSSProperties = {
  background: '#121410',
  border: '1px solid #2A2E25',
  color: '#F1EFE6',
  fontFamily: 'Archivo, sans-serif',
  fontSize: 15,
  padding: '13px 28px 13px 12px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  appearance: 'none',
  cursor: 'pointer',
  colorScheme: 'dark',
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%239BA08F' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
};

const sectionNum: CSSProperties = {
  fontFamily: 'Anton, sans-serif',
  fontSize: 15,
  color: '#C9F24B',
  letterSpacing: 3,
  textTransform: 'uppercase',
};
const sectionTitle: CSSProperties = {
  margin: 0,
  fontFamily: 'Anton, sans-serif',
  fontWeight: 400,
  fontSize: 'clamp(34px, 6vw, 52px)',
  letterSpacing: 0.5,
  textTransform: 'uppercase',
};
const fieldErr: CSSProperties = { fontSize: 13, color: '#F26D6D' };

export const Edition3Landing = () => {
  const cd = useCountdown(EVENT_DATE);
  const { stats, refresh } = useStats();
  const now = useNow(30_000);

  const [phase, setPhase] = useState<Phase>('form');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [dateErrMsg, setDateErrMsg] = useState('Introdu data nașterii.');
  const [confirmName, setConfirmName] = useState('atlet');
  const [submittedAsWaitlist, setSubmittedAsWaitlist] = useState(false);
  const [wlFull, setWlFull] = useState(false);
  const [sessionSignups, setSessionSignups] = useState(0);
  const [toast, setToast] = useState<{ kind: ToastKind; msg: string } | null>(null);
  const [birth, setBirth] = useState({ d: '', m: '', y: '' });
  const birthISO = birth.d && birth.m && birth.y ? `${birth.y}-${pad2(birth.m)}-${pad2(birth.d)}` : '';

  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const toastTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (stats) setSessionSignups(0);
  }, [stats]);

  useEffect(() => {
    return () => {
      for (const id of timersRef.current) window.clearTimeout(id);
      window.clearTimeout(toastTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const showToast = (kind: ToastKind, msg: string) => {
    window.clearTimeout(toastTimerRef.current);
    setToast({ kind, msg });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  };

  const scheduleTimer = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  };

  const slots = useMemo(() => {
    const base = stats?.count ?? OCCUPIED_SLOTS;
    const occupied = Math.min(TOTAL_SLOTS, base + sessionSignups);
    return { occupied, remaining: TOTAL_SLOTS - occupied };
  }, [stats, sessionSignups]);

  const isEventEnded = now > EVENT_END_DATE.getTime();
  const isRegClosed = now > REGISTRATION_DEADLINE.getTime();
  const isSoldOut = slots.remaining <= 0;
  const waitlistCount = stats?.waitlist ?? 0;
  const isWaitlistFull = wlFull || waitlistCount >= WAITLIST_SLOTS;
  const waitlistMode = isSoldOut && !isWaitlistFull;
  const waitlistLeft = Math.max(0, WAITLIST_SLOTS - waitlistCount);
  const showForm =
    phase === 'form' && !isEventEnded && !isRegClosed && !(isSoldOut && isWaitlistFull);
  const closedReason: 'ended' | 'reg' | 'full' | null =
    phase !== 'form'
      ? null
      : isEventEnded
      ? 'ended'
      : isRegClosed
      ? 'reg'
      : isSoldOut && isWaitlistFull
      ? 'full'
      : null;

  const clearErrorFor = (name: FieldName) =>
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingRef.current) return;

    const asWaitlist = isSoldOut && !isWaitlistFull;
    const fd = new window.FormData(e.currentTarget);
    const data: FormData = {
      nume: String(fd.get('nume') ?? '').trim(),
      telefon: String(fd.get('telefon') ?? '').trim(),
      email: String(fd.get('email') ?? '').trim(),
      dataNasterii: String(fd.get('dataNasterii') ?? '').trim(),
      acord: !!fd.get('acord'),
    };

    const errs = validate(data);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      if (errs.dataNasterii) {
        setDateErrMsg(dataNasteriiError(data.dataNasterii) ?? 'Data nașterii nu e validă.');
      }
      showToast('error', errorMessage(errs));
      const bad = firstErrorField(errs);
      if (bad) formRef.current?.querySelector<HTMLInputElement>(`[name="${bad}"]`)?.focus();
      return;
    }

    setErrors({});
    setPhase('loading');
    submittingRef.current = true;
    const firstName = data.nume.split(/\s+/)[0] || 'atlet';
    const startedAt = Date.now();

    const enforceMin = async () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_LOADING_MS) await delay(MIN_LOADING_MS - elapsed);
    };

    const finishSuccess = () => {
      setConfirmName(firstName);
      setSubmittedAsWaitlist(asWaitlist);
      if (!asWaitlist) {
        setSessionSignups((n) => n + 1);
        rememberMySignup(data.nume);
      }
      if (isBackendConfigured()) refresh();
      setPhase('success');
      submittingRef.current = false;
      showToast('success', asWaitlist ? 'Ai fost adăugat pe lista de așteptare!' : 'Înscrierea a fost trimisă!');
    };

    const finishError = (msg: string) => {
      setPhase('error');
      submittingRef.current = false;
      showToast('error', msg);
    };

    if (!isBackendConfigured()) {
      if (import.meta.env.DEV) {
        scheduleTimer(async () => {
          await enforceMin();
          finishSuccess();
        }, SIM_LOADING_MS);
      } else {
        scheduleTimer(async () => {
          await enforceMin();
          finishError('Înscrierea nu poate fi trimisă momentan.');
        }, 300);
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (asWaitlist) {
        await submitWaitlist(data, controller.signal);
      } else {
        const newId = await submitRegistration(data, controller.signal);
        void sendConfirmationEmail(newId);
      }
      await enforceMin();
      finishSuccess();
    } catch (err) {
      if (isAbortError(err)) return;
      await enforceMin();
      if (asWaitlist && isWaitlistFullError(err)) {
        setWlFull(true);
        if (isBackendConfigured()) refresh();
        setPhase('form');
        submittingRef.current = false;
        showToast('error', 'Lista de așteptare tocmai s-a umplut.');
        return;
      }
      const msg = isTimeoutError(err)
        ? 'Serverul răspunde greu. Încearcă din nou.'
        : isDuplicateError(err)
        ? 'Există deja o înscriere cu acest email.'
        : 'Înscrierea nu a putut fi trimisă.';
      finishError(msg);
    }
  };

  const resetForm = () => {
    formRef.current?.reset();
    setBirth({ d: '', m: '', y: '' });
    setErrors({});
    setPhase('form');
  };

  const participants = stats?.participants ?? [];
  const mine = new Set(getMySignups());

  return (
    <div className="e3-root">
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: toast.kind === 'error' ? '#3A1A1A' : '#C9F24B',
            color: toast.kind === 'error' ? '#F26D6D' : '#121410',
            fontFamily: 'Archivo, sans-serif',
            fontSize: 15,
            fontWeight: 600,
            padding: '14px 22px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            animation: 'e3-toast-in 0.25s ease',
            maxWidth: 'min(90vw, 480px)',
          }}
        >
          <span style={{ fontSize: 17, fontWeight: 700 }}>{toast.kind === 'error' ? '!' : '✓'}</span>
          {toast.msg}
        </div>
      )}

      {/* ===== TOP BAR ===== */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px 24px',
          padding: '14px clamp(16px, 4vw, 40px)',
          background: 'rgba(18,20,16,0.92)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #2A2E25',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 30,
              height: 30,
              background: '#C9F24B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Anton, sans-serif',
              fontSize: 15,
              color: '#121410',
              letterSpacing: 0.5,
            }}
          >
            RL
          </div>
          <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 18, letterSpacing: 1, textTransform: 'uppercase' }}>
            Run + Lift
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#C9F24B',
              animation: 'e3-dot-blink 1.4s ease-in-out infinite',
            }}
          />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#9BA08F' }}>
            Start în
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }} role="timer" aria-label="Timp rămas până la start">
            {[
              { v: cd.zile, l: 'z', lime: true },
              { v: cd.ore, l: 'h', lime: false },
              { v: cd.minute, l: 'm', lime: false },
              { v: cd.secunde, l: 's', lime: false },
            ].map((u) => (
              <span key={u.l} style={{ display: 'inline-flex', alignItems: 'baseline' }}>
                <span
                  style={{
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 24,
                    lineHeight: 1,
                    color: u.lime ? '#C9F24B' : '#F2F3EC',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {u.v}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#9BA08F' }}>
                  {u.l}
                </span>
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: '#9BA08F' }}>
            {EVENT_META}
          </span>
          <a
            href="#inscriere"
            className="e3-cta"
            style={{
              display: 'inline-block',
              background: '#C9F24B',
              color: '#121410',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              padding: '11px 22px',
              textDecoration: 'none',
            }}
          >
            Înscrie-te
          </a>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section
        style={{
          padding: 'clamp(48px, 9vw, 88px) clamp(20px, 5vw, 40px) clamp(48px, 7vw, 72px)',
          borderBottom: '1px solid #2A2E25',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <p
            style={{
              margin: '0 0 24px',
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: 2.5,
              textTransform: 'uppercase',
              color: '#9BA08F',
              animation: 'e3-fade-up 0.6s ease-out both',
            }}
          >
            {HERO_KICKER}
          </p>
          <h1
            style={{
              margin: 0,
              fontFamily: 'Anton, sans-serif',
              fontWeight: 400,
              fontSize: 'clamp(60px, 13vw, 136px)',
              lineHeight: 0.95,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              textWrap: 'balance',
            }}
          >
            <span style={{ display: 'inline-block', animation: 'e3-fade-up 0.6s ease-out 0.1s both' }}>Up</span>
            <span style={{ display: 'inline-block', color: '#C9F24B', animation: 'e3-fade-up 0.6s ease-out 0.25s both' }}>+</span>
            <br />
            <span style={{ display: 'inline-block', animation: 'e3-fade-up 0.6s ease-out 0.4s both' }}>Down.</span>
          </h1>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 32,
              marginTop: 40,
            }}
          >
            <p
              style={{
                margin: 0,
                maxWidth: 480,
                fontSize: 18,
                lineHeight: 1.55,
                color: '#C9CCBE',
                textWrap: 'pretty',
                animation: 'e3-fade-up 0.6s ease-out 0.55s both',
              }}
            >
              Cursă în stil HYROX în aer liber: urci, cobori, alergi și treci stațiile funcționale — contra
              cronometru, în ritmul tău. Ediția a treia Run + Lift.
            </p>
            <a
              href="#inscriere"
              className="e3-cta-lg"
              style={{
                display: 'inline-block',
                background: '#C9F24B',
                color: '#121410',
                fontFamily: 'Anton, sans-serif',
                fontSize: 20,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                padding: '18px 36px',
                textDecoration: 'none',
              }}
            >
              Rezervă-ți locul
            </a>
          </div>
        </div>
      </section>

      {/* ===== FORMAT ===== */}
      <section style={{ padding: 'clamp(48px, 8vw, 80px) clamp(20px, 5vw, 40px)', borderBottom: '1px solid #2A2E25' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 44 }}>
            <span style={sectionNum}>01</span>
            <h2 style={sectionTitle}>Formatul</h2>
          </div>
          <p style={{ margin: '0 0 40px', maxWidth: 620, fontSize: 17, lineHeight: 1.55, color: '#C9CCBE', textWrap: 'pretty' }}>
            Urci. Cobori. Repeți. Segmente de alergare alternate cu stații de exerciții funcționale sus–jos, în
            stil HYROX. Fără trucuri — doar tu, cronometrul și traseul. Stațiile și greutățile se adaptează
            nivelului tău de către antrenori la fața locului.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {FORMAT_CARDS.map((c) => (
              <div
                key={c.t}
                style={{ background: '#1A1D17', border: '1px solid #2A2E25', padding: '28px 24px', display: 'grid', gap: 10 }}
              >
                <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 40, color: '#C9F24B' }}>{c.t}</span>
                <span style={{ fontSize: 15, lineHeight: 1.5, color: '#C9CCBE' }}>{c.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== VENUE ===== */}
      <section style={{ padding: 'clamp(48px, 8vw, 80px) clamp(20px, 5vw, 40px)', borderBottom: '1px solid #2A2E25' }}>
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))',
            gap: 'clamp(32px, 5vw, 56px)',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 32 }}>
              <span style={sectionNum}>02</span>
              <h2 style={sectionTitle}>Locația</h2>
            </div>
            <div style={{ display: 'grid', gap: 0, border: '1px solid #2A2E25' }}>
              {[
                { k: 'Unde', v: 'Parcul Râșcani, Strada Braniștii, Chișinău', lime: false },
                { k: 'Când', v: 'Sâmbătă, 25 iulie 2026', lime: false },
                { k: 'Start', v: '07:00', lime: true },
              ].map((row, i, arr) => (
                <div
                  key={row.k}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    padding: '18px 22px',
                    borderBottom: i < arr.length - 1 ? '1px solid #2A2E25' : 'none',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: '#9BA08F' }}>
                    {row.k}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: row.lime ? '#C9F24B' : undefined }}>{row.v}</span>
                </div>
              ))}
            </div>
            <p style={{ margin: '24px 0 0', fontSize: 14, lineHeight: 1.55, color: '#9BA08F', textWrap: 'pretty' }}>
              Vino cu 30 de minute înainte pentru check-in și încălzire. Hidratare la fața locului.
            </p>
          </div>
          <div>
            <div style={{ border: '1px solid #2A2E25', overflow: 'hidden', background: '#1A1D17' }}>
              <iframe
                title="Parcul Râșcani, Chișinău — hartă"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                src={MAP_SRC}
                style={{ display: 'block', width: '100%', aspectRatio: '4 / 3', border: 0 }}
              />
            </div>
            <a
              className="e3-link"
              href={DIRECTIONS_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 14,
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: '#C9F24B',
              }}
            >
              <span aria-hidden="true">↗</span> Deschide în Google Maps
            </a>
          </div>
        </div>
      </section>

      {/* ===== REGISTRATION ===== */}
      <section
        id="inscriere"
        style={{ padding: 'clamp(48px, 8vw, 80px) clamp(20px, 5vw, 40px) clamp(64px, 9vw, 96px)' }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))',
            gap: 'clamp(32px, 5vw, 56px)',
            alignItems: 'start',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 32 }}>
              <span style={sectionNum}>03</span>
              <h2 style={sectionTitle}>Înscriere</h2>
            </div>
            <p style={{ margin: '0 0 28px', fontSize: 17, lineHeight: 1.55, color: '#C9CCBE', textWrap: 'pretty' }}>
              {waitlistMode ? (
                <>
                  Locurile s-au epuizat, dar te poți pune pe <strong style={{ color: '#C9F24B' }}>lista de așteptare</strong>.
                  Au mai rămas{' '}
                  <strong style={{ color: '#C9F24B' }}>
                    {waitlistLeft} {waitlistLeft === 1 ? 'loc' : 'locuri'}
                  </strong>{' '}
                  pe listă.
                </>
              ) : (
                <>
                  Completează formularul și primești confirmarea pe email.{' '}
                  <strong style={{ color: '#C9F24B' }}>Locuri limitate</strong> — primul venit, primul servit.
                </>
              )}
            </p>
            <div style={{ border: '1px solid #2A2E25', background: '#1A1D17', padding: 26 }}>
              <div
                style={{
                  fontFamily: 'Anton, sans-serif',
                  fontSize: 15,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: '#C9F24B',
                  marginBottom: 18,
                }}
              >
                Pe scurt
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
                {SUMMARY_ITEMS.map((item) => (
                  <li key={item} style={{ display: 'flex', gap: 12, fontSize: 15, lineHeight: 1.5, color: '#C9CCBE' }}>
                    <span style={{ color: '#C9F24B', fontWeight: 700 }}>→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            {/* Slots */}
            <div
              style={{
                border: '1px solid #2A2E25',
                borderBottom: 'none',
                background: '#1A1D17',
                padding: '18px 22px',
                display: 'grid',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: '#9BA08F' }}>
                  Locuri rămase
                </span>
                <span
                  style={{
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 22,
                    letterSpacing: 1,
                    color: slots.remaining <= 3 ? '#F26D6D' : '#C9F24B',
                  }}
                >
                  {stats ? slots.remaining : '–'} / {TOTAL_SLOTS}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4 }} aria-hidden="true">
                {Array.from({ length: TOTAL_SLOTS }, (_, i) => (
                  <div key={i} style={{ height: 8, flex: 1, background: i < slots.occupied ? '#C9F24B' : '#2A2E25' }} />
                ))}
              </div>
              {isSoldOut && !isWaitlistFull && (
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#C9F24B', fontWeight: 600, textWrap: 'pretty' }}>
                  Locurile s-au epuizat — completează formularul și intri pe lista de așteptare. Te contactăm
                  imediat ce se eliberează un loc.
                </p>
              )}
            </div>

            {/* Formular */}
            {showForm && (
              <form
                ref={formRef}
                noValidate
                onSubmit={handleSubmit}
                onInput={(e) => {
                  const el = e.target as HTMLElement;
                  const name = el.getAttribute('name') as FieldName | null;
                  if (name && name !== 'acord') clearErrorFor(name);
                }}
                style={{
                  border: '1px solid #2A2E25',
                  background: '#1A1D17',
                  padding: 'clamp(20px, 4vw, 36px)',
                  display: 'grid',
                  gap: 22,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 18 }}>
                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={label}>Nume complet *</span>
                    <input
                      className="e3-input"
                      name="nume"
                      type="text"
                      placeholder="Ana Popescu"
                      autoComplete="name"
                      style={{ ...inputStyle, borderColor: errors.nume ? '#F26D6D' : '#2A2E25' }}
                    />
                    {errors.nume && <span style={fieldErr}>Completează numele complet.</span>}
                  </label>
                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={label}>Telefon *</span>
                    <input
                      className="e3-input"
                      name="telefon"
                      type="tel"
                      placeholder="07xx xxx xxx"
                      autoComplete="tel"
                      style={{ ...inputStyle, borderColor: errors.telefon ? '#F26D6D' : '#2A2E25' }}
                    />
                    {errors.telefon && <span style={fieldErr}>Numărul de telefon nu e valid.</span>}
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 18 }}>
                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={label}>Email *</span>
                    <input
                      className="e3-input"
                      name="email"
                      type="email"
                      placeholder="ana@email.ro"
                      autoComplete="email"
                      style={{ ...inputStyle, borderColor: errors.email ? '#F26D6D' : '#2A2E25' }}
                    />
                    {errors.email && <span style={fieldErr}>Adresa de email nu e validă.</span>}
                  </label>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <span style={label}>Data nașterii *</span>
                    <input type="hidden" name="dataNasterii" value={birthISO} readOnly />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', gap: 8 }}>
                      <select
                        aria-label="Ziua nașterii"
                        className="e3-input"
                        value={birth.d}
                        onChange={(e) => {
                          setBirth((b) => ({ ...b, d: e.target.value }));
                          clearErrorFor('dataNasterii');
                        }}
                        style={{ ...selectStyle, borderColor: errors.dataNasterii ? '#F26D6D' : '#2A2E25' }}
                      >
                        <option value="">Zi</option>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={String(d)}>
                            {d}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Luna nașterii"
                        className="e3-input"
                        value={birth.m}
                        onChange={(e) => {
                          setBirth((b) => ({ ...b, m: e.target.value }));
                          clearErrorFor('dataNasterii');
                        }}
                        style={{ ...selectStyle, borderColor: errors.dataNasterii ? '#F26D6D' : '#2A2E25' }}
                      >
                        <option value="">Luna</option>
                        {MONTHS.map((name, i) => (
                          <option key={name} value={String(i + 1)}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Anul nașterii"
                        className="e3-input"
                        value={birth.y}
                        onChange={(e) => {
                          setBirth((b) => ({ ...b, y: e.target.value }));
                          clearErrorFor('dataNasterii');
                        }}
                        style={{ ...selectStyle, borderColor: errors.dataNasterii ? '#F26D6D' : '#2A2E25' }}
                      >
                        <option value="">An</option>
                        {BIRTH_YEARS.map((y) => (
                          <option key={y} value={String(y)}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                    {errors.dataNasterii && <span style={fieldErr}>{dateErrMsg}</span>}
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#9BA08F', textWrap: 'pretty' }}>
                  Participanții trebuie să aibă minim 14 ani în ziua evenimentului. Stațiile și greutățile sunt
                  adaptate de antrenori la fața locului.
                </p>
                <label
                  style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}
                  onChange={() => clearErrorFor('acord')}
                >
                  <input
                    name="acord"
                    type="checkbox"
                    style={{
                      width: 18,
                      height: 18,
                      margin: '2px 0 0',
                      accentColor: '#C9F24B',
                      cursor: 'pointer',
                      outline: `2px solid ${errors.acord ? '#F26D6D' : 'transparent'}`,
                      outlineOffset: 2,
                    }}
                  />
                  <span style={{ fontSize: 14, lineHeight: 1.5, color: errors.acord ? '#F26D6D' : '#9BA08F' }}>
                    Confirm că sunt apt din punct de vedere medical pentru efort fizic intens și accept
                    regulamentul evenimentului. *
                  </span>
                </label>
                {errors.acord && <span style={fieldErr}>Trebuie să accepți regulamentul ca să te poți înscrie.</span>}
                <button
                  type="submit"
                  className="e3-submit"
                  style={{
                    background: '#C9F24B',
                    color: '#121410',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 20,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    padding: 18,
                    marginTop: 4,
                  }}
                >
                  {waitlistMode ? 'Intră pe lista de așteptare' : 'Trimite înscrierea'}
                </button>
              </form>
            )}

            {/* Închis (eveniment trecut / înscrieri închise / totul plin) */}
            {closedReason && (
              <div
                style={{
                  border: '1px solid #2A2E25',
                  background: '#1A1D17',
                  padding: 'clamp(32px, 6vw, 56px) clamp(20px, 5vw, 40px)',
                  textAlign: 'center',
                  display: 'grid',
                  gap: 16,
                  justifyItems: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 'clamp(24px, 5vw, 34px)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {closedReason === 'ended'
                    ? 'Evenimentul a avut loc'
                    : closedReason === 'reg'
                    ? 'Înscrierile s-au închis'
                    : 'Locurile sunt pline'}
                </div>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: '#9BA08F', maxWidth: 380 }}>
                  {closedReason === 'ended'
                    ? 'Ne vedem la ediția următoare. Urmărește-ne pentru anunțuri.'
                    : closedReason === 'reg'
                    ? 'Perioada de înscriere s-a încheiat. Scrie-ne pe Instagram — dacă se eliberează un loc, te anunțăm.'
                    : 'Toate locurile și lista de așteptare sunt ocupate. Scrie-ne pe Instagram dacă apare o disponibilitate.'}
                </p>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="e3-cta"
                  style={{
                    display: 'inline-block',
                    background: '#C9F24B',
                    color: '#121410',
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 17,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    padding: '14px 32px',
                    textDecoration: 'none',
                  }}
                >
                  Contactează organizatorii
                </a>
              </div>
            )}

            {/* Loading */}
            {phase === 'loading' && (
              <div
                style={{
                  border: '1px solid #2A2E25',
                  background: '#1A1D17',
                  padding: 'clamp(48px, 8vw, 80px) clamp(20px, 5vw, 40px)',
                  textAlign: 'center',
                  display: 'grid',
                  gap: 22,
                  justifyItems: 'center',
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    border: '4px solid #2A2E25',
                    borderTopColor: '#C9F24B',
                    borderRadius: '50%',
                    animation: 'e3-spin 0.8s linear infinite',
                  }}
                />
                <div
                  style={{
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 22,
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                    color: '#C9CCBE',
                  }}
                >
                  Se trimite înscrierea…
                </div>
              </div>
            )}

            {/* Success */}
            {phase === 'success' && (
              <div
                style={{
                  border: '1px solid #C9F24B',
                  background: '#1A1D17',
                  padding: 'clamp(32px, 6vw, 56px) clamp(20px, 5vw, 40px)',
                  textAlign: 'center',
                  display: 'grid',
                  gap: 16,
                  justifyItems: 'center',
                }}
              >
                <div style={{ position: 'relative', width: 84, height: 84, display: 'grid', placeItems: 'center' }}>
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '50%',
                      border: '2px solid #C9F24B',
                      animation: 'e3-ring-pulse 1.6s ease-out 0.4s 3',
                    }}
                  />
                  <div
                    style={{
                      width: 84,
                      height: 84,
                      background: '#C9F24B',
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      animation: 'e3-pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    }}
                  >
                    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                      <path
                        d="M10 23 L19 32 L34 13"
                        stroke="#121410"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ strokeDasharray: 40, strokeDashoffset: 40, animation: 'e3-draw-check 0.5s ease-out 0.35s forwards' }}
                      />
                    </svg>
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 'clamp(28px, 6vw, 40px)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {submittedAsWaitlist ? 'Ești pe lista de așteptare, ' : 'Te-ai înregistrat, '}
                  {confirmName}!
                </div>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: '#9BA08F', maxWidth: 380 }}>
                  {submittedAsWaitlist
                    ? 'Toate locurile sunt ocupate momentan. Te contactăm pe email sau telefon imediat ce se eliberează un loc — în ordinea înscrierii.'
                    : 'Ți-am trimis un email de confirmare cu toate detaliile. Ne vedem pe 25 iulie la start, ora 07:00.'}
                </p>
                <button
                  type="button"
                  className="e3-ghost"
                  onClick={resetForm}
                  style={{
                    background: 'transparent',
                    border: '1px solid #2A2E25',
                    color: '#9BA08F',
                    cursor: 'pointer',
                    fontFamily: 'Archivo, sans-serif',
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    padding: '12px 24px',
                    marginTop: 8,
                  }}
                >
                  {submittedAsWaitlist ? 'Adaugă altă persoană' : 'Înscrie altă persoană'}
                </button>
              </div>
            )}

            {/* Error */}
            {phase === 'error' && (
              <div
                style={{
                  border: '1px solid #F26D6D',
                  background: '#1A1D17',
                  padding: 'clamp(32px, 6vw, 56px) clamp(20px, 5vw, 40px)',
                  textAlign: 'center',
                  display: 'grid',
                  gap: 16,
                  justifyItems: 'center',
                }}
              >
                <div
                  style={{
                    width: 84,
                    height: 84,
                    background: '#3A1A1A',
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    animation: 'e3-pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                >
                  <span style={{ fontSize: 38, fontWeight: 700, color: '#F26D6D' }}>✕</span>
                </div>
                <div
                  style={{
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 'clamp(28px, 6vw, 40px)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    color: '#F26D6D',
                  }}
                >
                  Ceva n-a mers
                </div>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: '#9BA08F', maxWidth: 380 }}>
                  Înscrierea nu a putut fi trimisă. Verifică conexiunea la internet și încearcă din nou.
                </p>
                <button
                  type="button"
                  className="e3-retry"
                  onClick={() => {
                    setErrors({});
                    setPhase('form');
                  }}
                  style={{
                    background: '#C9F24B',
                    color: '#121410',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 17,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    padding: '14px 32px',
                    marginTop: 8,
                  }}
                >
                  Încearcă din nou
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===== PARTICIPANTS ===== */}
      <section id="participanti" style={{ padding: 'clamp(48px, 8vw, 80px) clamp(20px, 5vw, 40px)', borderTop: '1px solid #2A2E25' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 32 }}>
            <span style={sectionNum}>04</span>
            <h2 style={sectionTitle}>Cine vine</h2>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
              border: '1px solid #2A2E25',
              borderBottom: 'none',
              background: '#1A1D17',
              padding: '16px 22px',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: '#9BA08F' }}>
              Participanți înscriși
            </span>
            <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 20, letterSpacing: 1, color: '#C9F24B' }}>
              {stats ? stats.count : '–'} / {TOTAL_SLOTS}
            </span>
          </div>
          <div style={{ border: '1px solid #2A2E25', background: '#1A1D17' }}>
            {participants.map((p, i) => (
              <div
                key={`${p.nume}-${i}`}
                style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '15px 22px', borderBottom: '1px solid #232620' }}
              >
                <span
                  style={{
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 15,
                    color: '#5E6355',
                    minWidth: 28,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#F1EFE6', flex: 1 }}>{p.nume}</span>
                {mine.has(p.nume) && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      color: '#121410',
                      background: '#C9F24B',
                      padding: '3px 8px',
                    }}
                  >
                    Nou
                  </span>
                )}
              </div>
            ))}
            {stats && participants.length === 0 && (
              <div style={{ padding: '36px 22px', textAlign: 'center', fontSize: 15, color: '#9BA08F' }}>
                Încă nimeni înscris — fii primul!{' '}
                <a href="#inscriere" style={{ color: '#C9F24B', fontWeight: 600 }}>
                  Înscrie-te
                </a>
              </div>
            )}
            {!stats && (
              <div style={{ padding: '36px 22px', textAlign: 'center', fontSize: 15, color: '#9BA08F' }}>Se încarcă lista…</div>
            )}
          </div>
          {waitlistCount > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
                border: '1px solid #2A2E25',
                background: '#1A1D17',
                padding: '16px 22px',
                marginTop: 28,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: '#9BA08F' }}>
                Pe lista de așteptare
              </span>
              <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 20, letterSpacing: 1, color: '#C9F24B' }}>
                {waitlistCount}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer
        style={{
          borderTop: '1px solid #2A2E25',
          padding: '28px clamp(20px, 5vw, 40px)',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px 24px',
        }}
      >
        <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 15, letterSpacing: 1, textTransform: 'uppercase', color: '#9BA08F' }}>
          Run + Lift · 2026
        </span>
        <span style={{ fontSize: 13, color: '#9BA08F' }}>
          Organizatori: <span style={{ color: '#C9CCBE', fontWeight: 600 }}>Vladislav Filip</span>{' '}
          <a href="tel:+37369509949" className="e3-link" style={{ color: '#C9F24B', fontWeight: 600 }}>
            +373 69 509 949
          </a>{' '}
          <a href="https://www.instagram.com/vladfillip" target="_blank" rel="noopener noreferrer" className="e3-link" style={{ color: '#C9F24B', fontWeight: 600 }}>
            @vladfillip
          </a>{' '}
          · <span style={{ color: '#C9CCBE', fontWeight: 600 }}>Roma Morari</span>{' '}
          <a href="tel:+37369819404" className="e3-link" style={{ color: '#C9F24B', fontWeight: 600 }}>
            +373 69 819 404
          </a>{' '}
          <a href="https://www.instagram.com/morarroma" target="_blank" rel="noopener noreferrer" className="e3-link" style={{ color: '#C9F24B', fontWeight: 600 }}>
            @morarroma
          </a>{' '}
          ·{' '}
          <a href="https://www.instagram.com/we_run_and_lift/" target="_blank" rel="noopener noreferrer" className="e3-link" style={{ color: '#C9F24B', fontWeight: 600 }}>
            @we_run_and_lift
          </a>
        </span>
      </footer>
    </div>
  );
};
