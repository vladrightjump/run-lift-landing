# Despre noi și prima vizită

## Obiectiv

Un vizitator care aude prima dată de Run + Lift poate afla cum a început grupul, ce fac membrii împreună și cum participă la o probă în Chișinău.

## Structura paginii

| Secțiune | Întrebarea vizitatorului | Conținut și acțiune |
|---|---|---|
| Povestea noastră | Cine sunteți? | Începutul cu trei prieteni, antrenamentele din parc și valorile grupului. |
| Comunitatea | La ce pot participa? | Întâlnirile săptămânale, programul de pe site și cursele Run + Lift. |
| Antrenamentul | Cum se desfășoară? | Încălzirea, alergarea, stațiile de forță și revenirea. Clipurile disponibile ilustrează etapele. |
| Prima vizită | Cum rezerv și ce se întâmplă după? | Condițiile în Telegram, alegerea zilei, confirmarea și invitația de a continua. Detaliile sesiunii provin din configurația publică a probei. |
| Program și contact | Cum ajung și cum aflu noutățile? | Orarul obișnuit, harta locului de antrenament și formularul de noutăți. |

## Implementare

1. Adăugăm un cuprins cu legături directe. Păstrăm adresa distribuită pentru prima vizită, `/despre-noi#prima-vizita`.
2. Înlocuim etichetele generale ale comunității cu activități concrete și legături către programul săptămânii și eveniment. Păstrăm povestea documentată în proiect.
3. Afișăm ghidul primei probe și refolosim rezervarea din homepage. Când rezervările sunt închise, vizitatorul poate cere noutăți.
4. Verificăm navigarea și lizibilitatea pe telefon și desktop, stările rezervării, harta, clipurile opționale și trimiterea formularului.
