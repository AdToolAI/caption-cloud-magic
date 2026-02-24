
Ich habe den Fehler jetzt tiefer analysiert: Das ist sehr wahrscheinlich kein „echter“ CORS-Header-Fehler mehr, sondern ein Timeout-/Gateway-Problem, das im Browser als CORS erscheint.

Was ich verifiziert habe:
1) `invoke-remotion-render` enthält bereits die erweiterten CORS-Headers im Code.
2) In den Backend-Logs sieht man einen echten Start von `invoke-remotion-render`:
   - `Starting for renderId=pm3vsmts9b`
   - direkt danach `Invoking Lambda in RequestResponse mode...`
   - aber kein `Lambda response status` mehr
   - anschließend Worker-Shutdown nach ~2 Minuten.
3) In der Datenbank bleibt derselbe Run auf:
   - `universal_video_progress.current_step = ready_to_render`
   - `video_renders.status = pending`
   - `lambda_render_id = NULL`

Das Muster zeigt: Der Request erreicht die Function, aber sie antwortet nicht rechtzeitig, daher liefert die Infrastruktur eine Fehlerantwort ohne CORS-Header zurück. Der Browser meldet das dann als CORS-Block.

Umsetzungsvorschlag (robuster Fix, nicht nur Symptom):
1) `invoke-remotion-render` von blockierendem `RequestResponse` auf nicht-blockierendes Starten umstellen
   - Datei: `supabase/functions/invoke-remotion-render/index.ts`
   - Änderungen:
     - AWS-Invocation mit `X-Amz-Invocation-Type: Event` (asynchrones Starten).
     - Vor AWS-Call sofort Status auf `rendering` setzen:
       - `video_renders.status = rendering`
       - `universal_video_progress.current_step = rendering`, `progress_percent = 90`
     - Sofortige Success-Response an den Client zurückgeben (kein Warten auf vollständiges Render-Ergebnis).
     - Idempotenz behalten/erweitern:
       - Wenn Render schon `rendering/completed` ist oder `lambda_render_id` gesetzt ist → No-op Success.
     - Payload-Size-Guard einbauen (präzise Fehlermeldung, falls jemals > AWS Event-Limit).
   - Effekt:
     - Kein lang laufender HTTP-Call mehr => kein pseudo-CORS durch Timeout.

2) Frontend robuster gegen „Antwortverlust“ machen
   - Datei: `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
   - Änderungen:
     - Bei `FunctionsFetchError` in `invokeRenderFromClient` nicht sofort in harten Fehlerzustand wechseln.
     - Stattdessen:
       - Render-Polling trotzdem starten (optimistischer Fallback),
       - optional kurze Verifikation über `debug-render-status` oder DB-Status.
     - Nur bei klar negativem Zustand (`failed`) wirklich abbrechen.
   - Effekt:
     - Selbst wenn Netz/Gateway-Antwort fehlschlägt, läuft der Prozess weiter und kann sauber abschließen.

3) Webhook-Completion unabhängig vom Zwischenstatus machen
   - Datei: `supabase/functions/remotion-webhook/index.ts`
   - Änderungen:
     - Update von `universal_video_progress` nicht nur für `status='rendering'`.
     - Stattdessen Run über `result_data.renderId === pendingRenderId` matchen und dann auf `completed` setzen.
   - Effekt:
     - Kein „hängender ready_to_render“-Eintrag mehr, wenn Statusübergang vorher ausfiel.

4) CORS vereinheitlichen bei browserseitig aufgerufenen Functions
   - Dateien:
     - `supabase/functions/check-remotion-progress/index.ts`
     - optional `supabase/functions/debug-render-status/index.ts`
   - Änderungen:
     - Gleiches erweitertes Header-Set wie bei `invoke-remotion-render`.
   - Effekt:
     - Verhindert Folgeprobleme im nächsten Schritt (Polling/Diagnose-Panel).

5) Timeout-Konfiguration explizit setzen (zusätzliche Absicherung)
   - Datei: `supabase/config.toml`
   - Änderung:
     - expliziter Block für `invoke-remotion-render` mit ausreichendem Timeout.
   - Hinweis:
     - Mit asynchronem Start ist das meist nicht mehr kritisch, aber sinnvoll als Guardrail.

Technischer Teil (kurz):
- Aktuell wartet `invoke-remotion-render` auf die komplette Lambda-Antwort im `RequestResponse`-Flow.
- Genau dieser wartende HTTP-Call bricht in der Laufzeit-Infrastruktur weg; dadurch kommt beim Browser eine generische Fehlerantwort ohne CORS zurück.
- Mit Event-Start + sofortiger 200-Antwort kapseln wir den langen Renderprozess vollständig vom Browser-Request ab.
- Fortschritt und Abschluss laufen dann über Polling + Webhook, was bereits in eurer Architektur vorhanden ist.

Abnahmekriterien (E2E):
1) Neuer Run zeigt Sequenz:
   - `ready_to_render -> rendering -> completed`
2) Kein Browserfehler mehr beim Invoke-Schritt (insb. kein „No Access-Control-Allow-Origin“ bei `invoke-remotion-render`).
3) `video_renders.status` wechselt kurz nach Invoke auf `rendering`.
4) `remotion-webhook` setzt den passenden `universal_video_progress`-Datensatz zuverlässig auf `completed`.
5) Retry startet keinen Doppel-Render (Idempotenz bestätigt).

Wenn du freigibst, setze ich genau diese Änderungen in der Reihenfolge 1→5 um.
