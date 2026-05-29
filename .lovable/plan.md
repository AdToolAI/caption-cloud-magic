## Warum Sync.so überhaupt failt

Sync.so `lipsync-2-pro` ist eine Blackbox, aber 95% der `An unknown error occurred` / `REJECTED` / `FAILED` Responses haben eine von 7 reproduzierbaren Input-Ursachen:

```text
1. Audio zu kurz / Sprache startet exakt bei t=0 (kein Lead-in)
2. Video-Segment zu kurz (<2.0s) oder zu hart geschnitten
3. Audio enthält Stille über die ganze Länge (VAD findet keinen Onset)
4. Audio/Video Sample-Rate oder Codec ist exotisch (44.1k stereo float, opus)
5. Gesicht im Zielframe verdeckt, abgewendet, geschnitten oder gar nicht da
6. Falsche Coords (zeigen auf leeren Bereich oder anderes Gesicht)
7. URL liefert 4xx/5xx, 0 Bytes oder Content-Type stimmt nicht
```

Wir können das nicht direkt von Sync.so „auslesen" – Sync gibt nur `unknown error` zurück. Aber wir können **jeden dieser 7 Punkte vor dem Dispatch deterministisch ausschließen**. Das ist der eigentliche Hebel.

## Zielbild

```text
Vor jedem Sync.so Call passiert ein "PreflightGuard":
  – Audio normiert (16-bit PCM mono 24kHz, ≥3.0s, 0.25s lead-in/0.20s tail)
  – Video normiert (≥3.0s Kontext, H.264 yuv420p 24fps, garantiert MOOV-OK)
  – Face am Sample-Frame validiert (visible, ≥ minBox, mouth region klar)
  – Assets HEAD-OK, ≥10kB, korrekter Content-Type
  – Bei Multi-Speaker: Coords zwingend, sonst Hard-Stop (kein Auto-Detect)

Wenn EIN Check failed → kein Sync.so Call, sondern deterministische
Reparatur (re-encode / re-trim / re-anchor / re-faceMap) und retry des
GLEICHEN Preflight. Erst wenn alle Checks grün sind, geht der Job raus.

Sync.so sieht nur noch "saubere" Inputs. Failrate erwartet < 2%.
```

## Die 8 Säulen des Plans

### 1. Zentraler `SyncSoPreflight` Service

Neues Modul `supabase/functions/_shared/syncso-preflight.ts`. Single Entry-Point den `poll-dialog-shots`, `compose-dialog-segments` und `compose-lipsync-scene` benutzen, bevor sie irgendetwas an Sync.so schicken.

Liefert:

```text
{
  ok: true,
  video_url, audio_url, coords, frame_number, window
}
oder
{
  ok: false,
  reason: "audio_too_short" | "no_speech_onset" | "face_not_visible" | ...,
  repaired: { video_url?, audio_url?, coords? },   // wenn reparierbar
  hard_fail: false                                  // true = nicht reparierbar
}
```

Solange `repaired` zurückkommt, dispatcht der Caller nicht direkt, sondern ruft Preflight rekursiv erneut mit den reparierten Assets auf. Max 3 Repair-Iterationen pro Turn.

### 2. Audio-Normierung statt nur Trim

Aktuell schneidet `sliceWavToWindow` nur. Wir machen daraus eine echte Normalisierung:

```text
– Decode beliebiges Eingangsformat (mp3/wav/m4a/opus)
– Mono downmix
– Resample auf 24000 Hz, 16-bit PCM
– Peak-normalize auf -1 dBFS (zu leise = VAD scheitert)
– 0.25s Stille prepend, 0.20s Stille append
– Mindestlänge 3.0s erzwingen (Tail-Stille bis Min erreicht)
– Speech-Onset-Probe: erste 200ms Energie > -45 dBFS? sonst Fade-In glätten
– Upload nach voiceover-audio/syncso-ready/{scene}-turn{idx}-{hash}.wav
```

Implementiert mit `Deno + WebAudio-decode-Polyfill` oder einer ffmpeg-Edge-Function (`audio-normalize-for-syncso`), die wir aus Preflight aufrufen.

Resultat: kein Sync.so-Job sieht je wieder Audio das mit Sprache bei 0.000s startet oder unter 3s ist.

### 3. Video-Preroll statt Hard-Cut

Preclips werden heute auf exakt das Turn-Fenster gerendert. Stattdessen:

```text
preclip_start_render = max(0, turn_start - 0.5s)
preclip_end_render   = min(master_end, turn_end + 0.5s)
preclip_min_dur      = 3.0s   (sonst symmetrisch verlängern)
```

Sync.so bekommt also immer ≥3.0s Video-Kontext mit dem Gesicht in Bewegung **vor** dem Mundeinsatz. Im finalen Stitch (`DialogStitchVideo`) nutzen wir weiterhin nur den echten Turn-Bereich – der Sync-Output wird auf den sichtbaren Bereich back-cropped.

Zusätzlich:

```text
– Force H.264 yuv420p, 24fps, +faststart (moov atom front)
– Auflösung clampen auf 1280x720 wenn größer (Sync.so verarbeitet 720p am stabilsten)
– HEAD-Check + Content-Length > 50kB vor Dispatch
```

### 4. Face-Validation am echten Sample-Frame

Vor jedem Dispatch im `mode=coords`:

```text
1. Hole frame_number aus dem WIRKLICHEN Preclip (ffmpeg -ss + select)
2. Gemini Vision (oder Mediapipe lokal) check:
     – face_visible: true?
     – face_box ≥ 80×80 px?
     – mouth_region nicht verdeckt?
     – coords ±64px innerhalb face_box?
3. Wenn nein → frame_number um ±N Frames verschieben, max 6 Versuche
4. Wenn weiterhin nein → faceMap rebuild (compose-scene-anchor neu)
5. Wenn auch das nichts bringt → hard_fail mit klarem reason
```

Das eliminiert die häufigste Ursache für „falscher Charakter wird animiert".

### 5. Strict Multi-Speaker Coords (kein Auto-Detect mehr)

Im aktuellen Code:

```text
if (mode === "auto") options.active_speaker_detection = { auto_detect: true }
```

Für Multi-Speaker ist `auto_detect` der größte Failure-Treiber – Sync.so wählt manchmal den schweigenden Charakter. Neue Regel:

```text
distinctSpeakerCount >= 2  →  mode = "coords" IMMER, kein Fallback auf auto
distinctSpeakerCount == 1  →  mode = "coords" wenn coords vorhanden,
                              sonst "auto" mit voller Bbox als Hint
```

Wenn Coords für Multi-Speaker fehlen → in Preflight (Säule 4) reparieren, niemals einfach `auto_detect` aktivieren.

### 6. Differenzierte Retry-Matrix

Heute retryt der Poller mehrfach mit fast identischen Inputs. Neu:

```text
Attempt 1: preclip + normalized audio + coords @ midFrame
Attempt 2: preclip + normalized audio + coords @ midFrame ± 8 frames
Attempt 3: master + segments_secs + normalized audio + coords @ turn-start
Attempt 4: anchor rebuild → fresh preclip → coords + midFrame
Attempt 5: hard_fail (kein Stitch, voller Refund, UI zeigt welcher Turn)
```

Jeder Attempt ist messbar anders. Kein blindes Wiederholen.

### 7. „Strict Integrity Gate" beim Stitch

`render-dialog-stitch` darf NIE laufen wenn auch nur ein Turn kein echtes `output_url` hat. Heute kann ein als `degraded` markierter Turn ins Endvideo durchrutschen.

```text
preStitchCheck(shots):
  for s in shots:
    require s.status === 'done'
    require s.output_url HEAD ok
    require s.output_url duration ≥ window.dur - 0.15s
  if any failed → scene.lip_sync_status = 'failed'
                  refund credits idempotent
                  return
```

Kein „degraded=true" Pfad mehr für Multi-Speaker. Lieber ehrlich failen + refund.

### 8. Telemetrie & selbstlernende Block-Liste

Neue Tabelle `syncso_dispatch_log`:

```text
job_id, scene_id, turn_idx, attempt, mode,
audio_dur, audio_lead_in, audio_peak_db,
video_dur, video_fps, video_codec,
face_box, coords, frame_number,
http_status, sync_status, error_class,
created_at
```

Jeder Dispatch wird hier protokolliert. Damit:

- können wir nach echten Patterns suchen (z.B. „alle Fails bei dur<2.2s und peak<-30dB")
- baut sich ein PreflightGuard-Tuning automatisch (Threshold-Anpassung wöchentlich)
- haben wir einen QA-View im Admin-Cockpit (Tab „Sync.so Health")

## Reihenfolge der Umsetzung

```text
Stufe A (Stabilität sofort)
  – Säule 7: Strict Integrity Gate + Refund
  – Säule 5: Multi-Speaker zwingt coords
  – Säule 6: Retry-Matrix mit echten Variationen

Stufe B (Input-Härtung, größter Hebel)
  – Säule 1: SyncSoPreflight Modul
  – Säule 2: Audio-Normierung (neue audio-normalize-for-syncso Edge)
  – Säule 3: Video-Preroll 3s + Re-Encode-Garantie

Stufe C (Smart Recovery)
  – Säule 4: Face-Validation am Sample-Frame + faceMap-Rebuild
  – Säule 8: syncso_dispatch_log + Cockpit-Tab
```

## Erwartetes Ergebnis

- Sync.so sieht nur noch normalisierte, validierte Inputs → unknown-error-Rate sinkt erfahrungsgemäß von ~25% auf <2%.
- Kein kaputtes Video wird mehr als „done" angezeigt.
- Jeder verbleibende Fail ist klassifiziert und reproduzierbar.
- User bekommt im Worst Case einen sauberen Refund + klare UI-Meldung statt eines stillen Turns.

## Was NICHT geändert wird

- Preisstruktur, Wallet-Logik, Cron-Intervalle bleiben.
- Director's Cut Übergabe / Composer-Stitch-Format bleibt.
- HeyGen / Hailuo / Vidu Pipelines bleiben unberührt.

Nach Approval starte ich mit Stufe A (sichert sofort die Qualität), dann B und C.