# Audit Run + Lift · parktraining.fit

*17 iulie 2026 — audit funcțional, UX și idei de creștere, bazat pe analiza aplicației și pe research despre evenimente sportive (HYROX, RunSignup, Race Roster, pagini de înscriere care convertesc).*

---

## 1. Ce faci deja bine

Aplicația ta bifează multe dintre practicile recomandate pentru pagini de eveniment care convertesc:

- **Un singur scop, un singur CTA** — pagina duce totul spre „Rezervă-ți locul". Exact ce recomandă ghidurile de landing pages.
- **Urgență reală** — countdown live, „Locuri rămase X/20" cu grilă vizuală, deadline clar. Cel mai puternic driver de conversie pentru evenimente.
- **Formular minimal** — 5 câmpuri, validare clară pe câmp, fără cont/parolă. Sub media industriei (bine!).
- **Dovadă socială** — secțiunea „Cine vine" cu numele participanților (mascate pentru privacy). Puțini fac asta.
- **Confirmare instant** — email automat brandat la înscriere. Standard la evenimentele mari, rar la cele comunitare.
- **Listă de așteptare** — abia adăugată; majoritatea evenimentelor mici pierd acești oameni complet.
- **Mobile OK** — fără overflow, formular utilizabil pe telefon.

---

## 2. Îmbunătățiri rapide (înainte de eveniment / ediția asta)

### 2.1 FAQ scurt pe pagină ⭐ prioritate
Ghidurile de conversie insistă: vizitatorii care nu găsesc rapid răspunsuri nu se înscriu. Lipsesc răspunsuri la: *Cât durează cursa? Ce nivel de pregătire trebuie? Cât costă (e gratuit? — spune explicit!)? Ce se întâmplă dacă plouă? Pot veni cu spectatori? Există parcare?* — 6 întrebări, o secțiune acordeon, 30 min de lucru.

### 2.2 Spune explicit că e gratuit (dacă e)
Nicăieri pe pagină nu apare prețul. Pentru mulți, incertitudinea preț = abandon. Un badge „Participare gratuită" lângă CTA poate crește vizibil conversia.

### 2.3 Ce primești / de ce să vii
Pagina spune *ce e* evenimentul, dar nu *ce primești*: cronometrare? clasament? poze profesionale? medalie/diplomă? apă/fructe la finish? Adaugă un rând de beneficii — HYROX-ul oficial vinde exact asta: timp oficial, split-uri, clasament.

### 2.4 Poze reale de la ediția 1
Ai avut deja un eveniment! Pozele reale (oameni transpirați, zâmbind, la stații) sunt cea mai credibilă dovadă socială — mult peste orice text. Un carusel simplu sau 3 poze în hero/secțiunea Format.

### 2.5 Buton „Adaugă în calendar"
Pe ecranul de confirmare + în emailul de confirmare: link .ics / Google Calendar. Reduce no-show-urile aproape gratuit.

### 2.6 Share după înscriere
Pe ecranul de confirmare: „Cheamă un prieten" — buton de share WhatsApp/Instagram cu text pre-completat („M-am înscris la Run + Lift HYROX pe 18 iulie! Mai sunt X locuri: parktraining.fit"). Înscrișii tăi sunt cel mai bun canal de marketing.

---

## 3. Pentru ziua evenimentului

- **Rezultate + clasament pe site** — cronometrezi oricum; publică timpii pe o pagină `/rezultate`. Cel mai citat motiv de revenire la HYROX: „vreau să-mi bat timpul". Rezultatele dau și motiv de share („locul 3 din 20!").
- **Email post-eveniment (la 1–3 zile)** — mulțumire + rezultate + poze + „spune-ne cum a fost" (2 întrebări). Infrastructura de email o ai deja; e doar un template nou.
- **Poze la stații + finish** — desemnează pe cineva; pozele alimentează tot marketingul ediției 3.

---

## 4. Pentru ediția următoare (creștere)

### 4.1 Re-înscriere prioritară ⭐ cel mai mare ROI
Ai deja emailurile participanților de la 2 ediții + lista de așteptare. Practica standard din industrie: la 2–3 săptămâni după eveniment, trimite „s-a deschis înscrierea pentru ediția 3 — ai prioritate 48h ca participant". Participanții recurenți sunt cei mai ieftini de câștigat. Infrastructura ta pe ediții suportă asta deja perfect.

### 4.2 Format pe echipe / perechi
Motivul nr. 1 pentru care HYROX crește: divizii duo și ștafetă — comunitățile de sală vin împreună. Ai avut câmpul „echipă" la ediția 1; adu-l înapoi ca **divizie** (Solo / Perechi), nu doar ca etichetă.

### 4.3 Istoric personal
La ediția 3+, cine s-a mai înscris să-și vadă timpul trecut („Ediția 2: 52:14 — îl bați?"). Progresul măsurabil e cârligul principal al sportivilor amatori.

### 4.4 Grup WhatsApp/Telegram al participanților
Link în emailul de confirmare. Comunitatea dintre evenimente = retenție; acolo se anunță și antrenamentele de pregătire (alt produs posibil: sesiuni de pregătire înainte de cursă).

### 4.5 Instagram embed / hashtag
Ai deja @vladfillip și @morarroma în footer. Definește un hashtag (#runliftmd), cere-l în emailul post-race, arată postările pe site.

---

## 5. Tehnic / operațional (igienă)

| Ce | De ce | Efort |
|---|---|---|
| Activează Vercel Analytics (toggle în dashboard) | Acum n-ai date de trafic; erorile 404 din consolă dispar | 2 min |
| GitHub → Vercel auto-deploy | Elimini pasul manual `vercel --prod`; commit = live | 15 min |
| Comite codul în git (acum e necomis) | Backup + istoric; azi totul e doar pe laptop | 5 min |
| Rate-limiting pe formular (Supabase) | Protecție anti-spam pe insert-ul anon | mediu |
| Pagină `/regulament` | Checkbox-ul de acord trimite la un regulament care nu există scris | 30 min |
| Politică de confidențialitate (GDPR) | Colectezi date personale (nume, telefon, data nașterii) — obligatoriu legal | 30 min |
| Reminder automat (nu manual) | Ai vrut manual acum; pentru ediția 3, un cron programat elimină riscul uman | mic |

---

## 6. Top 5 — dacă faci doar atât

1. **FAQ + preț explicit pe pagină** (conversie imediată, efort minim)
2. **Share pe WhatsApp după înscriere** (creștere organică gratuită)
3. **Rezultate publicate pe site după cursă** (motivul nr. 1 de revenire)
4. **Email „ediția 3 — prioritate participanți"** la 2 săpt. după eveniment (cei mai ieftini înscriși)
5. **Divizie pe perechi la ediția 3** (dublezi bazinul de participanți — vin împreună)

---

## Surse

- [Guidebook — Event registration landing page tips](https://www.guidebook.com/post/event-registration-landing-page-tips)
- [Swoogo — 15 event registration strategies](https://swoogo.events/blog/event-registration-strategies/)
- [Bizzabo — Registration pages that convert](https://www.bizzabo.com/blog/registration-pages-for-events-that-convert)
- [HYROX — The Fitness Race](https://hyrox.com/the-fitness-race/)
- [BoxLife — Why HYROX draws 15.000 people per event](https://boxlifemagazine.com/hyrox-worldwide-fitness-phenomenon/)
- [RunSignup — Race marketing plan](https://info.runsignup.com/2026/07/02/create-a-marketing-plan/)
- [RunTheDay — Post-race experience ideas](https://runtheday.com/blog/managing-a-5k/post-race-experience-for-runners/)
- [Race Roster — Boost registration via social media](https://raceroster.com/articles/5-ways-to-boost-race-registration-via-social-media)
