## Problem
Die Audio-Kette ist aktuell an zwei Stellen gebrochen:

1. **Preview reagiert nicht auf Musik-Prozentwerte**
   - `RemotionPreviewPlayer` memoisiert den Player so stark, dass Änderungen an `backgroundMusicVolume`, `voiceoverVolume` und `masterVolume` ignoriert werden.
   - Ergebnis: Der Slider zeigt z. B. 5%, aber der Player spielt weiter mit dem alten Mix.

2. **Musik ist im Mix zu dominant**
   - Der Musikwert wird technisch direkt weitergegeben, aber Musiktracks sind oft stark gemastert/komprimiert. Deshalb kann 30% Musik subjektiv lauter wirken als 100% Voice-over.
   - Wichtig: Ich werde **keine sichtbare “Effektiv”-Anzeige** zurückbringen. Die UI bleibt professionell und zeigt nur den echten Sliderwert.

## Plan

### 1. Preview-Player wirklich live machen
- In `src/components/universal-creator/RemotionPreviewPlayer.tsx` die Memo-Logik korrigieren:
  - Audio-URL-Änderungen dürfen weiterhin keinen kaputten Play/Pause-State erzeugen.
  - **Volume-Werte müssen aber Re-Renders auslösen**, damit Remotion `<Audio volume={...}>` neu bekommt.
- In den Vergleich aufnehmen:
  - `backgroundMusicVolume`
  - `voiceoverVolume`
  - `masterVolume`
  - optional `scenes`, weil Szenen Audio/Timeline beeinflussen können.

### 2. Musik-Slider und Voice-over-Mix einheitlich kalibrieren
- In `src/lib/audioVolume.ts` eine saubere, zentrale Mix-Funktion einführen:
  - Slider bleibt 0–100%.
  - Intern wird Musik voice-over-freundlich begrenzt, wenn eine Stimme vorhanden ist.
  - Kein UI-Debugtext, keine “effektiv”-Beschriftung.
- Ziel-Mix:
  - 100% Voice-over bleibt wirklich 100%.
  - 30% Musik darf die Stimme nicht überdecken.
  - 5%, 10%, 30%, 70%, 100% müssen hörbar unterschiedlich sein.

### 3. Preview und Export über denselben Payload absichern
- `src/lib/universalCreatorRenderPayload.ts` bleibt Single Source of Truth.
- Sicherstellen, dass exakt dieselben Werte an beide Wege gehen:
  - Live Preview
  - Export über `render-with-remotion`
- Keine parallele Sonderlogik im Export-Step.

### 4. Render-Bundle-Audio absichern
- In `src/remotion/templates/UniversalCreatorVideo.tsx` die Audio-Volumes robust clampen und mit stabilen Keys versehen, damit Remotion Preview und Lambda-Render die aktuellen Werte sicher übernehmen.
- Prüfen, dass Hintergrundmusik nicht doppelt gerendert/gemuxt wird.

### 5. Kurzer Testpfad nach Umsetzung
- Im Universal Content Creator:
  - Musik auf 5%, 30%, 80% stellen.
  - Preview abspielen und prüfen, ob die Lautstärke live hörbar springt.
  - Voice-over bei 100% gegen Musik testen.
  - Render-Payload prüfen, dass der gleiche Musikwert im Export landet.

## Erwartetes Ergebnis
- Der Musik-Slider beeinflusst die Lautstärke sofort hörbar.
- Preview und fertiger Render nutzen denselben Mix.
- 30% Musik ist nicht mehr lauter als 100% Voice-over.
- Die UI bleibt sauber ohne “effektiv”-Debuganzeige.