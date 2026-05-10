## Problem

Beim "Two-Shot Hook" (Cinematic-Sync mit zwei Sprechern) treten drei Probleme auf:

1. **Falsche Charaktere im Bild** — Hailuo zeigt zufällige Personen, nicht die in der Szene ausgewählten Cast-Charaktere.
2. **Erster Charakter redet zu lang** — Sync.so animiert eine Person für den gesamten Audio-Track, anstatt sauber zwischen Sprecher 1 und Sprecher 2 zu wechseln.
3. **Voiceover ist nicht hörbar** — die finale Lip-Sync-Szene wirkt stumm bzw. man hört den gemischten Voiceover nicht.

## Root-Cause-Analyse

**Issue 1 — Two-Shot überspringt den Scene-Anchor:**
`ClipsTab.handleStartCinematicSync` ruft korrekt `prepareSceneAnchor()` auf (Nano Banana 2 komponiert alle ausgewählten Cast-Portraits in EINEN Frame, der dann an Hailuo i2v als `first_frame_image` geht). Der **Two-Shot-Pfad in `SceneDialogStudio.tsx`** (Zeile ~961-998) tut das **nicht**: er sendet `referenceImageUrl: scene.referenceImageUrl` direkt an `compose-video-clips`. Hailuo erfindet dann beide Gesichter.

**Issue 2 hängt direkt an Issue 1:** Sync.so/lipsync-2 nutzt Active-Speaker-Detection auf dem Video. Wenn der Master-Clip nur EIN deutliches Gesicht enthält (oder zwei nicht zur Cast passen), animiert es das eine Gesicht über den gesamten Merged-Audio. → Sobald der korrekte Two-Shot-Anchor gerendert wird, kann lipsync-2 zwischen den beiden Gesichtern wechseln.

**Issue 3 — Auto-Unmute trifft nicht zu:**
Der Player-Auto-Unmute (`ComposerSequencePreview.tsx` Zeilen 631-646) entmutet erst, wenn mind. eine Szene `lipSyncWithVoiceover === true` hat (oder `voiceoverUrl`/`backgroundMusicUrl`/`sceneAudioClips` vorhanden ist). Beim Two-Shot setzt `SceneDialogStudio` zwar das Optimistic-Flag, aber die DB-Persistierung von `lipSyncWithVoiceover: true` läuft nur über das nachgelagerte Sync.so-Update. Wenn der Player die Szene lädt bevor `lip_sync_applied_at` gesetzt ist, bleibt er auf `muted=true` — der gemischte Voiceover ist im Sync.so-MP4 aber bereits eingebettet und damit unhörbar.

## Plan

### 1. `src/components/video-composer/SceneDialogStudio.tsx` — Composed Anchor für Two-Shot

Vor dem `supabase.functions.invoke('compose-video-clips', ...)` (Zeile ~996) den gleichen Anchor-Schritt einbauen wie `ClipsTab.handleStartCinematicSync` (Zeilen 944-972):

- `prepareSceneAnchor(scene, characters, activeBrandChar, scene.aiPrompt)` aufrufen.
- Erfolg → `composer_scenes.reference_image_url` mit dem komponierten Frame in der DB einfrieren UND `referenceImageUrl: composedFirstFrame` an die Edge Function übergeben.
- Fehler → ohne Anchor weitermachen (Logging), damit der Render nicht blockiert.

Dafür müssen `characters` (bereits als Prop vorhanden) und `activeBrandChar` (über `useActiveBrandKit`/`useAccessibleCharacters`-Hook, gleicher Pattern wie ClipsTab) ergänzt werden. Falls bereits importiert, einfach wiederverwenden.

### 2. `src/components/video-composer/SceneDialogStudio.tsx` — `lipSyncWithVoiceover` zuverlässig persistieren

Direkt nach der erfolgreichen Edge-Function-Invocation einen DB-Write nachschießen:

```ts
await supabase
  .from('composer_scenes')
  .update({ lip_sync_with_voiceover: true, engine_override: 'cinematic-sync' })
  .eq('id', sceneIdFinal);
```

So liest `ComposerSequencePreview` das Flag beim nächsten Refresh und ruft `setMuted(false)` automatisch auf — der eingebettete Voiceover wird hörbar, sobald der Sync.so-Output ankommt.

### 3. `supabase/functions/compose-video-clips/index.ts` — Server-side Safety-Net (defensiv)

Im `cinematic_sync_prep`-Block (Zeile 443-517) **bevor** das Hailuo-Routing startet: wenn die Szene **mehr als eine Cast-Rolle** hat UND `referenceImageUrl` keine "anchor"-Markierung trägt (z. B. URL enthält nicht `/scene-anchors/`), dann `compose-scene-anchor` mit `portraitUrls[]` aller Cast-Charaktere aufrufen und `scene.referenceImageUrl` für den Hailuo-Branch überschreiben. So sind auch ältere Re-Rolls / direkte API-Aufrufe abgesichert.

### 4. Kein Render-Engine-Wechsel, kein UI-Redesign

Sync.so/lipsync-2 bleibt unverändert (die korrekte Komposition macht die Active-Speaker-Detection erst möglich). Audio-Mixing, Player-UI, Wallet-Logik und Continuity-Check bleiben unangetastet.

## Out of Scope

- Per-Speaker-Stitching (mehrere Sync.so-Pässe) — die Single-Pass-Detection genügt mit korrektem Anchor.
- Änderungen an `compose-twoshot-audio` (Audio-Merge funktioniert bereits korrekt).
- Refactor der Anchor-Helper / Anchor-Cache.
- HeyGen-Pfad (separater Branch, von diesem Bug nicht betroffen).

## Verifikation

1. Two-Shot mit zwei Cast-Charakteren starten → vor dem Hailuo-Render sollte ein Anchor-Bild im `composer-anchors`/`scene-anchors` Bucket auftauchen, das beide Gesichter zeigt.
2. Sync.so-Output: Sprecher A bewegt nur den Mund während Sekunde 0–X, Sprecher B während X–Y.
3. Player startet automatisch entmutet, gemischter Voiceover ist hörbar.
