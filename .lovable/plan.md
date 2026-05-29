## Was passiert

- Lipsync-Qualität und Charakter-Zuordnung stimmen jetzt ✅
- Aber: das **final Video endet zu früh** — User sieht nur den Anfang der Lipsync, der 3. Satz fehlt komplett. „Kamera shiftet" = das Bild bleibt einfach mittendrin stehen / cuttet weg.

## Wahrscheinliche Ursache (zu validieren)

Unser neuer `compose-dialog-segments` Payload setzt **kein `sync_mode`**:

```ts
// compose-dialog-segments/index.ts Z. 705-720
options: {
  active_speaker_detection: { auto_detect: false, frame_number, coordinates }
}
```

Alle anderen Lipsync-Pfade in der Codebase (`poll-dialog-shots`, `poll-twoshot-lipsync`, `compose-lipsync-scene`, `compose-twoshot-lipsync`) setzen explizit `sync_mode: "cut_off"`. Ohne explizites Setting nimmt Sync.so den Default — und der schneidet bei `lipsync-2-pro` das Output auf die kürzere der beiden Spuren.

In unserem 2-Pass-Chain heißt das:
- **Pass 1 (Speaker A)**: Input video = volles Hailuo-Plate (z.B. 12s), Audio = Speaker A's Track (mit Silence gepadded auf `sceneDur` aus `audio_plan` = z.B. 10s) → Output = 10s. **2s abgeschnitten.**
- **Pass 2 (Speaker B)**: Input video = Pass-1-Output (10s), Audio = Speaker B's Track (10s) → Output = 10s, aber falls B's letzte Turn bei 9.5s endet und Sync.so trailing silence ignoriert, kann es noch kürzer werden.

Ergebnis: User sieht die ersten paar Sekunden, dann ist das Video aus.

Eine zweite mögliche Ursache: `compose-twoshot-audio` paddet auf `sceneDur` (aus `audio_plan.duration` oder `scene.duration_seconds`), aber das tatsächliche Hailuo-Plate kann länger sein. Wir müssen die echte Plate-Dauer mitberücksichtigen.

## Fix-Plan

### Schritt 1 — `sync_mode` explizit setzen

In `supabase/functions/compose-dialog-segments/index.ts` Z. 705–720 den Payload erweitern:

```ts
options: {
  sync_mode: "cut_off",          // explizit, kein Default-Drift
  active_speaker_detection: { ... }
}
```

`cut_off` ist konsistent mit allen anderen Lipsync-Pfaden. Damit weiß Sync.so dass es auf die kürzere Eingabe zuschneidet — wenn beide gleich lang sind, ist das Output voll.

### Schritt 2 — Length-Diagnose vor Dispatch

Im bestehenden `probeAsset()`-Block (Z. 537–540) `videoProbe` und `audioProbes` um echte Dauer-Erkennung erweitern (HEAD → `Content-Length` reicht nicht, daher kurzer Range-GET auf MP4 metadata). Wenn `audioSec < videoSec − 0.5s` ein Warn-Log + `dialog_shots.meta.length_mismatch` schreiben, damit wir die Cause sehen statt zu raten.

### Schritt 3 — Audio auf Plate-Dauer ausrichten (defensiv)

Vor Dispatch:
1. `videoSec` aus Probe lesen
2. Wenn jeder `pass.audio_url` Track kürzer ist als `videoSec`, einmalig in `compose-twoshot-audio` eine Re-Pad-Pfad triggern (oder direkt im Dispatcher mit ffmpeg-padding über eine kurze Helper-Edge-Function)
3. Alternativ einfacher: `sync_mode: "loop"` für die Audio-Track-Schleife — aber das verfälscht Lippen, daher Padding bevorzugen

Mini-Variante (sicherster Schritt zuerst): Schritt 1 + Schritt 2 alleine ausrollen. Das löst sehr wahrscheinlich schon das Symptom. Schritt 3 nur falls die Logs zeigen dass Audio < Video bleibt.

### Schritt 4 — Webhook-Side Sanity

In `sync-so-webhook/index.ts` beim Re-Hosting die Dauer des heruntergeladenen MP4 loggen (ffprobe-Range-Header oder reine Content-Length). Wenn `outputSec < totalSec − 1s` → `dialog_shots.meta.output_truncated = true` setzen, sichtbar im Debugging.

## Was NICHT in den Scope gehört

- Kein Wechsel weg vom 2-Pass-Chain
- Kein neues Modell
- Kein Refactor der Audio-Pipeline
- Keine DB-Schemaänderungen

## Technische Details

**Files:**
- `supabase/functions/compose-dialog-segments/index.ts` (Payload + Length-Probe + Meta-Logging)
- `supabase/functions/sync-so-webhook/index.ts` (Output-Duration-Check)
- Memory-Doc Update: `mem/features/video-composer/sync-segments-dialog-pipeline`

**Rollout:** Erst Schritt 1+2, neu rendern lassen, Logs prüfen. Falls weiterhin truncation → Schritt 3.

## Rückfrage

Soll ich direkt mit Schritt 1+2 starten (minimaler Patch, sehr wahrscheinlich ausreichend), oder vorher noch die DB-Logs einer betroffenen Szene checken um die Dauer-Diskrepanz konkret zu verifizieren?
