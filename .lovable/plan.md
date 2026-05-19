# Two-Shot Lipsync auf Artlist-Niveau bringen

## Warum es aktuell schiefgeht

Ich habe die fehlgeschlagene Szene (`ab0b0a8e-…`) in der DB inspiziert. Zwei Befunde erklären beide Symptome (Lipsync versetzt + Samuel ist stumm):

1. **Der Quellclip zeigt nur ein Gesicht.** `composer_scenes.reference_image_url` ist `NULL` — d. h. `compose-scene-anchor` wurde für diese Szene nie erfolgreich aufgerufen, bevor Hailuo das i2v-Video gerendert hat. Hailuo hatte also keinen komponierten Two-Shot-First-Frame und hat (wie üblich bei reinem Text-to-Video) nur **eine** Person gerendert.
2. **Stiller Fallback auf Single-Pass.** Weil Gemini im fertigen Clip nur 1 Gesicht findet (`faceMap.faces.length = 1`), greift mein letzter Fix und schickt **eine** Pass mit der gemischten VO + Auto-Detect an Sync.so. Resultat: Matthews Mund bewegt sich zu beiden Stimmen, Samuels Stimme klingt versetzt, Samuel selbst ist nie zu sehen.

So macht es **Artlist**: Sie generieren erst dann lippensynchron, wenn der Quellclip nachweislich N sichtbare Gesichter enthält (N = Anzahl Sprecher). Sonst rerollen sie den Clip — sie versuchen niemals 2 Stimmen auf 1 Mund zu mappen.

## Plan

### 1. Garantierte Two-Shot-Komposition vor i2v
In `compose-video-clips` (cinematic-sync-Zweig, Zeilen 520–575):
- Nach `compose-scene-anchor` einen **Face-Count-Check** auf das zurückgegebene Frame laufen lassen (Gemini Vision, 1 Call).
- Wenn `faces < character_shots.length` → Anchor mit verschärftem Prompt einmal neu komponieren ("wide two-shot, both faces fully visible at equal screen share, no occlusion, no back-of-head"). Max. 1 Retry.
- Wenn auch der Retry scheitert → Szene auf `clip_error='anchor_missing_speakers'` setzen, Credits refunden, UI zeigt "Anchor zeigt nicht alle Sprecher — bitte Shot/Prompt anpassen".
- Den verifizierten `faceMap` (mit Gesichts-Center-Koordinaten **aus dem Anchor**) direkt in `audio_plan.twoshot.faceMap` persistieren, damit Sync.so später nicht noch mal raten muss.

### 2. Stärkerer Anchor-Prompt für Multi-Char
In `compose-scene-anchor`: Wenn `portraitUrls.length ≥ 2`, hartcodiert anhängen: *"Both subjects fully visible, equal frame share, both faces front-3/4 to camera, no occlusion between them, no single-character close-up."* + Negativ-Prompt `"single person, one face cropped, back of head, profile silhouette"`.

### 3. Post-Clip Face-Audit vor Lipsync
In `compose-twoshot-lipsync` (Zeilen 680–715):
- **Stillen Fallback entfernen.** Wenn `passes.length ≥ 2` und `faceMap.faces.length < 2`:
  - Status auf `failed` mit `clip_error='source_clip_missing_speakers'`, Credits refunden, **UI-Button "Clip neu rendern"** anbieten.
  - **Nicht** mehr single-pass mit merged VO laufen lassen — das ist genau die Misalignment-Quelle.
- Beibehalten: bei genau 1 Sprecher → Single-Pass (das ist legitim).

### 4. UI: "Clip + Lipsync neu rendern" Quick-Action
In `ClipsTab.tsx` neben dem "Lipsync neu rendern"-Button: zweite Aktion **"Clip + Lipsync neu rendern"**, die zuerst `reference_image_url = NULL` setzt, dann den cinematic-sync Re-Roll-Flow (Pfad ab Zeile 828) triggert. Das ist der manuelle Notausgang, wenn die automatische Anchor-Verifizierung das Limit erreicht.

### 5. Optional, aber empfohlen: Multi-Ref i2v für ≥2 Charaktere
Für cinematic-sync Szenen mit ≥2 `character_shots` automatisch auf **Vidu Q2 reference2v** routen statt Hailuo i2v. Vidu nimmt bis zu 7 Subject-Refs nativ entgegen und liefert deutlich zuverlässigere Two-Shots. Hailuo bleibt Fallback für Single-Char. (Gemäß Memory `vidu-q2-multi-reference-integration`.)

### 6. Aktuelle Szene reparieren
`ab0b0a8e-…` zurücksetzen: `reference_image_url=NULL`, `clip_url=NULL`, `lip_sync_status=NULL`, `clip_error=NULL`, `twoshot_stage=NULL`. Dann mit der neuen Pipeline einmal komplett re-rollen.

## Technische Details

- Gemini-Face-Count nutzt `google/gemini-2.5-flash` (bereits in `detectFacesInMaster`) — Wir extrahieren die Funktion in `_shared/face-count.ts` und teilen sie zwischen `compose-video-clips` (Pre-Check) und `compose-twoshot-lipsync` (Post-Check). Cache-Key: Bild-URL → Zähler.
- Refund-Logik: vorhandener `refund-credits`-Pfad wird mit `reason='anchor_missing_speakers'` und `'source_clip_missing_speakers'` erweitert (idempotent über deterministische UUID aus `scene_id + reason`).
- Datei-Änderungen:
  - `supabase/functions/compose-scene-anchor/index.ts` — Two-Shot Prompt-Härtung
  - `supabase/functions/compose-video-clips/index.ts` — Pre-Flight Face-Audit + Retry
  - `supabase/functions/compose-twoshot-lipsync/index.ts` — stillen Single-Pass-Fallback entfernen, Fail-Loudly
  - `supabase/functions/_shared/face-count.ts` — neu
  - `src/components/video-composer/ClipsTab.tsx` — "Clip + Lipsync neu rendern" Button + Vidu-Routing für Multi-Char
  - Memory-Update: `mem://architecture/lipsync/sync-so-pro-model-policy` (neue Pre-Flight + No-Silent-Fallback-Regel)

## Akzeptanzkriterien
- Eine Szene mit 2 Sprechern wird nie lippensynchronisiert, wenn der Quellclip <2 Gesichter zeigt — stattdessen klare Fehlermeldung + Re-Roll-Button.
- Re-Roll der aktuellen Szene produziert einen Two-Shot mit Matthew **und** Samuel, beide bewegen ihre Lippen synchron zu ihrer jeweiligen Stimme.
- Credits werden bei jedem Fail automatisch refundiert.
