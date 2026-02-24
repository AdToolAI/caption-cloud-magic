
Ziel: Den Hänger bei 92% endgültig beheben, indem der Hand-off zwischen Phase 1 (Vorbereitung) und Phase 2 (Client startet Render) als saubere Zustandsmaschine implementiert wird.

Problemursache (aus dem aktuellen Stand verifiziert):
1) Der aktuelle Lauf endet in einem Race Condition:
- In `auto-generate-universal-video` wird zuerst `current_step='rendering'` geschrieben (mit `renderId`, aber noch ohne tatsächlichen Lambda-Start).
- Erst danach wird `current_step='ready_to_render'` mit `lambdaPayload` geschrieben.

2) Das Frontend reagiert auf dieses erste `rendering` sofort mit `startClientRenderPolling(...)`.
- Dadurch startet Polling gegen `check-remotion-progress`, obwohl Lambda nie gestartet wurde.
- Anschließend kommt `ready_to_render`, aber die Ready-Logik ist durch `!clientRenderPollRef.current` blockiert.

3) Beweis im Backend-Datenstand:
- Neuester Progress-Eintrag steht auf `ready_to_render` und hat `lambdaPayload=true`.
- Gleichzeitig keine Aktivität für `invoke-remotion-render`.
- `check-remotion-progress` läuft im Kreis mit `progress.json 404`, `out.mp4 404`, danach Timeout.

Umsetzungsplan

1) Hand-off im Backend entkoppeln (kein vorzeitiges `rendering`)
Datei: `supabase/functions/auto-generate-universal-video/index.ts`

Änderungen:
- Den vorzeitigen Progress-Update auf `rendering` entfernen (der aktuell vor `ready_to_render` geschrieben wird).
- Direkt auf `ready_to_render` wechseln, sobald `lambdaPayload` vollständig vorliegt.
- Optional, aber sinnvoll: `video_renders.status` beim Insert auf `pending` setzen (statt `rendering`), bis `invoke-remotion-render` erfolgreich gestartet hat.

Erwarteter Effekt:
- Das Frontend sieht zuerst und eindeutig `ready_to_render`.
- Kein falscher Polling-Start mehr vor der eigentlichen Invocation.

2) Frontend-Flow in deterministische Zustandsmaschine umbauen
Datei: `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

Änderungen:
- `ready_to_render` immer priorisiert behandeln (vor `rendering`-Branch).
- Zwei Schutz-Refs ergänzen:
  - `invokeInFlightRef` (läuft gerade Invocation?)
  - `invokedRenderIdRef` (welche Render-ID wurde bereits gestartet?)
- Bei `ready_to_render`:
  - Wenn noch nicht gestartet: Invocation starten.
  - Falls fälschlich schon Polling läuft: Polling stoppen, dann Invocation starten.
- `startClientRenderPolling(...)` nur starten, wenn Render wirklich gestartet wurde:
  - entweder `invokedRenderIdRef` passt
  - oder Backend liefert `lambdaRenderId`/explizites Start-Signal.
- Doppelte Invocation durch Realtime+Polling verhindern (idempotentes Frontend-Verhalten).

Erwarteter Effekt:
- Genau ein Invocation-Call pro Render.
- Kein „Polling ohne gestarteten Render“ mehr.

3) Invocation idempotent absichern (Defensive Backend-Sicherung)
Datei: `supabase/functions/invoke-remotion-render/index.ts`

Änderungen:
- Vor AWS-Call prüfen, ob für dieselbe `pendingRenderId` bereits ein Start passiert ist (z. B. vorhandene `lambda_render_id` oder erkennbarer Startzustand).
- Falls bereits gestartet: erfolgreiches No-op zurückgeben.
- Bei erfolgreichem Start weiterhin `current_step='rendering'` + `result_data` setzen.

Erwarteter Effekt:
- Selbst bei Doppelklick/Netzwerk-Retry kein doppelter AWS-Start.

4) Timeout-/Fehler-Synchronisation konsistent machen
Datei: `supabase/functions/check-remotion-progress/index.ts`

Änderungen:
- Timeout-Text konsistent zur echten Schwelle machen (aktuell 720s, Meldung spricht teils noch von 8 Minuten).
- Wenn Timeout/Failure gesetzt wird, zusätzlich `universal_video_progress` synchron auf `failed` aktualisieren (nicht nur `video_renders`), damit UI und Retry-Zustand immer korrekt sind.
- Kommentare auf aktuellen Wert (15-Minuten-UI-Timeout vs Backend-Timeout) angleichen.

Erwarteter Effekt:
- Keine widersprüchlichen Fehlermeldungen.
- Reload zeigt denselben Zustand wie laufende UI.

5) Diagnostik-Text aktualisieren
Datei: `supabase/functions/debug-render-status/index.ts`

Änderungen:
- Diagnose-Regel ergänzen:
  - Wenn `current_step='ready_to_render'` und kein `lambda_render_id` über längere Zeit: „Phase-2-Invocation wurde nicht ausgelöst“ statt pauschal „invoke timeout“.

Erwarteter Effekt:
- Schnellere, korrekte Ursachenanalyse bei zukünftigen Fällen.

Technischer Hinweis zur Reihenfolge
1. `auto-generate-universal-video` fixen (State-Reihenfolge)
2. Frontend-Guarding (`UniversalAutoGenerationProgress`)
3. Idempotenz in `invoke-remotion-render`
4. Konsistenz in `check-remotion-progress`
5. Diagnose-Update

Abnahmekriterien (Testplan)
1) Neuer Full-Service-Run:
- Progress-Sequenz muss sein: `... -> ready_to_render -> rendering -> completed`.
- Es darf kein direkter Sprung in Polling vor `ready_to_render` passieren.

2) Netzwerkprüfung:
- Genau ein Request an `invoke-remotion-render` pro Lauf.

3) Backendprüfung:
- In `video_renders.content_config` wird `lambda_render_id` gesetzt (oder zumindest Invocation-Start eindeutig sichtbar).
- `check-remotion-progress` liefert nicht dauerhaft nur `time-based` bis Timeout.

4) UI-Verhalten:
- Kein Hänger bei 92% mit anschließendem Timeout mehr.
- Retry funktioniert sauber ohne doppelte Parallel-Jobs.

5) Fehlerpfad:
- Bei echtem Render-Fehler werden `video_renders` und `universal_video_progress` beide konsistent auf `failed` gesetzt.
