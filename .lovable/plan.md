Ich habe den Fehler jetzt konkreter eingegrenzt.

Das eigentliche Problem ist nicht nur der einzelne Blackscreen, sondern dass im Editor aktuell die **Timeline-Länge** teilweise als **Originalvideo-Länge** verwendet wird. Sobald du die erste leere Szene 0:00–0:05 anlegst, kann die App intern denken: „Das Originalvideo endet bei 5 Sekunden“. Die nächste leere Szene ab 0:05 wird dann fälschlich als Bereich **außerhalb des Originalvideos** behandelt und deshalb als Blackscreen angelegt.

Zusätzlich ist die Auto-Cut-Logik aktuell zu hart: Die clientseitig erkannten Schnittpunkte werden als „fest“ betrachtet und die KI darf sie kaum korrigieren. Wenn die Erkennung knapp danebenliegt, entstehen miserable Szenengrenzen.

Do I know what the issue is? Ja: Es braucht eine saubere Trennung zwischen **Originalvideo-Dauer**, **Timeline-Dauer** und **Szenen-Quellmodus** sowie eine fehlertolerantere, editierbare Auto-Cut-Pipeline.

## Plan

### 1. Originalvideo-Dauer und Timeline-Dauer trennen
- In `DirectorsCut.tsx` die Timeline-Dauer wieder korrekt berechnen als:
  - `max(originalVideoDuration, letzte Szene / angehängte Medien)`
- `CapCutEditor` soll als `videoDuration` wieder die echte Originalvideo-Dauer bekommen, nicht die aktuelle Timeline-Länge.
- Falls die Dauer beim Import fehlt oder falsch ist, wird sie nachträglich per Video-Metadaten gemessen und in `selectedVideo.duration` gespeichert.

Ergebnis: Wenn dein Original 25 Sekunden lang ist, bleiben alle leeren Szenen von 0:00–0:25 automatisch „Original“, nicht Blackscreen.

### 2. Bestehende falsche Blackscreen-Szenen automatisch migrieren
- Beim Laden/Rendern des Studios alle Szenen ohne eigenes Medium prüfen.
- Wenn eine Szene innerhalb der Originalvideo-Dauer liegt, wird sie automatisch auf:
  - `sourceMode: 'original'`
  - `isBlackscreen: false`
  gesetzt.
- Nur Szenen nach dem Originalvideo-Ende bleiben echte Blackscreen-Platzhalter.

Ergebnis: Auch bereits falsch erzeugte zweite/dritte Szenen werden repariert, ohne dass du sie manuell neu erstellen musst.

### 3. Manuelle Szenen sauber als Original-Pass-Through anlegen
- „Leere Szene“ innerhalb des Originalvideos wird immer eine Original-Szene.
- „Leere Szene“ nach dem Originalvideo wird nur dann Blackscreen.
- Die Timeline-Labels werden angepasst, damit nicht mehr irreführend „Blackscreen“ angezeigt wird, wenn eigentlich Originalvideo durchgereicht wird.

### 4. Source-Time-Mapping bei Split/Trim stabilisieren
- Beim Teilen einer Original-Szene am Playhead wird die zweite Szene korrekt auf die passende Originalvideo-Zeit gemappt.
- Beim Trimmen werden `original_start_time` / `original_end_time` konsistent mitgeführt.
- Dadurch springt die Vorschau beim Abspielen nicht plötzlich auf falsche Quellstellen.

### 5. Auto-Cut-Erkennung verbessern, aber weiterhin editierbar lassen
- Die KI-/Analysefunktion soll künftig nicht mehr blind schlechte Kandidaten übernehmen.
- Workflow:
  1. Client erkennt grobe Kandidaten aus Frames.
  2. Backend-KI bekommt Video/Frames plus Kandidaten und darf die Schnittpunkte korrigieren.
  3. Grenzen werden geglättet: Mindestdauer, keine Mikro-Szenen, keine unnötigen Schnitte bei Kamerabewegung/Lichtwechsel.
  4. Alle erzeugten Szenen bekommen `sourceMode: 'original'`.
- Wenn die Analyse unsicher ist, lieber weniger, größere Szenen erzeugen statt viele falsch gesetzte Cuts.

Ergebnis: Die automatische Szene ist ein brauchbarer Vorschlag, bleibt aber komplett im Editor verschiebbar/trimbar.

### 6. UI-Verbesserung für Kontrolle
- Szenenkarten und Timeline zeigen künftig klarer:
  - Original
  - Media
  - Blackscreen
- Optional im Eigenschaftenbereich: Quellmodus manuell wechseln, damit du eine Szene bei Bedarf explizit auf „Original“ oder „Blackscreen“ setzen kannst.

### 7. Export-Parität prüfen
- Beim Export müssen dieselben Szeneninformationen mitgegeben werden:
  - `sourceMode`
  - `isFromOriginalVideo`
  - `additionalMedia`
  - `original_start_time` / `original_end_time`
- Damit das gerenderte Video genauso aussieht wie die Vorschau.

## Betroffene Dateien
- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `src/components/directors-cut/studio/CapCutEditor.tsx`
- `src/components/directors-cut/studio/CapCutTimeline.tsx`
- `src/components/directors-cut/studio/sidebar/CutPanel.tsx`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/lib/directors-cut-scene-detection.ts`
- `supabase/functions/analyze-video-scenes/index.ts`
- ggf. `src/lib/translations.ts`

Nach Umsetzung sollte dein Beispiel korrekt funktionieren: Originalvideo 25s + angehängte 5s = 30s Timeline, mit Original-Szenen innerhalb 0:00–0:25 statt Blackscreens und mit nachjustierbaren Auto-Cut-Grenzen.