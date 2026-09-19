import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listWeeklyWorkout,
  saveWeeklyWorkout,
  restoreWeeklyWorkout,
  mesajRefuzAntrenament,
  type AdminWorkoutRow,
} from '../lib/adminApi';
import { useSesiuneAdmin } from './adminSession';

/**
 * Antrenamentul săptămânii — scrii, pornești, copiezi linkul.
 *
 * De ce un ecran separat și nu un grup în tabul „Evenimentul": cadența.
 * Documentul ediției se schimbă de câteva ori pe ediție și merită pașii ciornă
 * → previzualizare → publică. Antrenamentul se schimbă săptămânal, miza e mică,
 * iar treaba pentru care se deschide ecranul durează treizeci de secunde.
 * Trecut prin fluxul ediției, ar fi moștenit exact greutatea care face
 * configurarea obositoare.
 *
 * Efect imediat, ca la „Coming Soon" — și din același motiv: e o manetă, nu o
 * ediție. Scurtătura e de PAȘI, nu de verificări: serverul refuză „pornit și
 * gol", iar versiunile anterioare rămân, deci orice salvare se poate întoarce.
 *
 * Comutatorul e independent de conținut, ca antrenamentul de săptămâna viitoare
 * să poată fi scris din timp cu pagina oprită. Singura combinație care n-are
 * sens — pornit peste un corp gol — o refuză serverul, nu butonul: formularul
 * nu e singura cale spre tabel.
 */

const LINK = '/antrenament';

/** Momentul salvării, scurt. Primește un timestamptz din DB (cu fus), nu ISO
 *  local — de asta nu e `candScurt` din `reperele.ts`, care cere altceva. */
const candSalvat = (iso: string): string =>
  new Date(iso).toLocaleString('ro-RO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export const AdminAntrenamentTab = () => {
  const { token, onAuthError, showToast } = useSesiuneAdmin();

  const [versiuni, setVersiuni] = useState<AdminWorkoutRow[] | null>(null);
  const [titlu, setTitlu] = useState('');
  const [corp, setCorp] = useState('');
  const [activ, setActiv] = useState(false);
  const [salveaza, setSalveaza] = useState(false);
  /**
   * Formularul a fost atins de om.
   *
   * Ref, nu state, și citit în callback-ul de încărcare, nu într-un efect de
   * sincronizare: valoarea contează exact în clipa în care sosește răspunsul,
   * iar un efect ar fi însemnat o rundă de randare în plus pentru o decizie
   * care nu se vede pe ecran.
   *
   * Cursa pe care o apără: salvezi, componenta reinterogează lista, iar tu
   * începi deja să scrii antrenamentul următor. Răspunsul poartă valoarea de
   * dinainte și n-are voie să-ți șteargă textul din mână.
   */
  const atinsRef = useRef(false);

  const incarca = useCallback(() => {
    listWeeklyWorkout(token)
      .then((randuri) => {
        setVersiuni(randuri);
        if (atinsRef.current) return;
        const pub = randuri.find((v) => v.status === 'published');
        if (!pub) return;
        setTitlu(pub.titlu);
        setCorp(pub.corp);
        setActiv(pub.activ);
      })
      .catch((err: unknown) => {
        if (!onAuthError(err)) setVersiuni([]);
      });
  }, [token, onAuthError]);

  useEffect(incarca, [incarca]);

  const publicat = versiuni?.find((v) => v.status === 'published') ?? null;

  const trimite = async () => {
    setSalveaza(true);
    try {
      await saveWeeklyWorkout(token, titlu, corp, activ);
      atinsRef.current = false;
      showToast({
        kind: 'success',
        msg: activ ? 'Salvat. Pagina arată deja antrenamentul nou.' : 'Salvat. Pagina e oprită.',
      });
      incarca();
    } catch (err) {
      if (!onAuthError(err)) showToast({ kind: 'error', msg: mesajRefuzAntrenament(err) });
    } finally {
      setSalveaza(false);
    }
  };

  const revinoLa = async (id: string) => {
    try {
      await restoreWeeklyWorkout(token, id);
      atinsRef.current = false;
      showToast({ kind: 'success', msg: 'Versiunea aceea e din nou publicată.' });
      incarca();
    } catch (err) {
      if (!onAuthError(err)) showToast({ kind: 'error', msg: mesajRefuzAntrenament(err) });
    }
  };

  const copiaza = () => {
    const url = `${window.location.origin}${LINK}`;
    navigator.clipboard
      .writeText(url)
      .then(() => showToast({ kind: 'success', msg: 'Link copiat.' }))
      // Clipboard-ul poate fi refuzat (permisiuni, context ne-securizat). Linkul
      // e vizibil pe ecran oricum, deci eșecul nu blochează treaba.
      .catch(() => showToast({ kind: 'error', msg: `Nu am putut copia. Linkul e ${url}` }));
  };

  const atinge = <T,>(set: (v: T) => void) => (v: T) => {
    atinsRef.current = true;
    set(v);
  };

  const istoric = (versiuni ?? []).filter((v) => v.status === 'superseded');

  return (
    <section className="admin-table-section">
      <div className="admin-stats">
        <div className="admin-stat">
          <span className="admin-stat-label">Pagina e</span>
          <span className={`admin-stat-value${publicat?.activ ? ' accent' : ''}`}>
            {publicat?.activ ? 'pornită' : 'oprită'}
          </span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">Antrenamentul curent</span>
          <span className="admin-stat-value">{publicat?.titlu || '—'}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">Versiuni păstrate</span>
          <span className="admin-stat-value">{istoric.length}</span>
        </div>
      </div>

      <div className="admin-table-head">
        <h2>Antrenamentul săptămânii</h2>
        <div className="admin-table-actions">
          <button type="button" className="admin-btn-ghost" onClick={copiaza}>
            Copiază linkul
          </button>
          <a className="admin-btn-ghost" href={LINK} target="_blank" rel="noopener noreferrer">
            Vezi pagina ↗
          </a>
        </div>
      </div>

      <div className="admin-config-form">
        <fieldset className="admin-config-grup">
          <legend>Ce scrie pe pagină</legend>
          <p className="admin-config-hint">
            Se salvează o dată și se vede imediat. Rândurile pe care le scrii aici sunt rândurile
            de pe pagină — nu e nevoie de nicio formatare.
          </p>

          <div className="admin-config-camp">
            <label className="admin-config-eticheta" htmlFor="an-titlu">
              Titlu
            </label>
            <input
              id="an-titlu"
              type="text"
              autoComplete="off"
              value={titlu}
              onChange={(e) => atinge(setTitlu)(e.target.value)}
            />
          </div>

          <div className="admin-config-camp">
            <label className="admin-config-eticheta" htmlFor="an-corp">
              Antrenamentul
            </label>
            <textarea
              id="an-corp"
              rows={10}
              value={corp}
              onChange={(e) => atinge(setCorp)(e.target.value)}
            />
          </div>
        </fieldset>

        <fieldset className="admin-config-grup">
          <legend>Vizibilitatea</legend>
          <p className="admin-config-hint">
            Oprit, textul rămâne salvat și pagina spune că nu e nimic publicat — linkurile
            trimise deja nu se rup. Pornit peste un text gol nu se poate.
          </p>
          <div className="admin-cs-comutator">
            {(
              [
                [true, 'Pornită'],
                [false, 'Oprită'],
              ] as const
            ).map(([val, eticheta]) => (
              <button
                key={eticheta}
                type="button"
                className={`admin-sursa-tab${activ === val ? ' activ' : ''}`}
                aria-pressed={activ === val}
                onClick={() => atinge(setActiv)(val)}
              >
                {eticheta}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="admin-table-actions">
          <button
            type="button"
            className="admin-btn-accent"
            disabled={salveaza}
            onClick={trimite}
          >
            {salveaza ? 'Se salvează…' : 'Salvează'}
          </button>
        </div>
      </div>

      {istoric.length > 0 && (
        <div className="admin-config-grup">
          <h3>Versiuni anterioare</h3>
          <p className="admin-config-hint">
            Doar editările de conținut lasă o versiune. Pornirea și oprirea nu — altfel lista ar
            fi plină de rânduri identice.
          </p>
          {/* Aceleași clase ca istoricul ediției din tabul „Evenimentul" — e
              aceeași listă, cu aceeași treabă. */}
          <div className="admin-table-wrap">
            <div className="admin-table">
              {istoric.map((v) => (
                <div key={v.id} className="admin-row">
                  <span className="admin-cell-name">{v.titlu || '(fără titlu)'}</span>
                  <span className="admin-cell-date">{candSalvat(v.creat_la)}</span>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    onClick={() => void revinoLa(v.id)}
                  >
                    Revino la ea
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
