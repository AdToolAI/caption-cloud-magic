Ich habe den konkreten Fehler gefunden: PySceneDetect wurde aufgerufen und hat laut Backend-Logs 2 Split-Clips geliefert. Daraus wurde aber nur 1 Boundary an `analyze-video-scenes` übergeben. Dort wird jede Boundary verworfen, wenn sie weniger als 3 Sekunden vor dem Videoende liegt. Bei deinem 25.77s-Video lag der Schnitt offenbar sehr nahe am Ende, deshalb wurde daraus wieder genau 1 Gesamtszene.

Plan zur Korrektur:

1. Mindestlängen-Filter für professionelle Detection entschärfen
   - `analyze-video-scenes` so erweitern, dass vorgegebene PySceneDetect-Boundaries nicht durch den harten `MIN_SCENE_DURATION = 3.0`-Filter verschwinden.
   - Stattdessen für externe/vertrauenswürdige Boundaries eine niedrigere Mindestlänge verwenden, z. B. 0.5s bis 1.0s, damit kurze echte Shots am Anfang oder Ende nicht zusammengeführt werden.
   - Die 3s-Regel nur für unsichere AI-/Fallback-Erkennung beibehalten, damit keine wilden Mikro-Cuts entstehen.

2. Quelle der Boundary explizit übergeben
   - Im Frontend bei PySceneDetect-Boundaries ein Feld wie `source: 'pyscenedetect'` oder eine Option `boundary_source: 'pyscenedetect'` an `analyze-video-scenes` senden.
   - Die Backend-Funktion nutzt diese Quelle, um die korrekte Mindestdauer und Filterlogik zu wählen.

3. Frontend-Zusammenführung ebenfalls entschärfen
   - In `DirectorsCut.tsx` wird nach der Analyse aktuell nochmal alles unter 3s mit der vorherigen Szene verschmolzen.
   - Für PySceneDetect-Ergebnisse muss auch hier die Mindestdauer niedriger sein, sonst kann ein korrekt erkannter kurzer Shot wieder verschwinden.

4. Diagnose verbessern
   - In den Logs/Response zusätzliche Debug-Daten ausgeben: empfangene Boundary-Zeiten, akzeptierte Boundary-Zeiten, verworfene Boundary-Zeiten inklusive Grund.
   - Damit sieht man künftig sofort, ob PySceneDetect falsch erkennt oder ob unsere eigene Nachbearbeitung Schnitte entfernt.

5. Optionaler robusterer Zeitcode-Pfad
   - Wenn möglich, die Dauer der Split-Clips weiterhin summieren, aber bei Probe-Problemen keine 0-Dauer einfließen lassen.
   - Falls PySceneDetect nur 1 Clip liefert, bleibt Fallback auf Client-/AI-Detection aktiv. Wenn PySceneDetect aber mehrere Clips liefert, sollen diese Schnitte nicht stillschweigend wegoptimiert werden.

Erwartetes Ergebnis:
- Bei deinem aktuellen Video werden statt einer Gesamtszene mindestens die von PySceneDetect erkannten Segmente angezeigt.
- Kurze echte Szenen am Ende oder Anfang werden nicht mehr durch unsere 3-Sekunden-Schutzlogik gelöscht.
- Falls künftig wieder nur eine Szene angezeigt wird, ist im Debug eindeutig sichtbar, ob PySceneDetect wirklich nur eine Szene gefunden hat oder ob ein Filter gegriffen hat.