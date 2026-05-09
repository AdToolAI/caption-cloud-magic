## Ziel

Nach „Voiceover generieren“ muss der sichtbare KI-Prompt garantiert den exakten Audio-Plan enthalten:

```text
[Dialog]
Audio plan (exact, do not deviate):
- 0.00s–3.42s  Matthew Dusatko speaks: "..."
- 3.57s–7.18s  Sarah Dusatko speaks: "..."
Total spoken duration: 7.18s. Use this exact speaker order and timing for lip-sync.
[/Dialog]
```

Ja: Das ist der richtige Ansatz wie bei Artlist/AI-Director-Workflows — erst wird ein deterministischer Audio-/Speaker-Plan erzeugt, dann bekommen Video- und Lip-Sync-Schritte genau diesen Plan statt nur „Matthew und Sarah reden abwechselnd“.

## Problem, das ich behebe

Aktuell wird zwar Code für `durationSec/startSec` aufgerufen, aber der Prompt im UI fällt in deinem Screenshot weiter auf den Fallback zurück. Das spricht für einen State-/Persistenzfehler:

- `applyDialogToPrompt(scene.aiPrompt || '', timedBlocks, ...)` nutzt noch den alten `scene.aiPrompt` aus Props.
- Direkt davor wurde oft bereits ein Fallback-Prompt geschrieben.
- Nach TTS wird nur `onUpdate({ aiPrompt: timedPrompt })` ausgelöst, aber die lokale Textarea/Preview kann weiterhin den alten Prompt anzeigen oder beim nächsten Update überschreiben.
- Außerdem fehlt eine klare Speicherung der getimten Blocks im Dialog-State, dadurch kann der Audio-Plan nicht zuverlässig neu aufgebaut werden.

## Umsetzung

### 1. SceneDialogStudio: eine Prompt-Quelle der Wahrheit

Ich ändere die Generate-Flows so, dass nach der TTS-Erzeugung nicht mehr vom stale `scene.aiPrompt` gearbeitet wird, sondern von einem stabilen Prompt-Basiswert:

- Vor TTS: optional Fallback schreiben.
- Nach TTS: den aktuellen Prompt erst von altem `[Dialog]...[/Dialog]` bereinigen.
- Dann den getimten `[Dialog] Audio plan` neu injizieren.
- Diesen finalen Prompt in einem einzigen Update zusammen mit Dialog-/Voiceover-Daten speichern.

### 2. Lokales UI sofort synchronisieren

Falls die Prompt-Textarea intern lokalen State hat, aktualisiere ich diesen State direkt mit dem finalen Audio-Plan, damit du ihn sofort siehst — ohne Reload, ohne erst Szene wechseln zu müssen.

### 3. Timing wirklich aus realem Voiceover ableiten

Für jeden Block:

- `startSec = cumulativeOffset`
- `endSec = startSec + realMeasuredTtsDuration`
- nächster Sprecher startet nach `INTER_SPEAKER_GAP_SEC = 0.15`

Dadurch landet konkret im Prompt:

```text
- 0.00s–2.10s Matthew speaks: "..."
- 2.25s–5.43s Sarah speaks: "..."
```

### 4. SRS/Sub-Szenen ebenfalls hart timen

Wenn „als separate Shot-Reverse-Shot-Szenen rendern“ aktiv ist:

- Parent-Szene bekommt den kompletten Audio-Plan aller Sprecher.
- Jede Sub-Szene bekommt zusätzlich einen Mini-Audio-Plan von `0.00s–durationSec` für genau diese Sprecherzeile.

### 5. Compose-Video-Clips Absicherung

Ich prüfe, ob `compose-video-clips` den Prompt eventuell durch `enrichPrompt(...)` verändert oder abschneidet. Falls ja, stelle ich sicher, dass der `[Dialog] Audio plan` vorne erhalten bleibt und an alle Provider weitergegeben wird.

## Ergebnis

Nach Klick auf „Voiceover generieren“ steht im sichtbaren Prompt nicht mehr nur:

```text
Matthew and Sarah speak to camera...
```

sondern der exakte, providerfertige Audio-Plan mit Sekunden, Sprecher, Text und Gesamtdauer. Damit planen Video, Voiceover und Lip-Sync auf derselben Timing-Wahrheit statt auf Zufall.