## Befund

Der 3-Charakter-Fehler ist behoben: Der neue Clip/Anchor hat exakt 2 sichtbare Personen und das Server-Audit meldet `faces=2/2`, `humans=2/2`, `identity=ok`.

Der aktuelle Lip-Sync-Fehler ist jetzt eine andere Ursache:

- Sync.so bricht schon bei Pass 1 mit `generation_pipeline_failed` ab.
- Unsere aktuelle Pipeline macht 2 sequenzielle Sync.so-Jobs:
  - Pass 1: komplettes 8s-Audio mit nur Matthew-Spur + Stille an Sync.so
  - Pass 2: danach komplettes 8s-Audio mit nur Samuel-Spur auf das Ergebnis von Pass 1
- Das ist für Sync.so fragil, weil `lipsync-2/lipsync-2-pro` laut Doku natürlich sprechende Mundbewegung im Input erwartet. Der Hailuo-Quellclip ist aber ein stiller/nicht sprechender Two-Shot. Sync.so empfiehlt für Multi-Speaker stattdessen die **Segments API** in einem einzigen Job.
- Zusätzlich ist der erste Target-Punkt aktuell zu hoch im Gesicht (`[414,219]`, nahe Augen/Stirn), weil wir Face-Center statt Mund-/untere-Gesichtsregion nutzen. Das kann die Speaker Selection zusätzlich destabilisieren.

## Plan

### 1. Sync.so-Aufruf auf Segments API umstellen

In `compose-twoshot-lipsync` wird für echte Two-Shots nicht mehr die sequenzielle 2-Pass-Strategie verwendet.

Stattdessen:

- Ein einziger Sync.so-Job pro Szene.
- `input` enthält:
  - das Quellvideo
  - pro Sprecher eine eigene Audio-Referenz mit `refId`
- `segments` enthält die tatsächlichen Dialog-Turns aus `audio_plan.twoshot.segments`:
  - Matthew: 0.000–1.440
  - Samuel: 1.440–3.390
  - Matthew: 3.390–4.087
- Damit bekommt Sync.so die Sprecherwechsel offiziell und zeitgenau, statt zwei vollständige Silent-Pass-Audios verarbeiten zu müssen.

### 2. Modell auf `sync-3` für diesen Fall wechseln

Für Cinematic-Sync/Two-Shot nutzen wir Sync.so `sync-3`, weil die Doku explizit sagt:

- `lipsync-2/lipsync-2-pro` haben eine Still-Frame-/Silent-Mouth-Limitation.
- `sync-3` kann stille Lippen öffnen und ist robuster für stillere AI-Video-Inputs.

Die bestehende Policy für Single-Speaker/andere Pfade bleibt unberührt.

### 3. Speaker-Targeting stabilisieren

Die FaceMap bleibt erhalten, aber der Zielpunkt wird für Sync.so von Face-Center auf Mund-/untere-Gesichtsregion verschoben:

- Wenn `bbox` vorhanden ist: x = Mitte der Box, y = ca. 68–72% der Boxhöhe.
- Wenn nur `normCenter` vorhanden ist: y leicht nach unten verschieben.

Das verhindert, dass Sync.so einen Punkt nahe Augen/Stirn bekommt.

### 4. Poller und Statusmodell vereinfachen

`poll-twoshot-lipsync` wird angepasst:

- Es erwartet nur noch einen Segments-Job.
- Bei Erfolg wird der Output gehostet und als finaler `clip_url` gesetzt.
- `audio_plan.twoshot.useExternalAudio` bleibt `true`, damit der finale Export weiterhin die saubere gemischte WAV-Spur nutzt.
- Alte `currentPass/pass 1/pass 2`-Logik bleibt nur als Legacy-Fallback lesbar, wird aber für neue Runs nicht mehr erzeugt.

### 5. Stale Failed-State der aktuellen Szene bereinigen

Die konkrete Szene `faf20fee-2b80-4bec-8af8-88c3662b53a7` wird zurückgesetzt:

- `lip_sync_status` wieder leer/pending
- `twoshot_stage` zurück auf `master_clip`
- `clip_error` löschen
- alte `syncJobs`/`heartbeat` aus `audio_plan.twoshot` entfernen
- Quellvideo und 2-Personen-Anchor bleiben erhalten, damit keine erneuten Hailuo-Kosten entstehen

### 6. Neu auslösen und validieren

Nach der Codeänderung:

- Edge Functions deployen/testen
- Szene neu mit Lip-Sync starten
- Logs prüfen:
  - Sync.so Job wird mit `segments` gestartet
  - kein `generation_pipeline_failed`
  - finale Szene bekommt `lip_sync_status='done'`

## Erwartetes Ergebnis

- Es bleiben exakt 2 sichtbare Charaktere.
- Lip-Sync nutzt die offizielle Multi-Speaker-Segments-Pipeline statt fragiler Mehrfach-Pässe.
- Matthew kann zweimal sprechen, ohne als dritter Charakter gerendert zu werden.
- Sync.so bekommt realistische Mund-Zielpunkte statt Face-Center-Punkte.
- Der aktuelle Clip muss nicht komplett neu erzeugt werden; nur Lip-Sync wird neu versucht.