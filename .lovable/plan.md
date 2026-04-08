

## Plan: Per-Scene Filter/Color Grading + Filter-Intensitätsregler

### Problem

1. **Filter und Color Grades gelten nur global** — Obwohl `selectedSceneId` an LookPanel übergeben wird und der Typ `SceneEffects` bereits `filter`, `colorGrading` und individuelle Werte pro Szene unterstützt, schreibt LookPanel alle Änderungen nur auf `effects` (global). Der Hinweis "Änderungen gelten global. Szenen-spezifische Effekte folgen." bestätigt das.

2. **Kein Intensitätsregler für Filter** — Filter sind nur an/aus. Color Grading hat bereits einen Intensitäts-Slider, Filter aber nicht.

### Lösung

**1. Per-Scene Filter & Color Grading ermöglichen**

- `LookPanel` erhält zwei neue Props: `sceneEffects` (Record der aktuellen Szenen-Effekte) und `onSceneEffectsChange` (Callback zum Setzen)
- Wenn `selectedSceneId` gesetzt ist:
  - Filter/Color-Grade/Anpassungen werden auf `sceneEffects[selectedSceneId]` geschrieben statt auf `effects`
  - Die aktive Auswahl liest zuerst den Szenen-Wert, Fallback auf Global
  - Der Hinweis ändert sich zu: "Änderungen gelten für Szene X"
  - Ein kleiner "Global übernehmen"-Button ermöglicht es, Szenen-Werte auf alle Szenen zu kopieren
- Wenn keine Szene ausgewählt ist, funktioniert alles wie bisher (global)

**2. Filter-Intensitätsregler hinzufügen**

- Neues Feld `filterIntensity` (0-100, Default 100) in `GlobalEffects` und `SceneEffects`
- Unterhalb der Filter-Kacheln erscheint ein Slider "Intensität" (analog zum bestehenden Color-Grading-Slider), sobald ein Filter aktiv ist
- Der Wert steuert, wie stark der CSS-Filter angewendet wird (z.B. bei 50% werden die Filter-Werte halbiert)

**3. Props-Kette verdrahten**

- `CapCutSidebar` leitet `sceneEffects` und `onSceneEffectsChange` an LookPanel durch (beides ist bereits als Prop im Editor verfügbar, wird aber nicht weitergereicht)
- `CapCutEditor` hat die Daten bereits (`appliedEffects.scenes`) — muss nur die Callbacks an die Sidebar durchreichen

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Edit | `src/types/directors-cut.ts` | `filterIntensity` zu `GlobalEffects` und `SceneEffects` hinzufügen |
| Edit | `src/components/directors-cut/studio/sidebar/LookPanel.tsx` | Per-Scene-Logik: lesen/schreiben auf richtige Ebene; Intensitäts-Slider für Filter |
| Edit | `src/components/directors-cut/studio/CapCutSidebar.tsx` | `sceneEffects` + `onSceneEffectsChange` Props an LookPanel durchreichen |
| Edit | `src/components/directors-cut/studio/CapCutEditor.tsx` | `sceneEffects` + Handler an Sidebar Props durchreichen |

### Technische Details

- `LookPanel` prüft `selectedSceneId`: wenn gesetzt → alle Änderungen gehen an `onSceneEffectsChange(sceneId, { filter, colorGrading, ... })`, sonst an `onEffectsChange` (global)
- Aktiver Filter wird so bestimmt: `sceneEffects[selectedSceneId]?.filter ?? effects.filter`
- Filter-Intensität moduliert den CSS-String: bei 50% wird z.B. `saturate(1.6)` zu `saturate(1.3)` (Mittelwert zwischen Neutral und Voll)
- Die Vorschau-Komponente (`VideoPreview`) nutzt bereits `sceneEffects` — dort muss nur `filterIntensity` in die CSS-Berechnung einfließen

