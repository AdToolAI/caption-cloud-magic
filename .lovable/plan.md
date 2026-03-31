

## Video-Analyse für Raumplan-Erstellung

### Was ich tun werde

Das Video (24 Sekunden) enthält kaum Audio ("Thank you"). Um eine detaillierte räumliche Beschreibung zu erstellen, werde ich:

1. **Frames extrahieren** — Alle 1-2 Sekunden ein Bild aus dem Video ziehen (ca. 12-15 Frames), um den gesamten Rundgang abzudecken
2. **KI-Bildanalyse** — Jeden Frame mit einem Vision-Modell analysieren lassen, um Räume, Möbel, Türen, Fenster, Durchgänge und räumliche Zusammenhänge zu erkennen
3. **Zusammenfassung erstellen** — Eine strukturierte Raumbeschreibung als Text-Dokument generieren, die folgendes enthält:
   - Auflistung aller sichtbaren Räume
   - Raumgrößen-Schätzungen (relativ zueinander)
   - Position von Türen, Fenstern, Durchgängen
   - Möblierung und markante Merkmale
   - Reihenfolge/Verbindung der Räume (wie sie im Video durchlaufen werden)
   - Himmelsrichtungs-Hinweise (falls Lichteinfall erkennbar)
4. **Dokument ausgeben** — Das Ergebnis als Textdatei, die du direkt an ChatGPT geben kannst

### Technischer Ablauf

- `ffmpeg` zum Frame-Extrahieren aus dem Video
- Lovable AI (Gemini Vision) zur Bildanalyse der einzelnen Frames
- Ergebnis wird als `/mnt/documents/raumanalyse.txt` gespeichert

### Ergebnis

Eine detaillierte, ChatGPT-optimierte Raumbeschreibung, mit der ein Grundriss/Raumplan erstellt werden kann.

