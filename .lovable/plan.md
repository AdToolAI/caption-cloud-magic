
Zuerst die bestätigte Diagnose (aus Runtime-Daten, nicht Vermutung):

1) Das Problem ist jetzt nicht mehr das Bundle-Deploy.
- Edge-Log zeigt klar: `r42 SAFETY: Video too long... 1800s exceeds 600s even at 15fps` (16:23:52).
- DB-Eintrag `universal_video_progress.id=0c525c8b...` ist genau damit fehlgeschlagen.
- Danach kommt beim Retry der 500er: `Existing progress has no lambdaPayload — full pipeline restart required` (16:24:22).

2) Warum der gleiche UI-Fehler weiter erscheint:
- Der fehlgeschlagene Progress (`0c...`) enthält **kein** `lambdaPayload`.
- Render-only Retry startet mit genau diesem Progress → Backend wirft Fehler → Frontend zeigt generisch „non-2xx status code“.
- Zusätzlich ist die neue r42-Safety aktuell zu streng und blockiert 60s-Jobs bereits vor Lambda-Start.

Implementierungsplan:

1. Render-only Retry robust machen (kein 500 mehr bei „falscher“ Source)
- Datei: `supabase/functions/auto-generate-universal-video/index.ts`
- Im `renderOnly`-Zweig:
  - Wenn `existingProgress.result_data.lambdaPayload` fehlt, automatisch auf `sourceProgressId` zurückspringen und dort Payload laden.
  - Falls auch dort kein Payload existiert: strukturierte 4xx-Antwort (kein Throw/500), z. B. `error: render_only_source_missing_payload`.
  - Retry-Counting weiterhin auf Chain-Root basieren (bereits vorhanden, beibehalten).
- Ergebnis: Retry startet wieder deterministisch aus dem letzten gültigen Payload-Anker.

2. r42 Timeout-Safety entschärfen (False-Positive Blocker entfernen)
- Dateien:
  - `supabase/functions/auto-generate-universal-video/index.ts`
  - optional feinjustiert in `supabase/functions/_shared/remotion-payload.ts`
- Änderung:
  - Den harten Abbruch „timeoutBudgetOk === false => throw“ im Initialpfad durch Soft-Guard ersetzen.
  - FPS-Reduktion (30→24→15) bleibt, aber wenn Budget-Schätzung trotzdem „false“ ist, wird nicht sofort abgebrochen, sondern mit konservativer Scheduling-Konfiguration weitergemacht + Forensik-Flag gesetzt.
- Ziel: Die Pipeline darf wieder bis `ready_to_render` kommen, statt vorzeitig mit „r42 SAFETY“ zu sterben.

3. Orphan-`pending` Render verhindern
- Datei: `supabase/functions/auto-generate-universal-video/index.ts`
- In `catch`-Pfaden von Full-Pipeline und Render-only:
  - Falls bereits `video_renders`-Zeile angelegt wurde, diese auf `failed` setzen (inkl. `error_message`, `completed_at`).
- Ziel: Keine hängenden `pending`-Rows mehr wie `hq938wpswf`.

4. Frontend-Fehlertext verbessern (damit Fehler nicht generisch bleibt)
- Datei: `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- Beim `response.error`:
  - strukturierte Fehlercodes aus Response bevorzugt anzeigen.
  - Für `render_only_source_missing_payload`: verständliche UI-Meldung mit automatischem Full-Restart-Hinweis statt „non-2xx“.

Technische Details (kurz):
- Keine DB-Migration nötig.
- Keine Secrets-Änderung nötig.
- Ursache war eine Kombination aus:
  - Retry-Source ohne `lambdaPayload`
  - zu aggressivem Safety-Throw vor Lambda-Invocation

Validierungsplan nach Umsetzung:
1) Neuer 60s-Testlauf:
- Erwartet: kein unmittelbarer `r42 SAFETY`-Fail mehr.
- Progress muss `ready_to_render` erreichen.

2) Render-only von einem fehlgeschlagenen Retry-Progress:
- Erwartet: kein 500.
- Backend soll automatisch Chain-Root-Payload verwenden und neuen Progress zurückgeben.

3) Datenprüfung:
- Keine neuen „stuck pending“ in `video_renders`.
- Fehlerfälle landen sauber als `failed` mit klarer Ursache.

4) UI:
- Kein generischer „non-2xx“ mehr bei bekannten Backend-Codes.
