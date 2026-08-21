import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

/**
 * Data nașterii într-un SINGUR câmp scris: `zz.ll.aaaa`, tastatură numerică pe
 * telefon, punctele puse automat. Înlocuiește cele 3 select-uri (zi/lună/an) —
 * pe mobil erau 3 deschideri de picker pentru o singură informație.
 *
 * Contractul cu restul aplicației nu se schimbă: componenta menține un
 * `<input type="hidden" name="dataNasterii">` în format ISO `yyyy-mm-dd`, exact
 * ce citește `validate()` din `lib/validation.ts`.
 */

const label: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: 'var(--e3-muted)',
};
const inputStyle: CSSProperties = {
  background: 'var(--e3-bg)',
  border: '1px solid var(--e3-border)',
  color: 'var(--e3-text)',
  fontFamily: 'Archivo, sans-serif',
  fontSize: 16, // 16px = iOS nu mai face zoom la focus
  letterSpacing: 1,
  padding: '13px 14px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontVariantNumeric: 'tabular-nums',
};

const pad2 = (n: string) => n.padStart(2, '0');

/** „12081990" → „12.08.1990" (punctele apar singure, în timp ce scrii). */
export const formatMask = (raw: string): string => {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  const parts = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter((p) => p.length > 0);
  return parts.join('.');
};

/** „12.08.1990" → „1990-08-12" (sau '' dacă nu e completă). */
export const toISO = (masked: string): string => {
  const d = masked.replace(/\D/g, '');
  if (d.length !== 8) return '';
  return `${d.slice(4, 8)}-${pad2(d.slice(2, 4))}-${pad2(d.slice(0, 2))}`;
};

/** „1990-08-12" → „12.08.1990" (pentru valoarea venită din afară). */
export const fromISO = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};

type Props = {
  /** Data în ISO (`yyyy-mm-dd`) sau '' — sursa de adevăr stă la părinte. */
  value: string;
  onChange: (iso: string) => void;
  error?: boolean;
  errMsg?: string;
  /** Text de sub câmp (ex. regula de vârstă). */
  hint?: string;
};

export const BirthDateField = ({ value, onChange, error, errMsg, hint }: Props) => {
  const [text, setText] = useState(() => fromISO(value));

  // Resetul formularului (`resetForm`) golește valoarea din afară — urmăm.
  useEffect(() => {
    if (value === '' && text !== '') setText('');
    else if (value !== '' && toISO(text) !== value) setText(fromISO(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={label}>Data nașterii *</span>
      <input type="hidden" name="dataNasterii" value={toISO(text)} readOnly />
      <input
        className="e3-input"
        aria-label="Data nașterii, în format zi punct lună punct an"
        inputMode="numeric"
        autoComplete="bday"
        placeholder="zz.ll.aaaa"
        value={text}
        onChange={(e) => {
          const masked = formatMask(e.target.value);
          setText(masked);
          onChange(toISO(masked));
        }}
        onKeyDown={(e) => {
          // Backspace peste un punct șterge și cifra de dinaintea lui.
          if (e.key === 'Backspace' && text.endsWith('.')) {
            e.preventDefault();
            const next = text.slice(0, -2);
            setText(next);
            onChange(toISO(next));
          }
        }}
        style={{ ...inputStyle, borderColor: error ? 'var(--e3-danger)' : 'var(--e3-border)' }}
      />
      {error ? (
        <span style={{ fontSize: 13, color: 'var(--e3-danger)' }}>{errMsg ?? 'Data nașterii nu e validă.'}</span>
      ) : (
        hint && <span style={{ fontSize: 13, color: 'var(--e3-muted)' }}>{hint}</span>
      )}
    </div>
  );
};
