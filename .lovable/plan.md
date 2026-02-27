
Ich habe die aktuellen Laufdaten geprüft: Der neue Fehler ist reproduzierbar und kommt nicht vom Bundle-URL-Secret mehr.

## Was ich konkret in deinem System gesehen habe

1. **Der alte Version-Mismatch ist wirklich gelöst**  
   - `auto-generate-universal-video` und `invoke-remotion-render` loggen jetzt `version: "4.0.424"` und normalisierte Payloads.
   - Lambda-Start gibt sogar erfolgreich eine echte `renderId` zurück (z. B. `3s58r19oj4`).

2. **Danach kommt ein Webhook-Fehler aus Remotion selbst**  
   - `remotion-webhook` meldet:
   - `Both 'framesPerLambda' and 'concurrency' were set. Please use only one of them.`

3. **In der gespeicherten Payload sehe ich `framesPerLambda: 150`**  
   - Aber kein explizites `concurrency`-Feld in `universal_video_progress.result_data.lambdaPayload`.
   - Das deutet auf einen Konflikt zwischen unserer Scheduling-Strategie (`framesPerLambda`) und einer parallel gesetzten Concurrency-Logik in der Runtime/Lambda hin.

## Wahrscheinliche Hauptursache

Der aktuelle Payload nutzt in manchen Flows weiterhin `framesPerLambda` (u. a. Universal Creator, Director’s Cut).  
Remotion interpretiert im aktuellen Laufkontext zusätzlich Concurrency, wodurch beides gleichzeitig aktiv ist.  
Damit ist die Regelverletzung reproduzierbar, obwohl das Bundle neu deployt wurde.

## Umsetzungsplan (gezielt gegen den neuen Fehler)

### 1) Eindeutige Scheduling-Strategie erzwingen (nur **eine** Option)
In `supabase/functions/_shared/remotion-payload.ts`:
- Scheduling-Felder hart sanitisieren:
  - `framesPerLambda`
  - `concurrency`
  - `concurrencyPerLambda`
- Nur **eine** Strategie zulassen und serialisieren.
- Für Stabilität: Standard auf **ohne framesPerLambda** umstellen (Remotion auto/Concurrency-Pfad), statt `framesPerLambda` zu forcieren.

### 2) `framesPerLambda` aus den aufrufenden Flows entfernen
- `supabase/functions/auto-generate-universal-video/index.ts`
- `supabase/functions/render-directors-cut/index.ts`
- Dort aktuell gesetztes `framesPerLambda: 150` entfernen, damit kein Konflikt mehr mit impliziter/alternativer Concurrency entsteht.

### 3) Vor dem Lambda-Call eine harte Guard-Validierung einbauen
In `supabase/functions/invoke-remotion-render/index.ts`:
- Direkt vor AWS-Invoke prüfen:
  - Wenn gleichzeitig `framesPerLambda` und (`concurrency` oder `concurrencyPerLambda`) vorhanden → sofort 4xx-Fehler mit klarer Diagnose statt teurem Fehlrender.
- Zusätzlich `payload_key_flags` (nur Metadaten) in `video_renders.content_config` speichern, damit jeder nächste Fehler sofort eindeutig ist.

### 4) Gleiche Guard für direkte Lambda-Invoker
- `render-universal-video` und `render-with-remotion` nutzen zwar bereits den Shared-Normalizer, aber die Guard muss zentral überall identisch greifen, damit kein alternativer Pfad wieder denselben Fehler produziert.

## Validierung nach Umsetzung

1. **Neuer Universal Video Creator Render** (kein Retry).  
2. Erwartung in Logs:
   - Kein Fehlertext mehr mit `Both 'framesPerLambda' and 'concurrency'`.
   - Lambda-Start + Webhook `type: success`.
3. Erwartung in DB:
   - `universal_video_progress`: `ready_to_render -> rendering -> completed`
   - `video_renders.status = completed`
   - `content_config.payload_key_flags` zeigt nur eine Scheduling-Strategie.
4. Sicherheitscheck:
   - Bei Startfehler weiterhin exakt einmalige Credit-Rückerstattung (idempotent).

## Technische Hinweise

- Das Problem hängt **nicht** mehr am neu deployten Bundle-Pfad, sondern am Render-Scheduling im Start-Payload.
- Wir lassen die Metadaten (`durationInFrames`, `fps`, `width`, `height`) weiterhin explizit drin, da sie für stabile Chunk-Berechnung weiterhin wichtig sind.
