## Diagnose

Bei 2 Sprechern in einer Szene gibt es heute keinen echten Lip-Sync, weil:

- Inline-Modus rendert HeyGen nur wenn `blocks.length === 1` (SceneDialogStudio.tsx Z. 466). Bei Sarah+Matthew wird HeyGen komplett übersprungen.
- Selbst wenn wir HeyGen für beide aufrufen würden: es gibt nur **ein** `clip_url` pro Szene. Der zweite Render würde den ersten überschreiben.
- Das B-Roll-Video kennt das Skript nicht. Es kann nicht "wissen" wann wer redet — diese Information existiert im Video-Prompt gar nicht.

Artlist/Synthesia/HeyGen lösen das ausschließlich über **Shot-Reverse-Shot**: pro Sprecher-Block ein eigener Talking-Head-Clip, hintereinander geschnitten. Genau das ist unser bereits existierender SRS-Modus (`renderAsSeparateScenes`).

## Lösung

**Multi-Speaker-Dialog mit Cast erzwingt automatisch SRS.** Inline-Mode bleibt nur für Single-Speaker oder wenn kein Portrait existiert (dann ehrlich als "Audio-Overlay" gelabelt, kein Fake-Lip-Sync-Versprechen).

### Schritt 1 — Auto-SRS bei Multi-Speaker + Portraits
**Datei:** `src/components/video-composer/SceneDialogStudio.tsx`

In `handleGenerateInline()` direkt nach dem Parsen der `blocks`:
- Wenn `blocks.length >= 2` UND **alle** beteiligten Sprecher ein `referenceImageUrl` haben → automatisch in den SRS-Pfad umleiten (gleiche Logik wie der "Als separate Szenen rendern"-Toggle).
- SRS erzeugt pro Block eine eigene Composer-Szene mit eigenem HeyGen-Render und eigenem `clip_url`. Die Reihenfolge im Storyboard entspricht 1:1 der Skript-Reihenfolge.
- Toggle `renderAsSeparateScenes` wird automatisch gesetzt + `handleGenerate()` (SRS-Pfad) aufgerufen — der Code dafür existiert bereits.

### Schritt 2 — Ehrliche Labels statt Fake-Lip-Sync
Im Hint-Badge unter dem Generate-Button (heutige Zeilen 983-1025):
- **Multi-Speaker + alle Portraits vorhanden** → "🎙️ Wird als 2 Szenen gerendert (Shot-Reverse-Shot, je 1 HeyGen-Clip pro Sprecher) — ~0,30 €/Sprecher"
- **Multi-Speaker + Portrait fehlt** → "⚠️ {Name} hat kein Portrait — bitte Cast-Charakter zuweisen, sonst nur Audio-Overlay ohne Lip-Sync"
- **Single-Speaker + Portrait** → "🎙️ Lip-Sync via HeyGen — Mund passt zum Audio (~0,30 €)"
- **Kein Portrait** → "🔊 Audio-Overlay (kein Lip-Sync möglich ohne Cast-Portrait)"

Der "Generieren"-Button-Text ändert sich entsprechend: "Lip-Sync generieren (2 Szenen)" statt nur "Voiceover generieren".

### Schritt 3 — Pre-Flight-Validation
Bevor SRS startet:
- Wenn ein Sprecher kein `referenceImageUrl` hat → Toast mit klarer Anweisung "Weise {Name} im Cast einen Brand-Character mit Portrait zu, dann erneut generieren". Kein automatischer Fallback auf Audio-Overlay (das war der Fake-Lip-Sync).

### Schritt 4 — Doppel-Voiceover-Bug abschließen
Der Insert-Loop in Inline läuft heute auch noch wenn HeyGen greift. Im SRS-Pfad hat jede Sub-Szene **ihren eigenen** `scene_audio_clips`-Eintrag, daher:
- Inline-Insert nur noch ausführen wenn **wir tatsächlich im Inline-Pfad bleiben** (Single-Speaker oder Audio-Only).
- Wenn wir auf SRS umleiten → früh returnen, SRS macht alles selbst.

## Was der User danach sieht

Bei „Sarah: Hi! / Matthew: Thanks":
1. Klick auf "Lip-Sync generieren"
2. Storyboard zeigt **2 neue Szenen**: "Sarah spricht (HeyGen)" + "Matthew spricht (HeyGen)"
3. Jede Szene hat ihren eigenen Talking-Head-Clip mit echtem Mund-zu-Audio-Sync
4. Die Original-B-Roll-Szene bleibt als Intro/Establishing-Shot davor erhalten oder wird ersetzt (User-Wahl im SRS-Dialog, existiert schon)

Das ist genau der Artlist-Workflow — kein magischer Multi-Mund-Render im selben Bild, sondern saubere Schnitt-Folge.

## Technische Details

- **Keine neuen Edge Functions.** SRS-Pfad und `generate-talking-head` existieren bereits.
- **Keine DB-Änderungen.** SRS legt Composer-Szenen über bestehende Tabellen an.
- **Keine neuen Kosten-Pfade.** HeyGen ~0,30 € pro Sprecher-Block bleibt unverändert.
- **Auto-Split-Confirm-Dialog** (aus dem letzten Loop) wird der Standard-Pfad — der Inline-Modus ist für Multi-Speaker nicht mehr erreichbar.

## Nicht im Scope

- Echtes „2 Münder im selben Frame"-Rendering. Das ist mit aktuellen i2v-Modellen nicht zuverlässig lösbar und macht auch Artlist nicht. Wer beide Köpfe gleichzeitig im Bild will, muss das via Compositing in Director's Cut machen (Picture-in-Picture).
- Phonem-Animation für AI-B-Roll-Gesichter (also lipSync-2 Polish). Bleibt opt-in über `engineOverride: 'sync-polish'`, ist aber unzuverlässig — daher nicht der Default.
