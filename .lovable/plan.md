# Cast & World: doppelte Quelle entfernen, Motion-Studio-Lücke schließen

Die vermissten Charaktere sind geklärt (anderes Konto) — kein Handlungsbedarf,
keine Datenänderung.


## 1. Es gibt immer noch zwei Charakter-Quellen

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
