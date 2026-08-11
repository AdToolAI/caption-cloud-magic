# Charakter-Auswahl im Composer: nur noch Cast & World

## Was tatsächlich passiert

Der Dialog auf deinem Screenshot liest bereits Cast & World: der obere Block
„Avatare (mit Portrait-Anker)" kommt aus deinen Cast-&-World-Charakteren. Er ist
leer, weil dein Konto aktuell **null** Cast-&-World-Charaktere hat (geprüft in der
Datenbank). Es fehlt also keine Verbindung — es fehlen die Charaktere.

Zwei Dinge machen das trotzdem unnötig verwirrend:

1. Der Dialog nennt Cast & World „Avatare" und schickt dich in der Leer-Meldung
   zu einem Bereich „Avatare", den es so nicht mehr gibt.
2. Darunter steht ein zweiter Block „Library-Charaktere (nur Beschreibung)", der
   aus der alten Motion-Studio-Bibliothek stammt — also genau die zweite
   Charakter-Quelle, die es laut Cast-&-World-Regel nicht mehr geben soll.

## Was ich ändere

- Der Dialog heißt „Charakter aus Cast & World verknüpfen" und beschreibt in
  einem Satz, dass das Referenzbild des Charakters als Anker für Gesichts- und
  Look-Konsistenz genutzt wird.
- Die Leer-Meldung wird handlungsfähig: „Noch keine Charaktere in Cast & World"
  plus Button, der die Cast-&-World-Bibliothek öffnet.
- Der zweite Block „Library-Charaktere" (Motion-Studio-Quelle) fliegt raus,
  damit es wirklich nur noch einen Eingang gibt.
- Der Button, der den Dialog öffnet, heißt „Aus Cast & World wählen".
- Alles in DE/EN/ES über `tx(...)`, keine gemischten Sprachen.

Kein Eingriff in Anker-Logik, Prompt-Injection oder die Lip-Sync-Kette — nur
Beschriftung, Leerzustand und das Entfernen der zweiten Quelle.

## Technische Details

- `src/components/video-composer/CharacterManager.tsx`:
  - Label-Block (ca. Z. 23–75): `pickFromLibrary`, `pickerTitle`, `pickerDesc`,
    `pickerEmpty` neu formulieren, `proTipBody` auf „Cast & World" umstellen.
  - `useMotionStudioLibrary()`-Aufruf (Z. 160) und den Abschnitt
    „Library-Charaktere" (ca. Z. 500–530) entfernen; Import mit aufräumen.
  - Leerzustand bekommt einen Link/Button nach `/library`.
- Quelle bleibt `useAccessibleCharacters()` (eigene + gekaufte
  Cast-&-World-Charaktere).
- Danach `bunx vitest run src/components/video-composer` bzw. die Composer-Suite
  laufen lassen und den i18n-Konsistenz-Check.

## Danach

Damit der Dialog bei dir etwas anzeigt, musst du einmalig einen Charakter in
Cast & World anlegen — das ist auch die Voraussetzung für den Testlauf
(Szene B braucht eine Figur mit Referenzbild).
