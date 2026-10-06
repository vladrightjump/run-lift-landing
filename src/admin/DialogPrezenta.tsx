import { useState } from 'react';
import type { AdminRegistration, Prezenta } from '../lib/adminApi';
import { GrupRadio } from './controale/GrupRadio';
import { Dialog } from './eventTab/Dialog';

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
    <Dialog titlu={rand.nume} clasa="admin-prezenta admin-confirm--neutru" onInchide={onInchide}>
      {/*
        Trei stări, nu o bifă. O bifă are doar „da" și „nu", iar „nu" ar fi
        scris din prima clipă pe toată lista — adică ar afirma absența
        fiecărui înscris cu săptămâni înainte de cursă. „Încă nu se știe" e
        starea implicită și trebuie să rămână spunibilă.
      */}
      <GrupRadio
        eticheta="A venit?"
        valoare={prezent === null ? 'nu-se-stie' : prezent ? 'da' : 'nu'}
        optiuni={[
          { valoare: 'nu-se-stie', eticheta: 'Încă nu se știe' },
          { valoare: 'da', eticheta: 'A venit' },
          { valoare: 'nu', eticheta: 'N-a venit' },
        ]}
        onSchimba={(v) => setPrezent(v === 'nu-se-stie' ? null : v === 'da')}
        dezactivat={ocupat}
      />

      <label className="admin-config-camp">
        <span>Număr de concurs</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
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
    </Dialog>
  );
};
