## Problem

Der Build schlägt fehl, aber die Lovable-UI zeigt nur die abgeschnittene Liste der geprüften Edge-Function-Dateien — **nicht die eigentlichen Fehlermeldungen**. Meine bisherigen Fixes (`provider-tracker.ts` Casts auf `any`, `concurrency: null` in `remotion-payload.ts`) sind bereits drin, aber offensichtlich greift noch ein anderer Fehler in einer der ~400 Edge Functions.

Bevor ich blind weiter Code ändere, müssen wir die **echten Fehlermeldungen** sehen.

## Plan

### Schritt 1 — Diagnose: Echte Fehler sichtbar machen
- `deno check` lokal über alle Shared-Files + die zuletzt geänderten Funktionen (`motion-studio-superuser`, `ai-superuser-test-runner`, `analyze-superuser-anomalies`, `analyze-brand-voice`, `auto-director-compose`) laufen lassen.
- Ausgabe komplett einsammeln (nicht abschneiden), um die exakten Dateien + Zeilen mit TS-Fehlern zu identifizieren.
- Parallel: `supabase--deploy_edge_functions` für die zuletzt geänderten Funktionen aufrufen — die Deploy-Logs zeigen oft präzisere Fehler als der globale Check.

### Schritt 2 — Hypothesen prüfen (was am wahrscheinlichsten kaputt ist)
Die wahrscheinlichsten Quellen, basierend auf dem Verlauf:
1. **`motion-studio-superuser/index.ts`** — In der vorherigen Iteration wurde ein Syntax-Fix erwähnt (extra `}`); möglicherweise gibt es noch ein TS-Issue mit den neuen Helpern (`ensureTestBrandKit`, `PUBLIC_TEST_CLIP`-Insert).
2. **`ai-superuser-test-runner/index.ts`** — Retry-Wrapper + Throttling neu hinzugefügt; ggf. Typing-Issue bei `invokeWithRetry` (z. B. `unknown` → `string` Konvertierung der Body, oder `Promise<{res, text}>`-Rückgabe ohne Type).
3. **Generated Supabase types** — Falls neue Tabellen erwartet werden, die noch nicht in `types.ts` sind, müssen wir alle Zugriffe konsistent als `any` casten.

### Schritt 3 — Gezielter Fix
- Pro identifiziertem Fehler: minimale Änderung (Cast, fehlender Import, fehlendes Property), keine Architektur-Refactors.
- Bei Bedarf `concurrency: null` und Casts auch in den Funktionen anwenden, die `remotion-payload` direkt konsumieren.

### Schritt 4 — Verifikation
- `supabase--deploy_edge_functions` nochmal für die gefixten Funktionen.
- Bei Erfolg: Statusmeldung „Build grün", keine Folge-Edits.

## Was ich NICHT tun werde
- Keine spekulativen Refactors anderer Edge Functions.
- Keine weiteren Casts in Files, die nichts mit dem Fehler zu tun haben.
- Keine Änderung an `src/integrations/supabase/types.ts` (auto-generiert).

## Erwartetes Ergebnis
Build wird grün, ohne weitere Iteration. Die Motion-Studio- und KI-Superuser-Pipelines bleiben funktional unverändert.