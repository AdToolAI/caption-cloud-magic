## Was ist passiert

Deine Beobachtung stimmt — mit 4 Sprechern hat es früher problemlos funktioniert, weil Kling-Szenen damals **gar nicht** durch die Sync.so-Multi-Speaker-Preflight liefen. Im letzten Turn habe ich zwei Änderungen an `supabase/functions/compose-video-clips/index.ts` gemacht, die genau das kaputt gemacht haben:

### Regression 1 — Implizites Lip-Sync Opt-in (Zeilen 1113–1120)

Der Hard-Guard `hasOptIn` wurde erweitert:

```ts
const hasOptIn =
  scene.lipSyncWithVoiceover === true ||
  scene.dialogMode === true ||
  (dialogScript.length > 0 && Object.keys(dialogVoices).length > 0);  // NEU
```

Das verletzt die Single-Source-of-Truth in `src/lib/video-composer/lipSyncIntent.ts`, die ausdrücklich sagt: *"NO implicit heuristic (dialog+cast+provider, etc.) may trigger lip-sync."* Genau der Bug den du zwei Turns davor gemeldet hattest ("obwohl Lip-Sync Toggle aus ist, retriggert es automatisch") ist damit wieder da.

### Regression 2 — Kling wird in die Sync-Segments-Pipeline gezogen (Zeilen 2529–2606)

Ich habe Kling-Szenen für `engineOverride ∈ {cinematic-sync, sync-segments}` in die Two-Shot-Pipeline eingehängt:
- setzt `twoshot_stage: "master_clip"` + `lip_sync_status: "pending"`
- benutzt `buildCinematicSyncMasterPrompt` statt `scene.aiPrompt`

Kling produziert aber häufig Klone / Spiegelungen / doppelte Gesichter (genau das Problem, das der v182 N=1 Anti-Clone-Suffix eigentlich mildern soll). Sobald der Multi-Speaker-Preflight in `compose-dialog-segments` (`v153.2_preflight_BLOCK`, Zeile 1718 ff.) auf der Kling-Plate zwei zu nahe beieinander liegende oder duplizierte Face-Boxen findet, blockt er hart:

> "Lip-Sync abgebrochen: die einzelnen Sprecher konnten auf dem Video nicht eindeutig unterschieden werden…"

Genau die Meldung aus dem Screenshot (S01, kling, 2 Sprecher, PROBLEM).

Vorher lief Kling einfach als B-Roll-Provider und die Two-Shot/Sync.so-Pipeline war Hailuo-only — deswegen 4 Sprecher problemlos.

## Fix (nur zurückrollen, sonst nichts)

### 1. `supabase/functions/compose-video-clips/index.ts` — implizites Opt-in entfernen

Zurück auf den ursprünglichen Hard-Guard (Zeile 1113–1120):

```ts
const hasOptIn =
  (scene as any).lipSyncWithVoiceover === true ||
  (scene as any).dialogMode === true;
```

### 2. `supabase/functions/compose-video-clips/index.ts` — Kling-Pfad zurückrollen

Im `else if (scene.clipSource === "ai-kling")` Block (~Zeile 2529):
- `isCinematicSyncScene`-Ableitung + zusätzliches `composer_scenes`-Update mit `lip_sync_source_clip_url/lip_sync_status/twoshot_stage` **entfernen**.
- `masterPrompt = isCinematicSyncScene ? buildCinematicSyncMasterPrompt(scene) : scene.aiPrompt` durch reines `scene.aiPrompt` ersetzen.
- Das zweite `composer_scenes`-Update nach `prediction.id` verliert das `twoshot_stage: "master_clip"` Suffix.
- **Behalten**: den `klingAntiCloneSuffix` und den N=1-Log — die adressieren dein zweites Problem (Klon bei 1 Sprecher) und laufen ohne Sync.so-Preflight-Kopplung.

### 3. Änderung bei `ai-hailuo` (Zeile ~2466) bewusst behalten

Dort ist die Erweiterung `isCinematicSyncScene` um `sync-segments` **korrekt** und war das ursprüngliche Ziel des Turns. Hailuo geht sauber durch die Preflight-Pipeline.

### 4. Redeploy nur der einen Edge Function

```
compose-video-clips
```

`render-sync-segments-audio-mux` und `DialogStitchVideo.tsx` (v182 N=1 Tail-Hold) bleiben unverändert — die betreffen nur den finalen Mux und sind orthogonal.

### 5. Memory

`mem/architecture/video-composer/v182-kling-n1-anticlone.md` bleibt bestehen, aber die Beschreibung wird um einen Absatz ergänzt: *Kling-Szenen laufen NICHT durch die Sync.so Multi-Speaker-Preflight. Anti-Clone-Suffix bleibt auf N=1 Kling beschränkt, keine `twoshot_stage`-Kopplung.*

## Verifikation

Nach Deploy:
1. Kling-Szene mit 2 Sprechern re-rendern → kein `v153_plate_box_duplicate` mehr, kein "Preflight blocked"; Szene läuft als reine Kling-Ausgabe ohne Sync.so.
2. Szene mit Lip-Sync-Toggle AUS + Dialog-Skript + Voices → keine Lip-Sync-Dispatch (Logs: kein `sync-segments` Eintrag).
3. Kling-Szene mit 1 Sprecher → weiterhin `v182_kling_n1_anticlone` Log, weiterhin Anti-Clone-Suffix im Prompt.

## Nicht Teil dieses Plans

- Keine Änderung an Hailuo Cinematic-Sync-Pipeline.
- Keine Änderung am v182 N=1 Tail-Hold (`render-sync-segments-audio-mux` + `DialogStitchVideo.tsx`) — der Fix für "Sprecher bewegen weiter Lippen" bleibt aktiv.
- Kein Ausbau von Kling zu einem echten Lip-Sync-Provider (Kling unterstützt keine `negative_prompt`, kein `start_image`-basiertes Two-Shot-Framing wie Hailuo — daher ist die Preflight-Kopplung strukturell falsch).