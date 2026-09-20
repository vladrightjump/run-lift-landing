import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listWeeklyWorkout,
  saveWeeklyWorkout,
  moveWeeklyWorkout,
  deleteWeeklyWorkout,
  restoreWeeklyWorkout,
  mesajRefuzAntrenament,
  type AdminWorkoutRow,
} from '../lib/adminApi';
import { useSesiuneAdmin } from './adminSession';
import { Dialog } from './eventTab/Dialog';

/**
 * Programul antrenamentelor — scrii săptămâna următoare, o pornești, copiezi linkul.
 *
 * De ce un ecran separat și nu un grup în tabul „Evenimentul": cadența.
 * Documentul ediției se schimbă de câteva ori pe ediție și merită pașii ciornă
 * → previzualizare → publică. Antrenamentul se schimbă săptămânal, miza e mică,
 * iar treaba pentru care se deschide ecranul durează treizeci de secunde.
 * Trecut prin fluxul ediției, ar fi moștenit exact greutatea care face
 * configurarea obositoare.
 *
 * Efect imediat, ca la „Coming Soon" — și din același motiv: e o manetă, nu o
 * ediție. Scurtătura e de PAȘI, nu de verificări: serverul refuză „vizibil și
 * gol", iar versiunile anterioare rămân, deci orice salvare se poate întoarce.
 *
 * Ecranul are două jumătăți: LISTA programului (ordine, vizibilitate,
 * ștergere) și EDITORUL săptămânii deschise. Numărul nu se tastează niciodată —
 * îl pune serverul, iar butonul de adăugare îl arată dinainte.
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

/** Ce e deschis în editor: o săptămână existentă, sau una nouă încă nescrisă. */
type Deschis = { fel: 'noua' } | { fel: 'existenta'; id: string };

export const AdminAntrenamentTab = () => {
  const { token, onAuthError, showToast } = useSesiuneAdmin();

  const [randuri, setRanduri] = useState<AdminWorkoutRow[] | null>(null);
  const [deschis, setDeschis] = useState<Deschis>({ fel: 'noua' });
  const [titlu, setTitlu] = useState('');
  const [corp, setCorp] = useState('');
  const [vizibil, setVizibil] = useState(false);
  const [salveaza, setSalveaza] = useState(false);
  const [deSters, setDeSters] = useState<AdminWorkoutRow | null>(null);
  const [deParasit, setDeParasit] = useState<Deschis | null>(null);

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
   *
   * A doua treabă, de la programul numerotat încoace: cu text netrimis în
   * editor, un clic pe altă săptămână ar fi șters în tăcere ce tocmai ai scris.
   * Acum cere confirmare.
   */
  const atinsRef = useRef(false);

  const incarca = useCallback(() => {
    listWeeklyWorkout(token)
      .then((r) => setRanduri(r))
      .catch((err: unknown) => {
        if (!onAuthError(err)) setRanduri([]);
      });
  }, [token, onAuthError]);

  useEffect(incarca, [incarca]);

  /** Programul: doar săptămânile publicate, în ordinea lor. */
  const program = (randuri ?? [])
    .filter((r) => r.status === 'published')
    .sort((a, b) => a.numar - b.numar);

  const urmatorul = program.length + 1;

  const saptamanaDeschisa =
    deschis.fel === 'existenta' ? (program.find((s) => s.id === deschis.id) ?? null) : null;

  /** Versiunile înlocuite ale săptămânii deschise — nu ale întregului program. */
  const istoric =
    saptamanaDeschisa === null
      ? []
      : (randuri ?? []).filter(
          (r) => r.status === 'superseded' && r.numar === saptamanaDeschisa.numar
        );

  const puneInEditor = (s: AdminWorkoutRow | null) => {
    atinsRef.current = false;
    if (s === null) {
      setDeschis({ fel: 'noua' });
      setTitlu('');
      setCorp('');
      setVizibil(false);
      return;
    }
    setDeschis({ fel: 'existenta', id: s.id });
    setTitlu(s.titlu);
    setCorp(s.corp);
    setVizibil(s.vizibil);
  };

  /** Deschide altceva în editor, dar nu peste text netrimis fără să întrebe. */
  const cereDeschiderea = (s: AdminWorkoutRow | null) => {
    const tinta: Deschis = s === null ? { fel: 'noua' } : { fel: 'existenta', id: s.id };
    if (atinsRef.current) {
      setDeParasit(tinta);
      return;
    }
    puneInEditor(s);
  };

  const confirmaParasirea = () => {
    if (deParasit === null) return;
    const tinta = deParasit;
    setDeParasit(null);
    puneInEditor(
      tinta.fel === 'noua' ? null : (program.find((s) => s.id === tinta.id) ?? null)
    );
  };

  const trimite = async () => {
    setSalveaza(true);
    try {
      await saveWeeklyWorkout(token, deschis.fel === 'noua' ? null : deschis.id, titlu, corp, vizibil);
      atinsRef.current = false;
      showToast({
        kind: 'success',
        msg:
          deschis.fel === 'noua'
            ? `Săptămâna ${urmatorul} e salvată.`
            : vizibil
              ? 'Salvat. Pagina arată deja textul nou.'
              : 'Salvat. Săptămâna e ascunsă.',
      });
      // După o săptămână nouă, editorul se pregătește pentru următoarea.
      if (deschis.fel === 'noua') puneInEditor(null);
      incarca();
    } catch (err) {
      if (!onAuthError(err)) showToast({ kind: 'error', msg: mesajRefuzAntrenament(err) });
    } finally {
      setSalveaza(false);
    }
  };

  const muta = async (s: AdminWorkoutRow, directie: -1 | 1) => {
    try {
      await moveWeeklyWorkout(token, s.id, directie);
      incarca();
    } catch (err) {
      if (!onAuthError(err)) showToast({ kind: 'error', msg: mesajRefuzAntrenament(err) });
    }
  };

  const comutaVizibilitatea = async (s: AdminWorkoutRow) => {
    try {
      await saveWeeklyWorkout(token, s.id, s.titlu, s.corp, !s.vizibil);
      if (deschis.fel === 'existenta' && deschis.id === s.id) setVizibil(!s.vizibil);
      incarca();
    } catch (err) {
      if (!onAuthError(err)) showToast({ kind: 'error', msg: mesajRefuzAntrenament(err) });
    }
  };

  const confirmaStergerea = async () => {
    if (deSters === null) return;
    const s = deSters;
    setDeSters(null);
    try {
      await deleteWeeklyWorkout(token, s.id);
      // Ștergerea renumerotează tot ce urmează, deci editorul nu mai poate ține
      // o săptămână care s-ar putea să nu mai fie aceeași.
      if (deschis.fel === 'existenta' && deschis.id === s.id) puneInEditor(null);
      showToast({ kind: 'success', msg: `Săptămâna ${s.numar} a fost ștearsă.` });
      incarca();
    } catch (err) {
      if (!onAuthError(err)) showToast({ kind: 'error', msg: mesajRefuzAntrenament(err) });
    }
  };

  const revinoLa = async (id: string) => {
    try {
      await restoreWeeklyWorkout(token, id);
      atinsRef.current = false;
      showToast({ kind: 'success', msg: 'Versiunea aceea e din nou publicată.' });
      // Rândul publicat al săptămânii are acum alt id.
      setDeschis({ fel: 'existenta', id });
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

  const vizibile = program.filter((s) => s.vizibil);
  const curenta = vizibile.length === 0 ? null : vizibile[vizibile.length - 1];

  return (
    <section className="admin-table-section">
      <div className="admin-stats">
        <div className="admin-stat">
          <span className="admin-stat-label">Programul are</span>
          <span className="admin-stat-value">
            {program.length} {program.length === 1 ? 'săptămână' : 'săptămâni'}
          </span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">Pe pagină se vede</span>
          <span className={`admin-stat-value${curenta ? ' accent' : ''}`}>
            {curenta ? `Săptămâna ${curenta.numar}` : 'nimic'}
          </span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">Ascunse</span>
          <span className="admin-stat-value">{program.length - vizibile.length}</span>
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
          <legend>Programul</legend>
          <p className="admin-config-hint">
            Ordinea de aici e ordinea din care alege vizitatorul. Numerele se pun singure și
            rămân 1, 2, 3… fără goluri — o săptămână ascunsă își păstrează numărul, ca un link
            trimis spre ea să nu ducă altundeva.
          </p>

          {program.length > 0 && (
            <ol className="admin-layout-list">
              {program.map((s, i) => (
                <li key={s.id} className={s.vizibil ? '' : 'ascunsa'}>
                  <span className="admin-layout-nr">{String(s.numar).padStart(2, '0')}</span>
                  <button
                    type="button"
                    className="admin-layout-nume admin-btn-link"
                    onClick={() => cereDeschiderea(s)}
                    aria-current={
                      deschis.fel === 'existenta' && deschis.id === s.id ? 'true' : undefined
                    }
                  >
                    {s.titlu || '(fără titlu)'}
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    onClick={() => void muta(s, -1)}
                    disabled={i === 0}
                    aria-label={`Mută săptămâna ${s.numar} mai sus`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    onClick={() => void muta(s, 1)}
                    disabled={i === program.length - 1}
                    aria-label={`Mută săptămâna ${s.numar} mai jos`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    onClick={() => void comutaVizibilitatea(s)}
                  >
                    {s.vizibil ? 'Ascunde' : 'Arată'}
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    onClick={() => setDeSters(s)}
                    aria-label={`Șterge săptămâna ${s.numar}`}
                  >
                    Șterge
                  </button>
                </li>
              ))}
            </ol>
          )}

          <div className="admin-table-actions">
            <button
              type="button"
              className="admin-btn-ghost"
              onClick={() => cereDeschiderea(null)}
              disabled={deschis.fel === 'noua'}
            >
              + Săptămâna {urmatorul}
            </button>
          </div>
        </fieldset>

        <fieldset className="admin-config-grup">
          <legend>
            {deschis.fel === 'noua'
              ? `Săptămâna ${urmatorul} (nouă)`
              : `Săptămâna ${saptamanaDeschisa?.numar ?? '—'}`}
          </legend>
          <p className="admin-config-hint">
            Rândurile pe care le scrii aici sunt rândurile de pe pagină — nu e nevoie de nicio
            formatare. Numărul îl pune serverul; tu scrii doar titlul și antrenamentul.
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
          <legend>Vizibilitatea săptămânii</legend>
          <p className="admin-config-hint">
            Ascunsă, textul rămâne salvat și săptămâna lipsește de pe pagină — așa scrii din
            timp antrenamentul de săptămâna viitoare. Vizibilă peste un text gol nu se poate.
          </p>
          <div className="admin-cs-comutator">
            {(
              [
                [true, 'Vizibilă'],
                [false, 'Ascunsă'],
              ] as const
            ).map(([val, eticheta]) => (
              <button
                key={eticheta}
                type="button"
                className={`admin-sursa-tab${vizibil === val ? ' activ' : ''}`}
                aria-pressed={vizibil === val}
                onClick={() => atinge(setVizibil)(val)}
              >
                {eticheta}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="admin-table-actions">
          <button type="button" className="admin-btn-accent" disabled={salveaza} onClick={trimite}>
            {salveaza
              ? 'Se salvează…'
              : deschis.fel === 'noua'
                ? `Adaugă Săptămâna ${urmatorul}`
                : 'Salvează'}
          </button>
        </div>
      </div>

      {istoric.length > 0 && saptamanaDeschisa && (
        <div className="admin-config-grup">
          <h3>Versiuni anterioare ale Săptămânii {saptamanaDeschisa.numar}</h3>
          <p className="admin-config-hint">
            Doar editările de conținut lasă o versiune. Ascunderea și arătarea nu — altfel lista
            ar fi plină de rânduri identice.
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

      {deSters && (
        <Dialog
          titlu={`Ștergi Săptămâna ${deSters.numar}?`}
          rol="alertdialog"
          onInchide={() => setDeSters(null)}
        >
          <p>
            „{deSters.titlu || '(fără titlu)'}" dispare cu tot cu versiunile ei, iar săptămânile
            de după se renumerotează. Nu se poate anula.
          </p>
          <div className="admin-table-actions">
            <button type="button" className="admin-btn-ghost" onClick={() => setDeSters(null)}>
              Nu șterge
            </button>
            <button
              type="button"
              className="admin-btn-accent"
              onClick={() => void confirmaStergerea()}
            >
              Șterge săptămâna
            </button>
          </div>
        </Dialog>
      )}

      {deParasit && (
        <Dialog
          titlu="Ai text nesalvat"
          rol="alertdialog"
          onInchide={() => setDeParasit(null)}
        >
          <p>
            Ce-ai scris în editor nu e salvat. Dacă deschizi altă săptămână acum, se pierde.
          </p>
          <div className="admin-table-actions">
            <button type="button" className="admin-btn-ghost" onClick={() => setDeParasit(null)}>
              Rămân aici
            </button>
            <button type="button" className="admin-btn-accent" onClick={confirmaParasirea}>
              Renunț la text
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
};
