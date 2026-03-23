
## Plan: Musikproblem jetzt wirklich isolieren statt weiter blind zu raten

### Was ich gerade eindeutig verifiziert habe
- Die Runtime läuft auf **r71**, also kein reines Deploy-Problem mehr.
- Der erste Render bekommt **wirklich eine `backgroundMusicUrl`**.
- Der Render scheitert dann an **`ffprobe` / `Failed to find two consecutive MPEG audio frames`**.
- Danach läuft ein späterer Retry **ohne Musik** erfolgreich durch.
- Es gibt zwar `AudioSmokeTest`, aber ich finde **keine echte Pipeline**, die Tracks damit validiert.
- In `universal_video_progress` werden **ausgewählter Track / Retry-Track aktuell nicht sauber persistiert**. Dadurch ist die Ursache im Nachhinein kaum belegbar.

## Ziel
Nicht mehr “noch einen möglichen Fix” bauen, sondern eine **deterministische Isolationsstrecke**, mit der wir in 1-2 Testläufen sicher wissen, ob das Problem ist:

```text
A) einzelne Track-Dateien
B) die gesamte Musikbibliothek / Storage-Auslieferung
C) die Retry-Logik (Track wird gar nicht wirklich gewechselt)
D) nur die Kombination aus Voiceover + Musik
E) der UniversalCreator-Renderpfad selbst
```

## Umsetzung

### 1. Deterministischen Debug-Modus für einen Render einbauen
In `auto-generate-universal-video` würde ich einen temporären Diagnosemodus ergänzen:

- `forceBackgroundMusicUrl`
- `disableMusicSelection`
- `disableRetryTrackSwap`
- `forceVoiceoverOff`
- `forceMusicOff`

Damit können wir gezielt exakt **einen** Track und **eine** Audio-Kombination rendern, statt Zufall + Auto-Retry im Weg zu haben.

### 2. Echte Track-Validierung über `AudioSmokeTest` bauen
Statt Tracks nur per DB-Flag als “validated” zu markieren:

- neue dedizierte Funktion, die **einen Track** mit `AudioSmokeTest` rendert
- Ergebnis in `background_music_tracks` speichern:
  - `validated`
  - `failed`
  - `validation_error`
  - `last_validated_at`
  - `validation_attempts`

Wichtig: Nur diese Smoke-Test-Funktion darf künftig `validation_status='validated'` setzen.

### 3. Drei isolierte Testfälle schaffen
Ich würde exakt diese drei Diagnoseläufe ermöglichen:

1. **Music only**
   - `AudioSmokeTest` oder `UniversalCreatorVideo` nur mit Musik, ohne Voiceover  
   -> isoliert, ob der Track selbst in Lambda lesbar ist

2. **Voiceover only**
   - aktueller Baseline-Test  
   -> bestätigt, dass der Rest des Renderpfads stabil ist

3. **Voiceover + exakt derselbe Musiktrack**
   - gleiche Musikdatei, gleicher Renderpfad  
   -> zeigt, ob das Problem nur bei der Kombination entsteht

So wissen wir sofort, ob der Fehler an der Datei oder an der Template-/Audio-Kombination liegt.

### 4. Retry-Forensik vollständig persistieren
Im Progress/Render-Record zusätzlich speichern:

- `selectedBackgroundMusicUrl`
- `selectedBackgroundMusicTrack`
- `retryTrack`
- `retryAttempt`
- `audioStripped`
- `validation_status`
- `validation_error`
- `failure_stage`
- `error_signature`

Aktuell fehlt genau diese Sichtbarkeit. Ohne sie bleibt jeder Versuch teilweise Blindflug.

### 5. Zufällige Musikauswahl für Diagnose abschalten
Während Diagnose:
- **kein random**
- **kein Mood-Ranking**
- **kein stilles Fallback auf andere Tracks**

Stattdessen:
```text
Track X -> Testlauf
Track X + Voiceover -> Testlauf
Track Y -> Testlauf
```

Nur so sehen wir, ob wirklich der Track gewechselt wurde und welcher exakt crasht.

### 6. Auswahl-Logik danach härten
Sobald die Isolation steht:
- Produktivauswahl nur noch aus **echten Smoke-Test-Passes**
- kein Track ohne `last_validated_at`
- kein stilles Wiederverwenden fraglicher Dateien

## Betroffene Dateien
- `supabase/functions/auto-generate-universal-video/index.ts`
- neue Edge Function für Musik-Smoke-Tests
- `src/remotion/templates/AudioSmokeTest.tsx` (nur falls kleine Diagnose-Erweiterung nötig)
- `src/remotion/Root.tsx` (falls zusätzliche Diagnose-Composition gebraucht wird)
- optional `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx` für sichtbare Forensik

## Erwartetes Ergebnis
Nach dieser Isolation wissen wir belastbar:

```text
- ob ein einzelner Track alleine in Lambda funktioniert
- ob Voiceover + Musik zusammen das Problem sind
- ob der Retry wirklich auf einen anderen Track wechselt
- welche Datei konkret crasht
- ob der "validated"-Status überhaupt echt ist
```

## Kurz gesagt
Ja — wir müssen das Problem jetzt **instrumentieren**, nicht weiter raten.  
Der nächste sinnvolle Schritt ist eine **deterministische Audio-Diagnose-Pipeline** mit Track-Smoke-Test, festen Testtracks und vollständiger Retry-Forensik. Erst damit können wir die eigentliche Ursache sauber beweisen und danach gezielt beheben.
