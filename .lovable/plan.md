## Befund

User-Report: „Sync trifft jeden Sprecher korrekt, aber manchmal bewegt ein Charakter die Lippen, obwohl sein Skript schon vorbei ist."

Code-Analyse zeigt **zwei voneinander unabhängige Quellen** für dieses Phänomen, beide im Overlay-Schritt (`render-sync-segments-audio-mux/index.ts`, Z. 200–258) bzw. im Tight-Audio-Build (`compose-dialog-segments/index.ts`, Z. 1870–1931):

### Ursache A — Multi-Turn-Aliasing (Hauptverdächtiger)
Wenn ein Sprecher **mehrere Turns** in derselben Szene hat (z. B. Matthew sagt zuerst „Hi", später nochmal „yes"), passiert Folgendes:
- `compose-dialog-segments` baut **ein einziges Tight-WAV** aus allen Turn-Fenstern des Sprechers, getrennt durch 0.05 s Gap (`sliceWavToWindows`, Z. 1900–1904).
- Sync.so liefert **eine zusammenhängende Output-Video-Datei**, die zeitlich der Tight-WAV-Länge entspricht und am Frame 0 mit Turn-1 startet.
- Im Mux (Z. 243–256) wird jeder Turn als **separates Shot mit `sourceTiming: "relative"`** ausgespielt. „relative" bedeutet: Jedes Shot startet im `outputUrl` bei **Output-t = 0** und spielt von dort vorwärts.
- Konsequenz: Turn 2 zeigt im Plate-Fenster `[turn2.start − 0.08, turn2.end + 0.08]` die **Lippenbewegung von Turn 1** (weil der Sync-Output immer wieder am Anfang gestartet wird) — der Charakter „spricht" Wörter, die schon ein paar Sekunden vorher gesagt wurden.

### Ursache B — Decay-Tail-Padding nach Skript-Ende
Auch wenn ein Sprecher nur einen Turn hat:
- Tight-Audio addiert `SEG_PAD = 0.08 s` an Anfang und Ende jeder Turn-Window (Z. 1870–1877).
- Mux-Overlay addiert nochmals `SHOT_PAD = 0.08 s` (Z. 205, 245–246).
- In Summe können die Lippen bis zu **160 ms nach Skript-Ende** weiterzucken, weil Sync.so im gepaddet-stillen Tail trotzdem Mikrobewegungen erzeugt. Bei Charakteren, die direkt nach dem Sprechen still im Bild bleiben, ist das deutlich sichtbar.

Beide Ursachen sind *innerhalb* eines korrekten Sync-Treffers — der Charakter wird richtig ausgewählt, aber das Animationsfenster ist falsch eingegrenzt.

## Plan

### 1. Multi-Turn-Aliasing eliminieren (`compose-dialog-segments/index.ts`)

Beim Build der Tight-Audio merken, wo jeder Turn **im Tight-Output liegt**, und ans `audio_tight`-Objekt anhängen:

```text
audio_tight = {
  url, dur_sec,
  windows_secs: [[plate_start, plate_end], ...],   // bestehend
  output_offsets_sec: [0.000, 0.812, 1.420, ...]   // NEU: Start jedes Turns IM Tight-WAV
}
```

Berechnung: kumulative Summe der Turn-Längen + `gapSec=0.05` Trennstellen (genau wie `sliceWavToWindows` bereits intern macht — wir spiegeln den Output zurück).

### 2. Per-Turn-Offset im Mux nutzen (`render-sync-segments-audio-mux/index.ts`)

In der `fanoutShots`-Map (Z. 243–256):
- Wenn `audio_tight.output_offsets_sec[i]` existiert → Shot erhält neuen Property `sourceStartSec = output_offsets_sec[i]`.
- Shot-Länge bleibt `(e − s)`; Remotion-Compositor spielt also `outputUrl[sourceStartSec .. sourceStartSec + (e−s)]` statt immer ab 0.
- Default bleibt `sourceStartSec = 0` für Sprecher mit nur einem Turn (kein Verhaltensbruch).

### 3. Remotion-Compositor erweitert (`src/remotion/templates/DialogTurnFaceCropVideo.tsx` oder die Audio-Mux-Composition, je nach aktuellem Render-Pfad)

`<Video>`/`<OffthreadVideo>` für jedes Shot bekommt einen `startFrom={Math.round(sourceStartSec * fps)}` Prop. Wenn `sourceStartSec === 0`, identisches Verhalten zu heute.

### 4. Decay-Tail nach Skript-Ende abschneiden

- `SEG_PAD` (compose-dialog-segments, Z. 1870) bleibt 0.08 s **am Anfang** (Konsonanten-Onset-Schutz) — **am Ende** auf `0.02 s` reduzieren.
- `SHOT_PAD` (mux, Z. 205) wird asymmetrisch: `START_PAD = 0.06`, `END_PAD = 0.02`.
- Damit endet das Overlay-Fenster spätestens 20 ms nach Skript-Ende; visuell kein „Nachzucken" mehr, kein Schnitt im Wortausklang.

### 5. Diagnose + Mem

- In `composer_scenes.audio_plan.twoshot.tts_diagnostics` zusätzlich pro Sprecher `output_offsets_sec` und `turns_count` schreiben → in den QA-Logs sofort sichtbar, ob Multi-Turn-Sprecher korrekt versetzt werden.
- Neue Memory-Datei `mem/architecture/lipsync/v90-multi-turn-aliasing-and-tail-clamp.md` mit Erklärung, Konstanten (`START_PAD=0.06`, `END_PAD=0.02`, `GAP_SEC=0.05`) und Verweis auf betroffene Datei-Zeilen.

### 6. Rescue für die aktuell betroffene Szene

- `compose-dialog-segments` nicht neu zahlen — `reset-lipsync-scene` auf die Szene, dann Re-Dispatch nutzt automatisch die neue Tight-Build- und Overlay-Logik (Sync.so wird die kürzeren Tight-WAVs neu generieren; das ist 1× regulärer Render, da `sourceClipUrl` und Identity-Map gleich bleiben).

### 7. Validierung

- DB-Check: `audio_tight.output_offsets_sec.length === segments.length` für jeden Pass.
- ffprobe auf gerenderten Mux: an `turn[i].endTime + 0.05 s` darf das Crop-Region keine erkennbare Mund-Aktivität mehr zeigen (manuell).
- Multi-Turn-Szene reproduzieren (z. B. ein Sprecher hat Turn 1 bei 0.5–1.8 s und Turn 2 bei 5.2–6.4 s): Turn-2-Animation muss tatsächlich Turn-2-Wörter zeigen, nicht die von Turn 1.

## Technische Details

- `sourceTiming: "relative"` bleibt das semantische Konzept; neu ist nur ein zusätzlicher `sourceStartSec`-Offset für die Output-Datei.
- Keine Änderung am Sync.so-Payload, an Bounding-Boxes, am Identity-Mapping oder am Retry-Ladder — der Fix liegt 100 % zwischen Tight-Audio-Build und Lambda-Compositor.
- Falls in der aktiven Mux-Composition `<Video startFrom>` noch nicht zur Verfügung steht (alter Bundle), erfordert das ein neues Bundle-Deploy via `scripts/deploy-remotion-bundle.sh`; das ist bereits etabliertes Muster (siehe v39-Tight-Audio-Rollout).
- `END_PAD = 0.02` ist konservativ — falls in Tests Wortausklang abgeschnitten klingt, auf 0.04 s heben; nie über 0.08 s, sonst kommt der Nachzucken-Effekt zurück.
