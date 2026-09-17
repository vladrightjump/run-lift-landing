---
title: Valul 1 — ceasul reminderelor - Plan
type: feat
date: 2026-09-16
origin: docs/plans/2026-09-06-1604-feat-idei-produs-si-admin-plan.md
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: plan-continuation
execution: code
---

# Valul 1 — ceasul reminderelor

## Goal Capsule

- **Objective:** `maybe_send_reminder()` rulează singură la fiecare 15 minute, iar backoffice-ul nu mai afirmă despre niciun reminder că „pleacă" fără să existe urma lui în jurnalul de livrare.
- **Means:** trei unități în ordine strictă — instrumentul (U2), apoi armarea (U1), apoi șablonul binar la 72 de ore (U3).
- **Authority:** planul-părinte `docs/plans/2026-09-06-1604-feat-idei-produs-si-admin-plan.md` fixează cerințele R1–R5 și deciziile KTD2, KTD3, KTD12. Unde starea verificată azi în DB contrazice planul-părinte, acest document o spune explicit și câștigă.
- **Execution profile:** o schimbare de client pur (U2), o operație manuală ireversibilă în efect pe un proiect Supabase partajat (U1), și un rând nou în `email_templates` plus două constante (U3).
- **Stop conditions:** oprește-te și întreabă dacă (a) armarea din U1 s-ar face înainte ca U2 să fie livrat și verificat; (b) `select count(*) from runlift.edition2_recipients()` întoarce un număr diferit de zero **și** `event_start` e în viitor în momentul armării; (c) instalarea `pg_cron` ar trebui făcută fără ca ceilalți consumatori ai proiectului (gym-app, botul de Telegram) să fie anunțați.
- **Tail ownership:** planul se oprește la implementare, armare și verificare. Publicarea ediției 7 rămâne a operatorului.

---

## Product Contract

### Summary

Valul 1 pornește ceasul care n-a existat niciodată și repară ecranul care pretinde de luni de zile că ceasul există. Ordinea nu e negociabilă: `U2` e instrumentul cu care se citește dacă `U1` a funcționat. Armarea fără instrument înseamnă un backoffice care arată identic înainte și după, adică o schimbare pe care n-o poți verifica.

### Problem Frame

Verificat pe 16 septembrie 2026, direct în proiectul `whyndrjcezmtajbykeil`:

- **`pg_cron` are în continuare `installed_version: null`.** `pg_net` e instalat (0.20.3). `supabase-cron-reminder-ARM.sql` e scris, comentat, idempotent, și rămâne marcat `NEAPLICAT` în `MIGRATIONS.md:88`.
- **`runlift.maybe_send_reminder()` n-a rulat niciodată.** Nicio cheie `once_reminder_*` în `app_config`.
- **`email_log` n-a văzut niciodată un rând cu `mod = 'broadcast'`.** Nici unul, pe nicio ediție. Distribuția reală: `confirm` (60 de rânduri), `admin` (30), `info` (6). Reminderele edițiilor 5 și 6 au plecat ca difuzări manuale — 28 de rânduri `mod='admin'` pe ediția 6, la 2026-09-04 18:49, cu ~12 ore înainte de start.
- **Între timp, `GrupRemindere.tsx:36` afișează „N active · următorul peste X zile".** Valoarea e derivată din `(start, offsetHours, acum)` — o proiecție a ce *ar trebui* să se întâmple. `remindere.ts:71` merge mai departe și promite explicit: „Pleacă la următoarea verificare (în cel mult 15 minute)." Nu există nicio verificare. Nu a existat niciodată.

Asta e afirmația falsă pe care o repară valul. Nu e un bug cosmetic: e singurul ecran pe baza căruia operatorul decide dacă mai trebuie să trimită el ceva manual.

### Fereastra e deschisă acum, și se închide singură

`app_config.event_start` e `2026-09-05T07:00:00+03:00` — **în trecut.** Ediția 6 s-a consumat. Nu există nicio ediție viitoare configurată.

Consecința e portantă pentru tot valul, în două direcții opuse:

**Riscul de armare e zero chiar acum.** Fereastra de declanșare a unui reminder e `[scadență, scadență + 2h]`, unde scadența = `start − avans`. Cu `start` în urmă cu unsprezece zile, fiecare fereastră a trecut. `cron.schedule` executat azi programează o funcție care, la fiecare 15 minute, nu găsește nimic de trimis. Fișierul de armare spune asta el însuși, la liniile 12–19. Scenariul de care se teme KTD12 — dublarea reminderelor, oameni care primesc același email de două ori — **nu se poate produce în intervalul ăsta.**

**Dar fereastra se închide în clipa în care operatorul publică ediția 7.** Din acel moment, orice armare se face lângă un `event_start` viitor, cu scadențe reale, iar KTD12 redevine exact ce spune.

Deci: valul 1 se livrează *acum*, nu pentru că e urgent, ci pentru că e singurul moment în care se poate livra fără nicio grijă. Iar dacă ediția 7 apare între timp, se livrează tot în ordinea asta, doar cu grija revenită.

### Ordinea, și de ce nu e cea din planul-părinte

Planul-părinte pune `U2` înaintea lui `U1` prin KTD12: retrage difuzarea manuală înainte de a arma, ca nimeni să nu primească reminderul de două ori. Motivul e corect, dar **azi e inert** — nu există ediție viitoare, deci nu există dublare posibilă.

Ordinea rămâne aceeași, din alt motiv, care nu expiră:

> `U2` e instrumentul de măsură. Fără el, backoffice-ul arată identic înainte și după armare, iar singura cale de a afla dacă ceasul merge e `psql`. Armezi după ce poți citi cadranul.

Motivul nou e mai puternic decât cel vechi: supraviețuiește publicării ediției 7, se aplică și la a doua armare, și explică de ce `U2` merită livrat chiar dacă `U1` ar fi amânat la infinit.

### Requirements

- **R1.** `pg_cron` e instalat în proiect și `runlift.maybe_send_reminder()` e programată la fiecare 15 minute prin jobul `runlift_reminder`.
- **R2.** Difuzarea manuală a reminderelor e retrasă din backoffice înainte ca ceasul să pornească.
- **R3.** Starea afișată a fiecărui reminder se deduce din jurnalul de livrare (`email_log`), nu doar din orar și din ceas.
- **R4.** Un reminder pentru care orarul spune „a plecat" dar jurnalul nu are nicio intrare e marcat ca atare, nu ca livrat.
- **R5.** Există un șablon de reminder cu întrebarea binară „vin" / „nu mai vin", cu `{link_renunt}` în el, și un rând de orar la 72 de ore.

### Success Criteria

- `select jobname, schedule, active from cron.job where jobname = 'runlift_reminder'` întoarce un rând activ cu `*/15 * * * *`.
- `cron.job_run_details` arată rulări reușite la fiecare 15 minute, fără erori.
- Un reminder cu scadența depășită și fără urmă în `email_log` se afișează ca `neplecat`, cu o notă care spune de ce — nu ca `ratat` și nu ca `trimis`.
- Rezumatul grupului nu mai numără ca „activ" un reminder care n-are cum să plece.
- Difuzarea manuală către participanți nu mai oferă șablonul de reminder; celelalte audiențe rămân neatinse.
- **Proba finală:** un reminder programat pleacă singur, la ora lui, fără ca cineva să atingă backoffice-ul, și apare în `email_log` cu `mod = 'broadcast'`.

### Scope Boundaries

**În scop:** U1, U2, U3 din planul-părinte, plus proba end-to-end a ceasului.

**În afara scopului:**

- Valurile 2, 3, 4 și U18. Neatinse, neblocate de acest val.
- Schimbarea ferestrei de grație sau a intervalului cron. `REMINDER_GRACE_HOURS` și `*/15` rămân cum sunt.
- Retragerea difuzării manuale pentru alte audiențe decât participanți. Doar șablonul de reminder pleacă din listă.

### Open Questions

- **Blocantă la U1 — vezi Decizia de verificare.** Cum se probează că ceasul chiar trimite, când nu există nicio ediție viitoare față de care să se declanșeze?
- **Deferred.** Rândul de orar la 72 de ore (R5) se adaugă din admin la configurarea ediției 7, nu prin migrare — orarul e al operatorului. U3 livrează șablonul și eticheta; rândul e o acțiune de operator.

---

## Planning Contract

### Key Technical Decisions

- **KTD-A. `U2` nu adaugă nicio suprafață de server.** `admin_list_email_log(p_token, p_editie, p_limit, p_cu_text)` există deja și întoarce exact ce trebuie: `mod`, `sablon`, `status`, `editie`, `created_at`. `listEmailLog` e deja expusă în `src/lib/adminApi.ts:405`. `U2` e o schimbare de client pură — zero migrări, zero atingeri ale bazei partajate, deci livrabilă și reversibilă printr-un singur PR. *Instanțiază R3, R4.*

- **KTD-B. Potrivirea livrare↔reminder se face pe `(editie, mod='broadcast', sablon)`, apoi pe fereastra de timp.** Verificat: `maybe_send_reminder()` cheamă `send-email` cu `'mode', 'broadcast'` și trimite `template` mai departe, iar `send-email` scrie `mod: "broadcast"` împreună cu cheia șablonului în `email_log.sablon`. `sablon` e o cheie, nu text editabil de operator — deci potrivirea pe ea nu se rupe tăcut când cineva schimbă subiectul din tabul „Șabloane", exact raționamentul din `deliveryLog.ts`. Fereastra de timp rămâne necesară doar ca departajare, pentru cazul în care două rânduri de orar folosesc același șablon la avansuri diferite. *Rafinează KTD3 din planul-părinte, care specifica doar `(editie, mod='broadcast')` plus fereastra.*

- **KTD-C. Cheile `once_reminder_*` nu devin sursă de adevăr, deși ar fi o potrivire exactă.** `broadcast_once` scrie în `app_config` o cheie de forma `once_reminder_ed<N>_h<M>` — cheiată exact pe (ediție, avans), adică exact pe identitatea unui rând de orar, fără nicio fereastră de timp și fără ambiguitate. E tentant. E respinsă din două motive: cheia dovedește că funcția *s-a declanșat*, nu că emailul *a ajuns* — iar diferența dintre „cron-ul a rulat" și „oamenii au primit" e fix diferența pe care valul ăsta o repară; și nu există niciun RPC care să citească `app_config`, deci ar costa o migrare și o suprafață nouă pe o bază partajată, pentru o distincție pe care operatorul n-o acționează diferit. `email_log` răspunde la ambele întrebări cu zero cost. *Respinge o alternativă la KTD3.*

- **KTD-D. `neplecat` e o stare nouă, distinctă de `ratat`.** `ratat` înseamnă „ceasul n-a apucat" — scadența plus grația au trecut în timp ce sistemul funcționa. `neplecat` înseamnă „ceasul n-a existat". Pentru operator sunt două acțiuni diferite: la `ratat` micșorează avansul, la `neplecat` verifică dacă jobul e armat. Un singur cuvânt pentru amândouă ar ascunde exact eșecul pe care valul îl face vizibil. `StareReminder` primește **două** membre noi — `neplecat` și `esuat` — fiindcă „n-a plecat niciodată" și „a plecat și a picat" cer și ele acțiuni diferite. *Instanțiază R4.*

- **KTD-H. Stările noi nu sunt complete până nu schimbă și pictograma, și stilul, și verbul.** `GrupRemindere.tsx` decide azi din ternare care enumeră stările pe nume: pictograma de la linia 63 e `oprit ? '—' : ratat ? '!' : '✓'`, iar nota de la liniile 100-107 primește `admin-config-eroare` și `role="status"` **doar** pentru `ratat`. O stare nouă cade pe ramura implicită a fiecăreia. Adică `neplecat` — starea inventată exact ca să expună minciuna — s-ar randa cu bifă verde și cu nota în stil discret, sub un ecou care scrie „pleacă joi, 6 august". Fiecare din cele trei locuri se schimbă odată cu tipul, altfel valul livrează aceeași afirmație falsă sub alt nume. *Gardă pe R4.*

- **KTD-E. `remindereleProgramate` rămâne pură; livrările intră ca al treilea parametru.** `acum` e deja parametru din același motiv, documentat la `remindere.ts:15`. Livrările devin la fel. Semnătura nouă: `remindereleProgramate(c, acum, livrari)`, unde `livrari` e un tablou derivat din `email_log`, nu clientul RPC însuși. *Susține R3.*

- **KTD-F. Jurnalul indisponibil degradează spre prudență, nu spre optimism.** Dacă RPC-ul eșuează, `livrari` e gol. Un tablou gol înseamnă „nicio livrare cunoscută", ceea ce ar transforma fiecare reminder scadent în `neplecat` — o afirmație la fel de falsă ca aceea pe care o repară valul, doar în cealaltă direcție. Deci `livrari` e `null` la eșec, distinct de `[]`, iar la `null` stările cad pe comportamentul de azi și nicio notă nu afirmă nimic despre livrare. *Gardă pe R4.*

- **KTD-G. Retragerea difuzării manuale e o ștergere din `PARTICIPANT_KEYS`, nu retragerea butonului.** `AdminEmailTab.tsx:46` listează `['bulk_participant_confirmare', 'bulk_participant_reminder']`. Butonul de difuzare deservește patru audiențe și rămâne. Pleacă o singură cheie din listă, plus eticheta ei de la linia 42. `bulk_participant_reminder_final` nu e nici azi în listă. *Instanțiază R2.*

### Decizia de verificare: cum probezi un ceas fără ediție

Aici e singura întrebare deschisă reală a valului, și merită tranșată înainte de U1, nu în timpul lui.

Armarea pe starea de azi poate fi verificată doar parțial. `cron.job_run_details` va arăta rulări reușite la fiecare 15 minute — dar fiecare rulare nu face nimic, fiindcă nicio fereastră nu e deschisă. Asta probează instalarea, programarea și dreptul de execuție. **Nu probează că un email pleacă.** Lanțul neprobat e tocmai partea fragilă: `maybe_send_reminder` → `net.http_post` → funcția Edge `send-email` → Resend → `email_log`.

Trei drumuri, evaluate:

1. **Armezi și aștepți ediția 7.** Zero efort, zero risc — și descoperi că `pg_net` nu ajunge la funcția Edge, sau că secretul s-a rotit, cu 24 de ore înainte de o cursă reală, în fereastra în care nu mai poți repara nimic. Respins: mută toată incertitudinea exact în momentul cel mai scump.

2. **Probă controlată, cu un singur destinatar.** Se izolează lista de destinatari pe o ediție de test, se deschide o fereastră, se așteaptă cron-ul, se curăță. Rețeta concretă e mai jos — și **contează că e scrisă**, fiindcă „redu destinatarii la tine" nu e o operație pe care funcția o oferă.

3. **Apel manual `select runlift.maybe_send_reminder();`.** Probează lanțul fără să atingă cron-ul. Mai ieftin decât (2), dar sare exact peste partea pe care o adaugă U1 — că *pg_cron* poate chema funcția, cu drepturile lui, nu ale tale.

**Ales: (2), cu (3) ca pas pregătitor.** Rulează întâi (3) manual, ca să separi „lanțul de trimitere e rupt" de „cron-ul nu cheamă funcția". Dacă (3) trece, armează și fă (2). Două probe în loc de una, fiecare izolând un strat.

#### Cum se izolează destinatarul

`runlift.edition2_recipients()` n-are parametri. Numele e istoric; corpul citește:

```sql
select email, nume, token_unsub, token_renunt
from runlift.registrations
where editie = (select value::smallint from runlift.app_config where key = 'current_event_edition')
  and dezabonat_la is null and deleted_at is null
```

Deci lista de destinatari e controlată de **o singură cheie**: `current_event_edition`. Asta e și pârghia, și pericolul. Ediția 6 are 31 de înscriși reali; o probă pe ea ar fi incidentul pe care valul trebuia să-l prevină.

Rețeta, în ordine:

1. **Notează starea de dinainte** — `current_event_edition`, `event_start`, `reminder_schedule`. Le restaurezi din notiță, nu din memorie.
2. **Un rând de înscriere de test** pe un număr de ediție nefolosit (7), cu adresa operatorului.
3. **`current_event_edition = 7`.** Din acest moment `edition2_recipients()` întoarce exact un rând.
4. **Verifică, nu presupune:** `select count(*), min(email) from runlift.edition2_recipients();` — trebuie să fie `1` și adresa operatorului. **Dacă nu e exact asta, oprește-te și restaurează.** Ăsta e singurul punct din tot planul unde o presupunere greșită trimite emailuri unor oameni reali.
5. **Deschide fereastra:** `event_start` la ~2 ore în viitor, un rând de orar la un avans care pune scadența în urmă cu câteva minute.
6. **Așteaptă o rulare de cron** (≤15 minute). Verifică `cron.job_run_details`, apoi `email_log` pentru rândul `mod='broadcast'`, apoi `app_config` pentru cheia `once_reminder_ed7_h*`, apoi inboxul.
7. **Curăță:** șterge cheia `once_reminder_ed7_h*`, șterge rândul de test, restaurează cele trei chei din pasul 1. Confirmă la final cu `select count(*) from runlift.edition2_recipients();` că numărul e iar cel al ediției 6.

Pasul 7 nu e opțional: un `current_event_edition` lăsat pe 7 înseamnă că landing-ul, înscrierea și backoffice-ul arată toate o ediție fantomă.

### Sequencing

```
U2 (client pur, fără migrare)  ──►  U1 (armare manuală + probă)  ──►  U3 (șablon binar)
   instrumentul de măsură           ceasul                            întrebarea la 72h
```

`U2` se poate livra și verifica integral azi, fără să atingă baza de date. `U1` depinde de `U2` doar prin observabilitate — tehnic ar merge și fără, dar atunci n-ai cum să vezi rezultatul din produs. `U3` depinde de `U1` fiindcă un șablon binar fără ceas e un rând de orar care nu pleacă.

### System-Wide Impact

- **Proiectul Supabase e partajat.** `create extension pg_cron` e la nivel de bază de date, iar baza e folosită și de gym-app și de botul de Telegram. Precedentul există (`pg_net` e deja instalat de același proiect), riscul e mic, dar decizia nu e izolată — anunț înainte, nu după.
- **`pg_cron` devine o suprafață operațională permanentă.** După armare, jobul rulează la fiecare 15 minute, la nesfârșit, indiferent dacă există sau nu o ediție. Costul e neglijabil, dar `cron.job_run_details` crește; dacă vreodată devine relevant, are propria politică de retenție în Supabase.
- **Istoricul din `email_log` nu se potrivește cu nimic, și e în regulă.** Zero rânduri `broadcast` înseamnă că, după `U2`, niciun reminder istoric nu găsește o livrare. Edițiile 5 și 6 au `start` în trecut, deci toate rândurile lor cad pe `trecut`, care scurtcircuitează înainte de orice verificare a jurnalului. Nota e aici fiindcă un implementator care testează pe datele reale va vedea zero potriviri și va crede că a stricat ceva.
- **CSP, `knip`, praguri de acoperire.** `U2` nu adaugă fișiere, deci `knip` e neatins. `U2` atinge o funcție cu suită dedicată (`tests/unit/remindere.test.ts`, 245 de linii), deci acoperirea urcă, nu scade. Nicio schimbare de origin, deci garda CSP↔config rămâne verde.

### Risks & Dependencies

- **Proba de la (2) scapă pe destinatari reali.** Cel mai scump eșec posibil al valului, și e la o cheie distanță: dacă `current_event_edition` rămâne 6, proba pleacă la 31 de oameni. Singura gardă e pasul 4 al rețetei — `count(*)` rulat *după* schimbarea cheii și *înainte* de deschiderea ferestrei, cu rezultatul citit, nu presupus.
- **`current_event_edition` lăsat pe ediția de test.** Eșecul tăcut al probei: nu trimite emailuri greșite, dar landing-ul, formularul de înscriere și backoffice-ul arată toate o ediție care nu există. Pasul 7 al rețetei e ce îl previne, iar confirmarea finală prin `count(*)` e ce îl dovedește.
- **Secretul dintre DB și funcția Edge.** `maybe_send_reminder` trimite `runlift.broadcast_secret()` către `send-email`. N-a fost exercitat niciodată pe drumul ăsta. Dacă secretul a fost rotit prin `supabase-roteste-secretul.sql` fără ca funcția să fie actualizată, lanțul pică tăcut la primul apel. Pasul (3) îl prinde înainte de armare.
- **`net.http_post` e asincron.** `pg_net` pune cererea în coadă și întoarce imediat. O rulare de cron „reușită" în `job_run_details` nu înseamnă că emailul a plecat. Verificarea reală e `email_log`, plus `net._http_response` dacă cererea nici măcar nu ajunge.
- **Textul „în cel mult 15 minute" din `remindere.ts:71`.** Promite intervalul cron-ului. După armare devine adevărat pentru prima dată. Dacă intervalul se schimbă vreodată, se schimbă și acolo — `U2` atinge oricum fișierul.
- **`--max-warnings=25` la `oxlint`.** O încălcare nouă pică pipeline-ul. Cele 25 preexistente sunt tolerate; nu urca pragul.
- **Pragurile de acoperire sunt clichete.** `vitest.config.ts` are praguri fixate (linii 68, instrucțiuni 67, funcții 61, ramuri 59). Cod nou fără teste le pică. Când acoperirea urcă, urcă și pragurile.
- **Fereastra se închide fără preaviz.** Tot calculul de risc redus din acest plan ține cât timp `event_start` e în trecut. Dacă operatorul publică ediția 7 în timpul implementării, recitește KTD12 din planul-părinte și tratează armarea ca operație cu consecințe.

### Sources & Research

Verificat pe 16 septembrie 2026, direct în proiectul `whyndrjcezmtajbykeil`:

- `pg_available_extensions` — `pg_cron` `installed_version: null`, `default_version` 1.6.4; `pg_net` instalat, 0.20.3.
- `runlift.app_config` — `event_start = 2026-09-05T07:00:00+03:00`; `reminder_offset_hours = 24`; `reminder_schedule` = un singur rând, `bulk_participant_reminder` la `offsetHours: 24`, activ. Nicio cheie `once_reminder_*`.
- `runlift.email_log`, grupat pe `(mod, audienta, status, editie)` — zero rânduri `broadcast`; 28 de rânduri `admin` pe ediția 6 la 2026-09-04 18:49; 31 `confirm` pe ediția 6; ultima activitate 2026-09-12.
- `pg_get_functiondef(runlift.maybe_send_reminder)` — corpul trimite `'mode', 'broadcast'`, `'audience', 'participanti'`, `'template', v_sablon`, `'secret', v_secret`.
- `information_schema` — schema `runlift` n-are tabel `editions`; edițiile sunt întregul `editie` plus rânduri în `event_config`.
- `pg_proc` — RPC-urile `admin_*` existente; niciunul nu citește `app_config`. `admin_list_email_log(p_token, p_editie, p_limit, p_cu_text)` există.
- `runlift.email_templates` — coloana-cheie e `cheie`, nu `key`. Ambele șabloane de reminder existente conțin deja `{link_renunt}`.
- `supabase-cron-reminder-ARM.sql:12-19` — fișierul argumentează el însuși că armarea e sigură oricând, fiindcă fereastra e `[scadență, scadență + 2h]`.
- `MIGRATIONS.md:88` — `supabase-cron-reminder-ARM.sql` — NEAPLICAT.
- `src/admin/remindere.ts` — cele cinci stări, toate derivate din `(start, offsetHours, acum)`; `starea()` la liniile 55-80; nota „în cel mult 15 minute" la linia 71.
- `src/admin/eventTab/grupuri/GrupRemindere.tsx:26-36` — `programate`, `urmatorul`, `active`; rezumatul „N active · următorul ...".
- `src/admin/AdminEventTab.tsx:532` — singurul loc care randează `GrupRemindere`.
- `src/lib/adminApi.ts:374-415` — `AdminEmailLogEntry` cu `mod`, `sablon`, `status`, `editie`; `listEmailLog(token, editie?, cuText, signal?)`.
- `src/lib/adminApi.ts:458` — singurul `mode` trimis din client e `'admin'`.
- `src/admin/AdminEmailTab.tsx:41-46` — `ETICHETE`/`PARTICIPANT_KEYS`.
- `src/content/eventConfig.ts:88-93` — `REMINDER_TEMPLATE_KEYS`; `src/admin/eventTab/ajutoare.ts:133-136` — `ETICHETE_SABLOANE`.

---

## Implementation Units

| U-ID | Titlu | Fișiere principale | Depinde de |
|---|---|---|---|
| U2 | Starea reminderelor din jurnal, nu din intenție | `src/admin/remindere.ts`, `src/admin/eventTab/grupuri/GrupRemindere.tsx`, `src/admin/AdminEventTab.tsx` | — |
| U1 | Armarea `pg_cron` | `src/admin/AdminEmailTab.tsx`, `supabase-cron-reminder-ARM.sql`, `MIGRATIONS.md` | U2 |
| U3 | Reminderul binar la 72 de ore | `supabase-migration-reminder-binar.sql`, `src/content/eventConfig.ts`, `src/admin/eventTab/ajutoare.ts` | U1 |

---

### U2. Starea reminderelor din jurnal, nu din intenție

- **Goal:** niciun ecran nu mai afirmă că un reminder a plecat, sau că pleacă, fără să existe urma lui în `email_log`.
- **Requirements:** R3, R4. Deținute de KTD-B, KTD-D, KTD-E, KTD-F.
- **Files:** `src/admin/remindere.ts`, `src/admin/eventTab/grupuri/GrupRemindere.tsx`, `src/admin/AdminEventTab.tsx`, `tests/unit/remindere.test.ts`.

- **Approach:**

  **Tipul livrării.** Un tip îngust, derivat din `AdminEmailLogEntry`, nu tipul întreg — funcția pură n-are nevoie de `text_email` și nu trebuie să depindă de forma jurnalului:

  ```ts
  export type LivrareReminder = {
    sablon: string | null;
    status: 'trimis' | 'esuat';
    la: number;        // created_at ca epoch ms
  };
  ```

  **Semnătura.** `remindereleProgramate(c, acum, livrari)` unde `livrari: LivrareReminder[] | null`. `null` e distinct de `[]` prin KTD-F: `null` = „nu știm", `[]` = „știm că nu e nimic". Parametrul e opțional cu default `null`, ca apelurile existente din teste să rămână compilabile și să documenteze exact comportamentul de azi.

  **Potrivirea**, prin KTD-B: o livrare aparține unui rând de orar dacă `sablon === intrare.template` **și** `la` cade în `[scadență, scadență + REMINDER_GRACE_HOURS * ORA]`. Când mai multe se potrivesc, contează `status`: o livrare `trimis` domină una `esuat`.

  **Stările.** `starea()` primește livrările potrivite și se extinde, păstrând ordinea actuală a gardelor:
  - `oprit` și `trecut` rămân primele și nu consultă deloc jurnalul — o ediție consumată e consumată, indiferent ce spune jurnalul. Asta scurtcircuitează întreg istoricul nepotrivit din `email_log` (vezi System-Wide Impact).
  - `programat` — neschimbat.
  - `iminent` — neschimbat, dar nota „Pleacă la următoarea verificare (în cel mult 15 minute)" e adevărată doar după `U1`. Până atunci rămâne cum e; `U1` e ce o face onestă.
  - După fereastra de grație, cu `livrari !== null`:
    - o livrare `trimis` potrivită → `trimis`
    - doar livrări `esuat` → `esuat`, cu nota care spune că s-a încercat și a picat
    - nicio livrare → **`neplecat`** (KTD-D), cu nota: scadența a trecut și jurnalul n-are nicio urmă — verifică dacă jobul `runlift_reminder` e armat.
  - Cu `livrari === null` → `ratat`, exact ca azi. Fără jurnal nu se afirmă nimic despre livrare.

  **Randarea rândului**, prin KTD-H. Trei locuri din `GrupRemindere.tsx` enumeră stările pe nume și trebuie schimbate odată cu tipul:
  - **linia 63, pictograma.** `oprit ? '—' : ratat ? '!' : '✓'` devine o funcție care mapează explicit fiecare stare. `neplecat` și `esuat` primesc `'!'`, nu bifă. Preferabil un `Record<StareReminder, string>` în loc de ternare înlănțuite: atunci TypeScript pică build-ul la starea următoare, în loc s-o lase să cadă tăcut pe `'✓'`.
  - **liniile 100-107, stilul notei.** Condiția `stare === 'ratat'` pentru `admin-config-eroare` și pentru `role="status"` devine „starea e terminală și nereușită" — `ratat`, `neplecat`, `esuat`.
  - **linia 95, ecoul.** Textul e `pleacă ${r.cand} · ${r.distanta}` pentru orice stare cu `cand` valid. Verbul la prezent e chiar afirmația falsă din Problem Frame, la nivel de rând. Pentru stările terminale devine „trebuia să plece" — timpul verbului e jumătate din corectură.

  **Rezumatul grupului.** `active` de la `GrupRemindere.tsx:28` filtrează azi doar pe `intrare.enabled`. Un rând `neplecat` e `enabled` și se numără ca „activ", ceea ce e chiar afirmația falsă din Problem Frame. Filtrul devine „activ = `enabled` și starea nu e terminală" — `neplecat`, `ratat`, `esuat` și `trecut` ies din numărătoare. `urmatorulReminder` selectează deja doar `programat`/`iminent`, deci rămâne corectă fără schimbări.

  **Firul de date.** `AdminEventTab.tsx:532` e singurul apelant. Are deja sesiunea din context și modelul de încărcare printr-un singur hook (introdus în `4cb6ecf`). Adaugă `listEmailLog(token, editie, false)` — `cuText: false`, fiindcă rezumatul n-are nevoie de corpul emailului și ar căra sute de KB degeaba (motivul e scris la `adminApi.ts:400-404`). Eroarea RPC nu se propagă în UI: se prinde și devine `null`, prin KTD-F.

- **Test Scenarios:**
  - Scadență în viitor, jurnal gol → `programat`, cu ora afișată.
  - Scadență trecută, în fereastra de grație, jurnal gol → `iminent`.
  - Scadență + grație trecute, jurnal gol (`[]`), cursa în viitor → **`neplecat`**, cu nota care trimite la job.
  - Aceeași situație cu `livrari === null` → `ratat`, nota de azi, nicio afirmație despre livrare.
  - Scadență trecută + livrare `trimis` cu `sablon` potrivit în fereastră → `trimis`.
  - Scadență trecută + livrare doar `esuat` → `esuat`, nu `trimis`.
  - Scadență trecută + livrare `esuat` **și** `trimis`, ambele potrivite → `trimis` (succesul domină).
  - Livrare cu `sablon` diferit, în aceeași fereastră → nepotrivită, rândul rămâne `neplecat`.
  - Livrare cu `sablon` potrivit dar în afara ferestrei → nepotrivită.
  - Două rânduri de orar cu același șablon la avansuri diferite → fiecare ia doar livrarea din fereastra lui.
  - Bifa scoasă → `oprit`, indiferent de jurnal.
  - Startul a trecut → `trecut`, indiferent de jurnal (inclusiv cu jurnal gol — cazul întregului istoric real).
  - Rezumatul nu numără ca „activ" un rând `neplecat`.
  - Rezumatul cu toate rândurile `neplecat` → „N în orar · niciunul nu mai pleacă".
  - **Randare (KTD-H):** un rând `neplecat` nu afișează bifa `'✓'`.
  - **Randare:** nota unui rând `neplecat` primește `admin-config-eroare` și `role="status"`, ca la `ratat`.
  - **Randare:** ecoul unui rând `neplecat` nu spune „pleacă" la prezent.
  - **Randare:** un rând `programat` rămâne exact cum arată azi — bifă, ecou la prezent, notă în stil discret.

- **Verification:** `npm run test -- remindere`, `npm run test -- adminEventTab`, `npm run typecheck`, `npm run lint`.

- **Execution note:** `remindere.ts` are suită dedicată și `remindereleProgramate` e pură. Scrie întâi cazurile pe semnătura nouă cu `livrari` opțional — toate trec fără nicio schimbare de implementare, fiindcă `null` e comportamentul de azi. Apoi adaugă `neplecat` și privește exact ce cade. Schimbarea e a unei funcții cu contract vizibil; nimic nu justifică mock-uri aici.

---

### U1. Armarea `pg_cron`

- **Goal:** ceasul pornește, `maybe_send_reminder()` rulează la fiecare 15 minute, și s-a demonstrat că lanțul trimite un email real.
- **Requirements:** R1, R2. Ordonarea vine din KTD12 (planul-părinte) și din secțiunea „Ordinea" de mai sus.
- **Files:** `src/admin/AdminEmailTab.tsx`, `supabase-cron-reminder-ARM.sql` (se rulează, **nu se rescrie**), `MIGRATIONS.md`.
- **Depinde de:** U2, livrat și verificat.

- **Approach:** patru pași, în ordine. Nu sări peste pasul 2.

  **1 — Retrage difuzarea manuală de remindere (R2, KTD-G).** În `AdminEmailTab.tsx`: scoate `'bulk_participant_reminder'` din `PARTICIPANT_KEYS` (linia 46) și eticheta ei (linia 42). Butonul de difuzare și celelalte trei audiențe rămân neatinse. Verifică faptul că lista de participanți rămâne cu un singur șablon și că `templates[0]` — folosit ca default la liniile 144-145 — e în continuare valid. Ăsta e un PR de sine stătător, care se poate livra înainte de orice atingere a bazei de date.

  **2 — Probează lanțul de trimitere fără cron.** `select runlift.maybe_send_reminder();` manual. **Precondiție, rulată și citită înainte:** `select count(*) from runlift.edition2_recipients();` — cu `event_start` în trecut, nicio fereastră nu e deschisă, deci apelul nu trebuie să trimită nimic. Rezultatul așteptat e „nimic nu s-a întâmplat, fără eroare". Dacă apelul aruncă — secret rotit, `pg_net` inaccesibil, drepturi lipsă — l-ai prins aici, nu cu 24 de ore înainte de o cursă.

  **3 — Armează.** Rulează `supabase-cron-reminder-ARM.sql` ca atare. Fișierul e idempotent: `cron.schedule` cu același `jobname` suprascrie jobul. Verificările de dinainte sunt deja scrise în capul lui (liniile 21-24) — rulează-le. Apoi:
  ```sql
  select jobid, jobname, schedule, active from cron.job where jobname = 'runlift_reminder';
  ```
  După ~30 de minute:
  ```sql
  select status, return_message, start_time from cron.job_run_details
   where jobid = (select jobid from cron.job where jobname='runlift_reminder')
   order by start_time desc limit 5;
  ```
  Aștepți rulări `succeeded` care nu fac nimic. Asta probează instalarea, programarea și dreptul de execuție — nu și trimiterea.

  **4 — Proba controlată end-to-end.** Urmează rețeta în șapte pași din „Cum se izolează destinatarul". Nu o rezuma din memorie: pârghia e `current_event_edition`, iar pasul 4 al rețetei — verificarea `count(*) = 1` înainte de a deschide fereastra — e singura gardă între probă și 31 de destinatari reali.

  **5 — Înregistrează.** Marchează `supabase-cron-reminder-ARM.sql` ca **APLICAT** în `MIGRATIONS.md`, cu data, și cu rezultatul probei de la pasul 4.

- **Test Scenarios:**
  - Difuzarea manuală către participanți nu mai oferă șablonul de reminder — testul de randare nu găsește opțiunea în lista de șabloane.
  - Difuzarea manuală către participanți oferă în continuare „Confirmare".
  - Difuzarea către celelalte trei audiențe e neschimbată.
  - Un `PARTICIPANT_KEYS` cu un singur element randează corect, iar șablonul default e cel rămas.

- **Verification:** `npm run test -- adminEmailTab`, `npm run typecheck`. În DB: `cron.job` conține `runlift_reminder` activ cu `*/15 * * * *`; `cron.job_run_details` arată rulări `succeeded`; după proba de la pasul 4, `email_log` are un rând `mod='broadcast'` și `app_config` o cheie `once_reminder_*` — ambele curățate după.

- **Execution note:** pasul 3 e singura operație din acest val care schimbă starea unui proiect Supabase partajat, iar pașii 3 și 4 sunt ireversibili în efect — oamenii primesc emailuri. Anunță ceilalți consumatori ai proiectului înainte de `create extension pg_cron`. Nu combina pasul 1 cu pașii 2-5 în același PR: primul e cod recenzabil, restul e o procedură de operator.

---

### U3. Reminderul binar la 72 de ore

- **Goal:** cu 72 de ore înainte de start, fiecare participant primește o singură întrebare: vin sau nu mai vin.
- **Requirements:** R5.
- **Files:** `supabase-migration-reminder-binar.sql` (nou), `src/content/eventConfig.ts`, `src/admin/eventTab/ajutoare.ts`, `tests/unit/eventConfig.test.ts`.
- **Depinde de:** U1.

- **Approach:** un rând nou în `runlift.email_templates` cu `cheie = 'bulk_participant_reminder_binar'`. Coloanele sunt `cheie`, `subiect`, `text_email`, `actualizat_la` — **nu `key`**; verificat, și e capcana în care cade oricine scrie migrarea din memorie. Migrarea e un `insert ... on conflict (cheie) do nothing`, ca re-rularea să fie inofensivă și ca un text deja editat de operator din tabul „Șabloane" să nu fie suprascris.

  Textul conține `{link_renunt}`. Mașinăria din spate e livrată integral: renunțarea și auto-promovarea de pe lista de așteptare funcționează, iar ambele șabloane de reminder existente poartă deja variabila — deci nu e cale nouă, e text nou pe o cale bătută.

  În client: adaugă cheia în `REMINDER_TEMPLATE_KEYS` (`eventConfig.ts:88-91`) și eticheta în `ETICHETE_SABLOANE` (`ajutoare.ts:133-136`). `ReminderTemplateKey` e derivat din tablou, iar `ETICHETE_SABLOANE` e tipat `Record<ReminderTemplateKey, string>` — deci TypeScript pică build-ul dacă adaugi cheia fără etichetă. Garda există; folosește-o, nu o ocoli.

  Rândul de orar la `offsetHours: 72` **nu** se adaugă prin migrare. Orarul e al operatorului și se scrie la publicarea ediției 7, din admin. `MAX_REMINDERS` e 5, deci un al treilea rând încape.

- **Test Scenarios:**
  - `bulk_participant_reminder_binar` apare în selectorul de șablon al unui rând de reminder.
  - `ETICHETE_SABLOANE` acoperă fiecare cheie din `REMINDER_TEMPLATE_KEYS` — testul e exhaustiv pe tablou, nu enumerat manual, ca să prindă și cheia următoare.
  - Validarea orarului acceptă un rând cu noua cheie la `offsetHours: 72`.
  - Două rânduri la același avans rămân respinse, indiferent de șablon (cheia de idempotență e (ediție, offset)).
  - Textul randat pentru un destinatar cu `token_renunt` conține URL-ul complet de `/renunt`.
  - Un șablon de reminder fără `{link_renunt}` e semnalat — un mesaj binar fără buton pune o întrebare la care nu se poate răspunde.

- **Verification:** `npm run test -- eventConfig`, `npm run typecheck`, plus o trimitere de test din backoffice către adresa operatorului, cu previzualizarea HTML din U14 (livrată în valul 5).

- **Execution note:** singura parte care cere judecată omenească e textul. O întrebare binară care nu sună binar — un paragraf de context urmat de un link discret — își ratează scopul. Scurt, două opțiuni, butonul vizibil.

---

## Verification Contract

- `npm run test` trece integral; pragurile din `vitest.config.ts` nu scad. `U2` adaugă teste unei suite existente, deci acoperirea urcă — urcă și pragurile, ca clichete.
- `npm run lint` rămâne sub `--max-warnings=25`.
- `npm run typecheck` trece.
- Migrările și funcțiile Edge se aplică **manual**. CI-ul din `main` nu le deployează.
- Merge-ul în `main` e deploy-ul, prin CI. Nu ocoli pipeline-ul.
- `MIGRATIONS.md` reflectă starea reală după U1 și U3, cu date.

## Definition of Done

- [ ] `remindereleProgramate` consultă jurnalul; `neplecat` e distinct de `ratat`; jurnalul indisponibil nu afirmă nimic.
- [ ] Un rând `neplecat` se randează cu semn de eroare, notă evidențiată și verb la trecut — nu cu bifă verde și „pleacă joi".
- [ ] Rezumatul grupului nu mai numără ca „activ" un reminder care n-are cum să plece.
- [ ] Șablonul de reminder nu mai e ofertabil din difuzarea manuală către participanți.
- [ ] `select runlift.maybe_send_reminder();` rulează manual fără eroare.
- [ ] `cron.job` conține `runlift_reminder` activ cu `*/15 * * * *`, cu rulări `succeeded` în `job_run_details`.
- [ ] Proba controlată a livrat un email real, vizibil în `email_log` cu `mod = 'broadcast'`.
- [ ] Proba a fost curățată: cheia `once_reminder_ed7_h*` ștearsă, rândul de test șters, iar `current_event_edition`, `event_start` și `reminder_schedule` restaurate — confirmat prin `select count(*) from runlift.edition2_recipients()`.
- [ ] `supabase-cron-reminder-ARM.sql` e marcat APLICAT în `MIGRATIONS.md`, cu data și rezultatul probei.
- [ ] `bulk_participant_reminder_binar` există în DB, în `REMINDER_TEMPLATE_KEYS` și în `ETICHETE_SABLOANE`.
- [ ] Planul-părinte are „Stare de execuție" actualizată: valul 1 livrat.
