/**
 * Run + Lift — Email confirmare înscriere
 * ---------------------------------------------------------------
 * Trimite automat un email de confirmare atunci când cineva se
 * înscrie prin Google Form-ul de la landing page. Emailul pleacă
 * din Gmail-ul contului care are Form-ul (adică al tău).
 *
 * INSTALARE (o dată):
 *  1. Deschide Google Form-ul tău.
 *  2. Sus dreapta ⋮ → "Script editor" (se deschide Apps Script).
 *  3. Șterge tot ce e în Code.gs și lipește conținutul acestui fișier.
 *  4. Modifică CONFIG mai jos (subiect, adresă reply-to etc.).
 *  5. Click ⚙ (Project Settings) → asigură-te că "Show appsscript.json
 *     manifest file in editor" e bifat (opțional).
 *  6. Click 🕒 Triggers (stânga) → "+ Add Trigger":
 *       - Function to run:            onFormSubmit
 *       - Event source:               From form
 *       - Event type:                 On form submit
 *     Save. Google îți cere autorizare — accept-o (contul tău).
 *  7. Testează completând Form-ul cu email-ul tău. Ar trebui să
 *     primești confirmarea în ~30s.
 * ---------------------------------------------------------------
 */

const CONFIG = {
  // Rubricile din Google Form — trebuie să se potrivească EXACT cu
  // titlurile întrebărilor din Form (case-sensitive).
  fieldTitles: {
    nume:    'Nume complet',
    telefon: 'Telefon',
    email:   'Email',
    echipa:  'Nume echipă / partener',
    acord:   'Acord medical'
  },

  // Setări email
  subject:   'Ești înscris(ă) la Run + Lift · 11 iulie 2026',
  fromName:  'Run + Lift',
  replyTo:   'contact@runlift.md',   // înlocuiește cu emailul tău real
  bccMe:     ''                       // opțional: primești și tu o copie ('' = fără)
};

/**
 * Handler apelat automat la fiecare submit de Google Form.
 * @param {GoogleAppsScript.Events.FormsOnFormSubmit} e
 */
function onFormSubmit(e) {
  const responses = e.response.getItemResponses();
  const data = {};
  responses.forEach(r => { data[r.getItem().getTitle()] = r.getResponse(); });

  const nume    = data[CONFIG.fieldTitles.nume]    || '';
  const email   = data[CONFIG.fieldTitles.email]   || '';
  const telefon = data[CONFIG.fieldTitles.telefon] || '';
  const echipa  = data[CONFIG.fieldTitles.echipa]  || '';

  if (!email) {
    console.warn('Lipsește emailul — nu trimit confirmare.', data);
    return;
  }

  const firstName = String(nume).trim().split(/\s+/)[0] || 'atlet';

  const htmlBody = buildEmailHtml({ firstName, nume, telefon, email, echipa });
  const plainBody = buildEmailPlain({ firstName, nume, telefon, email, echipa });

  const options = {
    name:     CONFIG.fromName,
    replyTo:  CONFIG.replyTo,
    htmlBody: htmlBody
  };
  if (CONFIG.bccMe) options.bcc = CONFIG.bccMe;

  MailApp.sendEmail(email, CONFIG.subject, plainBody, options);
}

function buildEmailHtml(d) {
  return `
<!DOCTYPE html>
<html lang="ro"><body style="margin:0;padding:0;background:#121410;font-family:Arial,Helvetica,sans-serif;color:#F1EFE6">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#121410">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#1A1D17;border:1px solid #2A2E25">
        <tr><td style="padding:32px 32px 8px">
          <div style="display:inline-block;background:#C9F24B;color:#121410;font-weight:900;font-size:16px;padding:6px 10px;letter-spacing:1px">RL</div>
          <div style="font-size:12px;letter-spacing:2px;color:#9BA08F;margin-top:16px;text-transform:uppercase">Run + Lift · 11 iulie 2026</div>
          <h1 style="margin:8px 0 0;font-size:32px;line-height:1.1;text-transform:uppercase;letter-spacing:0.5px">Ești pe listă, ${escapeHtml(d.firstName)}!</h1>
        </td></tr>
        <tr><td style="padding:16px 32px 8px;color:#C9CCBE;font-size:16px;line-height:1.55">
          Confirmăm înscrierea ta la <b>Run + Lift</b>. Ne vedem sâmbătă, <b>11 iulie 2026, ora 6:30</b>, la <b>Stadionul Dinamo, Chișinău</b>.
        </td></tr>
        <tr><td style="padding:16px 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #2A2E25">
            <tr><td style="padding:12px 16px;border-bottom:1px solid #2A2E25;color:#9BA08F;font-size:12px;letter-spacing:2px;text-transform:uppercase">Nume</td>
                <td style="padding:12px 16px;border-bottom:1px solid #2A2E25;text-align:right;font-weight:600">${escapeHtml(d.nume)}</td></tr>
            <tr><td style="padding:12px 16px;border-bottom:1px solid #2A2E25;color:#9BA08F;font-size:12px;letter-spacing:2px;text-transform:uppercase">Telefon</td>
                <td style="padding:12px 16px;border-bottom:1px solid #2A2E25;text-align:right;font-weight:600">${escapeHtml(d.telefon)}</td></tr>
            <tr><td style="padding:12px 16px;${d.echipa ? 'border-bottom:1px solid #2A2E25;' : ''}color:#9BA08F;font-size:12px;letter-spacing:2px;text-transform:uppercase">Email</td>
                <td style="padding:12px 16px;${d.echipa ? 'border-bottom:1px solid #2A2E25;' : ''}text-align:right;font-weight:600">${escapeHtml(d.email)}</td></tr>
            ${d.echipa ? `
            <tr><td style="padding:12px 16px;color:#9BA08F;font-size:12px;letter-spacing:2px;text-transform:uppercase">Echipă</td>
                <td style="padding:12px 16px;text-align:right;font-weight:600">${escapeHtml(d.echipa)}</td></tr>` : ''}
          </table>
        </td></tr>
        <tr><td style="padding:8px 32px 24px;color:#9BA08F;font-size:14px;line-height:1.55">
          <p style="margin:0 0 12px"><b style="color:#C9F24B">Ce urmează:</b></p>
          <ul style="margin:0;padding-left:18px">
            <li>Vino cu 15 minute înainte pentru înregistrare.</li>
            <li>Adu apă, tricou de schimb și energie.</li>
            <li>Antrenorul îți alege echipamentul (halteră / kettlebell / gantere) la fața locului.</li>
          </ul>
        </td></tr>
        <tr><td style="padding:16px 32px 32px;border-top:1px solid #2A2E25;color:#5E6355;font-size:12px">
          Ai întrebări? Răspunde la acest email sau scrie-ne la <a href="mailto:${escapeHtml(CONFIG.replyTo)}" style="color:#C9F24B;text-decoration:none">${escapeHtml(CONFIG.replyTo)}</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function buildEmailPlain(d) {
  return [
    `Ești pe listă, ${d.firstName}!`,
    '',
    `Confirmăm înscrierea ta la Run + Lift.`,
    `Sâmbătă, 11 iulie 2026, ora 6:30 — Stadionul Dinamo, Chișinău.`,
    '',
    `Nume:    ${d.nume}`,
    `Telefon: ${d.telefon}`,
    `Email:   ${d.email}`,
    d.echipa ? `Echipă:  ${d.echipa}` : '',
    '',
    `Ce urmează:`,
    `• Vino cu 15 minute înainte pentru înregistrare.`,
    `• Adu apă, tricou de schimb și energie.`,
    `• Antrenorul îți alege echipamentul (halteră / kettlebell / gantere) la fața locului.`,
    '',
    `Ai întrebări? Răspunde la acest email sau scrie-ne la ${CONFIG.replyTo}.`,
    '',
    `— Run + Lift`
  ].filter(Boolean).join('\n');
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
