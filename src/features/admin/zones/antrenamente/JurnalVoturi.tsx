import { useCallback } from 'react';
import { useAdminResource } from '../../data/useAdminResource';
import adminStyles from '../../components/AdminStyles.module.css';
import styles from './JurnalVoturi.module.css';
import { FUS } from '../../../../shared/lib/formatare';
import { incarcaVoturi, type VotSondaj } from './api';

const ora = new Intl.DateTimeFormat('ro-MD', {
  timeZone: FUS, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});
const eticheta = { yes: 'Vin', no: 'Nu vin' };

function dupaSondaj(start: string | null, vot: string) {
  if (!start) return '';
  const secunde = Math.round((Date.parse(vot) - Date.parse(start)) / 1000);
  if (secunde < 0) return '';
  if (secunde < 60) return ' · sub un minut de la sondaj';
  const minute = Math.floor(secunde / 60);
  const durata = minute < 60 ? `${minute} min` : `${Math.floor(minute / 60)} h ${minute % 60} min`;
  return ` · după ${durata}`;
}

export const JurnalVoturi = ({ sesiune, zi }: { sesiune: string; zi: string }) => {
  const incarca = useCallback((token: string, signal: AbortSignal) => incarcaVoturi(token, sesiune, signal), [sesiune]);
  const { date, eroare } = useAdminResource(incarca, undefined, { queryKey: ['antrenamente', 'voturi', sesiune] });
  // SQL orders events by timestamp and log ID, including ties.
  const ultimulRaspuns = new Map<string, VotSondaj['response']>();
  const razganditi = new Set<string>();
  const cronologie: { vot: VotSondaj; anterior?: VotSondaj['response'] }[] = [];
  for (const vot of date?.votes ?? []) {
    const anterior = ultimulRaspuns.get(vot.member_id);
    if (anterior === vot.response) continue;
    if (anterior) razganditi.add(vot.member_id);
    cronologie.push({ vot, anterior });
    ultimulRaspuns.set(vot.member_id, vot.response);
  }
  return (
    <section className={adminStyles['admin-config-grup']} aria-label="Cronologia voturilor">
      <h3>Cronologia voturilor · {zi}</h3>
      {!date ? (
        <p role="status">{eroare ? 'Jurnalul voturilor nu a putut fi încărcat.' : 'Se încarcă voturile…'}</p>
      ) : cronologie.length === 0 ? (
        <p>Niciun vot Telegram înregistrat.</p>
      ) : (
        <>
          <p className={adminStyles['admin-config-hint']}>
            {date.posted_at
              ? `Primul sondaj înregistrat la ${ora.format(new Date(date.posted_at))} (ora Chișinăului).`
              : 'Ora publicării lipsește. Orele voturilor sunt afișate în fusul orar al Chișinăului.'}
          </p>
          <p>Au votat <strong>{ultimulRaspuns.size}</strong> · Și-au schimbat votul <strong>{razganditi.size}</strong></p>
          <ol className={styles.cronologie} aria-label="Voturi în ordine cronologică">
            {cronologie.map(({ vot, anterior }, index) => (
              <li key={index}>
                <time dateTime={vot.at}>{ora.format(new Date(vot.at))}</time>
                <div>
                  <strong>{vot.name}</strong> · {anterior
                    ? `${eticheta[anterior]} → ${eticheta[vot.response]}`
                    : eticheta[vot.response]}
                  {dupaSondaj(date.posted_at, vot.at)}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
};
