## Befund

Der Backend-Status ist gesund. Der Fehler kommt aus der Sync.so-Verarbeitung selbst: mehrere Jobs enden mit `sync_FAILED: An unknown error occurred`.

Die aktuelle Pipeline ist noch nicht Artlist-robust, weil sie weiterhin Sync.so mit `segments_secs` auf dem langen Master-Video plus statischen Face-Koordinaten füttert. Das ist fragil:

- Sync.so muss intern einen Ausschnitt aus einem langen Video verarbeiten.
- Die Audioseite wird zwar vorgetrimmt, das Video aber nur per `segments_secs` referenziert.
- Die Face-Koordinaten stammen aus Anchor/FaceMap und sind statisch, obwohl das generierte Master-Video Bewegung/Kameradrift haben kann.
- Nach mehreren Retry-Varianten scheitern weiterhin ganze Turns; das bestätigt, dass nicht nur das Frame-Sampling falsch war, sondern die Grundstruktur noch zu provider-fragil ist.

## Ziel

Die Dialog-Lip-Sync-Pipeline wird so umgebaut, dass jeder Sprecher-Turn zuerst als eigener kurzer Video-Clip materialisiert wird. Sync.so bekommt dann keinen langen Master mit `segments_secs`, sondern einen kleinen, sauberen Turn-Clip ab Sekunde 0 plus exakt passenden Audio-Slice. Danach wird alles deterministisch wieder in den Master gestitcht.

Das ist näher an einer Artlist-ähnlichen Pipeline: segmentieren, isoliert verarbeiten, deterministisch zusammensetzen.

## Umsetzung

### 1. Per-Turn Video-Preclip einführen

Neue Remotion-Komposition:

```text
DialogTurnClipVideo
masterVideoUrl + startSec + endSec -> kurzer MP4-Clip ab t=0
```

Eigenschaften:

- rendert exakt das `render_window` eines Turns
- gleiche Breite/Höhe/FPS wie Master
- muted, ohne Audio
- Ergebnis ist ein eigenständiger kurzer Turn-Clip

### 2. Neue Backend-Funktion für Turn-Preclips

Neue Funktion `render-dialog-turn`:

- liest `composer_scenes.dialog_shots`
- sucht den Turn per `sceneId + shotIdx`
- erstellt einen `video_renders` Eintrag mit Quelle `dialog-turn-preclip`
- startet Remotion Lambda für `DialogTurnClipVideo`
- speichert Render-ID im jeweiligen Shot-JSON

Keine neue Tabelle nötig; wir nutzen weiterhin `dialog_shots` JSON und `video_renders`.

### 3. Webhook für Turn-Preclips erweitern

`remotion-webhook` bekommt einen neuen Pfad für `source='dialog-turn-preclip'`:

- bei Erfolg: `shot.preclip_url = outputFile`, `shot.status = 'pending'`
- bei Fehler: Shot retrybar markieren, nicht sofort ganze Szene zerstören
- danach `poll-dialog-shots` fire-and-forget anstoßen

### 4. Poller-Lifecycle erweitern

`poll-dialog-shots` wird von:

```text
pending -> lipsyncing -> ready
```

auf:

```text
pending -> preclipping -> pending_with_preclip -> lipsyncing -> ready
```

umgestellt.

Wichtig: Für Sync.so wird dann primär verwendet:

```text
video = shot.preclip_url
video segments_secs = KEINE
frame_number = segment-relative im kurzen Clip
audio = shot.trimmed_audio_url
```

Damit entfällt die fragile Kombination aus langem Master-Video + `segments_secs` + absolut/relativem Frame-Verhalten.

### 5. Sync.so Dispatch anpassen

`startSyncTurnJob` erhält einen Modus:

- `segmented_master` nur noch als Legacy-/Fallback-Strategie
- `preclip` als neuer Standard

Im `preclip` Modus:

- kein `segments_secs` auf dem Video
- `frame_number` wird gegen die kurze Clipdauer geclempt
- Audio bleibt der exakt getrimmte WAV-Slice
- aktive Sprechererkennung bleibt bei Multi-Speaker koordinatenbasiert, aber ohne Segment-API-Risiko

### 6. Finales Stitching korrigieren

`DialogStitchVideo` muss unterscheiden:

- alte Sync.so Outputs aus `segments_secs`: `startFrom = startFrame`
- neue Preclip Sync.so Outputs: `startFrom = 0`

Dafür bekommt jeder Shot im Stitch-Payload ein Feld wie:

```text
sourceTiming: 'relative' | 'absolute'
```

Bei Preclip-Outputs wird der kurze lipsynced Clip ab Frame 0 in das ursprüngliche `render_window` gelegt.

### 7. Failure-Handling sauberer machen

Aktuell können Shots bereits `failed` sein, während die Szene noch `running` bleibt, weil andere Shots weiterlaufen. Das wirkt wie ein 15-Minuten-Abbruch.

Ich ändere das Verhalten so:

- ein Turn-Failure stoppt keine Szene, solange Preclip-Fallback noch möglich ist
- terminal failed erst, wenn Preclip + Sync-Retries ausgeschöpft sind
- `clip_error` bekommt die genaue Strategie, z. B. `preclip_sync_failed_after_retries`
- Refund bleibt idempotent nur bei finalem Abbruch

### 8. Betroffene Szenen sauber neu starten

Nach dem Deployment:

- die fehlgeschlagenen Szenen (`a500df2e...`, `7842c6f6...`) in einen sauberen Dialog-Status zurücksetzen
- `compose-dialog-scene` neu anstoßen
- prüfen, dass jeder Turn erst `preclip_url`, dann `output_url`, dann final `clip_url` bekommt

## Dateien

Voraussichtlich betroffen:

- `supabase/functions/poll-dialog-shots/index.ts`
- `supabase/functions/sync-so-webhook/index.ts`
- `supabase/functions/render-dialog-turn/index.ts` neu
- `supabase/functions/remotion-webhook/index.ts`
- `src/remotion/templates/DialogTurnClipVideo.tsx` neu
- `src/remotion/templates/DialogStitchVideo.tsx`
- Remotion Composition-Registry (`src/remotion/index.ts` oder Loader, je nach bestehender Registrierung)
- Projekt-Memory zur neuen Artlist-Style Pipeline

## Nicht im Scope

- Kein Provider-Wechsel
- Keine neue Datenbanktabelle
- Keine UI-Änderung
- Keine Entfernung der Refund-Sicherheit