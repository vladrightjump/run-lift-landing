# Import WodUp în Programare

Importul este o copiere privată, o singură dată, pentru admini. Nu sincronizează contul WodUp. Fișierele rezultate stau exclusiv în `imports/`, ignorat de Git; testele folosesc date sintetice.

În zsh, citește cookie-ul de sesiune fără ecou și fără a-l scrie în istoric sau într-un fișier:

```zsh
read -rs 'WODUP_COOKIE?Cookie de sesiune WodUp: '
export WODUP_COOKIE
npx tsx scripts/wodup/extrage.ts 2026-09-07 2026-11-28 imports/hyrox-prep.json
unset WODUP_COOKIE
```

Cookie-ul există numai în memoria proceselor; scriptul nu îl salvează și nu îl afișează. Se cer doar datele de program și demonstrațiile mișcărilor, prin operația GraphQL Timeline a aplicației WodUp. Un răspuns refuzat sau incomplet nu produce un import.

În `/admin` → **Programare** → **Programe**, alege fișierul, verifică rezumatul și confirmă importul. Reimportarea aceluiași ID extern actualizează programul și păstrează identificatorii rândurilor existente. Alege apoi data de start pentru propria atribuire. Fiecare admin își salvează profilul și își atribuie programul din propria sesiune. „Începe din nou” creează o atribuire nouă.

Conversia păstrează țintele pentru ambele genuri, notele, instrucțiunile, pauzele, ordinea și proveniența fiecărui set. Încărcările în lbs devin kg la 0,5 kg; feet devin metri la 0,5 m; inch devin cm întregi. Procentele 1RM și țintele textuale rămân astfel. Demonstrația din overlay-ul antrenorului are prioritate față de cea generică.

Instantaneul privat de referință din 21 octombrie conține **72 de zile, 266 de componente și 76 de mișcări**, pe șase zile ale săptămânii. `isAlternating` leagă componenta de următoarea, iar ultima componentă a grupului are valoarea false. Păstrând aceste legături, conversia produce **219 blocuri**, cu toate cele 266 de componente păstrate în metadate și proveniență. Numărul de zile și structura sursei prevalează asupra exemplului de cinci zile pe săptămână din plan.

Etapa 1 permite citirea pe Azi, în calendar și în foaia antrenamentului, cu video. Salvarea rezultatelor, istoricul, alertele și editorul sunt etapele următoare.
