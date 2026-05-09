## Diagnose

Der Screenshot und der Code zeigen ein anderes Problem als zuerst vermutet:

- Die Szene ist 10 Sekunden lang, also ist die Dauer nicht der Hauptfehler.
- Beim Clip-Render in `compose-video-clips` wird jede Szene mit Dialog + Cast automatisch zu HeyGen geroutet.
- Der HeyGen-Zweig nimmt den ersten Charakter/sein Portrait (`primaryShot`) und schickt dann den komplett bereinigten Dialogtext (`stripSpeakerPrefixes(scene.dialogScript)`) an genau dieses eine Portrait.
- Ergebnis: Der erste Charakter spricht beide Dialogzeilen, mit kurzer Pause dazwischen. Genau das beschreibst du.

Zusätzlich kann das Voiceover in der Vorschau stumm wirken, weil der Multi-Speaker-Dialog teilweise nur als Render-Anweisung im Video steckt, statt als separate, sofort abspielbare `scene_audio_clips`-Audiospur.

## Zielverhalten

Für eine Szene mit zwei Charakteren im selben Bild:

1. Beide Dialogblöcke bleiben zeitlich korrekt im `audioPlan`.
2. Die Vorschau spielt beide Voiceover-Blöcke hörbar nacheinander ab.
3. Der normale AI-Clip wird nicht mehr fälschlich als ein einzelnes HeyGen-Talking-Head gerendert.
4. Wenn echter Lip-Sync pro Sprecher gewünscht ist, muss das bewusst über Shot-Reverse-Shot/Split-Szenen laufen — nicht automatisch über ein Gesicht.

## Umsetzung

### 1. Auto-HeyGen für Multi-Speaker im Clip-Render blockieren

In `supabase/functions/compose-video-clips/index.ts`:

- `speakerCount > 1` darf im Auto-Modus nicht mehr in den HeyGen-Zweig laufen.
- HeyGen bleibt erlaubt für:
  - `engineOverride === 'heygen'` bei Single-Speaker
  - explizit erzeugte Split/Sub-Szenen mit nur einem Sprecher
- Für Multi-Speaker in einer Szene fällt der Render zurück auf den normalen AI-Clip-Provider (`ai-hailuo`, Kling, etc.) mit Voiceover-Overlay.

Damit kann nicht mehr passieren, dass Charakter 1 beide Rollen spricht.

### 2. Multi-Speaker-Dialog standardmäßig als Voiceover-Overlay generieren

In `src/components/video-composer/SceneDialogStudio.tsx`:

- Der Button „Voiceover generieren“ soll bei 2+ Sprechern standardmäßig `handleGenerateInline()` nutzen.
- Diese Funktion erzeugt bereits pro Dialogblock eine eigene Audiodatei und speichert sie als `scene_audio_clips` mit korrektem `start_offset`.
- Der Shot-Reverse-Shot/Split-Pfad bleibt erhalten, wird aber nur genutzt, wenn der erweiterte Schalter aktiv ist oder der bestehende Auto-Split-Button bewusst ausgelöst wird.

### 3. Prompt-Text für Multi-Speaker klarer machen

In `src/lib/motion-studio/composeFinalPrompt.ts`:

- Die Dialog-Layer wird ergänzt um eine harte visuelle Regel:
  - Bei Multi-Speaker im selben Shot: „Do not make one character speak all lines. If lip-sync is uncertain, keep mouths subtle/neutral and treat dialog as voiceover timing.“
- Dadurch versteht der Videoprovider besser, dass die Audio-/Dialogstruktur nicht bedeuten soll: „ein Gesicht sagt alles“.

### 4. Preview-Audio robuster machen

In `src/components/video-composer/ComposerSequencePreview.tsx`:

- Bestehende `audioPlan.speakers[].audioUrl` werden weiterhin als virtuelle Voiceover-Clips genutzt, wenn DB-Clips noch nicht geladen sind.
- Für Altdaten sicherstellen: Voiceover-Clips werden nicht durch falsche Lip-Sync-Erkennung oder fehlende DB-Realtime-Propagation verschluckt.
- Mute-/Volume-Logik bleibt unverändert, aber Voiceover-Clips bleiben volle Lautstärke und ohne Fade.

### 5. UI-Text im Dialog-Studio präzisieren

In `SceneDialogStudio.tsx`:

- Kurzer Hinweis im Dialogbereich:
  - Standard: beide Stimmen laufen als Voiceover in dieser Szene.
  - Für echten sprechenden Kopf pro Person: erweiterten Split-Modus aktivieren.

## Ergebnis

- In deiner gezeigten 10-Sekunden-Szene spricht nicht mehr der erste Charakter beide Dialoge.
- Beide erzeugten Voiceover-Blöcke werden als Audio hörbar nacheinander abgespielt.
- Multi-Speaker-Lip-Sync bleibt technisch sauber: entweder Voiceover über Gruppenbild oder bewusst gesplittete Einzelsprecher-Szenen.