import { TRIAL_COPY, type TrialCopyKey } from '../../../bot/src/lib/trial-copy';
import { useEffect, useState } from 'react';
import { saveTrialConfig, type TrialConfig } from '../../lib/trialApi';
import { trialLink } from '../../lib/trialPublic';
import { useTrials } from './useTrials';
import './probe.css';

const TEXT_FIELDS = [
  ['bot_username', 'Username-ul botului'], ['welcome_text', 'Mesaj de bun venit'],
  ['trial_conditions', 'Condițiile antrenamentului de probă'], ['trial_price', 'Costul probei'],
  ['bring_text', 'Ce trebuie să aducă'], ['continuation_conditions', 'Condițiile continuării'],
  ['contact_text', 'Contact / mesaj când fluxul este oprit'],
] as const;
export function TrialSettings({ onDirty }: { onDirty?: (dirty: boolean) => void }) {
  const { date, eroare, busy, act } = useTrials();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const [draft, setDraft] = useState<TrialConfig | null>(null);
  const [messageKey, setMessageKey] = useState<TrialCopyKey>('booking_confirmed');
  const [copied, setCopied] = useState(false);
  const form = draft ?? date?.config;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(date?.config);
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  if (!form || !date) return <p className="admin-config-hint" role="status">{eroare ? 'Configurarea probelor nu este disponibilă. Verifică migrarea bazei de date și reîncarcă pagina.' : 'Se încarcă setările probelor…'}</p>;
  const set = <K extends keyof TrialConfig>(key: K, value: TrialConfig[K]) => setDraft({ ...form, [key]: value });
  const link = trialLink(form.bot_username, 'share');
  const incomplete = TEXT_FIELDS.some(([key]) => !form[key]?.trim()) || !link || !form.organizer_telegram_id || !Number.isInteger(form.duration_minutes) || form.duration_minutes < 15 || form.duration_minutes > 480;
  const invalidMessages = Object.values(form.message_texts ?? {}).some(text => !text.trim() || text.length > 1500);
  const verified = !!date.config.permissions_verified_at && now - Date.parse(date.config.permissions_verified_at) < 24 * 3600_000;
  return <section className="admin-config-grup admin-probe-settings" aria-labelledby="trial-settings-title">
    <h3 id="trial-settings-title">Antrenamente de probă</h3>
    <p className="admin-config-hint">Persoana alege din programul botului. După probă confirmi prezența, apoi botul cere acordul pentru continuare și trimite invitația în grup.</p>
    <form className="admin-config-form" onSubmit={e => { e.preventDefault(); const sent = draft; void act(t => saveTrialConfig(t, form), 'Setările probei sunt salvate.').then(ok => { if (ok) setDraft(d => d === sent ? null : d); }); }}>
      <fieldset disabled={busy} className="admin-probe-fields">
        {TEXT_FIELDS.map(([key, label]) => <label className="admin-config-camp" key={key}>{label}{key === 'bot_username' || key === 'trial_price'
          ? <input value={form[key] ?? ''} maxLength={key === 'bot_username' ? 32 : 200} onChange={e => set(key, e.target.value)} />
          : <textarea value={form[key] ?? ''} rows={3} maxLength={1500} onChange={e => set(key, e.target.value)} />}</label>)}
        <fieldset className="admin-probe-copy" disabled={date.config.message_texts === undefined}>
          <legend>Mesajele fluxului</legend>
          {date.config.message_texts === undefined && <p className="admin-config-hint" role="status">Editorul va fi disponibil după actualizarea bazei de date pentru mesajele personalizate.</p>}
          <p className="admin-config-hint">Editează textul mesajelor viitoare. Mesajele deja trimise rămân în istoric. Datele rezervării, condițiile, linkul și butoanele sunt adăugate automat de bot. Scrie text simplu, fără variabile sau HTML.</p>
          <label className="admin-config-camp">Mesaj de editat<select value={messageKey} onChange={e => setMessageKey(e.target.value as TrialCopyKey)}>{Object.entries(TRIAL_COPY).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label>
          <label className="admin-config-camp">Textul mesajului de probă<textarea aria-label="Textul mesajului de probă" rows={5} maxLength={1500} value={form.message_texts?.[messageKey] ?? TRIAL_COPY[messageKey].text} onChange={e => set('message_texts', { ...form.message_texts, [messageKey]: e.target.value })} /></label>
          <p className="admin-config-hint">{TRIAL_COPY[messageKey].context}</p>
          <button type="button" className="admin-btn-ghost" disabled={!Object.hasOwn(form.message_texts ?? {}, messageKey)} onClick={() => { const messages = { ...form.message_texts }; delete messages[messageKey]; set('message_texts', messages); }}>Restabilește mesajul implicit</button>
          <div className="admin-probe-preview" aria-label="Previzualizarea textului"><p>{form.message_texts?.[messageKey] ?? TRIAL_COPY[messageKey].text}</p><small>{TRIAL_COPY[messageKey].context}</small></div>
        </fieldset>
        <label className="admin-config-camp">Durata antrenamentului (minute)<input type="number" min={15} max={480} value={form.duration_minutes} onChange={e => set('duration_minutes', Number(e.target.value))} /></label>
        <label className="admin-config-camp">Organizatorul care primește notificările<select value={form.organizer_telegram_id ?? ''} onChange={e => set('organizer_telegram_id', e.target.value ? Number(e.target.value) : null)}><option value="">Alege organizatorul</option>{date.organizers.map(o => <option key={o.id} value={o.telegram_user_id}>{o.full_name}</option>)}</select></label>
        <label className="admin-sala-bifa"><input type="checkbox" checked={form.enabled} disabled={!form.enabled && (incomplete || !verified)} onChange={e => set('enabled', e.target.checked)} /> Activează înscrierile la probă și butonul public</label>
      </fieldset>
      {!verified && <p className="admin-config-hint">Botul trebuie să verifice dreptul de invitare și organizatorul înainte de activare. Salvează configurația, pornește botul și așteaptă verificarea automată.</p>}
      {invalidMessages && <p className="admin-config-hint" role="alert">Completează textul mesajului sau restabilește mesajul implicit.</p>}
      {incomplete && <p className="admin-config-hint">Completează toate informațiile și un username valid înainte de activare. Costul nu este presupus gratuit.</p>}
      <div className="admin-table-actions"><button type="button" className="admin-btn-ghost" disabled={busy || !dirty} onClick={() => setDraft(null)}>Renunță la modificări</button><button className="admin-btn-accent" disabled={busy || !dirty || invalidMessages || (form.enabled && incomplete)}>Salvează setările probei</button></div>
    </form>
    <details><summary>Previzualizarea mesajului</summary><div className="admin-probe-preview"><p>{form.welcome_text}</p><p>{form.trial_conditions}</p><p>Cost: {form.trial_price}</p><p>{form.bring_text}</p><p>Programul și locația apar după alegerea zilei.</p><p>După probă: {form.continuation_conditions}</p></div></details>
    {link && date.config.enabled && !dirty && <div className="admin-probe-share"><label className="admin-config-camp">Link de distribuit<input readOnly value={link} /></label><button className="admin-btn-ghost" onClick={() => { void navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false)); }}>Copiază linkul</button>{copied && <span role="status">Copiat.</span>}</div>}
  </section>;
}
