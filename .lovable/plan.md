# Ehrliche Antwort

Der vorherige Plan (Head/Tail-Freeze der ganzen Master-Plate) **funktioniert**, ist aber **nicht** der sauberste Weg. Er friert bei Kopf-/Schwanz-Bereich auch Hintergrund + Body-Motion ein — das widerspricht deinem Kernwunsch „Bewegungen im Hintergrund zu jeder Zeit möglich". Das ist ein Mux-Hack, keine Architektur.

Hier ist die professionellere Variante.

---

## Teil A — Silent-Window Face-Overlay (statt Full-Frame Freeze)

### Prinzip
Body & Hintergrund kommen **immer** aus der Live-Plate (Hailuo/Kling). Nur der **Mund-/Gesichtsbereich** wird während stiller Fenster durch ein *geschlossener-Mund Standbild-Crop* desselben Sprechers ersetzt. Während voiced-windows: Sync.so-Face-Crop wie heute. Zwischen den Windows: statischer Closed-Mouth Crop desselben Sprechers, an derselben Bbox — nicht die ganze Plate.

Das ist der Ansatz, den professionelle VFX-Pipelines (Facelab, Rope, Wav2Lip-Compositor) fahren: *lipsync = face patch, nichts anderes*.

### Umsetzung

1. **Neuer Preclip-Frame `closed_mouth_still`** pro Pass:
   - `compose-dialog-segments` produziert je Sprecher einen 1-Frame Preclip mit fixem Mund-geschlossen Referenzbild (bereits vorhanden via Anchor-Portrait) oder extrahiert Frame-0 des existierenden Preclips (Anfang = neutraler Mund).
   - Speichern als `dialog_shots.closed_mouth_still_url` + Bbox in Plate-Space.

2. **Mux-Erweiterung** `render-sync-segments-audio-mux`:
   - Für **jeden** Pass wird die Face-Overlay-Timeline erweitert:
     - `[0 .. startSec)` → `closed_mouth_still` Overlay auf Sprecher-Bbox
     - `[startSec .. endSec)` → Sync.so-Output (heute)
     - `[endSec .. sceneEnd)` → `closed_mouth_still` Overlay
   - Master-Plate-Layer läuft **ungestört** durch → Body-Motion + Hintergrund komplett erhalten.
   - Kein Full-Frame-Freeze. `tailFreezeFromSec` / `headFreezeUntilSec` werden **entfernt** (bzw. sind nach dieser Änderung obsolet).

3. **`DialogStitchVideo.tsx`**:
   - `fanoutShots[]` bekommt zusätzliches Feld `silenceOverlay: { url, bbox, from, to }[]`. Renderer legt jedes Silence-Overlay als `<Img>` mit korrekter `crop` + `transform` auf die entsprechende Bbox — mit demselben Post-Processing (feather, color-match) wie der Sync-Output.
   - Kein Freeze mehr.

4. **Fallback**: wenn `closed_mouth_still_url` fehlt (Legacy-Szenen), 1x Log `v183_missing_closed_mouth_still` + Verhalten wie heute (rohe Plate durchreichen). Kein Crash.

### Warum das sauberer ist
- Erfüllt beide Contracts gleichzeitig: „Bewegungen im Hintergrund immer möglich" + „keine Idle-Lippenbewegung außerhalb Skript".
- Kein Provider-Retrain, keine Prompt-Wette. Deterministisch pro Frame.
- Kein zusätzlicher Sync.so-Call (das war der Fehler von v194).

---

## Teil B — Sync.so ASD: bbox-only garantieren

Voraussetzung damit Teil A überhaupt greift (sonst falsche Bbox → Overlay am falschen Ort):

1. `_shared/asd-strategy.ts` → alle `auto_detect:true` Rückgaben löschen (auch N=1).
2. `compose-dialog-segments` Preclip-Branch: wenn crop-local Bbox nicht rechenbar → **hard fail + refund**, statt v99-Downgrade auf `auto_detect`.
3. `sanitizeSync3Options`: Runtime-Guard — Payload mit `auto_detect:true` wird geblockt, `syncso_dispatch_log.blocked_auto_detect=true`, kein `fetch`.
4. `sync-so-webhook` Retry: `retry_variant ∈ {coords-pro, bbox-url-pro}` fix.

---

## Teil C — Cast-ID System: Compile-Time Boundary

Kein Runtime-Assert-Flickenteppich. Eine echte Grenze:

1. **Branded Types** in `src/lib/video-composer/CastRef.ts`:
   ```ts
   export type BaseCharacterId = string & { readonly __brand: 'BaseCharacterId' };
   export type OutfitLookId    = string & { readonly __brand: 'OutfitLookId' };
   ```
   `CastRef.characterId: BaseCharacterId`. TypeScript verhindert dass ein `outfit:xxx`-String jemals hineinläuft.

2. **Einziger legaler Konstruktor** `mentionToCastRef()` — alle anderen Pfade (Scene Director, ProductionPlan, useSceneGenerate, Storyboard) rufen ihn auf oder erhalten `BaseCharacterId` bereits aus DB. Alte `stripPrefix` Funktionen in `useApplyProductionPlan.ts` (Z.62) werden gelöscht.

3. **Server-seitig** `supabase/functions/_shared/cast-id.ts`:
   ```ts
   assertBaseUuid(id, ctx): asserts id is BaseCharacterId
   ```
   In `compose-video-clips`, `compose-dialog-segments`, `compose-scene-anchor`, `twoshot-face-map`, `plate-face-identity`, `sync-so-webhook`, `render-sync-segments-audio-mux`: **eine** Import-Stelle, keine ad-hoc Regexes mehr. Assertion beim DB-Read von `character_shots[].characterId`. Wenn verletzt → Scene `needs_clip_rerender` markieren, kein Ghost-Face-Render.

4. **Backfill-Migration** einmalig: `video_scenes.character_shots[]` durchgehen, `outfit:` / `catalog:` in `characterId` gegen `avatar_outfit_looks` auflösen, in `characterId` (Avatar-UUID) + `outfitLookId` splitten.

5. **Analog Props / Locations / Buildings**: `world_catalog` / `brand_locations` / `brand_buildings` / `brand_props`. Statt `catalog:xxx` im Prompt-String separates `scene.assetRefs: { props, locations, buildings }` Feld (Base-UUIDs). `applySceneAssetsToPrompt` befüllt Namen aus DB.

---

## Verifikation

- Neue 1-Speaker-Szene: Log `v183_silence_overlay speaker=0 windows=2 mode=closed-mouth-still`. Player: Body/Auto/Hintergrund bewegen sich durchgehend, Mund still außerhalb VO.
- Neue 3-Speaker-Fanout-Szene: alle drei Sprecher zeigen jeweils Silence-Overlay in eigenen Bboxes; Hintergrund läuft.
- `syncso_dispatch_log` 24h: 0 Einträge mit `auto_detect:true`; 0 `blocked_auto_detect`.
- `character_shots[*].characterId` in DB: 100% UUID, 0% Prefix (SQL-Check `~ ':'`).
- Anchor-Missing Fehler: 0.
- Alt-Szenen ohne `closed_mouth_still_url` rendern weiter, Log-Zähler `v183_missing_closed_mouth_still` sichtbar für spätere Backfill-Entscheidung.

## Nicht in Scope
- Provider-Prompt (v175 bleibt).
- Sync.so ASD DTO Whitelist (v124 bleibt).
- Preview-Player-Umbau, v194 (bleibt off).
