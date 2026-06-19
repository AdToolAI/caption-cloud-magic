## Befund

Ja — im Screenshot ist der entscheidende Hinweis schon sichtbar: Der Preflight ist grün, aber darunter steht sinngemäß: **Snap-Kandidat erkannt — noch nicht im Dispatch angewandt**.

Das bedeutet: Die Forensik erkennt korrekt, dass die ursprüngliche Koordinate `[273,215]` nicht auf dem Gesicht liegt und auf `[120,440]` gesnappt werden sollte. In den aktuellen Dispatch-Logs wurde Sync.so aber weiterhin mit `auto_detect:true` bzw. ohne diese korrigierte Koordinate losgeschickt. Deshalb kann alles im Preflight normal aussehen, Sync.so aber trotzdem fehlschlagen oder ein No-Op erzeugen.

## Plan

1. **Snap als harte Dispatch-Korrektur anwenden**
   - In `compose-dialog-segments` die Face-Gate-Auto-Snap-Koordinate nicht nur loggen, sondern vor dem Sync.so-Request zuverlässig in den finalen Payload übernehmen.
   - Für Preclip-Dispatches die gesnappte Koordinate korrekt im **Preclip-Koordinatenraum** behandeln, nicht versehentlich als Plate-Koordinate.

2. **Auto-Detect bei Snap-Fällen vermeiden**
   - Wenn der Preflight `ok_after_snap` liefert, nicht mehr mit `{ auto_detect: true }` dispatchen.
   - Stattdessen `sync-3` mit doc-striktem ASD verwenden:
     - `auto_detect: false`
     - `frame_number`
     - `coordinates: snapped_coord`
   - Kein `lipsync-2` / `lipsync-2-pro` Fallback.

3. **Forensik-Log eindeutig machen**
   - `syncso_dispatch_log.meta.outbound_payload.options.active_speaker_detection` muss nachher die tatsächlich gesendete korrigierte Koordinate enthalten.
   - Zusätzlich `snap_applied_to_dispatch: true` loggen, damit UI/DB nicht mehr nur „Kandidat erkannt“ zeigen.

4. **UI-Status korrigieren**
   - Die Preflight-Anzeige soll unterscheiden:
     - Snap erkannt und **angewandt** = grün / sicherer Dispatch
     - Snap erkannt aber **nicht angewandt** = gelb/rot, kein irreführendes „alles normal“

5. **Letzte fehlgeschlagene Szene recovern**
   - Nach der Codeänderung die betroffene Szene/Passes zurück auf pending setzen bzw. über den bestehenden Reset-Flow neu dispatchen.
   - Danach prüfen, dass der neue Logeintrag nicht mehr `auto_detect:true`, sondern die gesnappte ASD-Koordinate enthält.

## Technische Details

- Hauptdatei: `supabase/functions/compose-dialog-segments/index.ts`
- Relevanter Bereich: Face-Gate nach Payload-Erstellung, aktuell um die Auto-Snap-Mutation.
- Wichtig: Der Screenshot-Job `2ea6981e...` war ein älterer Dispatch; neuere Logs zeigen weiter `outbound_asd: { auto_detect: true }`, was die Ursache bestätigt.
- Deployment: Danach `compose-dialog-segments` deployen und die betroffene Szene erneut anstoßen.