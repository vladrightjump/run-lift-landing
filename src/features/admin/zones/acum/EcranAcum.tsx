import shared1 from '../../components/AdminStyles.module.css';
import styles from './EcranAcum.module.css';
import { useTrials } from '../../data/useTrials';
import { trialNeedsAttention } from '../../../../lib/trialApi';
import { useId } from 'react';
import type { EventConfig } from '../../../../shared/content/eventConfig';
import { trimiteComanda, marcheazaComandaVerificata } from '../../../../lib/salaApi';
import { useNow } from '../../../../shared/lib/useNow';
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
import { Icon, type NumeIcon } from '../../../../shared/ui/Icon';
import { InelOcupare } from './InelOcupare';
import { useEsteTelefon } from '../../../../shared/ui/useEsteTelefon';
import { useNumarAnimat } from './useNumarAnimat';
import { cereFiltruUrmatorul, type FiltruUrmatorul } from '../../../../admin/sala/filtruUrmatorul';
import { RO_DOW } from '../../../../admin/sala/sondaj';
import { useSala } from '../../data/useSala';
import type { EcranAdmin, FazaSite, SemnaleAdmin } from '../../../../admin/stareCurenta';

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

/**
 * Scrise întregi, nu compuse: garda de clase le caută literal. `CSS_*` țin
 * numele originale pentru `data-css`.
 */
const CLASA_EVENIMENT: Record<TipEveniment, string> = {
  trecut: styles['admin-sapt-ev'] + ' ' + styles['admin-sapt-ev--trecut'],
  anulat: styles['admin-sapt-ev'] + ' ' + styles['admin-sapt-ev--trecut'],
  sondaj: styles['admin-sapt-ev'] + ' ' + styles['admin-sapt-ev--sondaj'],
  antrenament: styles['admin-sapt-ev'] + ' ' + styles['admin-sapt-ev--antrenament'],
  termen: styles['admin-sapt-ev'] + ' ' + styles['admin-sapt-ev--termen'],
  cursa: styles['admin-sapt-ev'] + ' ' + styles['admin-sapt-ev--cursa'],
  anuntul: styles['admin-sapt-ev'] + ' ' + styles['admin-sapt-ev--anuntul'],
};
const CSS_EVENIMENT: Record<TipEveniment, string> = {
  trecut: 'admin-sapt-ev admin-sapt-ev--trecut',
  anulat: 'admin-sapt-ev admin-sapt-ev--trecut',
  sondaj: 'admin-sapt-ev admin-sapt-ev--sondaj',
  antrenament: 'admin-sapt-ev admin-sapt-ev--antrenament',
  termen: 'admin-sapt-ev admin-sapt-ev--termen',
  cursa: 'admin-sapt-ev admin-sapt-ev--cursa',
  anuntul: 'admin-sapt-ev admin-sapt-ev--anuntul',
};
// `admin-punct--trecut` n-are regulă: punctul trecut rămâne pe culoarea de bază.
const CLASA_PUNCT: Record<TipEveniment, string> = {
  trecut: styles['admin-punct'] + ' admin-punct--trecut',
  anulat: styles['admin-punct'] + ' admin-punct--trecut',
  sondaj: styles['admin-punct'] + ' ' + styles['admin-punct--sondaj'],
  antrenament: styles['admin-punct'] + ' ' + styles['admin-punct--antrenament'],
  termen: styles['admin-punct'] + ' ' + styles['admin-punct--termen'],
  cursa: styles['admin-punct'] + ' ' + styles['admin-punct--cursa'],
  anuntul: styles['admin-punct'] + ' ' + styles['admin-punct--sondaj'],
};
const CSS_PUNCT: Record<TipEveniment, string> = {
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
    <section className={styles['admin-acum-bloc']} data-css={"admin-acum-bloc"} aria-labelledby={idRez}>
      <h2 className={styles['admin-acum-titlu']} data-css={"admin-acum-titlu"} id={idRez}>
        De rezolvat
        {lista.length > 0 && <span className={shared1['admin-numar'] + ' ' + styles['admin-numar--titlu']} data-css={"admin-numar admin-numar--titlu"}>{lista.length}</span>}
      </h2>
      {lista.length === 0 ? (
        // Un panou care tace când totul e bine se citește ca „n-a apucat să
        // încarce". Spunem explicit că am verificat (R35).
        <p className={styles['admin-inbox-gol']} data-css={"admin-inbox-gol"}>Nimic de rezolvat acum.</p>
      ) : (
        <ul className={styles['admin-inbox']} data-css={"admin-inbox"}>
          {lista.map((el) => (
            <li key={el.cheie} className={styles['admin-inbox-rand']} data-css={"admin-inbox-rand"}>
              <span
                className={styles['admin-inbox-icon'] + (el.urgent ? ' ' + styles['admin-inbox-icon--urgent'] : '')}
                data-css={`admin-inbox-icon${el.urgent ? ' admin-inbox-icon--urgent' : ''}`}
              >
                <Icon nume={iconElement(el)} />
              </span>
              <div className={styles['admin-inbox-text']} data-css={"admin-inbox-text"}>
                <p className={styles['admin-inbox-titlu']} data-css={"admin-inbox-titlu"}>{el.titlu}</p>
                <p className={styles['admin-inbox-detaliu']} data-css={"admin-inbox-detaliu"}>{el.detaliu}</p>
              </div>
              <div className={styles['admin-inbox-actiuni']} data-css={"admin-inbox-actiuni"}>
                {el.actiune && (
                  <button
                    type="button"
                    className={styles['admin-buton']} data-css={"admin-buton"}
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
    <div className={styles['admin-acum']} data-css={"admin-acum"}>
      <p className={styles['admin-acum-sub']} data-css={"admin-acum-sub"}>
        Săptămâna {s.numar} · {s.interval}
        <span className={styles['admin-viu']} data-css={"admin-viu"}>
          <span className={styles['admin-viu-punct']} data-css={"admin-viu-punct"} aria-hidden="true" />
          Live
        </span>
      </p>

      {telefon ? (
        <>
          <ol className={styles['admin-banda']} data-css={"admin-banda"} aria-label={`Săptămâna ${s.numar}`}>
            {zile.map((z) => (
              <li
                key={z.data}
                className={styles['admin-banda-zi'] + (z.azi ? ' ' + styles['admin-banda-zi--azi'] : '')}
                data-css={`admin-banda-zi${z.azi ? ' admin-banda-zi--azi' : ''}`}
              >
                <span className={styles['admin-banda-scurt']} data-css={"admin-banda-scurt"}>{z.scurt}</span>
                <span className={styles['admin-banda-numar']} data-css={"admin-banda-numar"}>{z.numar}</span>
                <span className={styles['admin-banda-puncte']} data-css={"admin-banda-puncte"} aria-hidden="true">
                  {z.evenimente.map((e) => (
                    <span key={e.cheie} className={CLASA_PUNCT[e.tip]} data-css={CSS_PUNCT[e.tip]} />
                  ))}
                </span>
                <span className={styles['admin-vh']} data-css={"admin-vh"}>{descriereZi(z)}</span>
              </li>
            ))}
          </ol>
          {viu && (
            <p className={styles['admin-acum-viu']} data-css={"admin-acum-viu"} aria-live="polite">
              {viu}
            </p>
          )}
          {deRezolvatBloc}
          {cardAntr}
          <section className={styles['admin-acum-bloc']} data-css={"admin-acum-bloc"} aria-labelledby={idSapt}>
            <h2 className={styles['admin-acum-titlu']} data-css={"admin-acum-titlu"} id={idSapt}>
              Programul săptămânii
            </h2>
            <ul className={styles['admin-agenda']} data-css={"admin-agenda"}>
              {zile.flatMap((z) =>
                z.evenimente.map((e) => (
                  <li
                    key={e.cheie}
                    className={
                      styles['admin-agenda-rand'] +
                      (z.data < s.zile.find((x) => x.azi)!.data ? ' ' + styles['admin-agenda-rand--trecut'] : '')
                    }
                    data-css={`admin-agenda-rand${z.data < s.zile.find((x) => x.azi)!.data ? ' admin-agenda-rand--trecut' : ''}`}
                  >
                    {e.ecran ? (
                      <button type="button" className={styles['admin-agenda-buton']} data-css={"admin-agenda-buton"} onClick={() => laEveniment(e)}>
                        <RandAgenda z={z} e={e} />
                        <Icon nume="dreapta" marime={18} />
                      </button>
                    ) : (
                      <div className={styles['admin-agenda-buton']} data-css={"admin-agenda-buton"}>
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
          <section className={styles['admin-sapt']} data-css={"admin-sapt"} aria-labelledby={idSapt}>
            <div className={styles['admin-sapt-cap']} data-css={"admin-sapt-cap"}>
              <h2 className={styles['admin-acum-titlu']} data-css={"admin-acum-titlu"} id={idSapt}>
                Săptămâna {s.numar}
              </h2>
              <span className={styles['admin-sapt-interval']} data-css={"admin-sapt-interval"}>{s.interval}</span>
            </div>
            <ol className={styles['admin-sapt-grila']} data-css={"admin-sapt-grila"}>
              {zile.map((z) => (
                <li
                  key={z.data}
                  className={styles['admin-sapt-zi'] + (z.azi ? ' ' + styles['admin-sapt-zi--azi'] : '')}
                  data-css={`admin-sapt-zi${z.azi ? ' admin-sapt-zi--azi' : ''}`}
                >
                  <p className={styles['admin-sapt-data']} data-css={"admin-sapt-data"}>
                    <span className={styles['admin-vh']} data-css={"admin-vh"}>{ziLunga(z.data)}, </span>
                    <span aria-hidden="true">{z.scurt}</span> <b>{z.numar}</b>
                    {z.azi && <span className={styles['admin-sapt-azi']} data-css={"admin-sapt-azi"}>azi</span>}
                  </p>
                  {z.evenimente.map((e) =>
                    e.ecran ? (
                      <button
                        key={e.cheie}
                        type="button"
                        className={CLASA_EVENIMENT[e.tip]}
                        data-css={CSS_EVENIMENT[e.tip]}
                        onClick={() => laEveniment(e)}
                      >
                        <b>{e.titlu}</b>
                        <span>{e.detaliu}</span>
                      </button>
                    ) : (
                      <div key={e.cheie} className={CLASA_EVENIMENT[e.tip]} data-css={CSS_EVENIMENT[e.tip]}>
                        <b>{e.titlu}</b>
                        <span>{e.detaliu}</span>
                      </div>
                    )
                  )}
                </li>
              ))}
            </ol>
            {viu && (
              <p className={styles['admin-acum-viu']} data-css={"admin-acum-viu"} aria-live="polite">
                {viu}
              </p>
            )}
          </section>
          <div className={styles['admin-acum-coloane']} data-css={"admin-acum-coloane"}>
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
    <span className={styles['admin-agenda-cand']} data-css={"admin-agenda-cand"}>
      <b>
        {z.scurt} {z.numar}
      </b>
    </span>
    <span className={styles['admin-agenda-text']} data-css={"admin-agenda-text"}>
      <span className={styles['admin-agenda-titlu']} data-css={"admin-agenda-titlu"}>{e.titlu}</span>
      <span className={styles['admin-agenda-detaliu']} data-css={"admin-agenda-detaliu"}>{e.detaliu}</span>
    </span>
  </>
);

/** O cifră care se derulează când se schimbă, cu un mic salt la fiecare valoare nouă. */
const Cifra = ({ valoare, atentie }: { valoare: number; atentie?: boolean }) => {
  const afisat = useNumarAnimat(valoare);
  return (
    <b
      key={valoare}
      className={
        styles['admin-cifra'] + ' ' + styles['admin-salt'] + (atentie ? ' ' + styles['admin-cifra--atentie'] : '')
      }
      data-css={`admin-cifra admin-salt${atentie ? ' admin-cifra--atentie' : ''}`}
    >
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
      <section className={styles['admin-acum-card']} data-css={"admin-acum-card"} aria-labelledby={idTitlu}>
        <h2 className={styles['admin-acum-titlu']} data-css={"admin-acum-titlu"} id={idTitlu}>
          Antrenamentul următor
        </h2>
        <p className={styles['admin-acum-card-text']} data-css={"admin-acum-card-text"} role="status">
          Nu s-au putut încărca datele grupului. Se reîncearcă singur în câteva secunde.
        </p>
      </section>
    );
  }
  if (!card) {
    return (
      <section className={styles['admin-acum-card']} data-css={"admin-acum-card"} aria-busy="true" aria-label="Antrenamentul următor">
        <div className={styles['admin-schelet'] + ' ' + styles['admin-schelet--rand']} data-css={"admin-schelet admin-schelet--rand"} />
        <div className={styles['admin-schelet'] + ' ' + styles['admin-schelet--bloc']} data-css={"admin-schelet admin-schelet--bloc"} />
      </section>
    );
  }
  if (card.stare === 'oprit' || card.stare === 'fara-orar') {
    const [titlu, detaliu] =
      card.stare === 'oprit'
        ? ['Botul e oprit', 'Sondajele programate nu pleacă până nu-l pornești.']
        : ['Niciun sondaj programat', 'Alege zilele sondajului în Setări bot.'];
    return (
      <section className={styles['admin-acum-card']} data-css={"admin-acum-card"} aria-labelledby={idTitlu}>
        <h2 className={styles['admin-acum-titlu']} data-css={"admin-acum-titlu"} id={idTitlu}>
          {titlu}
        </h2>
        <p className={styles['admin-acum-card-text']} data-css={"admin-acum-card-text"}>{detaliu}</p>
        <button type="button" className={styles['admin-link']} data-css={"admin-link"} onClick={onSetari}>
          Setări bot <Icon nume="dreapta" marime={16} />
        </button>
      </section>
    );
  }
  const titlu = `${ziLunga(card.data)}, ${card.ora}`;
  if (card.stare === 'asteapta-sondajul') {
    return (
      <section className={styles['admin-acum-card']} data-css={"admin-acum-card"} aria-labelledby={idTitlu}>
        <h2 className={styles['admin-acum-titlu']} data-css={"admin-acum-titlu"} id={idTitlu}>
          {titlu}
        </h2>
        {/* R37: încă nu e întrebat nimeni, deci nimeni nu e „fără răspuns". */}
        <p className={styles['admin-acum-card-text']} data-css={"admin-acum-card-text"}>{card.fraza}</p>
        {card.loc && (
          <p className={styles['admin-acum-card-loc']} data-css={"admin-acum-card-loc"}>
            <Icon nume="loc" marime={16} /> {card.loc}
          </p>
        )}
      </section>
    );
  }
  const total = card.vin + card.nu + card.fara || 1;
  return (
    <section className={styles['admin-acum-card']} data-css={"admin-acum-card"} aria-labelledby={idTitlu}>
      <h2 className={styles['admin-acum-titlu']} data-css={"admin-acum-titlu"} id={idTitlu}>
        {titlu} · după sondaj
      </h2>
      <div
        className={styles['admin-raport']} data-css={"admin-raport"}
        role="img"
        aria-label={`${card.vin} vin, ${card.nu} nu pot, ${card.fara} fără răspuns`}
      >
        <span className={styles['admin-raport-vin']} data-css={"admin-raport-vin"} style={{ flexGrow: card.vin / total }} />
        <span className={styles['admin-raport-nu']} data-css={"admin-raport-nu"} style={{ flexGrow: card.nu / total }} />
        <span className={styles['admin-raport-fara']} data-css={"admin-raport-fara"} style={{ flexGrow: card.fara / total }} />
      </div>
      <div className={styles['admin-cifre-antr']} data-css={"admin-cifre-antr"}>
        <button type="button" className={styles['admin-cifra-buton']} data-css={"admin-cifra-buton"} onClick={() => onFiltru('vin')}>
          <Cifra valoare={card.vin} />
          <span>vin</span>
        </button>
        <button type="button" className={styles['admin-cifra-buton']} data-css={"admin-cifra-buton"} onClick={() => onFiltru('nu')}>
          <Cifra valoare={card.nu} />
          <span>nu pot</span>
        </button>
        <button type="button" className={styles['admin-cifra-buton']} data-css={"admin-cifra-buton"} onClick={() => onFiltru('fara')}>
          <Cifra valoare={card.fara} atentie={card.fara > 0} />
          <span>fără răspuns</span>
        </button>
      </div>
      <button type="button" className={styles['admin-link']} data-css={"admin-link"} onClick={() => onFiltru('fara')}>
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
      <section className={styles['admin-acum-card']} data-css={"admin-acum-card"} aria-labelledby={idTitlu}>
        <h2 className={styles['admin-acum-titlu']} data-css={"admin-acum-titlu"} id={idTitlu}>
          Ediția {config.number} s-a încheiat
        </h2>
        <p className={styles['admin-acum-card-text']} data-css={"admin-acum-card-text"}>Nicio ediție nouă anunțată. Pornește-o când știi data.</p>
        <button type="button" className={styles['admin-buton']} data-css={"admin-buton"} onClick={onEditieNoua}>
          Pornește ediția următoare
        </button>
      </section>
    );
  }
  return (
    <section className={styles['admin-acum-card']} data-css={"admin-acum-card"} aria-labelledby={idTitlu}>
      <div className={styles['admin-acum-editie']} data-css={"admin-acum-editie"}>
        {inscrisi === null ? (
          <div className={styles['admin-schelet'] + ' ' + styles['admin-schelet--inel']} data-css={"admin-schelet admin-schelet--inel"} />
        ) : (
          <InelOcupare ocupate={inscrisi} total={config.slots.total} />
        )}
        <div>
          <h2 className={styles['admin-acum-titlu']} data-css={"admin-acum-titlu"} id={idTitlu}>
            Ediția {config.number} · {ziLunga(ziStart).toLowerCase()}
          </h2>
          <p className={styles['admin-acum-card-text']} data-css={"admin-acum-card-text"}>
            {inscrisi === null ? 'Se încarcă înscrierile…' : `${inscrisi} din ${config.slots.total} înscriși`}
            {asteptare ? ` · ${asteptare} în așteptare` : ''}
          </p>
          {reper && (
            <p className={styles['admin-acum-card-text']} data-css={"admin-acum-card-text"}>
              {reper.eticheta} {reper.cand}
            </p>
          )}
        </div>
      </div>
      <button type="button" className={styles['admin-link']} data-css={"admin-link"} onClick={onParticipanti}>
        Participanți <Icon nume="dreapta" marime={16} />
      </button>
    </section>
  );
};
