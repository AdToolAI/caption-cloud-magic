Du hast recht: Wir dürfen jetzt nicht weiter „herumpatchen“. Der Stand aus der Forensik ist klar genug, um die nächste Runde als Diagnose-Plan aufzusetzen.

Was ich bereits nachweisen konnte:

- Es läuft wirklich v5: `dialog_shots.version = 5`, `engine = sync-segments`.
- Der direkte Dispatch zu Sync.so klappt: Sync.so antwortet auf `/generate` mit `201` und Job-IDs.
- Der Fehler kommt erst asynchron vom Provider-Job: Webhook meldet sehr schnell `FAILED` mit nur `An unknown error occurred.`
- Es gibt einen separaten Bug in unserer Retry-Forensik: `retry_count` wird beim Retry-Dispatch wieder verworfen. Dadurch wurden in ca. 15 Minuten 71 Jobs für eine Szene und 36 Jobs für eine zweite Szene erzeugt, statt sauber nach 2 Versuchen zu stoppen.
- Der Webhook-Payload zeigt den kritischen Payload-Teil: `segments[]` plus `options.active_speaker_detection.bounding_boxes[]`.

Wichtig: „Alle Sync.so-Fehler abdecken“ heißt aktuell nur, dass bekannte Fehlerklassen wie 422, Rate Limit, Timeout, 5xx, Rejected, Failed, Refund etc. abgefangen werden. Wenn Sync.so selbst nur `An unknown error occurred` zurückgibt, haben wir die Provider-Fehlerklasse abgefangen, aber nicht automatisch die Ursache. Dafür brauchen wir jetzt eine kontrollierte Isolation.

Plan:

1. Live-Retry-Sturm stoppen
   - Die aktuell betroffenen Szenen aus dem endlosen `running`/Retry-Zyklus nehmen.
   - Keine weiteren Sync.so-Jobs erzeugen, bis die Ursache isoliert ist.
   - Credits idempotent schützen: kein Doppel-Refund, kein weiterer Verbrauch.

2. Vollständigen Debug-Datensatz sichern
   - Den exakten v5-Payload pro fehlgeschlagenem Job persistent erfassen, nicht nur abgeschnittene Edge-Logs.
   - Pro Job speichern:
     - Sync.so Job-ID
     - Modell
     - `segments[]`
     - Input-Audio-URLs und HEAD-Metadaten
     - Input-Video-URL und HEAD-Metadaten
     - `active_speaker_detection`-Form
     - Webhook-Status und Roh-Payload
   - Ziel: Nicht mehr nur `unknown`, sondern ein reproduzierbares Testpaket.

3. Minimal-Repro-Matrix gegen Sync.so fahren
   - Mit derselben Szene kontrolliert Varianten testen, jeweils nur eine Variable ändern:
     1. Video + ein Audio ohne `segments` und ohne Speaker-Selection.
     2. Video + ein Audio mit `segments`.
     3. Video + zwei Audio-Inputs mit `segments`, aber ohne `active_speaker_detection`.
     4. Video + zwei Audio-Inputs mit `segments` + nur `coordinates`.
     5. Video + zwei Audio-Inputs mit `segments` + `bounding_boxes`.
   - Ergebnis zeigt, ob Sync.so an den Medien, an `segments`, an mehreren Audio-Inputs oder an `bounding_boxes` scheitert.

4. Audio- und Segment-Timing verifizieren
   - Die per-speaker WAVs sind komplette, szenenlange Tracks mit Stille außerhalb des Sprecherfensters.
   - Gleichzeitig setzen wir im Segment `audioInput.startTime/endTime` auf die Szenenzeit.
   - Das muss gegen Sync.so-Dokumentation/Verhalten geprüft werden, weil bei szenenlangen Tracks die Audio-Crop-Zeiten möglicherweise anders interpretiert werden als erwartet.
   - Falls dies die Ursache ist, wäre der echte Fix nicht „Retry“, sondern segmentgerechte Audio-Crops oder andere `audioInput`-Zeiten.

5. Bounding-Box-Format isolieren
   - Sync.so akzeptiert laut Docs `bounding_boxes` als per-frame Array, aber unsere Boxen stammen aus dem Anchor-Bild und werden pauschal über jedes Frame wiederholt.
   - Zu prüfen:
     - Erwartet Sync.so Boxen in tatsächlicher Videoauflösung statt Anchor-Auflösung?
     - Ist die Array-Länge exakt zur Video-FPS/Dauer passend?
     - Scheitert `lipsync-2-pro` speziell mit `segments + bounding_boxes`, obwohl das Schema gültig ist?

6. Erst nach Ursache Fix implementieren
   - Kein Fallback und kein Payload-Umbau, bevor die Matrix zeigt, welche Variable Sync.so killt.
   - Danach gezielt fixen:
     - Audio-Crop-Logik, falls `audioInput` falsch ist.
     - Bounding-Box-Scaling/Format, falls Speaker-Selection falsch ist.
     - Sync.so-Segments-Routing, falls Provider `segments + ASD` nicht stabil unterstützt.
   - Retry-Budget trotzdem korrigieren, damit so ein Diagnosefehler nie wieder 100+ Jobs erzeugt.

7. Validierung
   - Mit derselben Szene erneut testen.
   - Erwartung: Ein einzelner Sync.so-Job läuft entweder erfolgreich durch oder endet deterministisch mit einem echten, gespeicherten Diagnosegrund.
   - Danach erst den normalen Auto-Trigger wieder freigeben.

Keine Codeänderung ohne Diagnose-Ergebnis. Der nächste Schritt wäre also nicht „Patch“, sondern: Retry-Sturm stoppen, Payload vollständig loggen, Minimal-Repro-Matrix fahren und daraus die echte Ursache ableiten.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>
<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>