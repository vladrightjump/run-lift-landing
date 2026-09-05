import { isTimeoutError, isNetworkOrCspError } from '../lib/supabase';
import { COMUNICARI_EDITIE } from './deliveryLog';
import type { StareCelula } from './deliveryLog';
import type { AdminEvent } from '../lib/adminApi';

/**
 * Funcțiile pure din `AdminDashboard` — cele care nu ating nici starea, nici
 * DOM-ul, dar decideau ce scrie pe ecran.
 *
 * Erau prinse între randare și handlere, într-un fișier de 1100 de linii, deci
 * ca să testezi „ce scrie insigna când o comunicare lipsește" trebuia montat
 * tot backoffice-ul. Acum se cheamă direct.
 *
 * Vezi `tests/unit/dashboardRezumate.test.ts`.
 */

/**
 * Insigna din tabelul de participanți — cea mai PROASTĂ stare dintre comunicările
 * datorate, nu cea mai recentă trimitere. Un eșec rămâne vizibil chiar dacă altă
 * comunicare a plecat cu bine după el.
 */
export const rezumaAcoperire = (
  celule: Record<string, StareCelula>
): { clasa: string; eticheta: string; detaliu: string } => {
  const stari = COMUNICARI_EDITIE.map((c) => ({ com: c, stare: celule[c.cheie] ?? 'lipsa' }));
  const detaliu = stari.map(({ com, stare }) => `${com.eticheta}: ${STARE_TEXT[stare]}`).join(' · ');
  const esuate = stari.filter((s) => s.stare === 'esuat');
  if (esuate.length) {
    return {
      clasa: 'esuat',
      eticheta: `✕ ${esuate.map((s) => s.com.eticheta.toLowerCase()).join(', ')}`,
      detaliu,
    };
  }
  const lipsa = stari.filter((s) => s.stare === 'lipsa');
  if (lipsa.length === stari.length) return { clasa: 'niciunul', eticheta: '— niciunul', detaliu };
  if (lipsa.length) {
    return {
      clasa: 'partial',
      eticheta: `${stari.length - lipsa.length}/${stari.length}`,
      detaliu,
    };
  }
  return { clasa: 'trimis', eticheta: '✓ complet', detaliu };
};

/**
 * De ce n-a mers reversarea. Ambele cauze sunt reale și au apărut exact în
 * fereastra dintre ștergere și undo: locul poate fi luat de auto-promovare, iar
 * adresa poate fi re-înscrisă. Înainte, undo-ul trecea peste amândouă în tăcere.
 */
export const motivUndoEsuat = (err: unknown, nume: string): string => {
  // `SubmitHttpError.message` poartă corpul răspunsului, deci și numele excepției
  // ridicate de RPC (`event_full`, `duplicate_email`).
  const text = err instanceof Error ? err.message : String(err);
  if (text.includes('event_full')) {
    return `Locul lui ${nume} a fost ocupat între timp — ediția e plină. Șterge pe altcineva sau adaugă-l manual peste capacitate.`;
  }
  if (text.includes('duplicate_email')) {
    return `Adresa lui ${nume} a fost re-înscrisă între timp, deci nu se mai poate readuce rândul vechi.`;
  }
  if (isTimeoutError(err)) return 'Serverul răspunde greu. Verifică lista și încearcă din nou.';
  if (isNetworkOrCspError(err)) return 'Conexiune blocată sau indisponibilă. Reîncearcă.';
  return 'Nu am putut anula ștergerea.';
};

const STARE_TEXT: Record<StareCelula, string> = {
  trimis: 'trimis',
  esuat: 'eșuat',
  lipsa: 'lipsă',
};

/**
 * Ce intră în „Activitate recentă".
 *
 * `admin_events` e un jurnal de audit și primește și tipuri pe care feed-ul nu
 * le arată (`admin_delete`, `config_publish` — lucruri făcute chiar de cel care
 * se uită la feed). Aici rămân doar cele întâmplate FĂRĂ el: cineva a renunțat,
 * cineva a fost promovat automat, s-a deschis o ediție.
 */
const TIPURI_ACTIVITATE = ['renuntare', 'auto_promote', 'editie_noua'];

export const activitateVizibila = (e: AdminEvent): boolean => TIPURI_ACTIVITATE.includes(e.tip);
