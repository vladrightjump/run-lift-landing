import type { SalaMembru } from '../../lib/salaApi';
import { Dialog } from '../eventTab/Dialog';

type Props = {
  membru: SalaMembru;
  ocupat: boolean;
  onConfirma: () => void;
  onInchide: () => void;
};

/**
 * Scoaterea cuiva din grupul de Telegram, cu confirmare (R9, F2).
 *
 * Folosit și din „Membrii grupului", și din „Analiza prezențelor" — acolo se
 * vede de obicei cine s-a rărit. O singură implementare, ca cele două locuri să
 * nu spună lucruri diferite despre aceeași acțiune.
 */
export const DialogScoatere = ({ membru, ocupat, onConfirma, onInchide }: Props) => (
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

/** De ce nu se poate scoate cineva, sau `null` dacă se poate. */
export const motivFaraScoatere = (m: SalaMembru): string | null => {
  if (m.is_admin) return 'Adminii grupului nu se scot.';
  if (m.telegram_user_id == null) return 'N-are cont de Telegram legat.';
  if (m.status === 'cancelled') return 'E deja ieșit.';
  return null;
};
