

# Fix: invoke-remotion-render Timeout + Diagnose-Dashboard

## Das Problem (endlich gefunden!)

`invoke-remotion-render` fehlt die `timeout_sec` Konfiguration in `config.toml`. Dadurch gilt der Standard-Timeout von ca. 200 Sekunden. Die AWS Lambda braucht aber 3+ Minuten im RequestResponse-Modus. Die Funktion wird vom Runtime gekillt, BEVOR Lambda antwortet.

**Beweiskette:**
- DB: `lambda_render_id` ist bei ALLEN letzten Renders `null`
- Logs: Funktion startet Lambda-Aufruf, aber es gibt KEINEN Log fuer die Lambda-Antwort
- Timing: Funktion laeuft exakt ~200s (Default-Timeout), Lambda braucht 3+ Minuten

## Loesung

### 1. Timeout-Konfiguration hinzufuegen

**Datei**: `supabase/config.toml`

```toml
[functions.invoke-remotion-render]
verify_jwt = false
timeout_sec = 300
```

Das gibt der Funktion 5 Minuten -- genug fuer die Lambda RequestResponse.

### 2. Diagnose-Endpoint erstellen

Neue Edge Function `debug-render-status` die den kompletten Status einer Render-Pipeline abfragt und alle relevanten Informationen zurueckgibt:

**Datei**: `supabase/functions/debug-render-status/index.ts`

- Nimmt eine `render_id` oder `progress_id` entgegen
- Prueft `video_renders` Tabelle (render_id, status, lambda_render_id, error_message)
- Prueft `universal_video_progress` Tabelle (current_step, status, progress_percent)
- Prueft ob die Lambda-Funktion ueberhaupt aufgerufen wurde
- Gibt einen vollstaendigen Diagnose-Report zurueck

### 3. Diagnose-Panel in der UI

Kleiner Debug-Button (nur sichtbar wenn Rendering laeuft oder fehlgeschlagen), der den `debug-render-status` Endpoint aufruft und die Ergebnisse anzeigt:

- Render-ID und Lambda-Render-ID
- DB-Status beider Tabellen
- Zeitstempel aller Schritte
- Klare Fehlermeldung was genau schiefgelaufen ist

## Technische Details

### config.toml Aenderung

Eintrag hinzufuegen zwischen den bestehenden Funktions-Konfigurationen:

```toml
[functions.invoke-remotion-render]
verify_jwt = false
timeout_sec = 300
```

### debug-render-status Edge Function

```typescript
// Liest video_renders + universal_video_progress
// Gibt strukturierten Diagnose-Report zurueck
// Felder: render_id, lambda_render_id, status, timestamps, error chain
```

Config:
```toml
[functions.debug-render-status]
verify_jwt = true
timeout_sec = 30
```

### UI: Debug-Overlay in UniversalAutoGenerationProgress

- Collapsible Panel unter dem Fortschrittsbalken
- Zeigt: Render-ID, Lambda-ID, DB-Status, Timestamps
- Automatisch aktualisiert bei jedem Poll
- Nur sichtbar bei Status "rendering" oder "failed"

## Dateien die geaendert werden

1. **EDIT**: `supabase/config.toml` -- timeout_sec = 300 fuer invoke-remotion-render
2. **NEU**: `supabase/functions/debug-render-status/index.ts` -- Diagnose-Endpoint
3. **EDIT**: UI-Komponente fuer Auto-Generation Progress -- Debug-Panel hinzufuegen

## Warum das diesmal das Problem loest

Die letzten 8 Tage Fehlersuche zeigten verschiedene Symptome desselben Problems: `invoke-remotion-render` stirbt durch Timeout bevor Lambda antwortet. Die TDZ-Fehler, JSON-Parse-Fehler und fire-and-forget Probleme waren alles Nebenschauplaetze. Die Grundursache war immer: **fehlende Timeout-Konfiguration**.

