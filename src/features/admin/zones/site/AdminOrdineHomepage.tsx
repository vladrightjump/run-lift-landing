import { useEffect, useState } from 'react';
import { setHomepageOrder } from './api';
import { loadPublicHomepage } from '../../../../shared/lib/homepagePublic';
import { useSesiuneAdmin } from '../../data/adminSession';
import { GrupRadio } from '../../../../shared/ui/GrupRadio';

type Ordine = 'antrenament' | 'proba';

const OPTIUNI: { valoare: Ordine; eticheta: string; descriere: string }[] = [
  {
    valoare: 'antrenament',
    eticheta: 'Antrenamentul săptămânii primul',
    descriere: 'Cardul „Până atunci" sub butoane, apoi „Primul tău antrenament cu noi".',
  },
  {
    valoare: 'proba',
    eticheta: 'Proba primul',
    descriere: '„Primul tău antrenament cu noi" sub butoane, apoi cardul antrenamentului.',
  },
];

/**
 * Ordinea de pe ecranul dintre ediții („Ne vedem curând").
 *
 * Tot o manetă, ca restul tabului: fiecare alegere pleacă imediat, fără „Aplică".
 * Valoarea afișată e mereu cea salvată — la un refuz alegerea revine, ca panoul
 * să nu pretindă o ordine pe care site-ul n-o arată.
 *
 * Citește prin aceeași funcție ca site-ul (`public_homepage`), deci ce vezi aici
 * e exact ce primește vizitatorul.
 */
export const AdminOrdineHomepage = () => {
  const { token, onAuthError, showToast } = useSesiuneAdmin();
  const [salvat, setSalvat] = useState<Ordine | null>(null);
  const [eroare, setEroare] = useState(false);
  const [trimite, setTrimite] = useState(false);

  useEffect(() => {
    const control = new AbortController();
    loadPublicHomepage(control.signal)
      .then((h) => setSalvat(h.trialFirst ? 'proba' : 'antrenament'))
      .catch(() => {
        if (!control.signal.aborted) setEroare(true);
      });
    return () => control.abort();
  }, []);

  const alege = async (nou: Ordine) => {
    if (nou === salvat || trimite) return;
    const vechi = salvat;
    setSalvat(nou);
    setTrimite(true);
    try {
      await setHomepageOrder(token, nou === 'proba');
      showToast({ kind: 'success', msg: 'Gata. Ecranul dintre ediții arată deja ordinea nouă.' });
    } catch (err) {
      setSalvat(vechi);
      if (!onAuthError(err)) showToast({ kind: 'error', msg: 'Nu am putut schimba ordinea. Încearcă din nou.' });
    } finally {
      setTrimite(false);
    }
  };

  return (
    <div className="admin-config-grup">
      <p className="admin-config-hint">
        Pe ecranul „Ne vedem curând", dintre ediții. Landing-ul unei ediții active nu se schimbă.
      </p>
      {eroare ? (
        <p className="admin-config-hint" role="status">
          Ordinea nu se poate citi acum. Verifică migrarea bazei de date și reîncarcă pagina.
        </p>
      ) : salvat === null ? (
        <p className="admin-config-hint" role="status">Se încarcă ordinea…</p>
      ) : (
        <GrupRadio
          eticheta="Ordinea pe ecranul dintre ediții"
          valoare={salvat}
          optiuni={OPTIUNI}
          onSchimba={(v) => void alege(v)}
          dezactivat={trimite}
        />
      )}
    </div>
  );
};
