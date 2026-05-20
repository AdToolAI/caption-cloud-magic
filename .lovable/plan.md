## Diagnose

Der aktuelle Fehler kommt nicht aus der UI und nicht vom Backend-Status. Die betroffene Szene `2641218f-b9b7-46b5-a56d-2fee61e53389` wird von Sync.so weiterhin mit `The segments configuration is invalid.` abgelehnt.

Die Ursache liegt sehr wahrscheinlich in der Struktur der Segment-Payload:

- Die Doku nutzt für Audio-Inputs im SDK `ref_id`, die REST-Referenz spricht aber bei Segmenten von `refId`.
- Unser Payload speichert nur reduzierte `bodyMeta`, nicht die exakte gesendete Payload; dadurch ist das Debugging unnötig schwer.
- Der Poller enthält noch Legacy-Code für alte 2-Pass-Jobs. Das ist nicht der direkte Fehler, erhöht aber das Risiko bei alten `syncJobs`-Zuständen.

## Plan

1. **Sync.so Segment-Payload robust machen**
   - Audio-Input mit beiden kompatiblen Referenzformen absichern, falls die API/SDK-Doku zwischen `ref_id` und `refId` unterscheidet.
   - Segment-Zeiten hart validieren: sortiert, keine Überlappungen, Mindestlänge, innerhalb Video- und Audio-Dauer.
   - Bei Start bei `0.0` minimal auf eine sichere Grenze normalisieren, falls Sync.so Null-Boundaries ablehnt.

2. **Fallback-Strategie einbauen, ohne wieder “beide Stimmen aus einem Mund” zu riskieren**
   - Erst Segments mit `sync-3` versuchen.
   - Wenn Sync.so genau `segments configuration is invalid` zurückgibt, automatisch mit dem dokumentierten stabileren Modell `lipsync-2` und identischer Segment-Struktur erneut anlegen.
   - Kein Single-Mouth-Fallback; bei echtem Provider-Fail wird weiter sauber refundet.

3. **Poller auf Segment-Jobs härten**
   - Segment-Mode strikt als Single-Job behandeln.
   - Legacy-2-Pass-Verhalten nur noch für alte Jobs ohne `mode: 'segments'` verwenden.
   - Fehlermeldungen weiter in `clip_error` und `audio_plan.twoshot.syncJobs` speichern.

4. **Bessere Provider-Diagnose speichern**
   - `bodyMeta` erweitern: Modell, Segmentzeiten, Audio-Ref-Key-Variante, Video-/Audio-URL-Dauerhinweise.
   - Exakte Sync.so-Response bei Create- und Poll-Fehlern begrenzt speichern.

5. **Betroffene Szene resetten und neu anstoßen**
   - Nur Lip-Sync-Zustand zurücksetzen.
   - Bestehendes 2-Personen-Video, FaceMap und gemergte WAV behalten.
   - Danach einmal die korrigierte Edge Function triggern, damit wir sehen, ob Sync.so den Job annimmt.

## Dateien/Backend

- `supabase/functions/compose-twoshot-lipsync/index.ts`
- `supabase/functions/poll-twoshot-lipsync/index.ts`
- eine kleine Datenkorrektur für die betroffene Szene in `composer_scenes`

## Erwartetes Ergebnis

Nach Umsetzung sollte der Sync.so-Job nicht mehr schon an der Segment-Konfiguration scheitern. Falls Sync.so danach trotzdem ablehnt, sehen wir endlich die vollständige relevante Provider-Antwort und können gezielt auf Audio-/Video-Content statt auf Payload-Struktur debuggen.