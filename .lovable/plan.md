## Ziel
Drei zusammenhängende Probleme im Universal Content Creator lösen:

1. **Schwarze Szene bleibt schwarz**, wenn eine leere Default-Szene existiert und man in Schritt 3 ein Video als Hintergrund wählt. Nur eine *neue* Szene hinzufügen bringt das Video an.
2. **Mute-Toggle scheinbar nicht sichtbar** in Schritt 2/3 — weil er nur bei `background.type === 'video'` gerendert wird und die vorhandene Szene bei den Nutzern noch `type: 'color'` (schwarz) ist.
3. **Original-Ton bleibt stumm** obwohl ein Video-Hintergrund gewählt ist, weil der globale `useOriginalAudio`-Toggle in Schritt 4 per Default aus ist.

## Ursache (kurz)

- `BackgroundAssetSelector` setzt nur den State `backgroundAsset`. Erst `handleAddScene()` (Button "Szene hinzufügen") übernimmt das Asset in eine neue Szene. Eine bereits existierende schwarze Default-Szene wird nie aktualisiert.
- Der Volume2/VolumeX-Button in `SceneTimeline` erscheint erst wenn eine Szene tatsächlich Video ist. Solange die Auto-Übernahme fehlt, sieht der Nutzer den Toggle nie.
- `contentConfig.useOriginalAudio` ist standardmäßig `undefined` → im Player als "aus" gewertet.

## Änderungen

### 1. Hintergrund-Auswahl übernimmt eine leere Default-Szene automatisch
`src/pages/UniversalCreator/UniversalCreator.tsx`

- `BackgroundAssetSelector.onSelectAsset` wird über einen neuen Handler `handleSelectBackgroundAsset(asset)` geführt:
  - Setzt weiterhin `setBackgroundAsset(asset)`.
  - Wenn `scenes.length === 0`: sofort eine Szene mit dem Asset erzeugen (`addScene(mapped, 5)`).
  - Wenn die *letzte* Szene eine unveränderte Default-Schwarz-Szene ist (`background.type === 'color'` und `color` in `{'#000000','#000'}` und keine `videoUrl/imageUrl`): diese Szene per `setScenes` durch das gemappte Video/Bild ersetzen statt eine neue anzuhängen.
  - Andernfalls: Verhalten wie bisher (Asset nur staged, Nutzer entscheidet über "Szene hinzufügen").
- `handleAddScene` bleibt, damit man bewusst weitere Szenen anhängen kann.

### 2. Per-Szene Mute-Toggle in Schritt 3 immer erreichbar machen
`src/components/universal-creator/SceneTimeline.tsx`

- Toggle-Button rendert weiter nur, wenn die Szene tatsächlich einen Audio-tragenden Hintergrund hat (`background.type === 'video'`), da bei Farbe/Bild/Gradient kein Original-Ton existiert. Nach Fix #1 wird die Szene sofort zum Video-Typ, sodass der Toggle sichtbar wird — was das Nutzer-Problem "Toggle fehlt in Schritt 2" auflöst, ohne UI-Rauschen bei stummen Backgrounds.
- Kleiner Text-Hinweis unter der Szene bei Nicht-Video-Typen: "Original-Ton nur für Video-Szenen verfügbar." (optional, i18n-Key `uc.originalAudioOnlyVideo`).

### 3. Original-Ton standardmäßig aktivieren
`src/pages/UniversalCreator/UniversalCreator.tsx`

- Beim ersten Anhängen einer Video-Szene (Fix #1 oder normales Add): falls `contentConfig?.useOriginalAudio === undefined`, auf `true` initialisieren und `originalAudioVolume` auf `0.6` setzen. So hört der Nutzer den Original-Ton sofort, kann ihn aber jederzeit in Schritt 4 oder pro Szene in Schritt 3 stummschalten.
- Die vorhandenen Overrides (per-Szene `muted`) gewinnen weiterhin wie in v-Original geplant.

## Technische Notizen

- Keine Änderungen an `SafeVideo`, `UniversalCreatorVideo.tsx`, oder am Render-Payload nötig — die Verkabelung Audio→Remotion existiert bereits, sie wurde nur nie mit `useOriginalAudio=true` und einer Video-Szene aktiviert.
- Erkennung "unveränderte Default-Schwarz-Szene" bewusst konservativ (nur exakt Default-Farbe & keine sonstigen Media-URLs), damit Nutzer, die absichtlich eine schwarze Farbszene angelegt haben, diese nicht verlieren.
- i18n: neuer Key `uc.originalAudioOnlyVideo` (DE/EN/ES).

## Nicht Teil dieses Plans
- Umbau des Wizard-Ablaufs.
- Änderungen an anderen Steps oder am Export-Payload.
- Neue Audio-Ducking-Logik gegenüber Voice-Over (bereits vorhanden).
