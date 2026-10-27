import { useRef, useState } from 'react';
import { importaProgram } from '../data/api';
import { citesteDocumentImport } from '../data/importProgram';
import type { DocumentImport } from '../data/importProgram';
import { useMutatieProgramare } from '../data/queries';
import { useSesiuneProgramare } from '../data/sesiune';
import styles from '../styles/Programe.module.css';

export const ImportProgram = () => {
  const [document, setDocument] = useState<DocumentImport | null>(null);
  const [eroare, setEroare] = useState('');
  const [mesaj, setMesaj] = useState('');
  const [citeste, setCiteste] = useState(false);
  const numarCitire = useRef(0);
  const fisierRef = useRef<HTMLInputElement>(null);
  const mutatie = useMutatieProgramare(importaProgram);
  const { onAuthError } = useSesiuneProgramare();

  const alege = (fisier?: File) => {
    const citire = ++numarCitire.current;
    setDocument(null); setEroare(''); setMesaj(''); setCiteste(false);
    if (!fisier) return;
    setCiteste(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (citire !== numarCitire.current) return;
      setCiteste(false);
      try { setDocument(citesteDocumentImport(String(reader.result))); }
      catch (err) { setEroare(err instanceof Error ? err.message : 'Fișier de import invalid.'); }
    };
    reader.onerror = () => {
      if (citire === numarCitire.current) { setCiteste(false); setEroare('Nu am putut citi fișierul. Alege-l din nou.'); }
    };
    reader.readAsText(fisier);
  };

  const confirma = async () => {
    if (!document || mutatie.isPending) return;
    setEroare(''); setMesaj('');
    try {
      await mutatie.mutateAsync([document]);
      setDocument(null);
      if (fisierRef.current) fisierRef.current.value = '';
      setMesaj('Import încheiat. Reimportul actualizează același program.');
    } catch (err) {
      if (!onAuthError(err)) setEroare('Importul nu a reușit. Poți încerca din nou.');
    }
  };

  return <section className={styles.panel} aria-labelledby="import-program-titlu">
    <h2 id="import-program-titlu">Importă un program</h2>
    <p className={styles.muted}>Alege fișierul JSON generat de importatorul WodUp. Vei verifica rezumatul înainte de import.</p>
    <label className={styles.camp}>Fișier JSON de import
      <input ref={fisierRef} type="file" accept=".json,application/json" disabled={mutatie.isPending} onChange={e => alege(e.target.files?.[0])} />
    </label>
    {citeste && <p role="status">Citim fișierul…</p>}
    {eroare && <p className={styles.eroare} role="alert">{eroare}</p>}
    {mesaj && <p role="status">{mesaj}</p>}
    {document && <div className={styles.rezumat}>
      <strong>{document.program.nume}</strong>
      <p>{document.program.saptamani} săptămâni · {document.zile.length} zile · {document.miscari.length} mișcări</p>
      <p className={styles.muted}>Sursa: {document.program.sursa}. Dacă programul există deja, conținutul lui va fi actualizat.</p>
      <button className={styles.principal} disabled={mutatie.isPending} onClick={() => void confirma()}>{mutatie.isPending ? 'Importăm…' : 'Confirmă importul'}</button>
    </div>}
  </section>;
};
