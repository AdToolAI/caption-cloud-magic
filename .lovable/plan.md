## Ziel
Der nach dem Voiceover verwendete Dialog darf nicht nur in `dialogScript` liegen, sondern muss sofort sichtbar und persistent im KI-Prompt landen. Dadurch sieht der Nutzer im Prompt-Feld eindeutig, wer spricht, und spätere Render-Pfade bekommen dieselbe Dialog-Info.

## Befund
Der bestehende Sync `dialogScript → aiPrompt` passiert aktuell in `SceneCard` per `useEffect`. Das ist zu indirekt: Wenn der Nutzer im Dialog-Studio Voiceover generiert, wird zwar Audio erzeugt und `dialogScript` gespeichert, aber der sichtbare Prompt wird nicht zuverlässig sofort aktualisiert. Außerdem erzeugt `buildSpokenLinesBlock` nur eine generische Beschreibung wie „Matthew and Sarah are speaking…“, nicht die konkreten Sprecherzeilen.

## Umsetzung

1. **Konkreten Dialogblock im Prompt erzeugen**
   - `src/lib/motion-studio/applyDialogToPrompt.ts` erweitern.
   - Der `[Dialog]...[/Dialog]` Marker enthält künftig die konkreten Sprecherzeilen in strukturierter Form, z. B.:

```text
[Dialog]
Matthew Dusatko says: "..."
Sarah Dusatko says: "..."
Timing must follow this speaker order. Do NOT render captions/subtitles/on-screen text.
[/Dialog]
```

   - Der Marker bleibt idempotent: alte `[Dialog]...[/Dialog]` Blöcke werden ersetzt, nicht dupliziert.

2. **Beim Voiceover-Generieren sofort den Prompt updaten**
   - In `SceneDialogStudio.tsx` beim Start von `handleGenerate()` und `handleGenerateInline()` aus den geparsten Blöcken den Prompt berechnen.
   - `onUpdate()` bekommt dann gemeinsam:
     - `dialogScript: script`
     - `dialogVoices: voicePerSpeaker`
     - `aiPrompt: promptMitDialogMarker`
   - Damit ist der Dialog unmittelbar nach Klick auf „Voiceover generieren“ im Prompt-Feld sichtbar, ohne auf den späteren `SceneCard`-Effect zu warten.

3. **SRS-Sub-Szenen ebenfalls eindeutig beschriften**
   - Die automatisch erzeugten Shot-Reverse-Shot-Sub-Szenen bekommen als `aiPrompt` nicht nur `Name: Text`, sondern ebenfalls einen kleinen `[Dialog]` Marker mit genau einer Sprecherzeile.
   - Dadurch bleibt jede Sub-Szene unabhängig lesbar und später eindeutig renderbar.

4. **Structured-Prompt-Modus berücksichtigen**
   - Wenn die Szene im strukturierten Prompt-Modus ist, bleibt der bestehende `SceneCard`-Sync zuständig für `promptSlots.subject`.
   - Für den sofortigen Update im Dialog-Studio wird mindestens `aiPrompt` korrekt gesetzt; der vorhandene `SceneCard`-Effect hält danach Slots und Prompt konsistent.

## Ergebnis
Nach dem Klick auf „Voiceover generieren“ steht der konkrete Dialog sichtbar im KI-Prompt. Der Prompt ist nicht mehr nur eine allgemeine Sprachbeschreibung, sondern enthält die Sprecher-Reihenfolge und Zeilen als harte Render-Anweisung, während Audio/HeyGen weiterhin die eigentliche Lip-Sync-Wahrheit bleiben.