
Ziel: eine wirklich einfache 1-Klick-Lösung, bei der der sichtbare Untertitel zuverlässig verschwindet.

Was ich im Code konkret gefunden habe
- In `CapCutEditor` wird „Original-Untertitel erkennen“ aktuell über `generate-subtitles` auf dem `videoUrl` gemacht. Das ist Audio-Transkription, nicht echte Erkennung von eingebranntem Text im Bild. Die UI vermischt also drei Dinge: Audio-Untertitel, Text-Overlays und eingebrannten Text.
- Der aktuelle Reframe-Modus ist nur ein weiches `scale + translateY`. `bottomBandPercent` ist zwar im Draft vorhanden, wird aber nirgends wirklich angewendet. Es gibt also keinen harten Zuschnitt, der den unteren Textbereich garantiert entfernt.
- Der Export kennt `subtitleSafeZone` noch nicht. Selbst wenn die Vorschau irgendwann passt, ist der finale Render derzeit nicht sauber gekoppelt.

Neue Richtung
Wir hören auf, den Untertitel „wegzuretuschieren“, und bauen stattdessen den robusten Standardweg:
- automatische Erkennung des unteren Untertitel-Bands
- echter Hard-Crop dieses Bereichs
- identische Logik in Vorschau und Export

Das ist kein weiterer Layer-Trick, sondern ein echter Zuschnitt des Bildes.

Umsetzung
1. UI sauber trennen
- In Schritt 10 drei klar getrennte Bereiche:
  - Untertitel aus Audio
  - Text-Overlays
  - Eingebrannter Text im Video
- „Original-Untertitel erkennen“ umbenennen, damit der Flow nicht mehr irreführend ist.
- Neuer Hauptbutton: „Automatisch sauber entfernen“.

2. Automatische Band-Erkennung
- Neue Backend-Funktion, die 5–8 repräsentative Frames analysiert und den festen unteren Textbereich erkennt.
- Rückgabe z. B.:
  `bottomBandPercent`, `zoom`, `offsetY`, `confidence`
- Ergebnis wird direkt als `subtitleSafeZone` gesetzt.
- Kein langes Inpainting für den Standardfall.

3. Echter Hard-Crop in der Vorschau
- In `DirectorsCutPreviewPlayer` den unteren Bereich wirklich abschneiden (`clip/mask + scale`), nicht nur nach oben schieben.
- `bottomBandPercent` endlich wirklich verwenden.
- „Feinjustieren“ bleibt optional für Sonderfälle, aber nicht mehr als Hauptweg.

4. Export 1:1 an Vorschau koppeln
- `subtitleSafeZone` durchreichen über:
  `ExportRenderStep` -> `render-directors-cut` -> `DirectorsCutVideo`
- Dieselbe Crop-Logik in beiden Render-Pfaden von `DirectorsCutVideo` anwenden, damit Export und Preview identisch sind.

5. Bestehende KI-Retusche nur noch als Fallback
- Die aktuelle KI-Entfernung bleibt unter „Experimentell“.
- Der empfohlene Standard wird der automatische Safe-Crop.

Technische Details
```text
Klick auf "Automatisch sauber entfernen"
-> Frames aus dem Video samplen
-> unteren Textbereich erkennen
-> subtitleSafeZone automatisch setzen
-> Hard-Crop in Preview anwenden
-> identische Daten in Export mitschicken
```

Betroffene Dateien
- `src/components/directors-cut/studio/CapCutSidebar.tsx`
- `src/components/directors-cut/studio/CapCutEditor.tsx`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/components/directors-cut/steps/ExportRenderStep.tsx`
- `src/remotion/templates/DirectorsCutVideo.tsx`
- `supabase/functions/render-directors-cut/index.ts`
- neu: `supabase/functions/director-cut-detect-subtitle-band/index.ts`

Wichtige Erwartung
- Wenn der Untertitel wirklich ohne großen Aufwand verschwinden soll, ist dieser automatische Hard-Crop der zuverlässige Weg.
- Eine komplett crop-freie „Pixel-Rekonstruktion“ bleibt bei solchen eingebrannten/stilisierten Untertiteln weiterhin nur experimentell.

Nebenwirkung
- Keine Datenbank-Migration nötig.
- Der Flow wird schneller, klarer und deutlich weniger frustrierend.
