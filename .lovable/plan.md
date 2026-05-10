## Ziel
Aus der bereits zusammengeführten 10s-Hook-Karte (Matthew + Sarah) wird auf einen Klick ein einziges 10s-Video, in dem **beide Charaktere gleichzeitig im Bild** zu sehen sind und **nacheinander lippensynchron** sprechen — Artlist-Niveau, ohne Splitten, mit Continuity-Lock.

---

## Schritt 1 — Neue Edge Function `compose-twoshot-lipsync`

Sequenzieller Multi-Face Sync.so Pass auf einem einzigen Master-Clip.

```text
Input:  master_clip_url (10s Hailuo two-shot, kein Lip-Sync)
        audio_plan.speakers[] mit { audioUrl, startSec, endSec, faceIndex }

Pass 1: Sync.so/lipsync-2
        → video = master_clip_url
        → audio = speaker[0].isolatedTrack (Matthew + Stille)
        → active_speaker_face_index = 0
        → result_v1.mp4

Pass 2: Sync.so/lipsync-2
        → video = result_v1.mp4
        → audio = speaker[1].isolatedTrack (Stille + Sarah)
        → active_speaker_face_index = 1
        → result_v2.mp4

Final:  ffmpeg-Mux: result_v2.mp4 + master_voice_track.wav
        → upload composer-clips bucket → final_clip_url
```

Fallback (Plan B) bei Sync.so-`face_index`-Fehler:
- ffmpeg + Gemini Vision Face-Crop (links/rechts der Bildmitte)
- Per-Crop Sync.so Single-Face → Re-Composite via ffmpeg overlay
- Loggen: `lip_sync_strategy = 'face_index' | 'crop_recomposite'`

Idempotenter Refund bei Failure (deterministische UUID aus `scene_id + master_clip_url`).
Timeout: 300s (`supabase/config.toml`).

## Schritt 2 — Routing in `compose-video-clips`

Multi-Speaker-Erkennung erweitern (bereits da: ≥ 2 Sprecher → `compose-twoshot-audio`):

```ts
if (isMultiSpeaker) {
  await compose-twoshot-audio    // (vorhanden) → master + per-speaker tracks
  await Hailuo i2v 10s            // mit Two-Shot-Anchor
  await compose-twoshot-lipsync   // (NEU) statt compose-lipsync-scene
} else {
  await compose-lipsync-scene     // single-speaker bleibt
}
```

`audioPlan.speakers[i].faceIndex` deterministisch aus Reihenfolge im Anchor (links = 0, rechts = 1) — kommt aus der Anchor-Validierung (Schritt 3).

## Schritt 3 — Two-Shot-Anchor + Validierung

In `compose-scene-anchor`:
- Bei `portraitUrls.length >= 2` Prompt-Hint hart einbauen: *"Two-Shot, both characters visible side by side, equal framing, shared lighting and location, eye-level, no cropping of either face"*.
- Nano Banana 2 Edit-Call mit beiden Porträts.

Neue Validierung (Gemini 2.5 Flash Vision):
- Anchor-Bild → Frage: *"Wie viele unterschiedliche Personen sind klar sichtbar? Welche Position hat jede (left/right)?"*
- Bei `count < 2` → automatischer Re-Roll (max 2 Versuche), sonst Hard-Fail mit klarer UI-Meldung.
- Speichere `anchor_face_map = [{ name: "Matthew", position: "left", index: 0 }, { name: "Sarah", position: "right", index: 1 }]` in `composer_scenes.audio_plan` → liefert `faceIndex` für Schritt 1.

## Schritt 4 — UI: Neuer CTA + Multi-Stage-Status

`SceneCard.tsx` (für Multi-Speaker-Hooks):
- Splitten-Button **degradiert** zu sekundärem Link "Als Shot-Reverse-Shot splitten (Legacy)".
- Großer Primär-CTA: **"Two-Shot in echte Szene einbauen (€~1.65)"**.
- Tipp-Banner umtexten: *"Multi-Charakter-Szenen werden jetzt als Two-Shot in einer einzigen 10s-Szene gerendert. Beide sprechen lippensynchron."*

`ClipsTab.tsx` Multi-Stage-Progress (5 Stufen, je mit Spinner + Häkchen):
1. Voiceover synthetisieren (Master + Stems)
2. Two-Shot-Anchor erzeugen
3. Master-Clip rendern (Hailuo 10s)
4. Lip-Sync 1/2 (Matthew)
5. Lip-Sync 2/2 (Sarah)
6. Continuity Check

Status-Quelle: neue Spalte `composer_scenes.twoshot_stage` (text, nullable) — Edge-Functions schreiben Stufen-Marker, UI pollt via vorhandenem Realtime-Channel.

`SceneDialogStudio.tsx`: Auto-Split entfernen — bleibt nur als manueller Legacy-Pfad.

## Schritt 5 — Continuity Guardian für Two-Shot

Nach finalem Render in `compose-twoshot-lipsync`:
- ffmpeg extrahiert 3 Frames (0s, 5s, 9.5s) aus `final_clip_url`.
- Gemini Vision Drift-Score gegen `lock_reference_url` (Anchor):
  - Identitäts-Match je Person (links/rechts)
  - Hintergrund-Konsistenz
  - Beleuchtung
- `composer_scenes.continuity_drift_score` (0–1) + `continuity_drift_notes` persistieren.
- Bei Score > 0.35 UI-Badge: **"Continuity-Drift erkannt — Re-Render?"** (Re-Render-Button triggert Schritt 1+2 mit gleichem Anchor).

---

## Tech-Footprint

| Bereich | Datei | Änderung |
|---|---|---|
| Edge | `supabase/functions/compose-twoshot-lipsync/index.ts` | NEU |
| Edge | `supabase/functions/compose-video-clips/index.ts` | Routing → twoshot-lipsync |
| Edge | `supabase/functions/compose-scene-anchor/index.ts` | Two-Shot-Hint + Vision-Validierung + face_map |
| Config | `supabase/config.toml` | `compose-twoshot-lipsync` 300s timeout |
| DB-Migration | `composer_scenes` | `twoshot_stage text`, `continuity_drift_score numeric`, `continuity_drift_notes jsonb` |
| Frontend | `src/components/video-composer/SceneCard.tsx` | Neuer CTA, Splitten degradiert |
| Frontend | `src/components/video-composer/ClipsTab.tsx` | 6-Stufen-Progress, Drift-Badge |
| Frontend | `src/components/video-composer/SceneDialogStudio.tsx` | Auto-Split entfernen |

## Reihenfolge (Implementierung)

1. DB-Migration (`twoshot_stage`, drift-Felder).
2. `compose-scene-anchor` Two-Shot-Hint + Vision-Validierung + `face_map`.
3. `compose-twoshot-lipsync` Edge Function + Config.
4. Routing in `compose-video-clips`.
5. Continuity Guardian Block am Ende von `compose-twoshot-lipsync`.
6. UI-Änderungen (SceneCard CTA, ClipsTab Multi-Stage, SceneDialogStudio).

## Kosten pro Hook
~€1.65 (Anchor €0.03 · Hailuo €0.95 · Sync.so 2× €0.60 · TTS €0.05 · Vision-Checks €0.02).

## Risiken & Mitigation
- **Sync.so face_index unzuverlässig** → automatischer Crop/Re-Composite-Fallback in Schritt 1.
- **Hailuo zeigt nur 1 Person** → Vision-Validierung in Schritt 3 löst Anchor-Re-Roll.
- **Drift im Master-Clip** → Continuity Guardian zeigt Re-Render-CTA.
- **Render dauert 90–180 s** → Multi-Stage-Status macht Fortschritt sichtbar (löst die ursprüngliche "kein Feedback"-Beschwerde).
