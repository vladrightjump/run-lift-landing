import { useContext, useState } from 'react';
import { MAX_REELS, type EventConfig } from '../../../content/eventConfig';
import { Grup, Camp, Blocat } from '../primitive';
import { areEroareIndexata } from '../ajutoare';
import { useSesiuneAdmin } from '../../adminSession';
import {
  parseInstagramUrl,
  adaugaReel,
  stergeReel,
  mutaReel,
  seteazaReel,
} from '../../eventConfigForm';

type Props = {
  ciorna: EventConfig;
  seteaza: <K extends keyof EventConfig>(cheie: K, valoare: EventConfig[K]) => void;
  erori: Map<string, string>;
};

/**
 * „Instagram": textele secțiunii și clipurile din bandă.
 *
 * Lista de clipuri stătea în afara grupului, la capătul formularului: grupul
 * își rezuma pliat un conținut („3 clipuri") pe care nu-l conținea, iar
 * rândurile nu primeau tratamentul lui `Camp` — etichetă legată prin `htmlFor`,
 * explicație și eroare prin `aria-describedby`, câmpuri inerte cât ține o
 * scriere.
 */
export const GrupInstagram = ({ ciorna, seteaza, erori }: Props) => {
  const ocupat = useContext(Blocat);
  const { showToast } = useSesiuneAdmin();

  /**
   * Textul brut din câmpurile de link, pe index.
   *
   * De ce nu se poate randa direct din `code`: câmpul ar fi controlat de o
   * valoare RECOMPUSĂ din ce s-a parsat, iar la tastare (nu lipire) fiecare
   * caracter în parte e un URL invalid — deci câmpul s-ar goli singur la prima
   * literă. Ciorna primește codul; câmpul păstrează ce a scris omul.
   *
   * Se golește la orice schimbare de structură (adăugare, ștergere, mutare):
   * rândurile sunt identificate prin index, iar altfel textul ar rămâne agățat
   * de poziție, nu de clip.
   */
  const [linkBrut, setLinkBrut] = useState<Record<number, string>>({});

  const seteazaReels = (items: EventConfig['reels']['items'], structural = false) => {
    if (structural) setLinkBrut({});
    seteaza('reels', { ...ciorna.reels, items });
  };

  return (
    <Grup
      titlu="Instagram"
      ajutor="Clipurile din bandă. Lipești linkul din Instagram — codul se extrage singur."
      areEroare={areEroareIndexata(erori, 'reels')}
      rezumat={
        ciorna.reels.items.length === 0
          ? 'Niciun clip · secțiunea nu apare pe pagină'
          : `${ciorna.reels.items.length} ${
              ciorna.reels.items.length === 1 ? 'clip' : 'clipuri'
            }`
      }
    >
      <Camp eticheta="Titlul secțiunii" cheie="reels.headline">
        {(p) => (
          <input
            {...p}
            value={ciorna.reels.headline}
            onChange={(e) => seteaza('reels', { ...ciorna.reels, headline: e.target.value })}
          />
        )}
      </Camp>
      <Camp
        eticheta="Textul de lângă bandă"
        ajutor="Două rânduri. Ce vede cineva care nu ne-a văzut niciodată alergând."
      >
        {(p) => (
          <textarea
            {...p}
            rows={3}
            value={ciorna.reels.body}
            onChange={(e) => seteaza('reels', { ...ciorna.reels, body: e.target.value })}
          />
        )}
      </Camp>

      <div className="admin-config-lista">
        <span className="admin-config-eticheta">Clipurile din bandă</span>
        <p className="admin-config-hint">
          Ordinea de aici e ordinea din bandă. Fără niciun clip, secțiunea nu apare pe pagină,
          oricât ar fi de vizibilă în lista de secțiuni.
        </p>
        {erori.get('reels') && (
          <div className="admin-banner warn" role="status">
            {erori.get('reels')}
          </div>
        )}
        <ol className="admin-reels-list">
          {ciorna.reels.items.map((r, i) => {
            const eroareCod = erori.get(`reels.${i}.code`);
            return (
              <li key={i} className={eroareCod ? 'invalid' : ''}>
                <div className="admin-reels-rand">
                  <span className="admin-layout-nr">{String(i + 1).padStart(2, '0')}</span>
                  <div className="admin-reels-campuri">
                    <Camp
                      eticheta="Linkul clipului"
                      cheie={`reels.${i}.code`}
                      eroare={eroareCod}
                      ecou={
                        r.code ? `cod: ${r.code} · ${r.kind === 'p' ? 'postare' : 'reel'}` : undefined
                      }
                    >
                      {(p) => (
                        <input
                          {...p}
                          placeholder="https://www.instagram.com/reel/ABC12345/"
                          // Textul brut cât timp se scrie; URL-ul canonic recompus
                          // din cod după ce câmpul e părăsit. Așa tastarea nu se
                          // autodistruge, iar la final se vede ce am înțeles.
                          value={
                            linkBrut[i] ??
                            (r.code ? `https://www.instagram.com/${r.kind}/${r.code}/` : '')
                          }
                          onChange={(e) => {
                            const text = e.target.value;
                            setLinkBrut((m) => ({ ...m, [i]: text }));
                            const parsat = parseInstagramUrl(text);
                            seteazaReels(
                              parsat
                                ? ciorna.reels.items.map((x, j) =>
                                    j === i ? { ...x, code: parsat.code, kind: parsat.kind } : x
                                  )
                                : seteazaReel(ciorna.reels.items, i, 'code', '')
                            );
                          }}
                          onBlur={() =>
                            // Ce a rămas în câmp după ce s-a extras codul nu mai
                            // interesează: la ieșire arătăm forma canonică.
                            setLinkBrut((m) => {
                              const { [i]: _, ...rest } = m;
                              return rest;
                            })
                          }
                        />
                      )}
                    </Camp>

                    <Camp eticheta="Poster (opțional)">
                      {(p) => (
                        <input
                          {...p}
                          placeholder="/reels/marti.jpg"
                          value={r.poster}
                          onChange={(e) =>
                            seteazaReels(seteazaReel(ciorna.reels.items, i, 'poster', e.target.value))
                          }
                        />
                      )}
                    </Camp>

                    <Camp eticheta="Textul de sub card">
                      {(p) => (
                        <input
                          {...p}
                          placeholder="Marți dimineața, Râșcani"
                          value={r.caption}
                          onChange={(e) =>
                            seteazaReels(
                              seteazaReel(ciorna.reels.items, i, 'caption', e.target.value)
                            )
                          }
                        />
                      )}
                    </Camp>
                  </div>
                  <div className="admin-reels-actiuni">
                    <button
                      type="button"
                      className="admin-btn-ghost"
                      disabled={ocupat || i === 0}
                      aria-label={`Mută clipul ${i + 1} mai devreme`}
                      onClick={() => seteazaReels(mutaReel(ciorna.reels.items, i, -1), true)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="admin-btn-ghost"
                      disabled={ocupat || i === ciorna.reels.items.length - 1}
                      aria-label={`Mută clipul ${i + 1} mai târziu`}
                      onClick={() => seteazaReels(mutaReel(ciorna.reels.items, i, 1), true)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="admin-btn-ghost"
                      disabled={ocupat}
                      aria-label={`Șterge clipul ${i + 1}`}
                      onClick={() => {
                        // Lista de dinainte, prinsă în închidere: ștergerea e
                        // stare locală de formular, deci undo-ul nu poate eșua
                        // — n-are cu cine să vorbească.
                        const inainte = ciorna.reels.items;
                        seteazaReels(stergeReel(inainte, i), true);
                        showToast({
                          kind: 'success',
                          msg: `Clipul ${i + 1} a fost șters din bandă.`,
                          undo: () => seteazaReels(inainte, true),
                        });
                      }}
                    >
                      Șterge
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className="admin-btn-ghost"
          disabled={ocupat || ciorna.reels.items.length >= MAX_REELS}
          onClick={() => seteazaReels(adaugaReel(ciorna.reels.items), true)}
        >
          + Adaugă clip
        </button>
      </div>
    </Grup>
  );
};
