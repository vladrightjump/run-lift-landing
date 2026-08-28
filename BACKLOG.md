# BACKLOG — de făcut (Run + Lift)

Lucruri deschise care NU țin de infrastructura curentă. Consolidat din audit-urile din iulie
(funcțional/UX + securitate) și din refactor-ul SSOT. Prioritizat aproximativ după ROI/efort.

Ultima actualizare: 4 august 2026.

## Securitate / legal (înainte de creștere)
- [ ] **Politică de confidențialitate (GDPR)** — colectezi nume, telefon, dată naștere. Necesară legal.
- [ ] **Pagină `/regulament`** — checkbox-ul de acord trimite la un regulament care nu există scris.
- [x] **Turnstile (captcha invizibil)** pe formularele de înscriere + „Anunță-mă" — făcut.
      Nu era suficient widgetul: insert-ul direct din browser a fost închis (RLS) și mutat în
      funcția Edge `submit-form`, care verifică token-ul la Cloudflare. Vezi **`ANTI-BOT.md`**.
- [ ] **`npm audit`** periodic — confirmă că vulnerabilitățile rămân doar în devDependencies.

## Conversie (înainte de eveniment)
- [ ] **FAQ scurt pe pagină** (durată, nivel, preț, vreme, spectatori, parcare) — acordeon, ~30 min.
- [ ] **Preț explicit** — badge „Participare gratuită" (dacă e) lângă CTA.
- [ ] **Ce primești** — rând de beneficii (cronometrare, clasament, poze, apă la finish).
- [ ] **Poze reale** de la edițiile trecute în hero/Format.
- [ ] **„Adaugă în calendar"** (.ics / Google) pe ecranul de confirmare + email.
- [ ] **Share după înscriere** — buton WhatsApp/Instagram cu text pre-completat.

## Ziua evenimentului / după
- [ ] **Pagină `/rezultate`** cu timpi + clasament (motivul nr. 1 de revenire la HYROX).
- [ ] **Email post-eveniment** (mulțumire + rezultate + poze + feedback) — doar un șablon nou.

## Creștere (ediția următoare)
- [ ] **Email „re-înscriere prioritară"** la 2–3 săpt. după eveniment (participanții recurenți = cel mai mare ROI).
- [ ] **Format pe echipe/perechi** (divizie Solo/Perechi) — vin împreună.
- [ ] **Istoric personal** (timpul de la ediția trecută) la ediția 3+.
- [ ] **Grup WhatsApp/Telegram** al participanților (link în email) + **hashtag** (#runliftmd).

## Igienă / ops
- [ ] **Reminder automat** (cron programat) în loc de broadcast manual.
- [ ] **Vercel Analytics** — activează din dashboard (decomentează scripturile din `index.html`).
- [ ] **Regenerare `og.png` din EDITION** — momentan asset manual (1200×630) per ediție.

---

## Rezolvate (referință — din audit-urile din iulie + refactor)

- Migrare pe proiectul Supabase nou (`whyndrjcezmtajbykeil`, schema `runlift`) + CSP corectat +
  schema expusă în API.
- Emailuri **de-hardcodate** (DB-driven din `email_templates`, editabile din `/admin`).
- **Refactor SSOT** (`src/content/edition.ts`) + meta din build + teste anti-drift.
- Securitate (audit 18 iul): lockout brute-force pe login admin, CORS restrâns la
  `parktraining.fit`, secret de broadcast rotit, cooldown la retrimiterea emailului, RLS verificat.
