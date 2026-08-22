# V442 — Anchor-Recompose-Härtung + ehrlicher Fehler-Fortschritt

Zwei bestätigte Befunde aus dem Live-Lauf von Szene S11 (15:31–15:32 UTC).

## Befund 1 — Warum die Szene fehlschlug (bestätigt)

Die Kette lief korrekt bis zur Anker-Neukomposition und starb dann an einem Modell-Fehler, nicht an fehlenden Portraits:

```text
15:31:05  alter Anker im Storage weg  -> "re-composing" (richtig)
15:31:05  compose-scene-anchor: 4 Portraits, 4 Identity-Refs (alles vorhanden)
15:31:51  nano_banana_2: TIMEOUT
15:32:50  Fallback gemini3pro: HTTP 400
          "Cannot fetch content from the provided URL. The request to crawl the page timed out."
15:32:50  compose-video-clips: v440-Gate -> anchor_pointer_missing -> Szene failed (0 Kosten)
```

Alle vier Brand Characters (Sarah, Samuel, Matthew, Kay) haben gültige Portraits und Referenzbilder — die Fehlermeldung "keine Portraits aufgelöst" ist schlicht falsch und hat uns in die falsche Richtung geschickt. Der eigentliche Fehler: das Bildmodell konnte die Portrait-URLs nicht selbst herunterladen (Crawl-Timeout auf den signierten Storage-Links).

### Fix
1. `compose-scene-anchor`: Portraits nicht mehr als URL an das Modell reichen, wenn sie aus unserem Storage kommen — Bytes serverseitig laden und als Inline-Data (base64) mitsenden. Damit entfällt der Crawl-Schritt, der beide Modellaufrufe gekillt hat.
2. Retry-Ordnung: bei `nano_banana_2`-Timeout einmal mit Inline-Bildern erneut versuchen, bevor auf gemini3pro gewechselt wird.
3. `compose-video-clips`: Fehlermeldung nach fehlgeschlagener Neukomposition trennen —
   - Portraits fehlen wirklich -> bisherige Meldung,
   - Portraits vorhanden, Komposition fehlgeschlagen -> neue Meldung `anchor_recompose_failed` inkl. Modell-Ursache, damit "Neu rendern" als richtige Aktion erkennbar ist.
4. Der Anker-Fehlschlag wird mit Grund in die Szene geschrieben (statt nur `console.warn`), damit die Ursache ohne Log-Zugriff sichtbar ist.

## Befund 2 — Balken springt sofort auf 99 %

`usePipelineProgress` zeigt im Fehlerfall nicht den echten Fortschritt, sondern den gespeicherten Höchststand des vorherigen Laufs (`runFloorRef`), der aus dem persistierten Snapshot rehydriert wird. Ein alter 99-%-Lauf färbt damit jeden neuen Fehlversuch sofort rot auf 99 %.

### Fix
1. Beim Start eines neuen Laufs (Run-Reset-Token / Plate-Epoche) den persistierten Snapshot und `runFloorRef` hart auf 0 setzen — nicht nur unter der bisherigen `lipsyncTerminal`-Bedingung.
2. Im Fehlerfall den Balken auf den echten gewichteten Phasenwert (`phaseOverall`) begrenzen statt auf den geerbten Floor: eine in Phase 1 gescheiterte Szene zeigt dann z. B. 8 % rot statt 99 %.
3. Snapshot beim Fehlschlag löschen, damit der nächste Lauf sauber bei 0 startet.

## Verifikation
- Neuer Rerender von S11: Anker wird komponiert (Log `v440_anchor_verified`), Lauf geht in den Provider-Dispatch.
- Balken startet sichtbar bei 0–10 % und steigt; bei einem Fehlschlag steht die rote Marke dort, wo der Lauf wirklich abbrach.
- Keine Änderung an Provider-Vertrag (v425), Credits oder Storage-Policies.
