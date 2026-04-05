
Ziel

Die Szenenerkennung soll deterministisch arbeiten: echte Szenengrenzen aus dem Video berechnen und die KI nur noch für Beschreibung/Effekte nutzen. Ich plane dabei, sowohl harte Schnitte als auch klare weiche Übergänge (Fade, Dissolve, Morph) als Szenenwechsel zu behandeln.

Warum es aktuell scheitert

- `src/lib/directors-cut-scene-detection.ts`: `extractTimestampedFrames()` ist für längere Videos zu grob (`maxFrames=60`), und `detectCutsAsync()` ist mit `Math.max(0.30, mean + 3*stdDev)` zu streng.
- Die aktuelle Logik vergleicht nur direkt benachbarte Frames. Weiche Übergänge haben oft keinen einzelnen starken Spike und werden dadurch übersehen.
- `supabase/functions/analyze-video-scenes/index.ts` ist auf „harte Schnitte“ gebiast. Wenn der Client nichts meldet, landet das System fast automatisch bei 1 Szene.
- `src/pages/DirectorsCut/DirectorsCut.tsx` schickt der KI bei fehlendem Cut nur wenige grob verteilte Frames statt gezielte Vorher/Nachher-Frames rund um den Übergang.

Umsetzung

1. `src/lib/directors-cut-scene-detection.ts` zu echtem Szenengrenzen-Detektor ausbauen
- Aus `detectCutsAsync()` wird ein Boundary-Detector statt nur Hard-Cut-Detector.
- Mehrere Signale kombinieren:
  - Pixel-/Luminanz-Differenz
  - Histogramm-/Farbverteilung
  - Struktur-/Kantenänderung
  - Vorher/Nachher-Fenstervergleich um Zeitpunkt `t`
- 2-stufige Analyse:
  - grober Full-Video-Scan
  - dichter Feinscan nur um starke Kandidaten
- Feste Absolute-Schwelle entfernen und auf Peak-Prominenz / relative Ausreißer umstellen.
- Harte Cuts und weiche Übergänge getrennt erkennen.
- Interne Zeit präzise halten und erst fürs UI runden.
- `buildScenesFromCuts()` zu allgemeinem Boundary-Builder erweitern.

2. `src/pages/DirectorsCut/DirectorsCut.tsx` auf deterministische Grenzen umstellen
- Die erkannten Grenzen werden zur Quelle der Szenenzahl.
- Für jeden Kandidaten gezielt Frames vor/nach dem Übergang an die KI schicken.
- Wenn ein starker Boundary-Score vorliegt, darf die KI daraus nicht wieder 1 Szene machen.
- Payload semantisch von `detected_cuts` auf echte `scene_boundaries` erweitern.

3. `supabase/functions/analyze-video-scenes/index.ts` von der Szenenzahl entkoppeln
- Die Edge Function soll keine Szenenzahl mehr schätzen.
- KI-Aufgabe nur noch:
  - Szenen beschreiben
  - Stimmung bestimmen
  - Effekte vorschlagen
  - optional Kandidaten kommentieren
- Prompt von „nur harte Schnitte“ auf „erkenne explizite Szenenübergänge“ umstellen.
- Wenn keine belastbare Grenze da ist: exakt 1 Szene, aber kein Ratespiel mehr.

4. UI transparenter machen
- In `SceneAnalysisStep.tsx` sichtbar machen:
  - deterministisch erkannt
  - weicher Übergang erkannt
  - nur KI-Beschreibung
  - manuell prüfen
- Exakte Grenzzeit(en) anzeigen, damit sofort sichtbar ist, ob z. B. 30.0s erkannt wurde.

Validierung

- 60s Video mit Wechsel bei 30.0s → exakt 2 Szenen
- gleiche Szene mit Kamerabewegung → kein falscher Szenenwechsel
- weicher Übergang bei 30s → trotzdem 2 Szenen
- keine Übergänge → exakt 1 Szene
- Fehler bei Frame-Extraktion → keine freie KI-Schätzung der Szenenzahl

Technische Leitlinie

````text
Video
  -> grober Boundary-Scan
  -> Peak-/Ramp-Kandidaten
  -> Feinscan um Kandidaten
  -> feste Szenengrenzen
  -> KI beschreibt nur noch die fertigen Szenen
````

Ergebnis

Danach erkennt das System Szenen anhand echter Übergangssignale im Video statt per KI-Ratespiel. In deinem Beispiel würde der Wechsel bei 30 Sekunden als konkrete Szenengrenze behandelt und zuverlässig als 2 Szenen ausgegeben.
