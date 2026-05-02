Ich habe mir den konkreten Lauf angesehen: Die Backend-Logs zeigen eindeutig, warum du exakt 5-Sekunden-Szenen bekommst:

```text
frames: 0, boundaries: 0, client_failed: true
Server-side detection failed: Video too large for inline analysis: 33.3MB (max 20MB)
Falling back to uniform splits (5s)
```

Das heißt: Die App erkennt gerade keine echten Schnitte. Weil die Client-Frame-Extraktion fehlgeschlagen ist und das Video für die alte Inline-Analyse zu groß ist, greift der Notfall-Fallback: alle 5 Sekunden schneiden. Das ist genau das, was du im Screenshot siehst.

Plan zur Behebung auf CapCut/Artlist-Niveau:

1. 5-Sekunden-Fallback entfernen bzw. degradieren
   - Die Auto-Cut-Funktion darf nicht mehr so tun, als wären 5s-Splits echte Szenen.
   - Wenn keine echten Grenzen erkannt werden, soll die UI klar anzeigen: „Keine echten Schnitte erkannt“ oder „Frame-Analyse fehlgeschlagen“, statt Fake-Cuts zu erzeugen.
   - Optional nur als manuelle Aktion anbieten: „In 5s-Abschnitte teilen“.

2. Client-Frame-Extraktion robuster machen
   - `extractTimestampedFrames` so umbauen, dass Video-Seek/Decode-Fehler sauber erkannt werden.
   - Der Proxy-Fallback soll nicht nur bei Canvas-CORS-Taint laufen, sondern auch bei typischen S3/Range/Seek/Decode-Problemen.
   - Zusätzlich bessere Diagnose liefern: wie viele Frames geladen wurden, welche URL-Variante genutzt wurde, warum ein Versuch fehlgeschlagen ist.

3. Echte automatische Schnitt-Erkennung als primären Weg verbessern
   - Statt nur grob 3 fps zu sampeln, eine zweistufige Erkennung einbauen:
     - Grobscan über das ganze Video.
     - Feinscan um auffällige Stellen mit höherer Dichte, z.B. 12–24 fps im Zeitfenster.
   - Die Erkennung kombiniert mehrere Signale:
     - Pixel-/Histogramm-Unterschiede
     - Edge-/Strukturwechsel
     - Luminanzwechsel/Fades
     - Peak-Prominence statt fester 5s-Raster
   - Ergebnis: echte Schnittpunkte wie z.B. `0.00–4.37`, `4.37–9.12`, `9.12–13.84`, statt immer `0–5`, `5–10`, `10–15`.

4. Backend-Fallback für große Videos richtig skalieren
   - `analyze-video-scenes` darf große Videos nicht mehr wegen `>20MB` direkt abbrechen.
   - Wenn das Video zu groß für Inline-Videoanalyse ist, soll das Backend stattdessen mit den clientseitig extrahierten Frames arbeiten oder einen framebasierten Analysepfad nutzen.
   - AI soll nur noch beschreiben/validieren, nicht die Szenengrenzen künstlich erfinden.

5. Ergebnis-Transparenz im Studio
   - Nach Auto-Cut eine kleine Debug-/Statusmeldung anzeigen:
     - Quelle: `client-frame-detection`, `proxy-frame-detection`, `server-ai-video`, `manual-uniform`
     - erkannte Schnittpunkte
     - Anzahl extrahierter Frames
   - So sehen wir sofort, ob echte Erkennung gelaufen ist oder ein Fallback.

6. Timeline korrekt aus echten Original-Zeitankern bauen
   - Die erkannten Boundary-Zeiten bleiben als `original_start_time` / `original_end_time` erhalten.
   - Die Timeline wird daraus sequenziell gebaut, ohne die Schnittzeiten wieder auf feste 5s-Zellen zu normalisieren.
   - AI-Cut-Marker werden nur aus echten Boundaries gesetzt, nicht aus Uniform-Fallbacks.

Technische Änderungspunkte:

- `src/lib/directors-cut-scene-detection.ts`
  - Fehlerklassifizierung erweitern.
  - Extraktion/Seek-Handling verbessern.
  - präzisere zweistufige Boundary Detection.

- `src/pages/DirectorsCut/DirectorsCut.tsx`
  - Proxy-Fallback breiter triggern.
  - Analyse-Metadaten anzeigen/toasten.
  - Uniform-Fallback nicht mehr als echte Auto-Cuts übernehmen.

- `supabase/functions/analyze-video-scenes/index.ts`
  - 5s-Auto-Fallback entfernen.
  - große Videos nicht mehr als „fake scenes“ behandeln.
  - klaren `analysis_mode` und Diagnose zurückgeben.

- `supabase/functions/proxy-video-bytes/index.ts`
  - Range-/Header-Verhalten prüfen und ggf. härten, damit Browser-Seeking zuverlässig funktioniert.

Erwartetes Ergebnis:

- Auto-Cut erzeugt keine künstlichen 5-Sekunden-Szenen mehr.
- Wenn das Video echte Schnitte enthält, erscheinen variable, realistische Szenenlängen.
- Wenn keine Schnitte erkannt werden oder die Analyse blockiert ist, bekommst du eine ehrliche Fehlermeldung mit Ursache statt falscher Timeline.
- Die Grundlage ist dann deutlich näher an CapCut/Artlist: echte Shot-Boundary-Erkennung statt periodisches Zerschneiden.