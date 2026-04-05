
Ziel

Der Übergang bei 30s soll als echte Szenengrenze erkannt werden. Das Ergebnis muss 2 Szenen sein, nicht 1.

Do I know what the issue is? Ja.

Das eigentliche Problem
- Der Browser liefert wegen CORS oft `frames=0` und `scene_boundaries=0`.
- Der Backend-Fallback analysiert das Video danach nicht wirklich: `detectScenesViaVision()` sendet die MP4-URL als `image_url`.
- Die Logs zeigen den echten Fehler:
  - `Unsupported image format for URL ... out.mp4`
- Danach setzt `analyze-video-scenes` stillschweigend `fallback_single` und baut genau 1 Szene über die volle Dauer.
- Deshalb ist das aktuelle Verhalten kein “schlechter Threshold”, sondern ein kaputter Fallback-Pfad.

Umsetzung
1. `supabase/functions/analyze-video-scenes/index.ts`
- `detectScenesViaVision()` als Boundary-Detektor ersetzen.
- Video serverseitig herunterladen.
- Mit `ffprobe` die echte Dauer/Streamdaten bestimmen.
- Mit `ffmpeg` eine echte Szenenerkennung ausführen.
- Kandidaten deduplizieren, stabilisieren und daraus deterministische Szenen bauen.
- KI nur noch für Szenenbeschreibung/Effekte verwenden, nicht für die Szenenzahl.

2. Fehlerlogik korrigieren
- `fallback_single` nicht mehr bei technischem Analysefehler verwenden.
- 1 Szene nur dann zurückgeben, wenn die serverseitige Analyse erfolgreich lief und wirklich keinen Übergang gefunden hat.
- Bei Download-/FFmpeg-/Parsing-Fehlern ein strukturiertes Fehlerobjekt zurückgeben statt still 1 Szene.

3. `src/pages/DirectorsCut/DirectorsCut.tsx`
- Client-Frames nur als optionalen Fast-Path behalten.
- Wenn `timestampedFrames.length === 0`, bewusst auf Backend-Detektion verlassen.
- Response-Debugdaten (`analysis_mode`, `boundaries_used`, `debug_boundary_times`, Fehlercode) mitverarbeiten.
- Strukturierte Function-Fehler sauber auslesen und im Toast anzeigen.

4. `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
- Badge/Status nicht mehr pauschal “Videoanalyse”.
- Sichtbar unterscheiden zwischen:
  - Client-Detektion
  - Serverseitiger FFmpeg-Analyse
  - Keine Übergänge gefunden
  - Analyse fehlgeschlagen
- Wenn die Analyse fehlschlägt, klaren Hinweis zeigen statt eine scheinbar korrekte 1-Szenen-Auswertung.

5. `src/types/directors-cut.ts`
- Kleine Analyse-Metadaten für die UI ergänzen, damit Quelle und Debug-Infos typisiert durchgereicht werden können.

6. `supabase/config.toml`
- Für `analyze-video-scenes` Timeout erhöhen, damit Download + ffmpeg/ffprobe stabil laufen.

Technische Leitlinie

````text
Video URL
  -> Client-Frames optional versuchen
  -> falls 0 Frames / 0 Boundaries:
       Video im Backend laden
       -> ffprobe: Dauer/Streams
       -> ffmpeg: echte Cut-Kandidaten
       -> Stabilisierung
       -> feste Szenengrenzen
  -> KI beschreibt nur noch die fertigen Segmente
````

Betroffene Dateien
- `supabase/functions/analyze-video-scenes/index.ts`
- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
- `src/types/directors-cut.ts`
- `supabase/config.toml`

Validierung
- Dein 60s-Video mit hartem Übergang bei 30s -> exakt 2 Szenen
- Gleiches Video ohne Übergang -> exakt 1 Szene
- Browser-CORS-Fehler -> trotzdem serverseitige Erkennung statt blindem 1-Szene-Fallback
- Analysefehler -> sichtbare Fehlermeldung statt irreführendem Erfolg

Erwartetes Ergebnis
Die eigentliche Ursache ist damit beseitigt: Der Backend-Fallback analysiert das MP4 dann wirklich, statt an einem ungültigen `image_url`-Aufruf zu scheitern und still 1 Szene zurückzugeben.
