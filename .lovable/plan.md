## Diagnose

Du hast recht: Der vorige Skriptfeld-Plan war am eigentlichen Problem vorbei. Der echte Fehler sitzt im Ablauf zwischen **„Clip generieren mit Voiceover"** und dem späteren **Generieren** links.

Aktueller Zustand aus der Datenbank:

- Die betroffene Szene ist inzwischen `ready`, `ai-hailuo`, `engine_override='cinematic-sync'`.
- `audio_plan.twoshot.useExternalAudio=true` ist gesetzt.
- Gleichzeitig existiert ein `scene_audio_clips` Voiceover für dieselbe Szene.
- Das erklärt das doppelte Hören: finaler Clip + externer Voiceover-Pfad können gleichzeitig aktiv sein.
- Der „Animorph"-Effekt kommt sehr wahrscheinlich daher, dass der **Voiceover-Button** zuerst einen anderen/älteren Pfad startet und danach der linke Generieren-Button nochmal die Cinematic-Sync-Master-Pipeline von vorne anstößt. Dadurch entstehen zwei konkurrierende Generationen/Audio-Quellen für eine Szene.

## Root Cause

Für eine 1-Charakter-Szene gibt es aktuell mehrere mögliche Startpfade:

1. `SceneDialogStudio` → erzeugt Voiceover und kann je nach Zustand den alten Talking-Head/Inline-Pfad starten.
2. Linker `Generieren` Button → startet `compose-video-clips` / Cinematic-Sync.
3. `useTwoShotAutoTrigger` → erkennt danach die Szene und startet Lip-Sync erneut/weiter.
4. `compose-twoshot-audio` schreibt zusätzlich ein externes Voiceover in `scene_audio_clips`.

Für 2 Charaktere ist das teilweise gewollt. Für **1 Charakter** ist es aber zu viel: Ein Startpfad, eine Master-Scene, eine Audio-Quelle.

## Neuer Fix-Plan

### 1. Voiceover-Button für 1 Sprecher auf denselben stabilen Startpfad routen

In `src/components/video-composer/SceneDialogStudio.tsx`:

- Wenn `blocks.length === 1` und `scene.engineOverride === 'cinematic-sync'` oder Dialog/Lip-Sync aktiv ist:
  - nicht mehr den alten Inline/Talking-Head-Pfad verwenden,
  - sondern direkt den gleichen Cinematic-Sync-Dispatch wie der linke `Generieren` Button starten.
- Der Button bleibt also nutzbar, macht aber nicht mehr „Voiceover separat + später Szene nochmal".
- Er setzt sofort:
  - `clipStatus='generating'`
  - `clipSource='ai-hailuo'`
  - `engineOverride='cinematic-sync'`
  - `lipSyncWithVoiceover=true`
  - `lipSyncStatus='pending'`

### 2. 1-Sprecher-Cinematic-Sync darf nicht über den Two-Shot-External-Audio-Modus laufen

In `supabase/functions/compose-video-clips/index.ts` oder `compose-twoshot-audio`:

- Bei exakt **1 Sprecher** kein `audio_plan.twoshot.useExternalAudio=true` als finalen Modus erzwingen.
- Für 1 Sprecher soll die finale Sync-Ausgabe als **eingebettete Audioquelle** gelten oder die externe Voiceover-Spur nach erfolgreichem Lip-Sync deaktiviert/entfernt werden.
- 2+ Sprecher bleiben unverändert im Two-Shot/Dialog-Shot-Modus.

### 3. Doppel-Audio verhindern

In `src/hooks/useSceneAudioClips.ts` und ggf. `ComposerSequencePreview.tsx`:

- Voiceover-Clips für eine Szene ignorieren, wenn:
  - `lipSyncAppliedAt` gesetzt ist und
  - es keine echte Multi-Speaker-External-Audio-Szene ist.
- Für 1-Sprecher-Lip-Sync gilt: nicht externe Voiceover-Spur zusätzlich abspielen.
- Für 2-Sprecher-Legacy-External-Audio bleibt die Ausnahme bestehen.

### 4. „Nach 35 Sekunden bricht ab" sichtbar fixen

In `SceneDialogStudio.tsx`:

- Der Button darf nicht warten, bis Anchor/Master/Lip-Sync fertig sind.
- Er soll nach dem Server-Dispatch schnell zurückkommen und die Szene im Pipeline-Status lassen.
- `emitPipelineEvent({ type: 'voiceover:end' })` erst dann senden, wenn nur TTS abgeschlossen ist — nicht so, dass der Gesamt-Ladebalken verschwindet, während Clip/Lip-Sync weiterlaufen.

### 5. Retry-/Doppelstart-Guard

In `SceneDialogStudio.tsx` und `useGenerateAllClips.ts`:

- Wenn eine Szene bereits `clipStatus='generating'` oder `lipSyncStatus in ('pending','running','stitching')` hat, wird kein zweiter Start ausgelöst.
- Der linke Generieren-Button soll diese Szene dann überspringen statt nach 5 Minuten von vorne zu beginnen.

### 6. Datenbereinigung für die betroffene Szene

Nach dem Code-Fix:

- Für die betroffene Szene alte externe/duplizierte Voiceover-Rows löschen oder neutralisieren.
- Alte `twoshot`-Flags bereinigen, sofern sie nur vom fehlerhaften 1-Sprecher-Pfad stammen.
- Szene sauber auf `pending` setzen, damit wir einen frischen 1-Sprecher-Lauf testen können.

## Was ausdrücklich nicht geändert wird

- Keine Änderungen an der stabileren 2-Charakter-Pipeline.
- Keine Änderung an Multi-Speaker Dialog-Shots.
- Keine neue Datenbankstruktur.
- Kein Umbau des kompletten Composers.

## Zielzustand

Für 1 Charakter gibt es danach nur noch diesen Ablauf:

```text
Skript/Voiceover klicken
→ Szene sofort generating
→ Hailuo Master-Clip wird erzeugt
→ Sync/Lip-Sync läuft einmal
→ fertiger Clip mit genau einer hörbaren Stimme
→ kein zweiter Start, kein Doppel-Audio, kein Talking-Head/Animorph-Fallback
```

