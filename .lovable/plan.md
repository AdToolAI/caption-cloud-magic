
Ziel: Den weiterhin auftretenden „Version mismatch / incompatible payload“-Fehler im AI Studio zuverlässig beheben.

## Ergebnis der Analyse (konkret aus deinem Live-System)

1. Die aktuelle Secret-URL wird bereits verwendet:
   - Neuester fehlgeschlagener Lauf (`universal_video_progress` vom 27.02.) nutzt:
   - `.../sites/adtool-remotion-bundle/index.html`
   - Damit ist klar: **Nicht mehr die alte v392-URL** ist das Hauptproblem.

2. Die aktuelle Pipeline sendet zwar bereits `inputProps` serialisiert (`{type:'payload', payload:'...'}`), aber Lambda lehnt trotzdem ab:
   - `invoke-remotion-render` Logs zeigen weiterhin:
   - `Version mismatch ... @remotion/lambda package sent an incompatible payload`

3. Der eigentliche Bruch ist das **gesamte Start-Payload-Schema**, nicht nur `serveUrl`/`inputProps`:
   - Der aktuell gesendete Payload enthält nur eine Teilmenge der Felder.
   - Remotion v4.0.424 erwartet beim Start-Invoke zusätzliche Felder (u. a. `version`, `logLevel`, `frameRange`, `timeoutInMilliseconds`, `chromiumOptions`, `scale`, `everyNthFrame`, `concurrencyPerLambda`, `downloadBehavior`, `muted`, `rendererFunctionName`, etc.).
   - Aktuell fehlt insbesondere `version` komplett.

## Umsetzungsplan (robust, rückwärtskompatibel)

### 1) Einheitlichen Payload-Builder einführen (Single Source of Truth)
- Neue gemeinsame Utility in `supabase/functions/_shared/...` für „Remotion Start Payload Normalization“.
- Diese Utility:
  - ergänzt alle für v4.0.424 benötigten Felder mit stabilen Defaults,
  - setzt `version` explizit (aus Lambda-Funktionsnamen abgeleitet, fallback auf `4.0.424`),
  - lässt `inputProps` im gültigen serialisierten Format,
  - setzt fehlende optionale Felder explizit auf `null`/Default, damit Schema-Validation nicht scheitert.

### 2) `auto-generate-universal-video` auf den Builder umstellen
- Statt Teil-Payload selbst zu bauen, wird vor dem Speichern in `universal_video_progress.result_data.lambdaPayload` direkt der **vollständige, normierte** Start-Payload erzeugt.
- Zusätzlich Logging:
  - `payload.version`
  - Pflichtfelder vorhanden (Boolean-Checks)
  - key count / payload size (ohne sensible Daten).

### 3) `invoke-remotion-render` als harte Kompatibilitätsschicht erweitern
- Vor AWS-Call immer `normalizeStartPayload(...)` anwenden (auch für ältere bereits gespeicherte Jobs).
- Damit werden Altjobs, deren Payload noch unvollständig ist, on-the-fly repariert.
- Fehlerpfad bleibt idempotent inkl. Credit-Refund.
- Zusätzlich: Im Fehlerfall den **effektiv gesendeten Payload-Metazustand** (Version, Schlüssel-Liste verkürzt) in `content_config` ablegen, damit die nächste Diagnose sofort eindeutig ist.

### 4) Gleiche Korrektur für alle anderen direkten Lambda-Invoker
Betroffene Dateien mit `type: 'start'`:
- `supabase/functions/render-directors-cut/index.ts`
- `supabase/functions/render-universal-video/index.ts`
- `supabase/functions/render-with-remotion/index.ts`
- Ziel: Alle Flows nutzen denselben validen Payload-Standard, damit der Fehler nicht an anderer Stelle erneut auftritt.

### 5) Kleine Stabilitätsverbesserung bei Persistenz
- In `invoke-remotion-render` beim Übergang auf `failed` den bereits gesetzten `serve_url`/tracking-Daten nicht überschreiben (aktuell geht ein Teil davon verloren).
- Hilft bei späterer forensischer Analyse.

## Validierung nach Umsetzung

1. Neuer AI-Studio-Render (kein Retry eines Altjobs).
2. Erwartung in Logs:
   - Kein `Version mismatch` mehr.
   - Lambda-Response liefert `renderId`.
3. Erwartung in DB:
   - `universal_video_progress`: `ready_to_render -> rendering -> completed`
   - `video_renders`: `status=rendering/completed`, `content_config.version` gesetzt.
4. Negativtest:
   - Erzwungener Startfehler => einmalige Credit-Rückerstattung (keine Doppel-Refunds).
5. UI-Ende-zu-Ende:
   - Fortschritt läuft weiter, Video erscheint im Verlauf und ist abspielbar.

## Was du manuell machen musst
- Für diese Korrektur selbst: **nichts zusätzlich an Secrets** (dein `REMOTION_SERVE_URL` ist bereits korrekt angekommen).
- Danach einmal einen **komplett neuen** Render starten, damit ein neu normalisierter Payload verwendet wird.
