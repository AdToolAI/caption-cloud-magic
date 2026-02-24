
## Aktueller Befund (warum es weiterhin fehlschlägt)

Ich habe die Pipeline erneut vollständig geprüft (Code + Datenbank + Storage-Objekte) und der neue Fehler ist jetzt klarer eingegrenzt:

1. Der Lauf startet korrekt bis **Render-Start**.
2. Danach steigt der Balken nur über **zeitbasierte Schätzung** (bis ~99%).
3. Nach exakt 12 Minuten setzt `check-remotion-progress` den Lauf auf **failed** (`Render-Timeout nach 12 Minuten`).
4. Für die aktuelle Render-ID (`y04f26bvza`) existiert **weder**
   - `universal-video-y04f26bvza.mp4`
   - noch `renders/y04f26bvza/out.mp4`
   - noch `renders/y04f26bvza/progress.json`.
5. Zusätzlich: In `video_renders` bleibt `lambda_render_id` leer. Damit fehlt ein verlässlicher technischer Anker für echtes Progress/Error-Tracking.

## Do I know what the issue is?

Ja – mit hoher Wahrscheinlichkeit ist es **kein reines UI-Problem**, sondern ein **Tracking-/Invocation-Designproblem im Render-Handoff**:
- Render wird zwar angestoßen, aber wir speichern keine belastbare Lambda-Referenz (renderId/bucket) für echte Progress-Abfrage.
- Dadurch läuft der Client auf Zeit-Schätzung und fällt am 12-Minuten-Guard in einen künstlichen Timeout.

---

## Umsetzungsplan (robuster Fix, nicht nur „Timeout erhöhen“)

### 1) Handoff stabilisieren: eindeutige Render-Referenz persistieren
**Datei:** `supabase/functions/invoke-remotion-render/index.ts`

- Invocation so umbauen, dass wir nach Start eine **harte Tracking-Referenz** haben:
  - `lambda_render_id` in `video_renders.content_config` setzen.
  - `bucket_name` konsistent speichern/aktualisieren.
- `universal_video_progress.result_data` erweitern statt überschreiben (nicht nur `{ renderId }`, sondern vollständige Trackingdaten erhalten).
- Idempotenz beibehalten: Wenn bereits `lambda_render_id` gesetzt ist, no-op success.

**Ziel:** Polling kann auf echte Render-Metadaten statt Schätzung gehen.

---

### 2) Progress-Checker auf echte Referenz umstellen
**Datei:** `supabase/functions/check-remotion-progress/index.ts`

- Primär mit `lambda_render_id` + `bucket_name` prüfen.
- S3-Prüfpfade konsolidieren:
  - `renders/{lambda_render_id}/progress.json`
  - `renders/{lambda_render_id}/out.mp4`
  - plus bestehender Universal-Fallback.
- Wenn `progress.json` Errors enthält: **sofort fail mit konkreter Fehlursache** statt später Timeout.
- Timeout-Logik an echten Render-Start koppeln (`lambda_invoked_at`) statt nur `created_at`.

**Ziel:** Keine „blinde 99%-Schätzung bis Timeout“ mehr.

---

### 3) Webhook-Update robuster machen
**Datei:** `supabase/functions/remotion-webhook/index.ts`

- Completion/Failure-Update auf `video_renders` + `universal_video_progress` anhand der persistierten Trackingfelder robust matchen.
- Bei success/failure immer `status_message` + technische Details konsistent schreiben.

**Ziel:** Falls Webhook eintrifft, wird der Run zuverlässig finalisiert (auch bei Zwischenstatus-Abweichungen).

---

### 4) Frontend-Fehlerbild korrigieren (verwirrendes 99% + Fehler)
**Datei:** `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

- Bei `status === failed` Progress nicht künstlich bei 99% stehen lassen (oder visuell klar als „abgebrochen“ kennzeichnen).
- Fehlermeldung direkt aus backend-spezifischem Renderfehler anzeigen (nicht nur generisch Timeout).

**Ziel:** Nutzer sieht sofort den echten Zustand statt widersprüchlicher UI.

---

### 5) Konfigurations-Härtung
**Datei:** `supabase/config.toml` (nur falls erforderlich in bestehender Struktur)

- Explizite Function-Settings für die betroffenen Render-Funktionen vereinheitlichen (insb. `invoke-remotion-render`, `check-remotion-progress`), damit Laufzeitverhalten reproduzierbar ist.
- Keine neue Architektur, nur Guardrails.

---

## Warum dieser Plan die aktuelle Schleife beendet

Der Fehlerloop entsteht aktuell aus:
- Startsignal vorhanden
- aber ohne belastbare Render-Referenz
- daher nur Zeit-Schätzung
- dann harter Timeout.

Mit dem Plan erzwingen wir:
1. **deterministisches Tracking** direkt nach Start,
2. **echte** Progress/Error-Abfrage,
3. konsistente Finalisierung per Polling + Webhook.

Damit verschwindet genau das Muster aus deinem Screenshot („99% + Render-Timeout nach 12 Minuten“).

---

## Abnahmekriterien (E2E)

1. Lauf zeigt Statusfolge ohne Hänger:
   - `ready_to_render -> rendering -> completed` (oder sauberer `failed` mit konkreter Ursache).
2. `video_renders.content_config.lambda_render_id` ist kurz nach Start gesetzt.
3. `check-remotion-progress` liefert echte Renderdaten (nicht nur time-based fallback).
4. Kein „99% + Timeout“-Widerspruch mehr in der UI.
5. Retry erzeugt keinen Doppelstart (Idempotenz bleibt intakt).
