import { useTrials } from './sala/useTrials';
import { trialNeedsAttention } from '../lib/trialApi';
import { useId } from 'react';
import type { EventConfig } from '../content/eventConfig';
import { trimiteComanda, marcheazaComandaVerificata } from '../lib/salaApi';
import { useNow } from '../hooks/useNow';
import {
  cardAntrenament,
  deRezolvat,
  evenimenteleSaptamanii,
  reperulUrmator,
  saptamana,
  aziLaChisinau,
  ultimulRaspuns,
  type CardAntrenament,
  type ElementDeRezolvat,
  type EvenimentZi,
  type TipEveniment,
  type ZiCuEvenimente,
} from './acum';
import { Icon, type NumeIcon } from './controale/Icon';
import { InelOcupare } from './controale/InelOcupare';
import { useEsteTelefon } from './controale/useEsteTelefon';
import { useNumarAnimat } from './controale/useNumarAnimat';
import { cereFiltruUrmatorul, type FiltruUrmatorul } from './sala/filtruUrmatorul';
import { RO_DOW } from './sala/sondaj';
import { useSala } from './sala/useSala';
import type { EcranAdmin, FazaSite, SemnaleAdmin } from './stareCurenta';

type Props = {
  semnale: SemnaleAdmin;
  faza: FazaSite;
  /** Configul publicat al ediției curente. */
  config: EventConfig;
  /** `null` cât timp lista de înscrieri n-a sosit. */
  inscrisi: number | null;
  asteptare: number | null;
  onEcran: (ecran: EcranAdmin) => void;
  onEditieNoua: () => void;
};

/** Scrise întregi, nu compuse: garda de clase le caută literal. */
const CLASA_EVENIMENT: Record<TipEveniment, string> = {
  trecut: 'admin-sapt-ev admin-sapt-ev--trecut',
  anulat: 'admin-sapt-ev admin-sapt-ev--trecut',
  sondaj: 'admin-sapt-ev admin-sapt-ev--sondaj',
  antrenament: 'admin-sapt-ev admin-sapt-ev--antrenament',
  termen: 'admin-sapt-ev admin-sapt-ev--termen',
  cursa: 'admin-sapt-ev admin-sapt-ev--cursa',
  anuntul: 'admin-sapt-ev admin-sapt-ev--anuntul',
};
const CLASA_PUNCT: Record<TipEveniment, string> = {
  trecut: 'admin-punct admin-punct--trecut',
  anulat: 'admin-punct admin-punct--trecut',
  sondaj: 'admin-punct admin-punct--sondaj',
  antrenament: 'admin-punct admin-punct--antrenament',
  termen: 'admin-punct admin-punct--termen',
  cursa: 'admin-punct admin-punct--cursa',
  anuntul: 'admin-punct admin-punct--sondaj',
};

const ziLunga = (iso: string) => {
  const [y, l, z] = iso.split('-').map(Number);
  return RO_DOW[new Date(Date.UTC(y, l - 1, z)).getUTCDay()];
};

/**
 * Acum (U8): ce urmează săptămâna asta și ce cere atenție, dintr-o privire.
 *
 * Desktop: săptămâna pe șapte coloane, dedesubt „De rezolvat", antrenamentul
 * următor și ediția. Telefon: săptămâna ca bandă, „De rezolvat",
 * antrenamentul și programul zilelor, unul sub altul.
 */
export const EcranAcum = ({ semnale, faza, config, inscrisi, asteptare, onEcran, onEditieNoua }: Props) => {
  const acum = new Date(useNow(30_000));
  const telefon = useEsteTelefon();
  const { date: sala, eroare, ocupat, fa } = useSala();
  const { date: trials } = useTrials();
  const idSapt = useId();
  const idRez = useId();

  const s = saptamana(sala?.azi ?? aziLaChisinau(acum));
  const zile = evenimenteleSaptamanii(s, sala, { config, inscrisi, asteptare }, acum);
  const lista = deRezolvat(semnale, faza, sala, acum);
  const trialAttention = trials ? trialNeedsAttention(trials) : 0;
  if (trialAttention) lista.push({ cheie: 'probe', titlu: `${trialAttention} de rezolvat la persoanele noi`, detaliu: 'Prezențe de confirmat, întrebări sau mesaje nelivrate.', urgent: true, actiune: { eticheta: 'Vezi persoanele', ecran: 'grup-probe' } });
  const viu = sala ? ultimulRaspuns(sala, acum) : null;

  const laEveniment = (e: EvenimentZi) => {
    if (!e.ecran) return;
    if (e.ecran === 'grup-prezente') cereFiltruUrmatorul('toti');
    onEcran(e.ecran);
  };
  const laFiltru = (f: FiltruUrmatorul) => {
    cereFiltruUrmatorul(f);
    onEcran('grup-prezente');
  };
  const laActiune = (el: ElementDeRezolvat) => {
    const a = el.actiune;
    if (!a || a.inAsteptare) return;
    if (a.reia) {
      const comanda = a.reia;
      void fa((t) => trimiteComanda(t, comanda), 'Comanda a plecat din nou spre bot.');
    } else if (a.ecran) {
      onEcran(a.ecran);
    }
  };

  const deRezolvatBloc = (
    <section className="admin-acum-bloc" aria-labelledby={idRez}>
      <h2 className="admin-acum-titlu" id={idRez}>
        De rezolvat
        {lista.length > 0 && <span className="admin-numar admin-numar--titlu">{lista.length}</span>}
      </h2>
      {lista.length === 0 ? (
        // Un panou care tace când totul e bine se citește ca „n-a apucat să
        // încarce". Spunem explicit că am verificat (R35).
        <p className="admin-inbox-gol">Nimic de rezolvat acum.</p>
      ) : (
        <ul className="admin-inbox">
          {lista.map((el) => (
            <li key={el.cheie} className="admin-inbox-rand">
              <span className={`admin-inbox-icon${el.urgent ? ' admin-inbox-icon--urgent' : ''}`}>
                <Icon nume={iconElement(el)} />
              </span>
              <div className="admin-inbox-text">
                <p className="admin-inbox-titlu">{el.titlu}</p>
                <p className="admin-inbox-detaliu">{el.detaliu}</p>
              </div>
              <div className="admin-inbox-actiuni">
                {el.actiune && (
                  <button
                    type="button"
                    className="admin-buton"
                    disabled={el.actiune.inAsteptare || (Boolean(el.actiune.reia) && ocupat)}
                    onClick={() => laActiune(el)}
                  >
                    {el.actiune.reia && ocupat ? 'Se reia…' : el.actiune.eticheta}
                  </button>
                )}
                {el.comandaDeVerificat && (
                  <button type="button" className="admin-btn-ghost" disabled={ocupat}
                    title="Ascunde avertizarea din De rezolvat. Istoricul și starea Telegram rămân neschimbate."
                    onClick={() => {
                      const id = el.comandaDeVerificat;
                      if (id) void fa((t) => marcheazaComandaVerificata(t, id), 'Marcat ca verificat. Rezultatul rămâne în jurnal.');
                    }}>
                    Marchează ca verificat
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const cardAntr = (
    <CardulAntrenamentului
      card={sala ? cardAntrenament(sala, acum) : null}
      eroare={eroare}
      onFiltru={laFiltru}
      onSetari={() => onEcran('grup-bot')}
    />
  );

  const cardEd = (
    <CardulEditiei
      config={config}
      inscrisi={inscrisi}
      asteptare={asteptare}
      acum={acum}
      faza={faza}
      onParticipanti={() => onEcran('participanti')}
      onEditieNoua={onEditieNoua}
    />
  );

  return (
    <div className="admin-acum">
      <p className="admin-acum-sub">
        Săptămâna {s.numar} · {s.interval}
        <span className="admin-viu">
          <span className="admin-viu-punct" aria-hidden="true" />
          Live
        </span>
      </p>

      {telefon ? (
        <>
          <ol className="admin-banda" aria-label={`Săptămâna ${s.numar}`}>
            {zile.map((z) => (
              <li key={z.data} className={`admin-banda-zi${z.azi ? ' admin-banda-zi--azi' : ''}`}>
                <span className="admin-banda-scurt">{z.scurt}</span>
                <span className="admin-banda-numar">{z.numar}</span>
                <span className="admin-banda-puncte" aria-hidden="true">
                  {z.evenimente.map((e) => (
                    <span key={e.cheie} className={CLASA_PUNCT[e.tip]} />
                  ))}
                </span>
                <span className="admin-vh">{descriereZi(z)}</span>
              </li>
            ))}
          </ol>
          {viu && (
            <p className="admin-acum-viu" aria-live="polite">
              {viu}
            </p>
          )}
          {deRezolvatBloc}
          {cardAntr}
          <section className="admin-acum-bloc" aria-labelledby={idSapt}>
            <h2 className="admin-acum-titlu" id={idSapt}>
              Programul săptămânii
            </h2>
            <ul className="admin-agenda">
              {zile.flatMap((z) =>
                z.evenimente.map((e) => (
                  <li key={e.cheie} className={`admin-agenda-rand${z.data < s.zile.find((x) => x.azi)!.data ? ' admin-agenda-rand--trecut' : ''}`}>
                    {e.ecran ? (
                      <button type="button" className="admin-agenda-buton" onClick={() => laEveniment(e)}>
                        <RandAgenda z={z} e={e} />
                        <Icon nume="dreapta" marime={18} />
                      </button>
                    ) : (
                      <div className="admin-agenda-buton">
                        <RandAgenda z={z} e={e} />
                      </div>
                    )}
                  </li>
                ))
              )}
            </ul>
          </section>
          {cardEd}
        </>
      ) : (
        <>
          <section className="admin-sapt" aria-labelledby={idSapt}>
            <div className="admin-sapt-cap">
              <h2 className="admin-acum-titlu" id={idSapt}>
                Săptămâna {s.numar}
              </h2>
              <span className="admin-sapt-interval">{s.interval}</span>
            </div>
            <ol className="admin-sapt-grila">
              {zile.map((z) => (
                <li key={z.data} className={`admin-sapt-zi${z.azi ? ' admin-sapt-zi--azi' : ''}`}>
                  <p className="admin-sapt-data">
                    <span className="admin-vh">{ziLunga(z.data)}, </span>
                    <span aria-hidden="true">{z.scurt}</span> <b>{z.numar}</b>
                    {z.azi && <span className="admin-sapt-azi">azi</span>}
                  </p>
                  {z.evenimente.map((e) =>
                    e.ecran ? (
                      <button key={e.cheie} type="button" className={CLASA_EVENIMENT[e.tip]} onClick={() => laEveniment(e)}>
                        <b>{e.titlu}</b>
                        <span>{e.detaliu}</span>
                      </button>
                    ) : (
                      <div key={e.cheie} className={CLASA_EVENIMENT[e.tip]}>
                        <b>{e.titlu}</b>
                        <span>{e.detaliu}</span>
                      </div>
                    )
                  )}
                </li>
              ))}
            </ol>
            {viu && (
              <p className="admin-acum-viu" aria-live="polite">
                {viu}
              </p>
            )}
          </section>
          <div className="admin-acum-coloane">
            {deRezolvatBloc}
            {cardAntr}
            {cardEd}
          </div>
        </>
      )}
    </div>
  );
};

const iconElement = (el: ElementDeRezolvat): NumeIcon =>
  el.cheie === 'nelivrate'
    ? 'mail'
    : el.cheie === 'bot' || el.cheie.startsWith('comanda-')
      ? 'bot'
      : el.cheie === 'asteptare'
        ? 'persoana'
        : 'atentie';

const descriereZi = (z: ZiCuEvenimente) =>
  `${ziLunga(z.data)} ${z.numar}${z.azi ? ', azi' : ''}${
    z.evenimente.length ? `: ${z.evenimente.map((e) => `${e.titlu}, ${e.detaliu}`).join('; ')}` : ''
  }`;

const RandAgenda = ({ z, e }: { z: ZiCuEvenimente; e: EvenimentZi }) => (
  <>
    <span className="admin-agenda-cand">
      <b>
        {z.scurt} {z.numar}
      </b>
    </span>
    <span className="admin-agenda-text">
      <span className="admin-agenda-titlu">{e.titlu}</span>
      <span className="admin-agenda-detaliu">{e.detaliu}</span>
    </span>
  </>
);

/** O cifră care se derulează când se schimbă, cu un mic salt la fiecare valoare nouă. */
const Cifra = ({ valoare, clasa }: { valoare: number; clasa?: string }) => {
  const afisat = useNumarAnimat(valoare);
  return (
    <b key={valoare} className={`admin-cifra admin-salt${clasa ? ` ${clasa}` : ''}`}>
      {afisat}
    </b>
  );
};

const CardulAntrenamentului = ({
  card,
  eroare,
  onFiltru,
  onSetari,
}: {
  card: CardAntrenament | null;
  /** Cererea a picat și n-avem nimic de arătat. */
  eroare: boolean;
  onFiltru: (f: FiltruUrmatorul) => void;
  onSetari: () => void;
}) => {
  const idTitlu = useId();
  if (!card && eroare) {
    // Un schelet care nu se mai termină s-ar citi ca „încă se încarcă" (R35).
    return (
      <section className="admin-acum-card" aria-labelledby={idTitlu}>
        <h2 className="admin-acum-titlu" id={idTitlu}>
          Antrenamentul următor
        </h2>
        <p className="admin-acum-card-text" role="status">
          Nu s-au putut încărca datele grupului. Se reîncearcă singur în câteva secunde.
        </p>
      </section>
    );
  }
  if (!card) {
    return (
      <section className="admin-acum-card" aria-busy="true" aria-label="Antrenamentul următor">
        <div className="admin-schelet admin-schelet--rand" />
        <div className="admin-schelet admin-schelet--bloc" />
      </section>
    );
  }
  if (card.stare === 'oprit' || card.stare === 'fara-orar') {
    const [titlu, detaliu] =
      card.stare === 'oprit'
        ? ['Botul e oprit', 'Sondajele programate nu pleacă până nu-l pornești.']
        : ['Niciun sondaj programat', 'Alege zilele sondajului în Setări bot.'];
    return (
      <section className="admin-acum-card" aria-labelledby={idTitlu}>
        <h2 className="admin-acum-titlu" id={idTitlu}>
          {titlu}
        </h2>
        <p className="admin-acum-card-text">{detaliu}</p>
        <button type="button" className="admin-link" onClick={onSetari}>
          Setări bot <Icon nume="dreapta" marime={16} />
        </button>
      </section>
    );
  }
  const titlu = `${ziLunga(card.data)}, ${card.ora}`;
  if (card.stare === 'asteapta-sondajul') {
    return (
      <section className="admin-acum-card" aria-labelledby={idTitlu}>
        <h2 className="admin-acum-titlu" id={idTitlu}>
          {titlu}
        </h2>
        {/* R37: încă nu e întrebat nimeni, deci nimeni nu e „fără răspuns". */}
        <p className="admin-acum-card-text">{card.fraza}</p>
        {card.loc && (
          <p className="admin-acum-card-loc">
            <Icon nume="loc" marime={16} /> {card.loc}
          </p>
        )}
      </section>
    );
  }
  const total = card.vin + card.nu + card.fara || 1;
  return (
    <section className="admin-acum-card" aria-labelledby={idTitlu}>
      <h2 className="admin-acum-titlu" id={idTitlu}>
        {titlu} · după sondaj
      </h2>
      <div
        className="admin-raport"
        role="img"
        aria-label={`${card.vin} vin, ${card.nu} nu pot, ${card.fara} fără răspuns`}
      >
        <span className="admin-raport-vin" style={{ flexGrow: card.vin / total }} />
        <span className="admin-raport-nu" style={{ flexGrow: card.nu / total }} />
        <span className="admin-raport-fara" style={{ flexGrow: card.fara / total }} />
      </div>
      <div className="admin-cifre-antr">
        <button type="button" className="admin-cifra-buton" onClick={() => onFiltru('vin')}>
          <Cifra valoare={card.vin} />
          <span>vin</span>
        </button>
        <button type="button" className="admin-cifra-buton" onClick={() => onFiltru('nu')}>
          <Cifra valoare={card.nu} />
          <span>nu pot</span>
        </button>
        <button type="button" className="admin-cifra-buton" onClick={() => onFiltru('fara')}>
          <Cifra valoare={card.fara} clasa={card.fara > 0 ? 'admin-cifra--atentie' : undefined} />
          <span>fără răspuns</span>
        </button>
      </div>
      <button type="button" className="admin-link" onClick={() => onFiltru('fara')}>
        Cine n-a răspuns <Icon nume="dreapta" marime={16} />
      </button>
    </section>
  );
};

const CardulEditiei = ({
  config,
  inscrisi,
  asteptare,
  acum,
  faza,
  onParticipanti,
  onEditieNoua,
}: {
  config: EventConfig;
  inscrisi: number | null;
  asteptare: number | null;
  acum: Date;
  faza: FazaSite;
  onParticipanti: () => void;
  onEditieNoua: () => void;
}) => {
  const idTitlu = useId();
  const reper = reperulUrmator(config, acum);
  const ziStart = config.start.slice(0, 10);
  if (faza === 'dupa-cursa' && !reper) {
    return (
      <section className="admin-acum-card" aria-labelledby={idTitlu}>
        <h2 className="admin-acum-titlu" id={idTitlu}>
          Ediția {config.number} s-a încheiat
        </h2>
        <p className="admin-acum-card-text">Nicio ediție nouă anunțată. Pornește-o când știi data.</p>
        <button type="button" className="admin-buton" onClick={onEditieNoua}>
          Pornește ediția următoare
        </button>
      </section>
    );
  }
  return (
    <section className="admin-acum-card" aria-labelledby={idTitlu}>
      <div className="admin-acum-editie">
        {inscrisi === null ? (
          <div className="admin-schelet admin-schelet--inel" />
        ) : (
          <InelOcupare ocupate={inscrisi} total={config.slots.total} />
        )}
        <div>
          <h2 className="admin-acum-titlu" id={idTitlu}>
            Ediția {config.number} · {ziLunga(ziStart).toLowerCase()}
          </h2>
          <p className="admin-acum-card-text">
            {inscrisi === null ? 'Se încarcă înscrierile…' : `${inscrisi} din ${config.slots.total} înscriși`}
            {asteptare ? ` · ${asteptare} în așteptare` : ''}
          </p>
          {reper && (
            <p className="admin-acum-card-text">
              {reper.eticheta} {reper.cand}
            </p>
          )}
        </div>
      </div>
      <button type="button" className="admin-link" onClick={onParticipanti}>
        Participanți <Icon nume="dreapta" marime={16} />
      </button>
    </section>
  );
};
