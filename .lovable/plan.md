## Kurze Antwort

Ja — nach den aktuellen Logs behebt dieser Ansatz sehr wahrscheinlich das eigentliche Problem.

Der Fehler ist nicht mehr plausibel „Sarah/3. Speaker ist nicht sichtbar“. Die Logs zeigen das Gegenteil: Die Face-Box für Sarah wurde sauber gefunden und mit Mouth-Anchor bestätigt.

Der eigentliche Bruch ist:

```text
Pass 1 → Preclip → OK
Pass 2 → Preclip → OK
Pass 3 / Sarah → Preclip poll_timeout_120s → Fallback auf Full-Plate → Sync.so rejected
```

Damit ist der wiederkehrende Fehler sehr wahrscheinlich kein Face-Detect-Grundproblem, sondern ein Pipeline-Fallback-Problem: Sobald der stabile Single-Face-Preclip-Pfad wegen Timeout nicht fertig wird, fällt die Funktion zurück auf Full-Plate + bbox-url-pro. Genau dieser Ersatzpfad produziert wieder `generation_input_face_selection_invalid`.

## Warum das der richtige Fix ist

- Alle 3 Speaker können sichtbar sein und trotzdem kann Sync.so Full-Plate ablehnen.
- Pass 3 hatte eine valide Box: `[882,209,1060,431]`.
- `mouth_used=true` zeigt: Der Speaker wurde nicht nur grob erkannt, sondern mit Mouth-Anchor bestätigt.
- `auto_detect:false` wurde eingehalten.
- Der Unterschied zwischen Erfolg und Fehler ist der Dispatch-Typ:
  - Erfolgreiche Passes: `dispatch_video_kind: preclip`
  - Fehlgeschlagener Pass: `dispatch_video_kind: full_plate`

## Plan

1. **Full-Plate-Fallback für Multi-Speaker entfernen**
   - Bei `speakers.length >= 2` darf ein fehlgeschlagener Preclip nicht mehr automatisch als Full-Plate an Sync.so geschickt werden.
   - Kein Autodetect, kein stiller Ersatzpfad, kein Morphing-Risiko.

2. **Preclip-Timeout als eigenes Problem behandeln**
   - `poll_timeout_120s` soll nicht mehr zu einem Sync.so Face-Selection-Fehler werden.
   - Stattdessen: kontrollierter Retry-/Fail-Closed-Zustand mit klarer Meldung.

3. **Preclip robuster machen**
   - Timeout/Polling für `renderPassFacePreclip(...)` konservativ erhöhen oder einen gezielten zweiten Versuch erlauben.
   - Ziel: Pass 3 bleibt im stabilen Single-Face-Pfad.

4. **Logs eindeutig machen**
   - Neuer Marker: `v187_preclip_required_no_fullplate_fallback`.
   - Loggt Speaker, Pass, Timeout-Klasse, Preclip-Fenster und ob ein Retry/Refund ausgelöst wurde.

5. **Validierung**
   - Dieselbe Scene neu rendern.
   - Erwartung:
     - Entweder Pass 3 läuft als Preclip durch,
     - oder er stoppt kontrolliert als Preclip-Timeout.
   - Wichtig: Kein erneuter Full-Plate-Dispatch und damit kein erneutes `generation_input_face_selection_invalid` aus diesem Fallback.

## Was unverändert bleibt

- Kein `auto_detect`.
- Keine Sync.so Model-Swaps.
- Keine neue Retry-Ladder über Provider-Varianten.
- Keine Änderung an der Speaker-Mapping-Logik.
- Der v186 `buildPerFrameBoxes`-Fix bleibt drin, ist aber nicht die Hauptursache dieses aktuellen Fehlers.