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
import { idYouTube, esteIdYouTube, sursaIncorporare } from '../lib/youtube';
import { InvelisEditare } from './continut/InvelisEditare';
import { CampEditare } from './continut/campuri';
import { ListaOrdonabila } from './controale/ListaOrdonabila';

/**
 * Banda cu clipuri de antrenament — ordinea, legendele și ce se vede.
 *
 * Un clip se adaugă lipind linkul lui de pe YouTube. Nu se încarcă fișiere și
 * nu mai există un pas pe laptop: pașii ăia — export, `ffmpeg`, commit — sînt
 * motivul pentru care banda n-a avut niciodată conținut.
 *
 * Ecranul folosește învelișul comun de editare, ca „Evenimentul": aceeași
 * succesiune, aceleași verbe. Ce diferă e ce înseamnă „publicat". Tabelul
 * n-are coloană de stare, iar banda publică filtrează pe `vizibil` — deci
 * „publicat" și „se vede pe pagină" sînt deja același lucru. „Salvează" scrie
 * clipul ascuns, „Publică" îl face vizibil.
 *
 * Previzualizarea e VIE, în editor, nu un buton spre altă pagină. Un clip
 * nepublicat nu apare pe banda publică, deci n-ar avea ce arăta acolo; aici se
 * randează cu același `iframe` pe care-l folosește pagina.
 */

type Props = {
  /**
   * Garda „pot pleca de aici?", predată cadrului.
   *
   * Ecranul se randează condiționat, deci schimbarea lui îl DEMONTEAZĂ. Fără
   * gardă, o cale + legendă + link tocmai completate dispar fără să întrebe.
   */
  inregistreazaGardaIesire: (garda: (() => boolean) | null) => void;
};

/** Ce e deschis în editor: un clip existent, sau unul nou încă nescris. */
type Deschis = { fel: 'nou' } | { fel: 'existent'; id: string };

const GOL = { youtube: '', caption: '', url: '' };

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

/** Aceeași formă ca garda din DB. Serverul rămâne autoritatea. */
const URL_RE = /^https:\/\/www\.instagram\.com\/(reel|p)\/[A-Za-z0-9_-]{5,32}\/$/;

export const AdminClipuriTab = ({ inregistreazaGardaIesire }: Props) => {
  const { token, onAuthError, showToast } = useSesiuneAdmin();

  const [randuri, setRanduri] = useState<AdminReelRow[] | null>(null);
  const [deschis, setDeschis] = useState<Deschis>({ fel: 'nou' });
  const [camp, setCamp] = useState(GOL);
  const [ocupat, setOcupat] = useState(false);
  const [refuz, setRefuz] = useState<string | null>(null);

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
      setRefuz(mesajRefuzClip(err));
    }
  }, [token, onAuthError]);

  useEffect(() => {
    incarca();
    return () => abortRef.current?.abort();
  }, [incarca]);

  const deschideNou = () => {
    setDeschis({ fel: 'nou' });
    setCamp(GOL);
    setRefuz(null);
  };

  const deschideExistent = (r: AdminReelRow) => {
    setDeschis({ fel: 'existent', id: r.id });
    setCamp({ youtube: r.youtube, caption: r.caption, url: r.url });
    setRefuz(null);
  };

  /** Câmpurile stricate, ca listă — bara arată câte sînt. */
  const problemeCampuri: Record<string, string> = {};
  if (!esteIdYouTube(camp.youtube)) {
    problemeCampuri.youtube =
      'Nu am recunoscut un clip YouTube în ce ai lipit. Apasă „Distribuie" pe clip și lipește linkul de acolo.';
  }
  if (camp.caption.trim() === '') {
    problemeCampuri.caption = 'Scrie o legendă: ea e ce citește cineva care folosește un cititor de ecran.';
  }
  if (!URL_RE.test(camp.url)) {
    problemeCampuri.url =
      'Linkul trebuie să fie o adresă Instagram curată — ex. https://www.instagram.com/reel/ABC12345/';
  }
  const probleme = Object.keys(problemeCampuri);

  /** Editor atins, dar netrimis: exact ce s-ar pierde la schimbarea ecranului. */
  const nesalvat = camp.youtube !== '' || camp.caption !== '' || camp.url !== '';

  /**
   * Un editor neatins n-are „probleme" — are câmpuri goale.
   *
   * Fără distincția asta, bara anunța „3 câmpuri de reparat" înainte să fi
   * tastat ceva: exact pe dos față de ajutorul care trebuie să ajungă ÎNAINTE
   * de a greși.
   */
  const problemeAfisate = nesalvat ? probleme : [];

  const scrie = async (vizibil: boolean) => {
    if (!token || ocupat || probleme.length > 0) return;
    setOcupat(true);
    setRefuz(null);
    try {
      await saveTrainingReel(
        token,
        deschis.fel === 'existent' ? deschis.id : null,
        camp.youtube,
        camp.caption.trim(),
        camp.url,
        vizibil
      );
      showToast({
        kind: 'success',
        msg: vizibil
          ? 'Clip publicat — se vede pe pagină.'
          : 'Clip salvat, încă ascuns. „Publică" îl pune pe pagină.',
      });
      deschideNou();
      await incarca();
    } catch (err) {
      if (!onAuthError(err)) setRefuz(mesajRefuzClip(err));
    } finally {
      setOcupat(false);
    }
  };

  /**
   * Mută un clip pe poziția cerută.
   *
   * Serverul mută cu UN pas, deci o mutare de pe 5 pe 1 e patru apeluri
   * seriale. Nu e atomică: o mutare întreruptă lasă clipul pe drum, iar
   * reparația e încă o mutare. Banda e scurtă, deci costul e mic — iar
   * alternativa era un RPC nou, adică o migrare.
   */
  const muta = async (id: string, pozitie: number) => {
    if (!token || ocupat || randuri === null) return;
    const acum = randuri.findIndex((r) => r.id === id);
    if (acum === -1) return;
    const pasi = pozitie - 1 - acum;
    if (pasi === 0) return;

    setOcupat(true);
    try {
      const directie: -1 | 1 = pasi > 0 ? 1 : -1;
      for (let i = 0; i < Math.abs(pasi); i += 1) {
        await moveTrainingReel(token, id, directie);
      }
      await incarca();
    } catch (err) {
      if (!onAuthError(err)) setRefuz(mesajRefuzClip(err));
    } finally {
      setOcupat(false);
    }
  };

  const sterge = async (r: AdminReelRow) => {
    if (!token || ocupat) return;
    setOcupat(true);
    try {
      await deleteTrainingReel(token, r.id);
      // Clipul rămâne pe YouTube — scoaterea din bandă nu e o ștergere de pe gazdă.
      showToast({
        kind: 'success',
        msg: `Clipul „${r.caption}” a ieșit din bandă. Pe YouTube rămâne.`,
      });
      if (deschis.fel === 'existent' && deschis.id === r.id) deschideNou();
      await incarca();
    } catch (err) {
      if (!onAuthError(err)) setRefuz(mesajRefuzClip(err));
    } finally {
      setOcupat(false);
    }
  };

  const potPleca = (): boolean =>
    !nesalvat ||
    window.confirm('Clipul început nu e salvat. Dacă pleci acum, se pierde. Continui?');

  // Se re-înregistrează la fiecare randare, ca să nu răspundă din starea de
  // acum două randări; se retrage la demontare, altfel ar bloca navigarea din
  // alt ecran.
  useEffect(() => {
    inregistreazaGardaIesire(potPleca);
    return () => inregistreazaGardaIesire(null);
  });

  const urmatorulNumar = (randuri?.length ?? 0) + 1;
  const editat = deschis.fel === 'existent' ? randuri?.find((r) => r.id === deschis.id) : undefined;

  return (
    <InvelisEditare
      titlu="Clipuri de antrenament"
      descriere={'Banda de pe pagina principală și de pe „Despre noi” — aceeași listă în amândouă. Încarcă clipul pe YouTube ca nelistat, lipește linkul aici. Nimic din ecranul ăsta nu cere deploy.'}
      actiuni={
        deschis.fel === 'existent' && (
          <button className="admin-btn-ghost" type="button" onClick={deschideNou} disabled={ocupat}>
            Renunță la editare
          </button>
        )
      }
      bara={{
        identitate: (
          <strong>
            {deschis.fel === 'nou'
              ? `Clip nou (va fi ${String(urmatorulNumar).padStart(2, '0')})`
              : `Clipul ${String(editat?.numar ?? 0).padStart(2, '0')}`}
          </strong>
        ),
        detaliu: camp.caption || undefined,
        nesalvat,
        probleme: problemeAfisate,
        refuz,
        ocupat,
        poatePublica: nesalvat && probleme.length === 0,
        onSalveaza: () => scrie(false),
        onPublica: () => scrie(true),
        seSalveaza: ocupat,
        sePublica: ocupat,
      }}
    >
      {randuri === null ? (
        <p className="admin-config-hint">Se încarcă…</p>
      ) : randuri.length === 0 ? (
        <p className="admin-config-hint">
          Niciun clip. Cât timp banda e goală, secțiunea nu apare pe pagină — nici pe landing,
          nici pe „Despre noi" — și nu strică numerotarea celorlalte.
        </p>
      ) : (
        <ListaOrdonabila
          eticheta="Ordinea clipurilor în bandă"
          dezactivat={ocupat}
          onMuta={muta}
          elemente={randuri.map((r) => ({
            id: r.id,
            nume: r.caption,
            continut: (
              <div className="admin-row">
                <div className="admin-cell-name">
                  <strong>{r.caption}</strong>
                  {/* `div`, nu `span`: pe un element inline identificatorul se
                      lipea de legendă și rândul se citea „Marți în parcdQw4…". */}
                  <div className="admin-config-hint">
                    {r.youtube}
                    {r.vizibil ? '' : ' · ascuns, nepublicat'}
                  </div>
                </div>
                <div className="admin-table-actions">
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
            ),
          }))}
        />
      )}

      <div className="admin-config-grup">
        <h3>{deschis.fel === 'nou' ? 'Clip nou' : 'Editezi un clip'}</h3>

        <CampEditare
          eticheta="Linkul clipului de pe YouTube"
          obligatoriu
          ajutor={'Lipește ce-ți dă „Distribuie” — orice formă (youtu.be, /shorts/, watch?v=), cu coada de parametri cu tot. Câmpul reține doar identificatorul clipului.'}
          problema={camp.youtube === '' ? undefined : problemeCampuri.youtube}
        >
          <input
            value={camp.youtube}
            placeholder="https://www.youtube.com/shorts/dQw4w9WgXcQ"
            disabled={ocupat}
            /* Normalizează doar când RECUNOAȘTE ceva. Cu `idYouTube` aplicat
               necondiționat, tastarea era imposibilă: fiecare caracter dădea un
               text incomplet, deci șirul gol, deci câmpul se golea la fiecare
               apăsare. Iar un link de pe altă gazdă dispărea fără explicație, în
               loc să ajungă la validare, care are un mesaj pentru exact asta. */
            onChange={(e) =>
              setCamp({ ...camp, youtube: idYouTube(e.target.value) || e.target.value.trim() })
            }
          />
        </CampEditare>

        <CampEditare
          eticheta="Legenda"
          obligatoriu
          ajutor="Ce se citește sub clip — și singurul text pe care-l aude cineva care folosește un cititor de ecran."
          problema={camp.caption === '' ? undefined : problemeCampuri.caption}
        >
          <input
            value={camp.caption}
            placeholder="Marți seara, în parc"
            disabled={ocupat}
            onChange={(e) => setCamp({ ...camp, caption: e.target.value })}
          />
        </CampEditare>

        {/* Eticheta singură nu spunea DE CE un clip de pe YouTube are nevoie și
            de o postare de Instagram. Se afla când validarea refuza salvarea. */}
        <CampEditare
          eticheta="Linkul postării de pe Instagram"
          obligatoriu
          ajutor={'Adresa spre care duce „vezi pe Instagram” de sub clip, pe pagina publică. Lipește linkul din aplicație — coada („?igsh=…”) se taie singură.'}
          problema={camp.url === '' ? undefined : problemeCampuri.url}
        >
          <input
            value={camp.url}
            placeholder="https://www.instagram.com/reel/ABC12345/"
            disabled={ocupat}
            onChange={(e) => setCamp({ ...camp, url: curataUrl(e.target.value) })}
          />
        </CampEditare>

        {/* Previzualizarea e vie, nu un buton spre altă pagină: un clip
            nepublicat nu apare pe banda publică, deci acolo n-ar avea ce
            arăta. Același `iframe` pe care-l folosește pagina. */}
        {esteIdYouTube(camp.youtube) && (
          <div className="admin-previz">
            <span className="admin-previz-eticheta">Așa se va vedea pe pagină</span>
            <div className="admin-previz-card">
              <iframe
                src={sursaIncorporare(camp.youtube)}
                title={camp.caption || 'Previzualizare clip'}
                loading="lazy"
                allow="encrypted-media; picture-in-picture"
                /* Aceeași listă ca pe banda publică, din același motiv:
                   regula cere să scoatem `allow-scripts` sau
                   `allow-same-origin`, fiindcă împreună lasă un cadru să-și
                   șteargă singur sandbox-ul. Aia e adevărat pentru un cadru de
                   pe ACEEAȘI origine; ăsta e pe `youtube-nocookie.com`, deci
                   `allow-same-origin` îi dă originea LUI. Fără el playerul
                   refuză să pornească; fără `allow-scripts` n-are player. */
                // eslint-disable-next-line react/iframe-missing-sandbox
                sandbox="allow-scripts allow-same-origin allow-presentation"
                referrerPolicy="strict-origin-when-cross-origin"
              />
              <span className="admin-previz-legenda">{camp.caption || '(fără legendă)'}</span>
            </div>
          </div>
        )}
      </div>
    </InvelisEditare>
  );
};
