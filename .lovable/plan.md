## Kurze Antwort: Nein — der Decoder-Fehler ist nicht die Ursache, er ist der Grund, warum wir sie nicht sehen

Zwei getrennte Dinge, beide gemessen an Szene `7c11bc27…` (01.08., 4 Sprecher):

**Symptom-Ursache (das eigentliche Problem):** Sync.so gibt den Input praktisch unverändert zurück.
- Pass 3 (Sarah): Mund-Bereich Input-Preclip = 3.333, Output = 3.343 → identisch.
- Pass 2 (Matthew): Output 0.46 → praktisch eingefroren, sogar weniger Bewegung als der Input.
- Die Bewegung, die man in den Outputs überhaupt misst, ist die Kamerabewegung der Platte, nicht der Mund.

**Diagnose-Ursache (warum es unbemerkt durchging):** `decodeFrame()` lädt den Bild-Decoder per dynamischem `import(specifier)`. Der Edge-Bundler kann nicht-statische Specifier nicht auflösen → jeder Frame `decoded_0` → jeder Verdict `unknown` → v348 lässt `unknown` bewusst durch → Passthrough-Clips werden als Erfolg gemuxt und abgerechnet.

Und noch wichtiger: **selbst mit repariertem Decoder** hätte die aktuelle Metrik das nicht erkannt. Sie misst nur Frame-zu-Frame-Deltas *innerhalb* des Outputs. Eine schwenkende Platte erzeugt Delta > 0 → Verdict wäre `moved` gewesen, obwohl kein Mund bewegt wurde. Genau deshalb hat sich das so lange im Kreis gedreht.

Nebenbefund: Das Compositing arbeitet korrekt. Alle drei Sprecher-Patches sitzen im finalen Mux exakt auf ihren Koordinaten (950,153), (676,309), (817,194). Da ist nichts kaputt.

## Plan

### 1. Decoder statisch einbinden
`supabase/functions/_shared/mouth-motion-verdict.ts`:
- Dynamische Import-Schleife raus, stattdessen ein statischer Top-Level-Import `import { Image } from "npm:imagescript@1.3.0"`.
- `deno.land/x/imagescript` ersatzlos streichen (Pfad existiert nicht mehr).
- Decode-Fehler behalten ihre konkrete Ursache (`fetch_404`, `bad_dims`, `sample_failed`) statt Sammel-`decode_failed`.

### 2. Neue Metrik: Output **gegen Input** messen
- Für jeden Pass dieselben Timestamps und dasselbe Mund-Rechteck aus **Input-Preclip** und **Output** ziehen (beide 720×720, identische Geometrie — nachgemessen).
- Zwei Kennzahlen: `intraOutput` (Frame-zu-Frame im Output, wie bisher) und `outputVsInput` (Output-Frame ↔ Input-Frame am selben Zeitpunkt).
- Verdicts:
  - `outputVsInput` unter Schwelle → **`passthrough`** → Pass gilt als fehlgeschlagen,
  - `intraOutput` unter Schwelle → `static`,
  - sonst `moved`,
  - Frame-/Decoder-Ausfall → `unknown`, bleibt reine Telemetrie und blockiert nichts (v348-Regel bleibt gültig).
- Schwellen kalibriert an den gemessenen Werten dieser Szene (Passthrough-Referenz: Delta ≈ 0.01).

### 3. Gates nachziehen
- `sync-so-webhook`: `passthrough` wie `static` behandeln → kein `done`, Retry-Pfad, danach ehrlicher Fehler + Credit-Refund statt stiller Auslieferung.
- `render-sync-segments-audio-mux`: blockt `static` **und** `passthrough`; `unknown` bleibt durchlässig mit `motion_unverified`-Log.

### 4. Provider-Ursache belastbar klären (vor jeder weiteren Payload-Änderung)
- Die 4 gespeicherten Sync.so-`job_id`s über die Job-API abfragen und die Provider-Antwort (Modell, ASD-Auswertung, erkannte Gesichter, Warnungen) 1:1 ins Pass-Objekt schreiben.
- Erst wenn dokumentiert ist, *warum* Sync.so nicht animiert (kein aktiver Sprecher in den bounding_boxes, Audio zu kurz, Modell-Fallback …), wird am Payload etwas geändert. Keine spekulativen Geometrie-Tweaks mehr.

### 5. Doku
`mem/architecture/lipsync/v350-…` anlegen: Decoder statisch, `passthrough`-Verdict, v348-Regel „Messausfall killt keine Szene" bleibt. Index aktualisieren.

## Technische Details
- Dateien: `supabase/functions/_shared/mouth-motion-verdict.ts`, `supabase/functions/sync-so-webhook/index.ts`, `supabase/functions/render-sync-segments-audio-mux/index.ts`, neue Memory-Datei.
- Frame-Extraktion bleibt AWS-only (`_shared/aws-frame-probe.ts`), Replicate bleibt gesperrt.
- Kein Eingriff in Preclip-Geometrie, Face-Gates oder Identity-Lock in diesem Schritt.

## Was dieser Plan nicht verspricht
Er macht das Lip-Sync nicht sofort sichtbar. Er sorgt dafür, dass die Pipeline aufhört, Passthrough-Clips als Erfolg zu verkaufen, und liefert erstmals die Provider-Antwort, die zeigt, warum Sync.so nicht animiert. Das ist die Voraussetzung dafür, dass der nächste Schritt ein echter Fix ist.
