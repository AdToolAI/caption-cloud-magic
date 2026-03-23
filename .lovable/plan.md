
## Plan: Das Restproblem jetzt als Mix-/Auswahlproblem beheben, nicht mehr als „Musik fehlt komplett“

### Was ich gerade im aktuellen Stand verifiziert habe
- Der letzte erfolgreiche Render (`r72`) hatte **wirklich eine Hintergrundmusik-URL**:
  `video-assets/jamendo-music/69c77d80-891c-44c2-9c73-077bed8a5d0e.mp3`
- Diese Datei ist **erreichbar und korrekt ausgeliefert**:
  - HTTP 200
  - `content-type: audio/mpeg`
  - ca. **2.1 MB**
- In `UniversalCreatorVideo.tsx` wird Musik auch tatsächlich gerendert:
  - `backgroundMusicUrl` ist aktiv
  - Volume ist aktuell fest auf `backgroundMusicVolume * masterVolume`
- In `auto-generate-universal-video/index.ts` ist das effektive Render-Volume aktuell nur **0.15**
- Die Musikauswahl nimmt aktuell einfach **den ersten Jamendo-Treffer**
- Der aktuelle erste „upbeat“-Treffer ist z. B. **„PTICE NA NEBU“** – also kein klarer, kurzer, sofort hörbarer Werbe-/Corporate-Track

### Wahrscheinlichste Restursache
Das ist sehr wahrscheinlich **nicht mehr** das alte Lambda-/ffprobe-Problem.

Das aktuelle Problem sieht eher so aus:
```text
Musikdatei wird gefunden
-> Render läuft erfolgreich durch
-> Track ist aber für den Use-Case schlecht gewählt
   und/oder startet zu subtil
   und/oder ist mit 0.15 unter dem Voiceover zu leise
-> Nutzer nimmt praktisch keine Hintergrundmusik wahr
```

## Umsetzung

### 1. Musikauswahl von „erstes Ergebnis“ auf „geeigneter Kandidat“ umstellen
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Ich würde `selectBackgroundMusic()` so umbauen, dass nicht mehr stumpf `results[0]` genommen wird, sondern ein kleines Ranking läuft:

- Tracks mit passender Dauer bevorzugen (z. B. 20–120s)
- klare Corporate-/Upbeat-/Cinematic-Titel bevorzugen
- ungeeignete oder zu diffuse Treffer abwerten
- mehrere Kandidaten in Reihenfolge testen statt nur 1

Ziel:
- nicht irgendein Jamendo-Track
- sondern ein Track, der **im fertigen Video sofort hörbar und passend** ist

### 2. Musik im Universal Creator hörbar mischen
**Dateien:**
- `supabase/functions/auto-generate-universal-video/index.ts`
- `src/remotion/templates/UniversalCreatorVideo.tsx`

Ich würde die Mischung für den Universal Creator explizit anheben:

- Startwert für Musik testweise auf **0.3 bis 0.4** statt 0.15
- optional sanftes Fade-in statt sofort leiser Bettung
- Voiceover/Music-Verhältnis klarer definieren

Wichtig:
Der aktuelle Wert 0.15 ist für „deutlich hörbare Hintergrundmusik“ sehr konservativ.

### 3. Determinischen Audio-Diagnosemodus einbauen
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Für einen Render soll man gezielt erzwingen können:

```text
- forceBackgroundMusicUrl
- forceBackgroundMusicVolume
- disableRandomTrackSelection
- voiceoverOff
- musicOnly
```

Damit können wir in 1 Testlauf sauber unterscheiden:
- Track hörbar, wenn nur Musik läuft?
- Track hörbar zusammen mit Voiceover?
- Ist es Auswahl oder Mix?

### 4. Gewählten Track und effektive Lautstärke sauber persistieren
**Bereiche:**
- `auto-generate-universal-video`
- `universal_video_progress` result_data
- optional Progress-UI

Ich würde künftig speichern:
- Track-Titel
- Artist
- finale Musik-URL
- effektive Lautstärke
- ob Kandidat 1, 2 oder 3 gewählt wurde
- ob Fallback benutzt wurde

Dann sehen wir sofort:
```text
Welcher Track lief wirklich?
Mit welcher Lautstärke?
War es ein Fallback?
```

### 5. Optional: kurze „Musik zuerst“-Einleitung
Wenn gewünscht, würde ich zusätzlich die ersten ~0.8–1.5 Sekunden so mischen, dass Musik kurz deutlicher hörbar ist, bevor das Voiceover voll einsetzt.

Das ist keine Pflicht, aber sehr hilfreich, wenn Nutzer sofort prüfen sollen:
- „Ja, da ist jetzt wirklich Musik drin.“

## Betroffene Dateien
- `supabase/functions/auto-generate-universal-video/index.ts`
- `src/remotion/templates/UniversalCreatorVideo.tsx`
- optional `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

## Erwartetes Ergebnis
Nach der Umstellung soll das Verhalten so sein:

```text
Video startet
-> Musik ist sofort eindeutig wahrnehmbar
-> Voiceover bleibt verständlich
-> Track passt besser zur Stimmung
-> wir können jeden Render forensisch nachvollziehen
```

## Technische Kurzfassung
Der aktuelle Stand spricht dafür, dass die Musik **nicht mehr fehlt**, sondern **zu subtil / zu leise / unpassend ausgewählt** wird.

Der nächste sinnvolle Fix ist deshalb:
1. **bessere Track-Auswahl**
2. **lautere, klarere Mischung**
3. **determinischer Musik-Only-/Mix-Debugmodus**
4. **saubere Persistenz des tatsächlich verwendeten Tracks**
