import { useState } from 'react';
import { retryTrialMessage, trialAttendance, trialReply, type TrialProspect } from '../../lib/trialApi';
import { ziLunaOra } from '../../lib/formatare';
import { Dialog } from '../eventTab/Dialog';
import { useTrials } from './useTrials';
import './probe.css';

const TRIAL_STAGE: Record<string, string> = {
  interested: 'Interesat', scheduled: 'Probă programată', awaiting_attendance: 'De confirmat',
  attended: 'A venit', absent: 'Nu a venit', invited: 'Invitat', in_group: 'În grup', closed: 'Închis', cancelled: 'Anulat',
};
const MESSAGE_KIND: Record<string, string> = { booking_confirmed: 'Confirmarea probei', organizer_booking: 'Rezervare nouă', reminder: 'Reminder', attendance_request: 'Confirmarea prezenței', cancelled: 'Anulare', organizer_cancelled: 'Anulare către organizator', continuation: 'Continuarea antrenamentelor', rebook: 'Reprogramare', invite: 'Invitație în grup', question: 'Întrebare', answer: 'Răspuns', session_changed: 'Program modificat' };
const MESSAGE_STATUS: Record<string, string> = { pending: 'În așteptare', processing: 'Se trimite', sent: 'Trimis', failed: 'Nelivrat', ambiguous: 'Livrare neconfirmată', cancelled: 'Anulat' };
const nameOf = (p: TrialProspect) => p.full_name || p.telegram_username || String(p.telegram_user_id);

export function EcranProbe() {
  const { date, eroare, busy, act, reincarca } = useTrials();
  const [filter, setFilter] = useState('all');
  const [selected, select] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [confirm, setConfirm] = useState<{ title: string; text: string; work: (token: string) => Promise<unknown> } | null>(null);
  if (!date) return <p role="status">{eroare ? 'Nu s-au putut încărca persoanele noi.' : 'Se încarcă…'} {eroare && <button className="admin-btn-ghost" onClick={() => void reincarca()}>Reîncearcă</button>}</p>;
  const people = date.prospects.filter(p => filter === 'all' || p.stage === filter);
  const person = date.prospects.find(p => p.id === selected);
  return <div className="admin-probe">
    <p className="admin-config-hint">Botul pregătește proba. Confirmi prezența; invitația în grup pleacă numai după răspunsul „Da” al persoanei privind continuarea.</p>
    <label className="admin-config-camp">Starea persoanei
      <select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Toate persoanele noi</option>{Object.entries(TRIAL_STAGE).filter(([key]) => key !== 'cancelled').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
    </label>
    <div className="admin-probe-layout">
      <div className="admin-probe-list">
        {people.length === 0 && <p>Nicio persoană în această categorie.</p>}
        {people.map(p => <button className={`admin-probe-person${selected === p.id ? ' activ' : ''}`} key={p.id} onClick={() => { select(p.id); setReply(''); }} aria-pressed={selected === p.id}>
          <strong>{nameOf(p)}</strong><span>{TRIAL_STAGE[p.stage] ?? p.stage}</span>
          <small>{p.telegram_username ? `@${p.telegram_username}` : `Telegram ${p.telegram_user_id}`}{!p.dm_enabled && ' · Mesaje oprite'}</small>
        </button>)}
      </div>
      <section className="admin-config-grup admin-probe-detail" aria-label="Detaliile persoanei">
        {!person ? <p>Alege o persoană pentru a vedea proba, întrebările și istoricul.</p> : <>
          <h3>{nameOf(person)}</h3><p className="admin-config-hint">{TRIAL_STAGE[person.stage] ?? person.stage} · Sursă: {person.source}</p>
          <h4>Antrenamente de probă</h4>
          {date.bookings.filter(b => b.prospect_id === person.id).map(b => <article className="admin-probe-item" key={b.id}>
            <strong>{ziLunaOra(b.session_start)}</strong><p>{b.session_location} · {TRIAL_STAGE[b.status] ?? b.status}</p>
            {b.status === 'attended' && <p>{b.continuation === 'yes' ? 'A confirmat că vrea să continue.' : b.continuation === 'no' ? 'Nu dorește să continue acum.' : 'Așteaptă răspunsul privind continuarea.'}</p>}
            {['awaiting_attendance', 'attended', 'absent'].includes(b.status) && <div className="admin-table-actions">
              {[true, false].map(attended => <button className="admin-btn-ghost" key={String(attended)} disabled={busy || (attended ? b.status === 'attended' : b.status === 'absent')} onClick={() => setConfirm({
                title: b.attendance_at ? 'Corectezi prezența?' : 'Confirmi prezența?',
                text: `${nameOf(person)} · ${ziLunaOra(b.session_start)}: ${attended ? 'a venit' : 'nu a venit'}. ${b.attendance_at ? 'Corecția rămâne în istoric.' : attended ? 'Botul va întreba dacă dorește să continue.' : 'Botul va oferi reprogramarea.'}`,
                work: token => trialAttendance(token, b.id, attended),
              })}>{attended ? 'A venit' : 'Nu a venit'}</button>)}
            </div>}
          </article>)}
          <h4>Întrebări</h4>
          {date.questions.filter(q => q.prospect_id === person.id).map(q => <article className="admin-probe-item" key={q.id}><p>{q.body}</p>
            {q.response && <p><strong>Răspuns {q.status === 'queued' ? '(în așteptare)' : ''}:</strong> {q.response}</p>}
            {q.status === 'open' && <><label className="admin-config-camp">Răspuns pentru {nameOf(person)}<textarea rows={3} maxLength={3000} value={reply} disabled={busy} onChange={e => setReply(e.target.value)} /></label>
              <button className="admin-btn-accent" disabled={busy || !reply.trim()} onClick={() => setConfirm({ title: `Trimiți răspunsul către ${nameOf(person)}?`, text: reply.trim(), work: token => trialReply(token, q.id, reply.trim()) })}>Previzualizează răspunsul</button></>}
          </article>)}
          <h4>Istoricul mesajelor</h4>
          {date.messages.filter(m => m.prospect_id === person.id).map(m => <article className="admin-probe-item" key={m.id}>
            <p>{MESSAGE_KIND[m.kind] ?? m.kind} · {MESSAGE_STATUS[m.status] ?? m.status} · {ziLunaOra(m.created_at)}</p>{m.result && <p className="admin-config-hint">{m.result}</p>}
            {['failed', 'ambiguous'].includes(m.status) && <button className="admin-btn-ghost" disabled={busy} onClick={() => setConfirm({ title: 'Reîncerci trimiterea?', text: m.status === 'ambiguous' ? 'Telegram nu a confirmat rezultatul. Mesajul poate să fi ajuns deja; reîncercarea îl poate dubla.' : 'Botul va verifica dacă mesajul mai este relevant înainte să îl trimită.', work: token => retryTrialMessage(token, m.id) })}>Reîncearcă mesajul</button>}
          </article>)}
        </>}
      </section>
    </div>
    {confirm && <Dialog titlu={confirm.title} rol="alertdialog" onInchide={() => !busy && setConfirm(null)}><p className="admin-probe-preview">{confirm.text}</p><div className="admin-table-actions"><button className="admin-btn-ghost" disabled={busy} onClick={() => setConfirm(null)}>Renunță</button><button className="admin-btn-accent" disabled={busy} onClick={() => void act(confirm.work, 'Acțiunea a fost salvată.').then(ok => { if (ok) { setConfirm(null); setReply(''); } })}>Confirmă</button></div></Dialog>}
  </div>;
}
