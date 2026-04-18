

## Lösung: Voiceover als ein einziger durchgehender Track

Du hast die Wurzel exakt erkannt. Das aktuelle System bindet das VO an Szenen-Slots — jede Szene hat ihren eigenen VO-Schnipsel, die werden aneinandergeklebt und dann gegen die reale Video-Geometrie ausgerichtet. **Jeder Mismatch zwischen erwarteter und realer Szenen-Länge erzeugt eine hörbare Naht.**

Die saubere Lösung: **VO als ein einziger durchgehender Track behandeln**, der unabhängig von Szenen läuft.

## Plan: One-Track-Voiceover

### Phase 1 — Aktuellen Renderer & VO-Pipeline lesen
Bevor ich code, muss ich kurz verifizieren wie der WAV aktuell aufgebaut wird:
- Wird das WAV aus mehreren Szenen-WAVs zusammengeklebt (mit Padding pro Szene)?
- Oder wird ein einzelner ElevenLabs-Call mit dem ganzen Skript gemacht und dann nur einmal gepaddet?

Je nachdem ist der Fix unterschiedlich groß. (Die genannten Datei-Pfade in den Memories: `VoiceSubtitlesTab.tsx` Zeile ~232 hat aktuell die Padding-Logik mit `sumSceneFrames`.)

### Phase 2 — Ein einziger TTS-Call

**`VoiceSubtitlesTab.tsx`:**
- Alle Szenen-Texte zu **einem** zusammenhängenden Skript joinen (z.B. mit "... " als Atempause)
- **Ein einziger ElevenLabs-Call** mit dem ganzen Skript → ein einziger MP3
- Dauer dieses MP3 wird real gemessen (kein Padding pro Szene)
- WAV wird auf die **Komposition-Gesamtlänge** gepaddet (Stille am Ende, falls VO kürzer als Video)
- **Keine** szenenbasierte WAV-Konstruktion mehr

**Was wegfällt:**
- Pro-Szene Padding
- `sumSceneFrames` als Audio-Geometrie-Anker
- Reale-vs-nominelle-Dauern-Synchronisation für Audio (für Video bleibt sie nötig)

### Phase 3 — Renderer

**`ComposedAdVideo.tsx`:**
- Audio-Track bleibt eine einzige `<Audio>`-Komponente, die über die ganze Komposition läuft
- Video-Sequences (Hard-Cuts wie aktuell) bleiben unverändert
- **Komposition-Dauer** = `max(sumSceneFrames, audioFrames)` damit das VO nicht abgeschnitten wird, falls es länger ist als die Video-Summe

### Phase 4 — UI / UX

**Implikationen für den User:**
- Skript-Editor zeigt den ganzen Text als ein zusammenhängendes Stück (statt pro-Szene-Felder), oder die Szenen-Texte werden im Backend zu einem Skript gemerged
- Empfehlung: Pro-Szene-Eingabefelder behalten (gewohnter Workflow), aber **intern joinen** vor dem TTS-Call
- Hinweis im UI: "Voiceover läuft durchgehend über das gesamte Video"

### Warum das das Problem definitiv löst

- **Keine Audio-Nähte mehr** — ein einziger Decoder-Stream, keine Schnitte zwischen Szenen
- **Keine Drift-Empfindlichkeit** — egal ob Szene 1 real 5.875s oder 7s lang ist, das VO läuft einfach weiter
- **ElevenLabs liefert natürlichere Prosodie** — bei einem zusammenhängenden Text wird der Sprecher Atempausen, Betonung und Tempo natürlich gestalten, statt isolierter Sätze
- **Synchronisation** wird ein "Best-Effort"-Soft-Sync (VO startet bei Frame 0 und läuft durch) statt Hard-Sync pro Szene

### Trade-off (ehrlich)

Wenn Szene-zu-VO-Mapping **inhaltlich** wichtig ist (z.B. "Szene 3 muss exakt zu Satz 3 passen"), wird das nicht mehr garantiert. Aber: das war eh nie garantiert, weil reale Szenen-Längen variieren. Der User hat zwei Wege das in den Griff zu bekommen:
1. Skript so schreiben, dass die Reihenfolge passt (das VO erzählt linear)
2. Im Director's Cut nachträglich Szenen-Längen oder Reihenfolge an das VO anpassen

### Klärungsfrage

Wie soll der **Skript-Editor** aussehen?

- **(a)** Pro-Szene-Felder behalten (vertrauter Workflow), intern werden alle Texte zu einem Skript gejoint und in einem TTS-Call generiert. **Empfohlen** — minimal disruptiv.
- **(b)** Ein großes Textfeld für das ganze Skript, Szenen werden visuell separiert (z.B. mit "—— Szene 2 ——" als visueller Marker, der vor TTS entfernt wird).
- **(c)** Beides: User kann zwischen "Pro-Szene-Modus" und "Durchgehend-Modus" wechseln.

### Dateien (voraussichtlich)

1. `src/components/video-composer/VoiceSubtitlesTab.tsx` — TTS-Aufruf vereinheitlichen, kein Pro-Szene-Padding mehr
2. `src/remotion/templates/ComposedAdVideo.tsx` — Audio-Komponente bleibt durchgehend, Komposition-Dauer = `max(video, audio)`
3. `supabase/functions/compose-video-assemble/index.ts` — Komposition-Dauer berücksichtigt jetzt auch VO-Länge
4. **Bundle-Redeploy nötig** (Renderer ändert sich)

