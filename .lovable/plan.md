<final-text>## Plan: Persistierenden Volume-Fehler im echten Director's Cut-Preview beheben

### Do I know what the issue is?
Ja.

### Was wirklich kaputt ist
Der bisherige Fix war im falschen Preview-Pfad.  
`TimelineVideoPreview.tsx` wurde zwar abgesichert, aber der Fehler im Director's Cut Studio kommt weiter aus `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`.

Dort wird `audio.master_volume / 100` an mehreren Stellen direkt auf `HTMLMediaElement.volume` gesetzt. Das crasht weiterhin, sobald der Wert über `1` liegt. Laut Web-API darf `volume` nur im Bereich `0..1` liegen.

Zusätzlich wirkt der Master-Volume-Regler bei Musik nicht korrekt, weil in `src/components/directors-cut/studio/CapCutEditor.tsx` die Timeline-Audios noch mit einem lokalen `volume`-State berechnet werden, der nicht an `audioEnhancements.master_volume` gekoppelt ist.

### Umsetzung
1. **Echten Crash-Pfad fixen**
   - **Datei:** `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
   - Helper einbauen, z. B. `clampMediaVolume(value)`
   - Alle `.volume`-Zuweisungen darüber absichern:
     - Initiales Laden
     - Reaktive Updates bei `audio.master_volume`
     - Playback-/Ducking-Logik
     - Unmute-Handler

2. **Master Volume wirklich auf Musik/Voiceover anwenden**
   - **Datei:** `src/components/directors-cut/studio/CapCutEditor.tsx`
   - In der Audio-Playback-Logik den ungenutzten lokalen `volume`-State entfernen/ersetzen
   - Stattdessen `audioEnhancements.master_volume` als echten Master-Multiplikator verwenden
   - Ergebnis weiter clampen, damit auch `master * track * clip` nie über `1` an den Browser geht

3. **Slider-Verhalten konsistent machen**
   - **Dateien:**  
     - `src/components/directors-cut/studio/CapCutPropertiesPanel.tsx`
     - optional `src/components/directors-cut/steps/AudioEnhancementStep.tsx`
   - Werte über 100 dürfen intern bestehen bleiben, aber die Browser-Vorschau wird sauber gedeckelt
   - Optional kleiner Hinweis, dass die Vorschau technisch bei 100% limitiert ist

### Betroffene Dateien
- **Edit:** `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- **Edit:** `src/components/directors-cut/studio/CapCutEditor.tsx`
- **Optional Edit:** `src/components/directors-cut/studio/CapCutPropertiesPanel.tsx`
- **Optional Edit:** `src/components/directors-cut/steps/AudioEnhancementStep.tsx`

### Ergebnis
- Kein `HTMLMediaElement.volume`-Fehler mehr
- Master Volume wirkt endlich auch auf Musik/Voiceover in der Studio-Vorschau
- Werte über 100 verursachen keinen Crash mehr</final-text>