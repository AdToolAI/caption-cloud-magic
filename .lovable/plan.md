## Befund

Du hast recht: Szene 2 hängt nicht, weil sie „langsam“ ist, sondern weil der Pipeline-Zustand kaputt ist.

Aktueller Datenstand für Szene 2:

- `clip_status = generating`
- `clip_url` ist bereits vorhanden
- `lip_sync_status = pending`
- `clip_error = Insufficient credit. This operation requires 'api' credits.`
- Es gibt keine `scene_audio_clips` für das Projekt
- Für `compose-lipsync-scene` gibt es keine Logs zum Lauf — der Lip-Sync-Schritt wurde also nicht sauber gestartet

Der Kernfehler liegt in der State Machine: Sobald ein Cinematic-Sync-Clip eine `clip_url` hat, wird er aktuell nicht als „Hailuo-Render fertig“ behandelt, weil `lip_sync_status=pending` ist. Dadurch startet der automatische Lip-Sync nicht zuverlässig, und die UI bleibt endlos bei „Wird generiert…“.

Zusätzlich ist die „2. Lip-Sync in die Szene packen“-Logik noch nicht die Artlist-ähnliche Produktionslogik. Sie hängt aktuell eher einzelne Talking-Head/Lip-Sync-Clips hintereinander, statt sie als echte Dialog-Cuts in die gewünschte Szene einzubauen.

## Ziel

Cinematic-Sync soll als klare mehrstufige Pipeline laufen:

```text
Scene Anchor / Ensemble Frame
        ↓
Hailuo rendert echte Szene
        ↓
Hailuo-Clip wird als Zwischenresultat fertig markiert
        ↓
Voiceover/Lip-Sync wird validiert
        ↓
Single Speaker: Sync.so auf die echte Szene
Multi Speaker: Shot-Reverse-Shot Dialog-Cuts in der gleichen Szene
        ↓
Finale Szene/Sequenz ist fertig, hörbar und nicht doppelt/stumm
```

## Umsetzungsplan

### 1. Cinematic-Sync State Machine reparieren

- `clip_status` darf nur den Video-Render beschreiben.
- `lip_sync_status` beschreibt separat den Sync-Schritt.
- Wenn eine Cinematic-Sync-Szene `clip_url` hat, wird sie als Hailuo-Zwischenrender fertig behandelt, statt endlos `generating` zu bleiben.
- Der Fortschritt zeigt künftig klar:
  - „Szene gerendert“
  - „Lip-Sync läuft“
  - „Voiceover fehlt“
  - „Lip-Sync fehlgeschlagen“
  - „Final fertig“

### 2. Auto-Trigger für Lip-Sync robust machen

- Der Lip-Sync wird nicht mehr nur beim Übergang `generating → ready` gestartet.
- Wenn beim Polling erkannt wird:
  - Cinematic-Sync aktiv
  - `clip_url` vorhanden
  - `lip_sync_status = pending`
  - gültige Voiceover-Quelle vorhanden

  dann wird `compose-lipsync-scene` aktiv gestartet.

- Vor dem Invoke wird der Status auf `running` gesetzt, damit der Browser nicht mehrfach denselben Sync startet.
- Wenn keine Voiceover-Quelle existiert, wird `no_voiceover` gesetzt und nicht weiter endlos generiert.

### 3. Fehlende Voiceover-Spiegelung lösen

- Wenn `audioPlan.speakers[].audioUrl` vorhanden ist, aber noch kein `scene_audio_clips`-Eintrag existiert, wird dieser vor dem Lip-Sync gespiegelt.
- Dadurch erkennt Backend, Preview und Export dieselbe Tonquelle.
- Wenn nur Dialogtext existiert, aber kein Audio, wird die Szene nicht als fertig markiert, sondern fordert erst Voiceover-Erzeugung an.

### 4. Multi-Speaker korrekt routen

Für mehrere sprechende Charaktere wird kein Fake-Multi-Face-Lip-Sync in einem einzigen Clip versprochen.

Stattdessen:

- Ensemble-Shot: alle gewählten Charaktere sichtbar in der Szene.
- Dialog-Cuts: pro Sprecher ein eigener Shot-Reverse-Shot-Cut mit eigenem Voiceover und Lip-Sync.
- Die Cuts werden anhand der AudioPlan-Zeitfenster in der richtigen Reihenfolge abgespielt.
- Am Ende kann wieder ein Ensemble-Shot folgen, in dem alle Charaktere sichtbar sind.

Das entspricht dem professionellen Schnittprinzip: nicht „ein Gesicht spricht alles“, sondern jede Sprecherzeile bekommt den passenden sichtbaren Charakter.

### 5. UI-Blockierung verhindern

- „Weiter zu Voiceover & Untertitel“ bleibt deaktiviert, solange Cinematic-Sync noch `pending` oder `running` ist.
- Bei `failed` oder `no_voiceover` zeigt die Szene eine konkrete Aktion statt endlosem Spinner:
  - „Voiceover erzeugen“
  - „Lip-Sync erneut starten“
  - „Als stumme Szene verwenden“

### 6. Preview/Export-Audio reparieren

- Globales Voiceover wird nur stummgeschaltet, wenn wirklich eine per-scene Voiceover-Spur oder eingebetteter Lip-Sync existiert.
- `lipSyncWithVoiceover=true` allein darf keinen Ton muten.
- Dadurch verschwinden die Effekte „zwei Lip-Syncs hintereinander“ und „ohne Sound“.

### 7. Aktuelle Szene 2 bereinigen

Für dein aktuelles Projekt wird Szene 2 zurück in einen sauberen Zustand gebracht:

- vorhandene `clip_url` bleibt erhalten
- falscher Endlos-Status wird entfernt
- `lip_sync_status` wird auf einen ehrlichen Zustand gesetzt
- alter `clip_error` wird nicht mehr versteckt, sondern als konkreter Fehler/Aktion angezeigt

## Betroffene Dateien

- `src/components/video-composer/ClipsTab.tsx`
- `src/components/video-composer/SceneCard.tsx`
- `src/components/video-composer/ComposerSequencePreview.tsx`
- `src/hooks/useSceneAudioClips.ts`
- `supabase/functions/compose-lipsync-scene/index.ts`
- optional: Datenreparatur für Projekt `6f448619-7af6-4ed5-902c-dde6f5973ba5`

## Ergebnis nach Umsetzung

- Szene 2 bleibt nicht mehr endlos bei „Wird generiert…“ hängen.
- Hailuo-Render und Lip-Sync werden getrennt sichtbar und steuerbar.
- Fehlendes Voiceover führt zu einer klaren Aktion, nicht zu einem stillen Spinner.
- Multi-Character-Dialog wird als echte Cut-Sequenz aufgebaut, statt zwei Lip-Syncs stumpf hintereinander ohne Szenenintegration abzuspielen.
- Preview und Weiter-Tab spielen Audio wieder korrekt.

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>