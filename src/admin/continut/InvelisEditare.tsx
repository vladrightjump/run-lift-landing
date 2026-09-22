import type { ReactNode } from 'react';

/**
 * Starea și verbele barei lipite jos.
 *
 * `null` înseamnă că nu e nimic deschis: fără document, verbele n-ar avea pe
 * ce lucra, iar o bară care oferă „Publică" fără ciornă e o promisiune goală.
 */
export type StareBara = {
  /** Ce anume editezi acum — „Ediția 5", „Săptămâna 12". */
  identitate: ReactNode;
  /** Al doilea rând al identității: data, legenda, ce lămurește. */
  detaliu?: ReactNode;
  nesalvat: boolean;
  /** Câmpurile care împiedică publicarea. Lungimea e ce se afișează. */
  probleme: string[];
  /** Sare la primul câmp stricat. Fără ea, numărul spune CÂTE, niciodată CARE. */
  onPrimaProblema?: () => void;
  /** Refuzul serverului de la ultima încercare. */
  refuz?: string | null;
  ocupat: boolean;
  poatePublica: boolean;
  /** Lipsește pe ecranele care n-au ce previzualiza. */
  onPreviz?: () => void;
  urlPreviz?: string;
  onSalveaza: () => void;
  onPublica: () => void;
  seSalveaza: boolean;
  sePublica: boolean;
};

type Props = {
  titlu: string;
  /** Ce editează ecranul, într-o propoziție. */
  descriere?: ReactNode;
  /** Acțiunile din cap: deschide, ciornă nouă, renunță. */
  actiuni?: ReactNode;
  /** Ce e publicat acum — rezumatul de deasupra editorului. */
  rezumat?: ReactNode;
  children: ReactNode;
  bara: StareBara | null;
};

/**
 * Învelișul comun al ecranelor de conținut: listă, editor, previzualizare,
 * publicare.
 *
 * Extras din ecranul „Evenimentul", nu scris de la zero. Acolo existau deja
 * ciorna, previzualizarea, validarea care blochează publicarea și garda de
 * ieșire; celelalte trei ecrane de conținut aveau fiecare câte o bucată sau
 * niciuna. Trei treburi asemănătoare cereau trei modele mentale.
 *
 * Nu generalizează CÂMPURILE. Seturile lor diferă ireductibil — o dată de
 * start, un link de YouTube, un bloc de text — iar o abstracție peste ele ar
 * fi fost mai proastă decât repetiția. Învelișul ține succesiunea și verbele.
 *
 * Verbele trăiesc DOAR în bara de jos. Aceleași butoane și sus, și jos, ar
 * însemna că la fiecare apăsare întrebi care set e cel „real".
 */
export const InvelisEditare = ({
  titlu,
  descriere,
  actiuni,
  rezumat,
  children,
  bara,
}: Props) => (
  <section className="admin-table-section">
    <div className="admin-table-head">
      <div className="admin-invelis-titlu">
        <h2>{titlu}</h2>
        {descriere && <p className="admin-config-hint">{descriere}</p>}
      </div>
      {actiuni && <div className="admin-table-actions">{actiuni}</div>}
    </div>

    {rezumat}

    {children}

    {/* Bara lipită jos.
        „Salvează" și „Publică" stăteau doar în capul ecranului, adică la două
        ecrane și jumătate deasupra locului în care editezi ultimul câmp. Ca să
        publici trebuia să derulezi înapoi, iar starea documentului nu se vedea
        deloc de jos. */}
    {bara && (
      <div className="admin-bara-actiuni" role="status">
        <span className="admin-bara-stare">
          {/* Problemele de validare au întâietate: ele dezactivează „Publică",
              deci un refuz vechi n-are ce concura cu ele. */}
          {bara.probleme.length > 0 ? (
            // Buton, nu text: numărul spunea CÂTE, niciodată CARE.
            <button
              type="button"
              className="admin-bara-problema admin-bara-problema--link"
              onClick={bara.onPrimaProblema}
            >
              {bara.probleme.length === 1
                ? '1 câmp de reparat'
                : `${bara.probleme.length} câmpuri de reparat`}
            </button>
          ) : bara.refuz ? (
            // `alert`, nu doar `status`: un refuz al serverului e o eroare, nu
            // o schimbare de stare pe care o afli când ajungi la ea.
            <span className="admin-bara-problema" role="alert">
              {bara.refuz}
            </span>
          ) : (
            <>
              {bara.identitate}
              {bara.detaliu && <span className="admin-bara-detaliu">{bara.detaliu}</span>}
              {/* După detaliu, nu în locul lui: „nesalvat" e o stare a
                  documentului, nu o problemă a lui. */}
              {bara.nesalvat && <span className="admin-bara-nesalvat">Nesalvat</span>}
            </>
          )}
        </span>

        <div className="admin-bara-butoane">
          {/* Cu diferențe nesalvate previzualizarea SCRIE întâi, deci e un
              buton; fără ele rămâne ce era, o ancoră — cu Cmd-click și click
              de mijloc cu tot. */}
          {bara.onPreviz &&
            bara.urlPreviz &&
            (bara.nesalvat ? (
              <button
                type="button"
                className="admin-btn-ghost"
                onClick={bara.onPreviz}
                // Aceeași gardă ca „Salvează": previzualizarea unui document pe
                // care serverul l-ar refuza n-are ce arăta.
                disabled={bara.ocupat || !bara.poatePublica}
              >
                {bara.seSalveaza ? 'Se salvează…' : 'Salvează și previzualizează'}
              </button>
            ) : (
              <a
                className="admin-btn-ghost"
                href={bara.urlPreviz}
                target="_blank"
                rel="noopener noreferrer"
              >
                Previzualizează
              </a>
            ))}

          <button
            type="button"
            className="admin-btn-ghost"
            onClick={bara.onSalveaza}
            // `sePublica` la fel de mult ca `seSalveaza`: publicarea salvează
            // ea însăși, deci un al doilea „Salvează" din zbor ar scrie peste.
            disabled={bara.ocupat || !bara.poatePublica}
          >
            {bara.seSalveaza ? 'Se salvează…' : 'Salvează'}
          </button>

          <button
            type="button"
            className="admin-btn-accent"
            onClick={bara.onPublica}
            disabled={bara.ocupat || !bara.poatePublica}
          >
            {bara.sePublica ? 'Se publică…' : 'Publică'}
          </button>
        </div>
      </div>
    )}
  </section>
);
