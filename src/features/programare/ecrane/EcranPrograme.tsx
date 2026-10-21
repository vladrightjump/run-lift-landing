import { useState } from 'react';
import type { FormEvent } from 'react';
import { atribuieProgram, incarcaProfil, incarcaProgram, incarcaPrograme, salveazaProfil } from '../data/api';
import { useMutatieProgramare, useResursaProgramare } from '../data/queries';
import { useSesiuneProgramare } from '../data/sesiune';
import type { NavigareProgramare, ProfilDeSalvat, ProfilSportiv, Program } from '../data/tipuri';
import { ImportProgram } from '../editor/ImportProgram';
import { dataCompleta } from '../lib/date';
import styles from '../styles/Programe.module.css';

const Profil = ({ profil }: { profil: ProfilSportiv | null }) => {
  const [date, setDate] = useState<ProfilDeSalvat>({ nume: profil?.nume ?? '', gen: profil?.gen ?? 'masculin', unitate_greutate: 'kg', unitate_distanta: 'm', telegram_id: profil?.telegram_id ?? null });
  const [mesaj, setMesaj] = useState('');
  const [eroare, setEroare] = useState('');
  const mutatie = useMutatieProgramare(salveazaProfil);
  const { onAuthError } = useSesiuneProgramare();
  const salveaza = async (e: FormEvent) => {
    e.preventDefault();
    if (!date.nume.trim() || date.telegram_id && !/^\d+$/.test(date.telegram_id)) return;
    setMesaj(''); setEroare('');
    try { await mutatie.mutateAsync([{ ...date, nume: date.nume.trim() }]); setMesaj('Profil salvat.'); }
    catch (err) { if (!onAuthError(err)) setEroare('Nu am putut salva profilul. Încearcă din nou.'); }
  };
  return <section className={styles.panel} aria-labelledby="profil-programare-titlu">
    <h2 id="profil-programare-titlu">Profilul tău de sportiv</h2>
    <p className={styles.muted}>Numele și genul aleg identitatea și țintele afișate în antrenamente.</p>
    <form onSubmit={e => void salveaza(e)} className={styles.formular}>
      <label className={styles.camp}>Nume afișat<input required value={date.nume} onChange={e => setDate({ ...date, nume: e.target.value })} /></label>
      <label className={styles.camp}>Gen<select value={date.gen} onChange={e => setDate({ ...date, gen: e.target.value as ProfilDeSalvat['gen'] })}><option value="masculin">Masculin</option><option value="feminin">Feminin</option></select></label>
      <label className={styles.camp}>Greutate<select value="kg" disabled><option value="kg">Kilograme (kg)</option></select></label>
      <label className={styles.camp}>Distanță<select value="m" disabled><option value="m">Metri (m)</option></select></label>
      <label className={`${styles.camp} ${styles.lat}`}>Id Telegram (opțional)<input inputMode="numeric" pattern="[0-9]+" aria-describedby="telegram-explicatie" value={date.telegram_id ?? ''} onChange={e => setDate({ ...date, telegram_id: e.target.value || null })} /></label>
      <p id="telegram-explicatie" className={`${styles.muted} ${styles.lat}`}>Id-ul numeric al contului tău Telegram, fără @. {!date.telegram_id ? 'Fără id Telegram, nu vei primi alerte.' : 'Va fi folosit pentru alertele din Telegram când acestea vor fi disponibile.'}</p>
      <div className={styles.lat}><button className={styles.principal} disabled={mutatie.isPending || !date.nume.trim()}>{mutatie.isPending ? 'Salvăm…' : 'Salvează profilul'}</button></div>
      {mesaj && <p className={styles.lat} role="status">{mesaj}</p>}
      {eroare && <p className={`${styles.lat} ${styles.eroare}`} role="alert">{eroare}</p>}
    </form>
  </section>;
};

const Sursa = ({ program }: { program: Program }) => <p className={styles.sursa}>{program.sursa === 'TTT / WodUp' ? 'Referință externă: TTT / WodUp' : `Sursa: ${program.sursa}`}</p>;

const DetaliuProgram = ({ id, profil, onNavigare }: { id: string; profil: ProfilSportiv | null | undefined; onNavigare: NavigareProgramare }) => {
  const { date: program, eroare, reincarca } = useResursaProgramare(['program', id], (t, signal) => incarcaProgram(t, id, signal));
  const [dataStart, setDataStart] = useState('');
  const [mesaj, setMesaj] = useState('');
  const [eroareScriere, setEroareScriere] = useState('');
  const mutatie = useMutatieProgramare(atribuieProgram);
  const { onAuthError } = useSesiuneProgramare();
  const atribuie = async (e: FormEvent) => {
    e.preventDefault(); if (!dataStart || mutatie.isPending) return;
    setMesaj(''); setEroareScriere('');
    try { await mutatie.mutateAsync([id, dataStart]); setMesaj('Program atribuit. Îl găsești în Azi și Calendar.'); }
    catch (err) { if (!onAuthError(err)) setEroareScriere('Nu am putut atribui programul. Încearcă din nou.'); }
  };
  return <div className={styles.ecran}>
    <button className={styles.secundar} onClick={() => onNavigare('prog-programe')}>← Toate programele</button>
    {eroare && <p role="alert">Nu am putut încărca programul. <button className={styles.secundar} onClick={() => void reincarca()}>Reîncearcă</button></p>}
    {!program && !eroare && <p role="status">Încărcăm programul…</p>}
    {program && <>
      <section className={styles.panel}>
        <Sursa program={program} /><h2 className={styles.titluProgram}>{program.nume}</h2>
        <p className={styles.descriere}>{program.descriere || 'Program fără descriere.'}</p>
        <p className={styles.muted}>{program.saptamani} săptămâni · {program.zile_pe_saptamana} zile pe săptămână</p>
      </section>
      <section className={styles.panel} aria-labelledby="atribuire-program-titlu">
        <h2 id="atribuire-program-titlu">Urmează programul</h2>
        {!profil && <p>Salvează mai întâi <button className={styles.legatura} onClick={() => onNavigare('prog-programe')}>profilul tău de sportiv</button>.</p>}
        {!program.publicat && <p>Programul trebuie publicat înainte de atribuire.</p>}
        {profil && program.publicat && <form className={styles.atribuire} onSubmit={e => void atribuie(e)}>
          <label className={styles.camp}>Data de start<input type="date" required value={dataStart} onChange={e => setDataStart(e.target.value)} /></label>
          <button className={styles.principal} disabled={!dataStart || mutatie.isPending}>{mutatie.isPending ? 'Atribuim…' : program.atribuiri.some(a => a.sportiv_id === profil.id) ? 'Începe din nou' : 'Atribuie-mi programul'}</button>
          <p className={styles.muted}>O pornire nouă creează o atribuire separată și păstrează istoricul.</p>
        </form>}
        {mesaj && <p role="status">{mesaj}</p>}{eroareScriere && <p role="alert" className={styles.eroare}>{eroareScriere}</p>}
      </section>
      <section className={styles.panel}><h2>Istoricul atribuirilor</h2>
        {!program.atribuiri.length ? <p className={styles.muted}>Nicio atribuire încă.</p> : <ul className={styles.istoric} aria-label="Istoricul atribuirilor">{program.atribuiri.map(a => <li key={a.id}><strong>{a.sportiv_nume}</strong><span>{dataCompleta(a.data_start)} — {dataCompleta(a.data_sfarsit)}</span></li>)}</ul>}
      </section>
    </>}
  </div>;
};

export const EcranPrograme = ({ parametri = [], onNavigare }: { parametri?: string[]; onNavigare: NavigareProgramare }) => {
  const { date: profil, eroare: eroareProfil, reincarca: reincarcaProfil } = useResursaProgramare(['profil'], incarcaProfil);
  const { date: programe, eroare, reincarca } = useResursaProgramare(['programe'], incarcaPrograme, !parametri[0]);
  if (parametri[0]) return <DetaliuProgram key={parametri[0]} id={parametri[0]} profil={profil} onNavigare={onNavigare} />;
  return <div className={styles.ecran}>
    {eroareProfil && <p role="alert">Nu am putut încărca profilul. <button className={styles.secundar} onClick={() => void reincarcaProfil()}>Reîncearcă</button></p>}
    {profil === undefined ? !eroareProfil && <p role="status">Încărcăm profilul…</p> : <Profil profil={profil} />}
    <section className={styles.panel} aria-labelledby="programe-lista-titlu"><h2 id="programe-lista-titlu">Programe disponibile</h2>
      {eroare && <p role="alert">Nu am putut încărca programele. <button className={styles.secundar} onClick={() => void reincarca()}>Reîncearcă</button></p>}
      {programe === undefined && !eroare && <p role="status">Încărcăm programele…</p>}
      {programe?.length === 0 && <p className={styles.muted}>Niciun program încă. Importă un fișier mai jos.</p>}
      {programe && <ul className={styles.lista}>{programe.map(p => <li key={p.id}>
        <button className={styles.numeProgram} onClick={() => onNavigare('prog-programe', [p.id])}>{p.nume}</button>
        <p className={styles.muted}>{p.saptamani} săptămâni · {p.zile_pe_saptamana} zile pe săptămână{!p.publicat && ' · Nepublicat'}</p><Sursa program={p} />
      </li>)}</ul>}
    </section>
    <ImportProgram />
  </div>;
};
