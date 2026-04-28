# Hintergrundmusik im Export sichtbar & hörbar machen

## Diagnose

Die Hintergrundmusik **wird** technisch in den Export übertragen — die Datenkette ist intakt:

```text
AudioTab (assemblyConfig.music)
  → updateAssembly() debounced DB-Write (800ms)
  → Render-Klick: persistAssemblyConfig() flush vor Edge-Call
  → compose-video-assemble liest assembly_config aus DB
  → inputProps.backgroundMusicUrl + backgroundMusicVolume
  → Lambda rendert ComposedAdVideo mit <Audio src={backgroundMusicUrl} />
```

**Das wirkliche Problem**: Im Export-Step gibt es **keinerlei UI-Hinweis**, dass eine Musik ausgewählt ist. Die Vorschau im Export-Step spielt zudem nur das Voiceover ab, nicht die Musik. Dadurch entsteht der Eindruck, die Musik sei verloren — sie ist im finalen MP4 aber drin.

Drei Lücken konkret:
1. `AssemblyTab.tsx` zeigt keine Musik-Zusammenfassung (Track-Name, Volume).
2. `ComposerSequencePreview.tsx` mischt nur das Voiceover, nicht die BGM.
3. `CostEstimationPanel` listet Musik nicht als aktiven Bestandteil auf.

## Lösung

### 1. Musik-Zusammenfassung im Export-Step (AssemblyTab)

Neue kompakte Card direkt unter "Color Grading", die liest:

- Aktiv / Inaktiv (mit Switch zum Schnell-Stummschalten ohne den Audio-Tab zu verlassen)
- Track-Name (z.B. "Beach Sunset — Lofi Artist")
- Volume in % (mit Slider 0–100, gespiegelt aus `assemblyConfig.music.volume`)
- Mini-Play-Button für 10-Sekunden-Preview des Tracks
- Link "Im Audio-Tab ändern" → wechselt zurück zum Audio-Tab

Wenn keine Musik gesetzt ist: dezenter Hinweis "Keine Hintergrundmusik gewählt — im Audio-Tab hinzufügen."

### 2. Musik im Vorschau-Player abspielen

`ComposerSequencePreview.tsx` erweitern:

- Zweites verstecktes `<audio>`-Element für `backgroundMusicUrl`
- Sync-Logik analog zum Voiceover (play/pause/seek an `globalTime` gekoppelt)
- Volume aus `assemblyConfig.music.volume / 100` (clamped 0..1)
- Loop aktiv, falls Track kürzer als Gesamtvideo
- Mute-Button im Player wirkt auf beide Spuren

Neue Props an `ComposerSequencePreview`: `backgroundMusicUrl?: string | null`, `backgroundMusicVolume?: number`.

### 3. Musik in CostEstimationPanel listen

Eine zusätzliche Zeile "Hintergrundmusik" — kostet 0 € (Stock-Library), aber sie taucht als aktiver Bestandteil auf, damit der User sieht, dass sie mitläuft.

### 4. Defensive Logging im Render-Pfad

In `handleRender` (AssemblyTab) eine kurze Konsolen-Log-Ausgabe vor dem Edge-Call:

```text
[Composer] Render payload check: music=<trackName or "none"> vol=<%>
```

Hilft dem User & uns bei künftigem Debugging, sofort zu sehen, ob die Musik die Render-Stufe erreicht.

## Geänderte Dateien

- `src/components/video-composer/AssemblyTab.tsx` — neue MusicSummaryCard, Props an Preview, Pre-Render-Log
- `src/components/video-composer/ComposerSequencePreview.tsx` — zweite Audio-Spur für BGM, Sync + Mute
- `src/components/video-composer/CostEstimationPanel.tsx` — Zeile für Musik
- (optional) neue kleine Komponente `src/components/video-composer/MusicSummaryCard.tsx`

Keine Änderungen an Edge-Funktion oder Remotion-Template nötig — die Render-Pipeline ist korrekt.

## Ergebnis

Im Export-Step sieht und hört der User klar, dass die Hintergrundmusik Teil des finalen Videos ist. Die tatsächliche Übergabe an Lambda war bereits korrekt; dieser Plan schließt die UX-Lücke, die das Vertrauen in das Feature untergräbt.
