import { useCallback } from 'react';
import { useAdminResource } from '../../data/useAdminResource';
import adminStyles from '../../components/AdminStyles.module.css';
import shared from './SalaStyles.module.css';
import { incarcaVoturi, type VotSondaj } from './api';

const ora = new Intl.DateTimeFormat('ro-MD', {
  timeZone: 'Europe/Chisinau', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
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
  // The RPC returns taps in chronological order. Only a different choice is a change.
  const membri = new Map<string, VotSondaj[]>();
  for (const vot of date?.votes ?? []) {
    const voturi = membri.get(vot.member_id) ?? [];
    if (voturi.at(-1)?.response === vot.response) continue;
    voturi.push(vot);
    membri.set(vot.member_id, voturi);
  }
  const cronologii = [...membri.values()].sort((a, b) => b.length - a.length);
  const schimbari = cronologii.filter((voturi) => voturi.length > 1).length;
  return (
    <section className={adminStyles['admin-config-grup']} aria-label="Voturile din sondaj">
      <h3>Voturile din sondaj · {zi}</h3>
      {!date ? (
        <p role="status">{eroare ? 'Jurnalul voturilor nu a putut fi încărcat.' : 'Se încarcă voturile…'}</p>
      ) : membri.size === 0 ? (
        <p>Niciun vot Telegram înregistrat.</p>
      ) : (
        <>
          <p className={adminStyles['admin-config-hint']}>
            {date.posted_at
              ? `Primul sondaj înregistrat la ${ora.format(new Date(date.posted_at))} (ora Chișinăului).`
              : 'Ora publicării lipsește. Orele voturilor sunt afișate în fusul orar al Chișinăului.'}
          </p>
          <p>Au votat <strong>{membri.size}</strong> · Și-au schimbat votul <strong>{schimbari}</strong></p>
          <ul className={shared['admin-sala-lista']}>
            {cronologii.map((voturi) => (
              <li key={voturi[0].member_id} className={shared['admin-sala-rand']}>
                <strong>{voturi[0].name}</strong>
                <ol className={shared['admin-sala-lista']}>
                  {voturi.map((vot, i) => (
                    <li key={i}>
                      {i === 0 ? eticheta[vot.response] : `${eticheta[voturi[i - 1].response]} → ${eticheta[vot.response]}`}
                      {' · '}<time dateTime={vot.at}>{ora.format(new Date(vot.at))}</time>
                      {dupaSondaj(date.posted_at, vot.at)}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};
