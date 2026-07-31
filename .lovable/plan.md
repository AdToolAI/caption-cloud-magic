## Korrektur

Ja — **Cast & World soll die einzige Charakterquelle sein**. Die Begriffe „Briefing-Charaktere“ und „Avatar-Bibliothek“ im aktuellen Picker sind noch technische Altpfade: `CharacterCastPicker` erhält weiterhin zwei Listen (`characters` und `libraryCharacters`) und kann Bibliotheksfiguren nachträglich ins Briefing übernehmen. Das ist unnötig und begünstigt die sichtbaren Duplikate.

## Umsetzung

1. **Picker auf eine Quelle reduzieren**
   - `CharacterCastPicker` erhält nur noch die zugänglichen Cast-&-World-Charaktere.
   - `libraryCharacters`, `onAddToBriefing` sowie die getrennten Bereiche „In diesem Projekt“ / „Aus deiner Avatar-Bibliothek“ werden entfernt.
   - Charaktere werden nicht mehr beim Auswählen in eine zweite Projektliste kopiert.

2. **Aufrufer bereinigen**
   - `UnifiedAssetPicker` und `SceneCard` reichen nur noch den zentralen Cast-&-World-Pool weiter.
   - Alte Briefing-Daten dürfen bestehende Szenen weiterhin anzeigen, aber keine neue Auswahlquelle mehr bilden.
   - `useComposerPersistence` nutzt Cast & World nur noch zur ID-Auflösung, nicht als parallele Charakterliste.

3. **Doppelte Namen im Cast-&-World-Pool abfangen**
   - Die zentrale zugängliche Charakterabfrage wird nach normalisiertem Namen dedupliziert.
   - Pro Name bleibt genau ein Datensatz wählbar; bevorzugt wird der eigene, vollständigste und zuletzt aktualisierte Charakter.
   - Bereits gespeicherte Szenen mit einer älteren Duplikat-UUID werden auf den sichtbaren Gewinner aufgelöst, ohne Daten automatisch zu löschen.

4. **Pipeline-Parität**
   - Client und Render-/Lip-Sync-Pipeline verwenden dieselbe Cast-&-World-UUID als kanonische Identität.
   - Briefing-Slugs, Namen und alte Duplikat-UUIDs sind nur noch Kompatibilitäts-Aliase, niemals eigenständige Charakterquellen.

5. **Prüfung**
   - Verifizieren: Ein Name erscheint genau einmal im Picker.
   - Manuelles Hinzufügen hängt keinen ersten Charakter mehr automatisch an.
   - Bestehende Szenen bleiben auflösbar und erzeugen keine doppelten Cast-Chips oder Lip-Sync-Pässe.