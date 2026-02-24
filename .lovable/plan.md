

# Fix: Zwei-Phasen-Ansatz fuer zuverlaessige Lambda-Invocation

## Problem-Analyse

Wir stecken in einem unloesbaren Dilemma:
- **Event-Modus**: 256KB Payload-Limit -- die Payload mit Szenen-Bildern, Props etc. ist zu gross. Lambda wird nie gestartet.
- **RequestResponse aus waitUntil**: Die Verbindung wird gekappt wenn waitUntil stirbt (~120-300s), Lambda-Ausfuehrung wird abgebrochen.
- **Edge-zu-Edge Aufruf**: 120s API Gateway Timeout.

Die Funktion `auto-generate-universal-video` hat **NULL Logs** fuer die Lambda-Phase -- das bestaetigt, dass die Lambda nie startet (Event-Modus verwirft den zu grossen Payload still).

## Loesung: Client-gesteuerte Zwei-Phasen-Architektur

Die bewiesene funktionierende Methode in diesem Projekt ist `invoke-remotion-render` -- diese Funktion verwendet RequestResponse-Modus und wird **direkt vom Client** aufgerufen (nicht aus waitUntil). Sie funktioniert zuverlaessig.

```text
VORHER (kaputt):
  auto-generate-universal-video (waitUntil)
    -> Vorbereitung (Script, Bilder, Voice, Musik)
    -> Lambda Event-Aufruf (Payload >256KB -> still verworfen)

NACHHER (zuverlaessig):
  Phase 1: auto-generate-universal-video (waitUntil)
    -> Vorbereitung (Script, Bilder, Voice, Musik)
    -> Speichert lambdaPayload in DB
    -> Setzt Step auf 'ready_to_render'

  Phase 2: Client erkennt 'ready_to_render'
    -> Ruft invoke-remotion-render DIREKT auf (eigene Edge Function)
    -> RequestResponse-Modus (6MB Limit, eigener Wall-Clock)
    -> Lambda laeuft zuverlaessig
```

## Technische Aenderungen

### Datei 1: `supabase/functions/auto-generate-universal-video/index.ts`

Statt Lambda direkt aufzurufen, speichert die Funktion den fertig vorbereiteten `lambdaPayload` und die `pendingRenderId` in der `universal_video_progress`-Tabelle und setzt den Step auf `'ready_to_render'`:

- Zeilen 552-597 ersetzen: Statt Lambda-Aufruf wird `updateProgress()` mit `result_data: { renderId, lambdaPayload }` aufgerufen
- Der Lambda-Aufruf-Code (aws.fetch, Event-Modus) wird komplett entfernt
- Die `video_renders`-Insertion und Credit-Deduction bleiben unveraendert

### Datei 2: `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

In `handleProgressUpdate()` wird eine neue Phase erkannt:
- Wenn `current_step === 'ready_to_render'` und `result_data.lambdaPayload` existiert:
  1. Client ruft `invoke-remotion-render` mit dem gespeicherten Payload auf
  2. Bei Erfolg: startet `startClientRenderPolling()` wie bisher
  3. Bei Fehler: zeigt Fehlermeldung an

### Datei 3: `supabase/functions/invoke-remotion-render/index.ts`

Minimale Anpassung: Sicherstellen dass der `progressId` aus `auto-generate-universal-video` korrekt weitergereicht wird (ist bereits im Code vorhanden).

## Warum das funktioniert

1. **6MB Payload-Limit**: `invoke-remotion-render` nutzt RequestResponse -- kein 256KB-Problem
2. **Eigener Wall-Clock**: Die Edge Function hat eigene 300s Laufzeit, nicht an waitUntil gebunden
3. **Bewiesenes Pattern**: `invoke-remotion-render` funktioniert bereits fuer Director's Cut
4. **Kein Edge-zu-Edge**: Client ruft die Funktion direkt auf, kein API Gateway Timeout
5. **Webhook + S3-Polling**: Completion-Detection bleibt unveraendert

## Dateien die geaendert werden

1. **EDIT**: `supabase/functions/auto-generate-universal-video/index.ts` -- Lambda-Aufruf durch Payload-Speicherung ersetzen
2. **EDIT**: `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx` -- Client-seitige Lambda-Invocation bei 'ready_to_render' Phase

