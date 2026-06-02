## Befund (Scene `e2b0f980…`, 3-Sprecher cinematic-sync, v9 Pipeline)

DB-Stand für die letzte Szene zeigt zwei separate Probleme:

```
Samuel  window [0.00, 2.32]   coords [197,240]  ✓ Lippen bewegen sich
Matthew window [2.20, 3.50]   coords [439,228]  ✓ Lippen bewegen sich
Kailee  window [3.44, 6.56]   coords [690,276]  ✗ Lippen bewegen sich NICHT
                                                  (Sync.so COMPLETED, output_url_rehosted=true)
gap     window [6.56, 9.00]   – kein Overlay, nur stummer Master-Plate
totalSec=9, master=stumm    – 2.44s Master ohne Lipsync am Ende
```

Sync.so meldet für Kailee „COMPLETED", die Datei ist re-hosted, aber im Stitch sieht man keine Mundbewegung. Zusätzlich gibt es ab 6.56s einen 2.44s langen „nackten" Master-Plate-Abschnitt, der den Eindruck ruckeliger/uneinheitlicher Wiedergabe erzeugt.

## Plan

### 1. Kailee-Bug (Coords/Preclip-Mismatch) härten
- `compose-dialog-segments` / `poll-dialog-shots`: vor jedem `startSyncTurnJob` im **preclip-Modus** Coords gegen die Preclip-Dimensionen revalidieren (statt nur gegen Master). Slot >2 fällt heute durch die normalisierte 0..1 Box von Stage D, weil `validateFrameFace` nur den Master prüft.
- Neuer Stitch-Diagnose-Pass: `validate-frame-face` einmal pro Turn auf das **fertige `output_url`** (Mid-Frame) anwenden. Wenn `faceVisible=true` aber Mund-Box unverändert vs. Preclip-Mid-Frame → markiere `shot.lipsync_noop=true`, refunde anteilig und re-dispatche mit `frame_number_override` + alternativen Coords (slot-aware Heuristik aus N-Slot Face Map).
- Hard-Cap: nach 2 Noop-Retries einmaliger Fallback `sync_source_kind='master'` für genau diesen Turn (Master-Pfad ist für 3+ Speaker derzeit verboten — Ausnahme nur als letzte Stufe, nicht ab Start, damit das `preclip_exhausted_3plus_no_master_fallback` von oben nicht greift).

### 2. Glatte Wiedergabe im Stitch
- `render-dialog-stitch`: wenn `endSec(lastShot) < totalSec - 0.15s`, automatisch `totalSec := endSec(lastShot)` setzen (Szene endet sauber, kein stummer Master-Tail).
- `DialogStitchVideo.tsx`: Crossfade von 3 auf 6 Frames erhöhen UND zwischen aufeinanderfolgenden Speakern eine 2-Frame-Überlappung erzwingen (heute überlappen Matthew/Kailee bereits, aber Samuel/Matthew nicht → harter Cut bei 2.32s).
- Per-Shot `playbackRate` aus `(render_window_dur / output_video_dur)` ableiten, falls Sync.so eine leicht andere Dauer zurückgibt (verhindert Mikro-Ruckler).

### 3. UI: „Abbrechen & sauber neu starten"
- `SceneCard.tsx`: zusätzlich zum bestehenden Abbrechen-Button einen **„🗑 Lipsync-Eintrag löschen"**-Button (auch im `done`/`failed`-State), der `dialog_shots=null`, `lip_sync_status=null`, `clip_url=null`, `clip_status='pending'`, `engine_override` belassen setzt — damit der User aus einem Loop garantiert raus kommt, ohne neue Credits zu verlieren.

### 4. Diagnose & Doku
- Neue Spalte `dialog_shots.shots[].stitch_diagnostics` mit `{ output_face_visible, output_mouth_delta_px, validated_at }`.
- Mem-Update: `mem/architecture/lipsync/dialog-shot-pipeline` v9 → v10 (Noop-Detection + clean totalSec + 6-Frame Crossfade).

### Geänderte Dateien
- `supabase/functions/poll-dialog-shots/index.ts`
- `supabase/functions/render-dialog-stitch/index.ts`
- `supabase/functions/_shared/syncso-preflight.ts`
- `src/remotion/templates/DialogStitchVideo.tsx`
- `src/components/video-composer/SceneCard.tsx`
- `mem/features/video-composer/dialog-shot-pipeline`

### Was NICHT geändert wird
- v9 No-Chaining-Regel, isolierte per-Speaker-Audios, master_audio_url-Policy bleiben unverändert.
- Keine Schema-Migration (Diagnostics liegen im bestehenden JSONB).
