# Cast & World: falsches Konto, doppelte Quelle, Motion-Studio-Lücke

## 1. Die vier Charaktere sind nicht gelöscht

Geprüft in der Datenbank: **Matthew Dusatko, Samuel Dusatko, Sarah Dusatko und Kailee
existieren alle noch**, nicht archiviert, mit Referenzbild. Sie gehören zum Konto
`bestofproducts4u@gmail.com`. Der Screenshot zeigt eine Session des Kontos
`info@useadtool.ai` — und das hat null eigene Charaktere. Es wurde also nichts
gelöscht, du bist nur im anderen Konto angemeldet.

(Nebenbefund: es gibt zusätzlich drei ältere archivierte Duplikate von Matthew/Sarah
aus dem Mai — die sind bewusst archiviert und bleiben ausgeblendet.)

Zwei mögliche Wege, das dauerhaft zu lösen:

- **A (Standard):** Charaktere bleiben, wo sie sind — du arbeitest im Konto
  `bestofproducts4u@gmail.com`, wenn du sie brauchst.
- **B (Umzug):** Ich kopiere die vier Charaktere samt Referenzbildern, Outfits und
  Varianten auf `info@useadtool.ai`, damit das Firmenkonto vollständig ist.

Ich brauche von dir die Entscheidung A oder B, bevor ich Daten anfasse.

## 2. Es gibt immer noch zwei Charakter-Quellen

Der Dialog listet zwei Blöcke:

- „Avatare (mit Portrait-Anker)" = Cast & World (`brand_characters`) — korrekt.
- „Library-Charaktere (nur Beschreibung)" = alte Motion-Studio-Tabelle
  (`motion_studio_characters`) — das ist die zweite Quelle, die weg soll.

Änderungen:

- Zweiten Block ersatzlos entfernen; nur Cast & World bleibt.
- Beschriftungen umstellen: Button „Aus Cast & World wählen", Dialog
  „Charakter aus Cast & World verknüpfen", Pro-Tipp-Text ohne „Avatar-Bibliothek".
- Leerzustand wird handlungsfähig: „Noch keine Charaktere in Cast & World" plus
  Button, der `/library` öffnet.

## 3. Ausgewählte Charaktere kommen nicht im Motion Studio an

Ursache: Das Motion Studio (Hub, Studio-Mode, Library, LibraryPicker) liest
ausschließlich `motion_studio_characters`. Cast & World liegt in
`brand_characters`. Der Composer nutzt dagegen bereits die zusammengeführte
Quelle (`useUnifiedMentionLibrary`), die beides mischt — deshalb sieht man dort
Charaktere, im Motion Studio aber nicht.

Fix: Motion Studio auf dieselbe zusammengeführte Quelle umstellen.

- `useUnifiedMentionLibrary` wird die Lesequelle für Charaktere in
  `MotionStudio/Hub.tsx`, `MotionStudio/StudioMode.tsx`, `MotionStudio/Library.tsx`
  und `motion-studio/LibraryPicker.tsx`.
- Schreiboperationen (Anlegen/Bearbeiten/Varianten) bleiben unverändert bei
  `useMotionStudioLibrary`; Cast-&-World-Einträge werden im Motion Studio als
  „aus Cast & World" markiert und dort nicht editiert, sondern verlinken nach
  `/library`.
- Locations bleiben in diesem Schritt unverändert (gleiche Mechanik, eigener
  Folgeschritt), damit die Änderung überschaubar bleibt.

## Technische Details

- `src/components/video-composer/CharacterManager.tsx`: `useMotionStudioLibrary`-
  Import + Aufruf (Z. 13/160), `linkLibraryCharacter` (Z. 210) und den Abschnitt
  „Library characters" (Z. 503–530) entfernen; Labels in den drei Sprachblöcken
  (Z. 29–33, 67–71, 105–109) auf Cast & World umschreiben; Leerzustand mit
  Link nach `/library`.
- Motion-Studio-Seiten: `useMotionStudioLibrary().characters` durch
  `useUnifiedMentionLibrary().characters` ersetzen, Mutationen weiter aus
  `useMotionStudioLibrary` beziehen. IDs aus Cast & World sind reine UUIDs, die
  `resolveCharacterId`-Logik bleibt unangetastet.
- Keine Schema-Änderung, kein Eingriff in Anker-Logik, Prompt-Injection oder die
  Lip-Sync-Kette.
- Prüfung: `bunx vitest run src/lib/composer src/lib/motion-studio` plus
  i18n-Konsistenz-Check.
