import { useState } from 'react';
import { scoateDinGrup, type SalaComanda, type SalaMembru } from '../../lib/salaApi';
import { Dialog } from '../eventTab/Dialog';

/**
 * Scoaterea cuiva din grupul de Telegram, cu confirmare (R9, F2).
 *
 * Folosită și din „Membrii grupului", și din „Analiza prezențelor" — acolo se
 * vede de obicei cine s-a rărit. O singură implementare (butonul, motivul pentru
 * care nu se poate, dialogul și apelul), ca cele două locuri să nu spună lucruri
 * diferite despre aceeași acțiune.
 */

type PropsDialog = {
  membru: SalaMembru;
  ocupat: boolean;
  onConfirma: () => void;
  onInchide: () => void;
};

const DialogScoatere = ({ membru, ocupat, onConfirma, onInchide }: PropsDialog) => (
  <Dialog titlu={`Îl scoți pe ${membru.full_name} din grup?`} rol="alertdialog" onInchide={onInchide}>
    <p>
      Botul îl scoate din grupul de Telegram în cel mult un minut, iar membrul trece pe
      „ieșit". Istoricul de prezențe rămâne. Dacă revine, îl poți adăuga înapoi în grup din
      Telegram și îl treci pe „activ" de aici.
    </p>
    <div className="admin-table-actions">
      <button type="button" className="admin-btn-ghost" onClick={onInchide}>
        Nu-l scoate
      </button>
      <button type="button" className="admin-btn-accent" disabled={ocupat} onClick={onConfirma}>
        Scoate din grup
      </button>
    </div>
  </Dialog>
);

/**
 * Ultima comandă de scoatere pentru fiecare membru (comenzile vin cea mai nouă
 * prima). Din `scoateri`, nu din ultimele 30 de `comenzi`: o scoatere eșuată
 * trebuie să rămână reîncercabilă oricâte comenzi au venit după ea.
 */
export const ultimeleScoateri = (comenzi: SalaComanda[]): Map<string, SalaComanda> => {
  const m = new Map<string, SalaComanda>();
  for (const c of comenzi) {
    if (c.action === 'kick_member' && c.member_id && !m.has(c.member_id)) m.set(c.member_id, c);
  }
  return m;
};

/**
 * De ce nu se poate scoate cineva, sau `null` dacă se poate.
 *
 * Serverul trece membrul pe „ieșit" încă de la cerere. Dacă Telegram refuză
 * apoi scoaterea (AE3), omul e tot în grup: „E deja ieșit" ar bloca exact
 * reîncercarea de care e nevoie.
 */
export const motivFaraScoatere = (m: SalaMembru, ultimaScoatere?: SalaComanda): string | null => {
  if (m.is_admin) return 'Adminii grupului nu se scot.';
  if (m.telegram_user_id == null) return 'N-are cont de Telegram legat.';
  if (m.status === 'cancelled' && ultimaScoatere?.status !== 'failed') return 'E deja ieșit.';
  return null;
};

type Props = {
  membru: SalaMembru;
  ultimaScoatere?: SalaComanda;
  ocupat: boolean;
  fa: (actiune: (token: string) => Promise<unknown>, reusit: string) => Promise<boolean>;
};

/** Butonul „Scoate din grup", cu dialogul lui. Dezactivat, își spune motivul. */
export const ScoateDinGrup = ({ membru: m, ultimaScoatere, ocupat, fa }: Props) => {
  const [deschis, setDeschis] = useState(false);
  const motiv = motivFaraScoatere(m, ultimaScoatere);
  const reincercare = m.status === 'cancelled' && motiv === null;
  return (
    <>
      <button
        type="button"
        className="admin-btn-ghost"
        disabled={ocupat || motiv !== null}
        title={motiv ?? undefined}
        aria-label={
          motiv
            ? `Scoate din grup: ${motiv}`
            : `${reincercare ? 'Reîncearcă scoaterea lui' : 'Scoate-l pe'} ${m.full_name} din grup`
        }
        onClick={() => setDeschis(true)}
      >
        {reincercare ? 'Reîncearcă scoaterea' : 'Scoate din grup'}
      </button>
      {deschis && (
        <DialogScoatere
          membru={m}
          ocupat={ocupat}
          onInchide={() => setDeschis(false)}
          onConfirma={() => {
            setDeschis(false);
            void fa((t) => scoateDinGrup(t, m.id), `${m.full_name} iese din grup în cel mult un minut.`);
          }}
        />
      )}
    </>
  );
};

/** Motivul vizibil de lângă rând; „E deja ieșit" nu are nevoie de explicație. */
export const MotivScoatere = ({ membru, ultimaScoatere }: { membru: SalaMembru; ultimaScoatere?: SalaComanda }) => {
  const motiv = motivFaraScoatere(membru, ultimaScoatere);
  return motiv && membru.status !== 'cancelled' ? <span className="admin-sala-motiv">{motiv}</span> : null;
};
