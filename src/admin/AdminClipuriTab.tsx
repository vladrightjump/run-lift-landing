import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listTrainingReels,
  saveTrainingReel,
  moveTrainingReel,
  deleteTrainingReel,
  mesajRefuzClip,
  type AdminReelRow,
} from '../lib/adminApi';
import { useSesiuneAdmin } from './adminSession';

/**
 * Banda cu clipuri de antrenament — ordinea, legendele și ce se vede.
 *
 * Ce NU se face de aici: nu se încarcă fișiere. Un reel exportat din Instagram
 * are 150-250 MB la 28-30 Mbps, iar un formular din browser n-are cum să-l
 * transforme în ceva ce poate servi o pagină. Compresia se face pe mașina
 * organizatorului, cu `npm run reel`, care tipărește exact căile de lipit aici.
 *
 * Ce se face de aici e restul — și restul e partea frecventă: reordonarea,
 * legenda greșită, ascunderea unui clip. Alea nu mai cer deploy.
 *
 * Efect imediat, ca la „Coming Soon" și la programul de antrenamente: e o
 * manetă, nu o ediție. Scurtătura e de PAȘI, nu de verificări — constrângerile
 * din baza de date resping o cale ostilă sau un link cu query indiferent ce
 * trimite ecranul.
 */

type Props = {
  /**
   * Garda „pot pleca de aici?", predată dashboardului.
   *
   * Tabul se randează condiționat, deci schimbarea lui îl DEMONTEAZĂ. Fără
   * gardă, o cale + legendă + link tocmai completate dispar fără să întrebe,
   * la un click pe alt tab.
   */
  inregistreazaGardaIesire: (garda: (() => boolean) | null) => void;
};

/** Ce e deschis în editor: un clip existent, sau unul nou încă nescris. */
type Deschis = { fel: 'nou' } | { fel: 'existent'; id: string };

const GOL = { video: '', poster: '', caption: '', url: '' };

/**
 * Linkul lipit din Instagram vine cu coadă („?igsh=…"). O tăiem la lipire, în
 * loc să refuzăm salvarea: organizatorul apasă „Copiază linkul" în aplicație și
 * n-are de ce să știe care bucată contează.
 */
const curataUrl = (brut: string): string => {
  const text = brut.trim();
  const m = /^(https:\/\/www\.instagram\.com\/(?:reel|p)\/[A-Za-z0-9_-]{5,32}\/)/.exec(text);
  if (m) return m[1];
  // `instagram.com/...` fără `www`, sau `/reels/` plural din share-ul de browser.
  const alt = /instagram\.com\/(reels?|p)\/([A-Za-z0-9_-]{5,32})/i.exec(text);
  if (alt) {
    const ruta = alt[1].toLowerCase() === 'p' ? 'p' : 'reel';
    return `https://www.instagram.com/${ruta}/${alt[2]}/`;
  }
  return text;
};

/** Aceleași forme ca gardele din DB. Serverul rămâne autoritatea. */
const VIDEO_RE = /^\/reels\/[a-z0-9-]+\.mp4$/;
const POSTER_RE = /^\/reels\/[a-z0-9-]+\.jpg$/;
const URL_RE = /^https:\/\/www\.instagram\.com\/(reel|p)\/[A-Za-z0-9_-]{5,32}\/$/;

export const AdminClipuriTab = ({ inregistreazaGardaIesire }: Props) => {
  const { token, onAuthError, showToast } = useSesiuneAdmin();

  const [randuri, setRanduri] = useState<AdminReelRow[] | null>(null);
  const [deschis, setDeschis] = useState<Deschis>({ fel: 'nou' });
  const [camp, setCamp] = useState(GOL);
  const [vizibil, setVizibil] = useState(true);
  const [ocupat, setOcupat] = useState(false);
  const [problema, setProblema] = useState('');

  // Reîncărcarea listei nu trebuie să calce peste ce tocmai s-a tastat în
  // editor, deci editorul nu se resetează decât la cerere explicită.
  const abortRef = useRef<AbortController | null>(null);

  const incarca = useCallback(async () => {
    if (!token) return;
    abortRef.current?.abort();
    const control = new AbortController();
    abortRef.current = control;
    try {
      setRanduri(await listTrainingReels(token, control.signal));
    } catch (err) {
      if (control.signal.aborted) return;
      if (onAuthError(err)) return;
      setProblema(mesajRefuzClip(err));
    }
  }, [token, onAuthError]);

  useEffect(() => {
    incarca();
    return () => abortRef.current?.abort();
  }, [incarca]);

  const deschideNou = () => {
    setDeschis({ fel: 'nou' });
    setCamp(GOL);
    setVizibil(true);
    setProblema('');
  };

  const deschideExistent = (r: AdminReelRow) => {
    setDeschis({ fel: 'existent', id: r.id });
    setCamp({ video: r.video, poster: r.poster, caption: r.caption, url: r.url });
    setVizibil(r.vizibil);
    setProblema('');
  };

  /** Problema din formular, înainte de a deranja serverul. */
  const validare = (): string => {
    if (!VIDEO_RE.test(camp.video)) {
      return 'Calea clipului trebuie să arate ca „/reels/nume-clip.mp4". Rulează `npm run reel` și copiază ce-ți tipărește.';
    }
    if (camp.poster !== '' && !POSTER_RE.test(camp.poster)) {
      return 'Calea posterului trebuie să arate ca „/reels/nume-clip.jpg", sau să fie goală.';
    }
    if (camp.caption.trim() === '') {
      return 'Scrie o legendă: ea e ce citește cineva care folosește un cititor de ecran.';
    }
    if (!URL_RE.test(camp.url)) {
      return 'Linkul trebuie să fie o adresă Instagram curată — ex. https://www.instagram.com/reel/ABC12345/';
    }
    return '';
  };

  const salveaza = async () => {
    if (!token || ocupat) return;
    const rea = validare();
    if (rea) {
      setProblema(rea);
      return;
    }
    setOcupat(true);
    setProblema('');
    try {
      await saveTrainingReel(
        token,
        deschis.fel === 'existent' ? deschis.id : null,
        camp.video,
        camp.poster,
        camp.caption.trim(),
        camp.url,
        vizibil
      );
      showToast({
        kind: 'success',
        msg: deschis.fel === 'nou' ? 'Clip adăugat în bandă.' : 'Clip salvat.',
      });
      deschideNou();
      await incarca();
    } catch (err) {
      if (!onAuthError(err)) setProblema(mesajRefuzClip(err));
    } finally {
      setOcupat(false);
    }
  };

  const muta = async (r: AdminReelRow, directie: -1 | 1) => {
    if (!token || ocupat) return;
    setOcupat(true);
    try {
      await moveTrainingReel(token, r.id, directie);
      await incarca();
    } catch (err) {
      if (!onAuthError(err)) setProblema(mesajRefuzClip(err));
    } finally {
      setOcupat(false);
    }
  };

  const sterge = async (r: AdminReelRow) => {
    if (!token || ocupat) return;
    setOcupat(true);
    try {
      await deleteTrainingReel(token, r.id);
      // Fișierul rămâne în repo — ștergerea din bandă nu e o ștergere de pe disc.
      showToast({
        kind: 'success',
        msg: `Clipul „${r.caption}” a ieșit din bandă. Fișierul rămâne în repo.`,
      });
      if (deschis.fel === 'existent' && deschis.id === r.id) deschideNou();
      await incarca();
    } catch (err) {
      if (!onAuthError(err)) setProblema(mesajRefuzClip(err));
    } finally {
      setOcupat(false);
    }
  };

  /** Editor atins, dar netrimis: exact ce s-ar pierde la schimbarea tabului. */
  const nesalvat =
    camp.video !== '' || camp.poster !== '' || camp.caption !== '' || camp.url !== '';

  const potPleca = (): boolean =>
    !nesalvat ||
    window.confirm('Clipul început nu e salvat. Dacă pleci acum, se pierde. Continui?');

  // Se re-înregistrează la fiecare randare, ca să nu răspundă din starea de
  // acum două randări; se retrage la demontare, altfel ar bloca navigarea din
  // alt tab.
  useEffect(() => {
    inregistreazaGardaIesire(potPleca);
    return () => inregistreazaGardaIesire(null);
  });

  const urmatorulNumar = (randuri?.length ?? 0) + 1;

  return (
    <section className="admin-table-section">
      <header>
        <h2>Clipuri de antrenament</h2>
        <p className="admin-config-hint">
          Banda de pe pagina principală și de pe „Despre noi" — aceeași listă în amândouă.
          Fișierele se produc cu <code>npm run reel</code> și intră printr-un commit; de aici se
          schimbă ordinea, legendele și ce se vede, fără deploy.
        </p>
      </header>

      {problema && (
        <div className="admin-banner warn" role="alert">
          {problema}
        </div>
      )}

      {randuri === null ? (
        <p className="admin-config-hint">Se încarcă…</p>
      ) : randuri.length === 0 ? (
        <p className="admin-config-hint">
          Niciun clip. Cât timp banda e goală, secțiunea nu apare pe pagină — nici pe landing,
          nici pe „Despre noi" — și nu strică numerotarea celorlalte.
        </p>
      ) : (
        <ol className="admin-layout-list">
          {randuri.map((r, i) => (
            <li key={r.id} className={r.vizibil ? '' : 'ascuns'}>
              <div className="admin-row">
                <span className="admin-layout-nr">{String(r.numar).padStart(2, '0')}</span>
                <div className="admin-cell-name">
                  <strong>{r.caption}</strong>
                  {/* `div`, nu `span`: pe un element inline calea se lipea de
                      legendă și rândul se citea „Marți în parc/reels/x.mp4". */}
                  <div className="admin-config-hint">
                    {r.video}
                    {r.vizibil ? '' : ' · ascuns'}
                  </div>
                </div>
                <div className="admin-table-actions">
                  <button
                    type="button"
                    onClick={() => muta(r, -1)}
                    disabled={ocupat || i === 0}
                    aria-label={`Mută „${r.caption}” mai sus`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => muta(r, 1)}
                    disabled={ocupat || i === randuri.length - 1}
                    aria-label={`Mută „${r.caption}” mai jos`}
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => deschideExistent(r)} disabled={ocupat}>
                    Editează
                  </button>
                  <button
                    type="button"
                    onClick={() => sterge(r)}
                    disabled={ocupat}
                    aria-label={`Scoate clipul „${r.caption}” din bandă`}
                  >
                    Scoate
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="admin-config-grup">
        <h3>
          {deschis.fel === 'nou' ? `Clip nou (va fi ${String(urmatorulNumar).padStart(2, '0')})` : 'Editezi un clip'}
        </h3>

        <label className="admin-config-camp">
          <span className="admin-config-eticheta">Calea clipului</span>
          <input
            value={camp.video}
            placeholder="/reels/marti-in-parc.mp4"
            disabled={ocupat}
            onChange={(e) => setCamp({ ...camp, video: e.target.value.trim() })}
          />
        </label>

        <label className="admin-config-camp">
          <span className="admin-config-eticheta">Calea posterului</span>
          <input
            value={camp.poster}
            placeholder="/reels/marti-in-parc.jpg"
            disabled={ocupat}
            onChange={(e) => setCamp({ ...camp, poster: e.target.value.trim() })}
          />
          <small className="admin-config-hint">
            Opțional. Fără el, cardul se randează cu cifra lui mare în locul imaginii.
          </small>
        </label>

        <label className="admin-config-camp">
          <span className="admin-config-eticheta">Legenda</span>
          <input
            value={camp.caption}
            placeholder="Marți seara, în parc"
            disabled={ocupat}
            onChange={(e) => setCamp({ ...camp, caption: e.target.value })}
          />
        </label>

        <label className="admin-config-camp">
          <span className="admin-config-eticheta">Linkul postării</span>
          <input
            value={camp.url}
            placeholder="https://www.instagram.com/reel/ABC12345/"
            disabled={ocupat}
            onChange={(e) => setCamp({ ...camp, url: curataUrl(e.target.value) })}
          />
          <small className="admin-config-hint">
            Lipește linkul din Instagram — coada („?igsh=…") se taie singură.
          </small>
        </label>

        <label className="admin-cs-comutator">
          <input
            type="checkbox"
            checked={vizibil}
            disabled={ocupat}
            onChange={(e) => setVizibil(e.target.checked)}
          />
          <span>Se vede pe pagină</span>
        </label>

        <div className="admin-table-actions">
          <button className="admin-btn-accent" type="button" onClick={salveaza} disabled={ocupat}>
            {deschis.fel === 'nou' ? 'Adaugă în bandă' : 'Salvează'}
          </button>
          {deschis.fel === 'existent' && (
            <button className="admin-btn-ghost" type="button" onClick={deschideNou} disabled={ocupat}>
              Renunță la editare
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
