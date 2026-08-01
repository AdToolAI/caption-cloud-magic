## Plan v368 — Preclip-Reprojection beweissicher reparieren

### Bestätigter Ist-Zustand
- HappyHorse erhält weder Dialogtext noch Sprecher-Timing; der Basisclip erklärt daher keinen englischen Audiotrack.
- Alle vier deutschen Sprecher-Audios wurden separat und mit korrekten Zeitfenstern an Sync.so gesendet.
- Die vier Passes besitzen unterschiedliche Charakter-IDs und unterschiedliche Crops.
- Trotzdem erscheinen die fertigen Mundbewegungen auf Sarah. Der Defekt liegt damit zwischen Sync.so-Ausgabe und dem Einsetzen der 720×720-Preclips in die Gesamtplatte.

### Umsetzung
1. **Jeden Pass visuell beweisen**
   - Für Input-Preclip und Sync.so-Output denselben Frame-Zeitpunkt extrahieren.
   - Gesichts-/Mundbewegung und Bildidentität vergleichen.
   - Pro Pass persistieren: erwarteter Charakter, erkannte Face-ID, Crop, Zielregion und Motion-Delta.

2. **Einheitlichen Koordinatenvertrag herstellen**
   - Plate-Crop ausschließlich als `{x, y, size}` in nativen Plattenpixeln behandeln.
   - 720×720 ist nur der lokale Sync.so-Arbeitsraum und darf niemals als Zielkoordinate interpretiert werden.
   - Skalierung, Clamping und Offset genau einmal zentral berechnen; doppelte Transformationen entfernen.

3. **Mux an den Pass binden**
   - Jeder Sync.so-Output wird strikt mit seinem eigenen persistierten `preclip_crop`, `speaker_idx` und `character_id` eingesetzt.
   - Keine Neuberechnung der Gesichtszuordnung im Mux.
   - Vor Renderstart abbrechen, wenn zwei Passes dieselbe Zielregion/Face-ID beanspruchen oder Pass-Metadaten nicht zusammenpassen.

4. **Originale Mundbewegung korrekt überdecken**
   - Das vollständige bearbeitete Gesichtsfenster des jeweiligen Passes einsetzen, nicht nur eine falsch lokalisierte Mundmaske.
   - Alpha-/Masken-Geometrie aus dem lokalen 720er Raum deterministisch in den Plate-Raum transformieren.
   - Außerhalb des aktiven Dialogfensters bleibt die unveränderte Platte sichtbar.

5. **Regressionstest für vier Sprecher**
   - Test mit vier eindeutig getrennten Crops und vier nicht überlappenden Zeitfenstern.
   - Assertions: Pass 1–4 landen jeweils auf ihrer erwarteten Region; kein Pass verändert Sarah außerhalb Sarahs eigenem Zeitfenster.
   - Danach betroffene Backend-Funktionen deployen und einen neuen echten 4-Sprecher-Lauf prüfen.

### Erwartetes Ergebnis
Jeder deutsche Dialog bewegt ausschließlich den zugeordneten Charakter. Eine bereits im stummen Basisvideo vorhandene, sprachähnliche Mundbewegung wird während des jeweiligen Dialogfensters durch den korrekten Sync.so-Pass ersetzt, ohne dass alle Passes auf Sarah kollabieren.