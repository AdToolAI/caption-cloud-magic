# v430 Schritt 6.4 — SceneCard bereinigen

Ziel: `SceneCard.tsx` (3.686 Zeilen) liest Zustand, Output, Continuity und Lip-Sync-Intent
ausschließlich über die bestehenden Verträge. Keine Verhaltensänderung — nur Lesequellen und
doppelte lokale Ableitungen.

## Ist-Zustand (verifiziert)

- Zustand: bereits sauber. Zeilen 355–359 nutzen `sceneState()`, `sceneSubstate()`,
  `legacyClipReadyEquivalentRow()`, `legacyClipFailedEquivalentRow()`. Der 5E-Scanner meldet
  aktuell 0 unerlaubte Legacy-Reads (nur 1 begründeter Marker).
- Output: **nicht** sauber. 14 direkte Zugriffe auf `scene.clipUrl` / `scene.uploadUrl`
  (u. a. Expanded-Default Z. 663, Director-Mode-Gate Z. 1473, Stock-Thumbnail Z. 3256–3273,
  Thumbnail-Preview Z. 3553–3561). `resolveSceneOutput()` wird in der Datei nicht importiert.
- Continuity: die Anzeige läuft bereits über `SceneContinuityStatus` (Z. 1999); es gibt keine
  lokale Stale-Ableitung in der Karte.
- Lip-Sync-Intent: mehrfach lokal als `scene.dialogMode === true` bzw.
  `scene.engineOverride === "cinematic-sync"` abgeleitet (Z. 1704, 2386, 2786 ff.), obwohl
  `isLipSyncIntentional()` existiert.

## Umfang

### 1. Output-Lesungen auf `resolveSceneOutput()`

Ein `const output = resolveSceneOutput(scene)` oben in der Komponente; alle Lese-Stellen
nutzen `output.effectiveUrl` (bzw. `output.baseUrl`, wo bewusst die Roh-Platte gemeint ist).

Semantik-Erhalt ist hier der kritische Punkt und wird pro Stelle einzeln entschieden:

- Stellen, die heute `scene.clipUrl || scene.uploadUrl` lesen, entsprechen bereits der
  Resolver-Kette (`processed → base → legacy clip → upload`) und werden 1:1 ersetzt.
- Stellen, die heute **nur** `scene.clipUrl` lesen und Upload bewusst ausschließen
  (z. B. der Zweig „Bild vs. Video" in der Thumbnail-Preview), behalten ihre Trennung; dort
  wird `output.effectiveUrl` nur verwendet, wenn `output.source !== 'upload'`.
- Schreib-Stellen (`clipUrl: …` in `onUpdate`-Payloads, Stock-Auswahl) bleiben unverändert —
  6.4 ändert keine Writer.

### 2. Lip-Sync-Intent über den bestehenden Vertrag

Reine **Lese**-Ableitungen „ist diese Szene eine Lip-Sync-Szene?" laufen über
`isLipSyncIntentional(scene)`. Nicht angefasst werden:

- der Toggle-Zustand selbst (`scene.dialogMode` als Checkbox-Wert und in Update-Payloads),
- `engineOverride`-Vergleiche, die eine konkrete Engine-Auswahl abbilden (Select-Wert),
- der v425-Provider-Gate und die Auto-Trigger-Logik.

### 3. Presentational-Helper auslagern

Neu: `src/lib/composer/sceneCardPresentation.ts` (pure, keine React-Imports, keine DB).
Aufnahme ausschließlich von Ableitungen, die heute doppelt in der Karte stehen:

- `sceneThumbnailSource(scene)` → `{ kind: 'image' | 'video' | 'none'; url: string | null }`
- `sceneHasAuthoredContent(scene)` (Expanded-Default)
- `sceneDirectorModeReady(scene)` (Ready + vorhandener Output)
- `sceneLipsyncFlags(scene)` → `{ busy, hasArtifact, cancellable }` — verschiebt die
  bestehenden Ableitungen aus Z. 361–375 unverändert in eine testbare Funktion.

### 4. Tests

- Neue Datei `src/lib/composer/__tests__/sceneCardPresentation.test.ts`:
  Verhaltenstests für Thumbnail-Auswahl, Director-Mode-Sichtbarkeit, Expanded-Default und
  Lip-Sync-Flags — je Fall normale Szene, Lip-Sync-Szene, failed-mit-Output, Upload-only.
- Parity-Tests „vorher/nachher": für jede migrierte Output-Stelle ein Fall, der die alte
  Ausdrucks-Semantik gegen die neue Resolver-Semantik prüft (inkl. Legacy-Szene mit nur
  `clip_url` und Szene mit `processed_video_url`).
- 5E-Contract-Scanner und der 6.3-Sprach-Scanner müssen für `SceneCard.tsx` weiterhin 0
  Verstöße melden.

### 5. UI-Smoke

Playwright im Motion Studio auf vier Szenen-Zuständen: normale Szene, Lip-Sync-Szene,
failed + vorhandener Output, Continuity-stale. Geprüft wird: Vorschau/Thumbnail sichtbar,
Aktionsmenü-Einträge unverändert, kein Console-Error.

## Harte Grenzen

- Keine Änderung an Button-Gates, Handlern, Payloads, Auto-Triggern, Reset-/Render-Semantik.
- Keine Änderung an Lip-Sync-Writern, `reference_image_url`, Continuity-Queue, State Machine.
- Keine neuen `clip_url`-Writer; `materializeCompatibilityOutput()` bleibt einziger Writer.
- Keine Arbeiten an 6.5.

## Abschluss

Vitest (Composer-Suites + neue Tests), beide Contract-Scanner, `tsgo`, UI-Smoke —
danach STOP und Bericht mit Vorher/Nachher-Liste aller migrierten Lesestellen.
