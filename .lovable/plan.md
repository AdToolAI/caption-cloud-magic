# Cast & World als einzige Charakter-Quelle

Aktueller Stand (geprüft): Beide UIs lesen bereits dieselbe Tabelle `brand_characters`. Der Doppel-Eindruck entsteht rein durch zwei parallele Auswahl-Oberflächen ("Brand Character"-Panel + "Cast & World"-Picker) und eine eigene Seite `/brand-characters`. Es gibt also keine zweite Datenquelle, sondern zwei Eingänge auf dieselbe.

Ziel: Genau ein Eingang überall — Cast & World.

## Was sich für dich ändert

- Im AI Video Studio verschwindet das Panel "Brand Character". Charaktere wählst du nur noch unter "Cast & World".
- Die alte Seite `/brand-characters` leitet auf die Cast-&-World-Library (`/library`) um; alle Links/Buttons zeigen dorthin.
- Kein Funktionsverlust: Charakter-Lock, Referenzbild-Anker, Prompt-Injection und Usage-Tracking laufen weiter, nur eben über die Cast-&-World-Auswahl.
- Sprachlich einheitlich: überall "Cast & World" statt "Brand Character".

## Umsetzung (technisch)

1. `src/components/ai-video/ToolkitGenerator.tsx`
   - `BrandCharacterSelector`-Karte (ca. Zeile 930-943) und `brandCharacter`-State entfernen.
   - Die bisher vom `brandCharacter` gespeisten Pfade auf den ersten Cast-&-World-Charakter (`castCharacterIds[0]`, aufgelöst über die Liste im Picker) umstellen: Prompt-Suffix (Z. 451-460), Anchor/Character-Payload (Z. 520-540), Vorschau-Props `brandCharacterUrl/Name` (Z. 1007-1008), Usage-Tracking (Z. 791-795), Debug-Zeile (Z. 1659).
   - Um Doppelarbeit zu vermeiden: die vorhandene Mapping-Logik aus `ToolkitCastWorldPicker` in einen kleinen Hook/Helper ziehen, damit der Generator die gewählten Charaktere samt `reference_image_url` bekommt.
2. `src/pages/AIVideoToolkit.tsx` (Z. 219), `src/components/video-composer/CharacterCastPicker.tsx` (Z. 326), `src/components/video-composer/SceneAvatarMode.tsx` (Z. 179, 233), `src/components/landing/CapabilityBento.tsx` (Z. 270): Links auf `/library` (Cast & World) ändern.
3. `src/App.tsx`: Route `/brand-characters` auf einen Redirect nach `/library` umstellen, Lazy-Import und `src/pages/BrandCharacters.tsx` entfernen (Deep-Links bleiben funktionsfähig).
4. Wiederverwendete Bausteine bleiben: `useBrandCharacters` (Datenzugriff), `AddBrandCharacterDialog`, Avatar-/Outfit-Sheets — sie sind Infrastruktur unter Cast & World, keine zweite Oberfläche. Optional in einem Folgeschritt Ordner/Hook nach `cast-world` umbenennen; nicht Teil dieses Plans, um Regressionen zu vermeiden.
5. Prüfen: bestehende Tests (`bunx vitest run`) und ein Klick-Durchlauf im AI Video Studio (Charakter wählen → Prompt-Suffix + Anker vorhanden).

## Nicht enthalten

- Keine Datenbank-Änderung (`brand_characters` bleibt die Tabelle hinter Cast & World).
- Composer/Autopilot-Logik, die intern `useBrandCharacters` liest, bleibt unverändert — dort gibt es kein doppeltes Auswahl-UI.
