## Ursache (verifiziert)

Passt exakt zu einem 4-Sekunden-Voiceover: In `src/components/universal-creator/steps/PreviewExportStep.tsx` (Zeile 312) wird beim Render-Aufruf die **VO-Dauer mit der Gesamt-Videolänge überschrieben**:

```ts
customizations: { ...sharedCustomizations, voiceoverDuration: calculatedDuration }
```

`calculatedDuration` stammt aus `computeTotalDurationSeconds(...)` (Zeile 395) und ist die Timeline-Länge, nicht die VO-Länge. Aus 4 s werden also z. B. 15 s.

Server (`supabase/functions/render-with-remotion/index.ts`, Zeilen 659–668) rechnet daraufhin:
- `totalDurationSeconds = max(Szenensumme, voDuration, 5)` → gleich der Gesamtdauer
- `maxVoiceoverStart = totalDurationSeconds − voDuration` → **0**
- `voiceoverStartTime = min(0, start)` → **0**

Deshalb startet das 4-s-VO im Export immer bei 0, obwohl die Preview (die die echten Werte aus `buildUniversalCreatorCustomizations` nutzt) korrekt ist. Das Remotion-Template selbst (`UniversalCreatorVideo.tsx`, Zeilen 3029/3092) setzt den Offset korrekt per `<Sequence from=...>`.

## Änderungen

**1. `src/components/universal-creator/steps/PreviewExportStep.tsx`**
- Zeile 312: `voiceoverDuration: calculatedDuration` entfernen. `buildUniversalCreatorCustomizations` liefert bereits die echte VO-Dauer (`voDurationForRender`, Zeile 152) und den korrekt geklemmten `voiceoverStartTime`.
- Die Gesamtdauer stattdessen als eigenes Feld mitgeben (`durationSeconds: calculatedDuration`), damit die Frame-Berechnung serverseitig unverändert bleibt.

**2. `supabase/functions/render-with-remotion/index.ts`**
- Wenn `customizations.durationSeconds` vorhanden und plausibel ist, dieses als `totalDurationSeconds` verwenden; sonst wie bisher `max(Szenensumme, voDuration, 5)`.
- Der Clamp `voiceoverStartTime = min(start, totalDuration − voDuration)` bleibt — mit der korrekten VO-Dauer (4 s) erlaubt er dann z. B. bis 11 s statt 0.

## Verifikation
- 15 s Szenen + 4 s VO, Start 5 s: Payload enthält `voiceoverDuration: 4`, `voiceoverStartTime: 5`, `durationSeconds: 15`; Export-MP4 hat VO von 5 s bis 9 s.
- Preview und Export identisch (gleiche Werte aus `buildUniversalCreatorCustomizations`).
- Regressions-Check: Video ohne VO sowie VO mit Start 0 rendern unverändert.
