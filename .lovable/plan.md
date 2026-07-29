## Ziel

Das Voiceover darf die Video-Länge **nie** verlängern. Der Startzeit-Regler wird stattdessen hart begrenzt: `maxStart = max(0, Videolänge − VO-Dauer)`.

## Änderungen

**1. `src/lib/universalCreatorDefaults.ts`**
- `computeTotalDurationSeconds()` wieder offset-frei: `max(voDauer, Szenensumme, MIN)`.
- Neue Hilfsfunktion `computeMaxVoiceoverStart({ scenes, voiceoverDuration, actualVoiceoverDuration })` → `max(0, totalDuration − voDuration)`, eine gemeinsame Quelle für UI, Payload und Render.

**2. `src/lib/universalCreatorRenderPayload.ts`**
- `voiceoverStartTime` auf `computeMaxVoiceoverStart(...)` klemmen (statt auf die Gesamtdauer). Damit läuft der VO immer vollständig innerhalb des Videos.

**3. `src/components/universal-creator/steps/ContentVoiceStep.tsx`**
- Slider-`max` = `computeMaxVoiceoverStart(...)`, nicht mehr die Gesamtdauer.
- Den in der letzten Runde eingebauten Hinweis „Video wird auf X s verlängert" entfernen; stattdessen ein neutraler Hinweis, z. B. „Max. Start: X,X s (VO endet exakt mit dem Video)".
- Bereits gespeicherte Startwerte über dem Maximum werden beim Laden auf `maxStart` korrigiert.

**4. `supabase/functions/render-with-remotion/index.ts`**
- Renderdauer wieder ohne VO-Offset: `max(Szenensumme, voDauer, 5)`.
- Zusätzlich serverseitig `voiceoverStartTime = min(start, totalDuration − voDuration)` klemmen, damit auch fremde/alte Payloads das Video nicht sprengen.

**5. Andere Aufrufer angleichen**
- `src/pages/UniversalCreator/UniversalCreator.tsx` und `src/components/universal-creator/steps/PreviewExportStep.tsx`: die zuletzt ergänzte `voiceoverStartTime`-Übergabe an `computeTotalDurationSeconds` entfernen.

## Verifikation
- 15 s Szenen + 8 s VO: Regler geht maximal bis 7,0 s; Video bleibt 15 s, VO hörbar von 7 s bis 15 s.
- VO länger als Video: Regler-Max = 0 s, Start bleibt bei 0.
- Export-MP4-Länge identisch zur Vorschau.
