import { useState } from 'react';
import type { AdminRegistration, Prezenta } from '../lib/adminApi';

/**
 * Prezența, numărul și timpul final ale unui rând.
 *
 * Dialog separat de „Editează", deși amândouă scriu pe același rând: identitatea
 * (nume, telefon, email) și rezultatul cursei se completează în momente
 * diferite, de obicei de pe dispozitive diferite, iar un singur formular cu
 * șase câmpuri ar cere derulare exact în dimineața în care nimeni n-are timp.
 * Separat înseamnă și un singur RPC per salvare — fără scrieri parțiale când
 * una dintre ele pică.
 *
 * Componenta nu cheamă serverul: ține ciorna și o predă. Așa se testează
 * formularul fără să existe o rețea.
 */

type Props = {
  rand: AdminRegistration;
  ocupat: boolean;
  onSalveaza: (date: Prezenta) => void;
  onInchide: () => void;
};

/** `HH:MM:SS` sau `MM:SS` — forma pe care o acceptăm de la tastatură. */
const TIMP_RE = /^(?:(\d+):)?([0-5]?\d):([0-5]\d)$/;

/**
 * Normalizează la `HH:MM:SS`, forma pe care o înțelege `interval` din Postgres.
 *
 * `null` pentru gol; `undefined` pentru ce nu recunoaștem — apelantul face
 * diferența dintre „șterge timpul" și „nu salva, textul e stricat".
 */
export const normalizeazaTimp = (brut: string): string | null | undefined => {
  const text = brut.trim();
  if (text === '') return null;
  const m = TIMP_RE.exec(text);
  if (!m) return undefined;
  const [, h, min, s] = m;
  return `${String(Number(h ?? 0)).padStart(2, '0')}:${min.padStart(2, '0')}:${s}`;
};

/** `HH:MM:SS` din server → ce se pune în câmp. Gol dacă lipsește. */
const pentruCamp = (timp: string | null | undefined): string => timp?.trim() ?? '';

export const DialogPrezenta = ({ rand, ocupat, onSalveaza, onInchide }: Props) => {
  const [prezent, setPrezent] = useState<boolean | null>(rand.prezent ?? null);
  const [numar, setNumar] = useState(rand.numar == null ? '' : String(rand.numar));
  const [timp, setTimp] = useState(pentruCamp(rand.timp_final));
  const [eroare, setEroare] = useState<string | null>(null);

  const salveaza = () => {
    const timpNormalizat = normalizeazaTimp(timp);
    if (timpNormalizat === undefined) {
      setEroare('Timpul se scrie ca 32:15 sau 1:02:15.');
      return;
    }
    const numarText = numar.trim();
    const numarValoare = numarText === '' ? null : Number(numarText);
    if (numarValoare !== null && (!Number.isInteger(numarValoare) || numarValoare <= 0)) {
      setEroare('Numărul de concurs e un întreg pozitiv.');
      return;
    }
    setEroare(null);
    onSalveaza({ prezent, numar: numarValoare, timp_final: timpNormalizat });
  };

  return (
    <div className="admin-confirm-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onInchide();
      }}>
      <div
        className="admin-confirm admin-prezenta"
        role="dialog"
        aria-modal="true"
        aria-label={`Prezența pentru ${rand.nume}`}
      >
        <h3>{rand.nume}</h3>

        <fieldset className="admin-prezenta-grup">
          <legend>A venit?</legend>
          {/*
            Trei stări, nu o bifă. O bifă are doar „da" și „nu", iar „nu" ar fi
            scris din prima clipă pe toată lista — adică ar afirma absența
            fiecărui înscris cu săptămâni înainte de cursă. „Încă nu se știe" e
            starea implicită și trebuie să rămână spunibilă.
          */}
          {(
            [
              [null, 'Încă nu se știe'],
              [true, 'A venit'],
              [false, 'N-a venit'],
            ] as const
          ).map(([valoare, eticheta]) => (
            <label key={String(valoare)} className="admin-prezenta-optiune">
              <input
                type="radio"
                name="prezent"
                disabled={ocupat}
                checked={prezent === valoare}
                onChange={() => setPrezent(valoare)}
              />
              {eticheta}
            </label>
          ))}
        </fieldset>

        <label className="admin-config-camp">
          <span>Număr de concurs</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            autoComplete="off"
            disabled={ocupat}
            value={numar}
            onChange={(e) => setNumar(e.target.value)}
          />
        </label>

        <label className="admin-config-camp">
          <span>Timp final</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="32:15"
            disabled={ocupat}
            value={timp}
            onChange={(e) => setTimp(e.target.value)}
          />
        </label>
        <p className="admin-config-hint">
          Minute și secunde („32:15") sau cu ore („1:02:15"). Lasă gol dacă nu se aplică.
        </p>

        {eroare && (
          <p className="admin-config-eroare" role="alert">
            {eroare}
          </p>
        )}

        <div className="admin-confirm-actions">
          <button type="button" className="admin-confirm-cancel" onClick={onInchide} disabled={ocupat}>
            Renunță
          </button>
          <button type="button" className="admin-confirm-delete" onClick={salveaza} disabled={ocupat}>
            Salvează
          </button>
        </div>
      </div>
    </div>
  );
};
