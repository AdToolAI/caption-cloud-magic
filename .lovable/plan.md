## Diagnose: neue Deep-Sweep-Bugs

Der aktuelle Run ist deutlich weiter gekommen: Es wurden diesmal echte Renders angestoßen, aber die nächsten Fehler liegen in vier Bereichen:

1. **Auth-Weitergabe im Background-Runner**
   - Flow 4, 5 und 7 scheitern mit `401 Unauthorized` / `UNAUTHORIZED_LEGACY_JWT`.
   - Ursache: Der Deep-Sweep startet per `EdgeRuntime.waitUntil`. Der User-JWT aus dem ursprünglichen Browser-Request ist im langen Background-Kontext offenbar nicht mehr zuverlässig für interne Function-Aufrufe nutzbar. Einige Functions validieren ihn strikt, andere erwarten moderne Header-Konfiguration.

2. **Composer Flow nutzt falsche Stitch-Abstraktion**
   - Flow 1 scheitert mit `Missing generationIds: false,true,true`.
   - Ursache A: Hailuo wurde durch das globale 10/h Rate-Limit blockiert.
   - Ursache B: Selbst wenn alle drei URLs vorliegen, ruft der Orchestrator `compose-stitch-and-handoff` mit direkten `scenes` auf. Diese Function erwartet aber ein echtes `composer_project` mit `composer_scenes` und nur `projectId`.

3. **Auto-Director Response wird falsch gelesen**
   - Flow 3: Function ist `ok`, aber Deep Sweep sagt `returned no scenes`.
   - Ursache: `auto-director-compose` gibt `{ ok: true, plan: { scenes, rationale } }` zurück. Der Orchestrator sucht aktuell fälschlich `json.scenes` und `json.rationale` auf Root-Ebene.

4. **Long-Form Seed-Schema ist falsch**
   - Flow 6: `Could not find the 'language' column...`
   - Ursache: Die echte Tabelle `sora_long_form_projects` hat `name`, `target_duration`, `script`, aber keine `title`, `total_duration_seconds`, `language`.
   - Zusätzlich sind Szenen-Dauern per Constraint nur `4, 8, 12`; der Seed nutzt aktuell `5`.

5. **Director's Cut Polling schaut in die falsche Tabelle**
   - Flow 2 triggert Render korrekt, läuft aber in Timeout.
   - Ursache: `render-directors-cut` schreibt in `director_cut_renders`, der Orchestrator pollt aber `video_creations`.

## Fix-Plan

### 1. Deep-Sweep Auth robust machen

In `supabase/functions/qa-weekly-deep-sweep/index.ts`:

- Den eingehenden User-JWT nur noch für den initialen Admin-Check nutzen.
- Für interne Deep-Sweep-Aufrufe einen sicheren internen Service-Auth-Modus verwenden:
  - `Authorization: Bearer <service_role_key>`
  - zusätzlich `x-qa-user-id: <triggered_by_user_id>`
  - zusätzlich `x-qa-real-spend: true`
- Für QA-only Pfade in den Ziel-Functions eine explizite, serverseitig geschützte Service-Auth-Erkennung einbauen, damit kein Client diese Pfade fälschen kann.

Betroffene Ziel-Functions:
- `generate-talking-head`
- `magic-edit-image`
- `auto-generate-universal-video` nur falls sie User-Kontext benötigt; ansonsten genügt Service-Header plus Body-`userId`.

### 2. Flow 1 stabilisieren: Composer-Seed statt direkte Scenes

In `qa-weekly-deep-sweep`:

- Nicht mehr drei teure Provider parallel für jeden Run erzwingen.
- Stattdessen für den Stitch-E2E-Test ein temporäres `composer_project` mit drei fertigen `composer_scenes` anlegen:
  - `clip_status = 'ready'`
  - `clip_url = ctx.assets.video` oder optional eine Kombination aus bootstrapped sample + erfolgreich generierter Provider-URL
  - `duration_seconds` passend zur Sample-Länge
- Dann `compose-stitch-and-handoff` korrekt mit `{ projectId, destination: 'download' }` aufrufen.
- Cleanup der temporären Composer-Rows im `finally`-Block.
- Optional: Einen separaten Provider-Generation-Flow behalten, aber nicht als Voraussetzung für Stitching; so bricht Hailuo Rate-Limit nicht den gesamten Composer-Stitch-Test.

### 3. Flow 2 Polling auf `director_cut_renders` umstellen

In `qa-weekly-deep-sweep`:

- Nach `render-directors-cut` den zurückgegebenen `render_id` als ID der Tabelle `director_cut_renders` behandeln.
- Polling ersetzen:
  - Tabelle: `director_cut_renders`
  - Felder: `status`, `output_url`, `error_message`, `remotion_render_id`
- Timeout auf 360s erhöhen, damit Lambda-Cold-Starts realistischer abgedeckt sind.
- Bei `status='rendering'` und vorhandenem `remotion_render_id` nicht sofort als Payload-Bug werten, sondern sauber als Render-Timeout klassifizieren.

### 4. Flow 3 Auto-Director Response korrigieren

In `qa-weekly-deep-sweep`:

- `const planObj = json.plan ?? json`
- `scenes = planObj.scenes`
- `rationale = planObj.rationale`
- Flow als success werten, wenn `plan.ok === true` und `planObj.scenes.length > 0`.

### 5. Flow 6 Long-Form Seed korrigieren

In `qa-weekly-deep-sweep`:

- Project-Insert auf echte Spalten umstellen:
  - `name`
  - `target_duration: 30`
  - `aspect_ratio: '16:9'`
  - `model: 'sora-2-standard'`
  - `status: 'draft'` oder `ready_to_render`, je nachdem was die Render-Function toleriert
  - `script`
- Scene-Insert korrigieren:
  - `duration: 4` statt `5`
  - `scene_order: 0`
  - `generated_video_url: ctx.assets.video`
  - `status: 'completed'`
- Polling bleibt auf `sora_long_form_projects`, aber Timeout auf 360s erhöhen.

### 6. Flow 4/7 Ziel-Functions QA-Service-Auth-fähig machen

In `generate-talking-head` und `magic-edit-image`:

- Kleine Helper-Funktion hinzufügen:
  - Wenn `Authorization` Service-Key ist und `x-qa-user-id` gesetzt ist, wird dieser User für den QA-Run verwendet.
  - Sonst bleibt der normale User-JWT-Flow unverändert.
- Keine öffentliche Umgehung der Auth: Der `x-qa-user-id` Header wird nur akzeptiert, wenn gleichzeitig der Service-Key im Authorization-Header ist.

### 7. CORS Header aktualisieren

Alle betroffenen QA-/Provider-Functions, die interne QA-Header erhalten, bekommen in `Access-Control-Allow-Headers` zusätzlich:

```text
x-qa-real-spend, x-qa-user-id
```

Das verhindert Preflight-/Header-Drift, falls diese Functions künftig auch direkt aus dem Admin-UI oder Test-Harness mit QA-Headern angesprochen werden.

### 8. Optionaler Rate-Limit-Schutz im Deep Sweep

Damit wir das 50€ Budget möglichst sinnvoll nutzen:

- Vor teuren Provider-Flows prüfen, ob der User in der letzten Stunde bereits nahe am 10/h-Limit ist.
- Wenn ja: Flow sauber als `budget_skipped` oder `rate_limited` markieren statt `failed`.
- Für den eigentlichen Stitch-Test weiterhin bootstrapped Sample-Clips verwenden, damit er unabhängig vom Provider-Rate-Limit bleibt.

## Erwartetes Ergebnis nach Fix

Beim nächsten Run sollten die Fehler nicht mehr als Payload-/Auth-Bugs auftreten:

- Flow 1: Stitch testet wirklich Composer → Assemble → Render-Pipeline.
- Flow 2: Pollt den richtigen Director's-Cut-Render-Status.
- Flow 3: Erkennt den gültigen Plan als Erfolg.
- Flow 4: Talking Head startet mit gültigem QA-User-Kontext.
- Flow 5: Universal Video erhält einen gültigen internen Aufrufkontext.
- Flow 6: Long-Form Seed passt zum echten DB-Schema.
- Flow 7: Magic Edit startet mit gültigem QA-User-Kontext und PNG-Maske.

## Dateien, die ich ändern werde

- `supabase/functions/qa-weekly-deep-sweep/index.ts`
- `supabase/functions/generate-talking-head/index.ts`
- `supabase/functions/magic-edit-image/index.ts`
- eventuell `supabase/config.toml` nur für function-spezifische Timeout-/Header-Kompatibilität, keine Projekt-Settings
- Memory-Update für `mem://features/qa-agent/deep-sweep` mit den neuen Deep-Sweep-Stabilitätsregeln