# Cum lansezi un giveaway

## Pregătește campania

1. Confirmă premiul, regulamentul și deschiderea înscrierilor cu organizatorii. Alege dacă înscrierile se închid la o oră stabilită sau manual, după anunțul de pe Instagram.
2. Adaugă în `src/features/giveaway/content.ts` titlul, premiul, logoul, linkurile și regulamentul, sub un `slug` unic. Pune logoul în `public/giveaway/` pentru a fi servit de site. Campania BITONIC folosește `bitonic-2026` și titlul `Run + Lift × BITONIC`.
3. Verifică afișarea și înscrierea în browser cu serverul simulat. Rulează `npm run build` și `npm run test:e2e:preview -- tests/e2e/giveaway.spec.ts`.

## Programează campania

1. Verifică în Supabase că migrările giveaway-ului sunt aplicate. Publică site-ul cu textele și verifică disponibilitatea funcției Edge `submit-form`. [Migrările giveaway-ului](MIGRATIONS.md) [Ghidul de deploy](ANTI-BOT.md)
2. În producție, adaugă un rând în `runlift.giveaways` cu `slug`, `titlu`, `starts_at` și `ends_at`. Folosește același `slug` ca în cod. Pentru BITONIC, setează `ends_at` la `'infinity'::timestamptz`. Pentru deschidere imediată folosește `now()`, iar pentru momente programate folosește fusul `Europe/Chisinau`.
3. Verifică `/giveaway`. Campania programată arată premiul și data începerii. Formularul apare când se deschid înscrierile. În `/admin#giveaway`, verifică titlul, perioada și contorul de participări, care pornește de la zero.
4. Distribuie linkul public după ce pagina afișează campania.

## Extrage și confirmă câștigătorul

1. Pentru o campanie fără termen fix, anunță când se închid înscrierile pe Instagram. La ora anunțată, apasă **Închide înscrierile** în `/admin#giveaway` și confirmă. Formularul se închide la confirmare.
2. După închiderea înscrierilor, extrage o participare din `/admin#giveaway`.
3. Verifică pe Instagram dacă persoana extrasă urmărește ambele conturi și contacteaz-o. Confirmă câștigătorul în admin. Dacă persoana extrasă nu îndeplinește condițiile sau nu poate fi contactată, folosește butonul de reextragere.
4. După predarea premiului și anunțul pe Instagram, încheie giveaway-ul. Adminul șterge participările fără acord de contact și salvează totalul și câștigătorul confirmat.
