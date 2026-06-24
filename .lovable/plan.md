## Problem

Beim Erstellen des Storyboards triggert `useStoryboardTransition` automatisch die Edge Function `briefing-deep-parse`. Diese liefert aktuell einen non-2xx Status zurück (Toast: "Briefing-Analyse fehlgeschlagen · Edge Function returned a non-2xx status code"). Die Edge-Function-Logs zeigen nur `booted/shutdown`, keinen `console.error` aus dem `catch` — d.h. der Fehler entsteht entweder vor dem ersten `await` (z. B. Boot-Crash) oder die Gateway-Antwort wird vom Client als FunctionsHttpError verpackt, ohne dass wir den realen Status sehen.

Zusätzlich ist die UX brüchig: bei jedem Fehlschlag bleibt der User komplett ohne Plan stehen, obwohl wir serverseitig bereits eine deterministische 3-Szenen-Fallback-Arc bauen können (Logik existiert in `briefing-deep-parse` Zeile 627-669, läuft aber nur wenn Pass A 0 Szenen liefert — nicht wenn Pass A komplett fehlschlägt).

## Lösung (3 Schritte, keine Pipeline-Änderung)

### 1. Echten Status sichtbar machen (Diagnose)
`src/hooks/useStoryboardTransition.ts`:
- Im `catch` zusätzlich `e?.context?.status`, `e?.context?.statusText` und Response-Body (falls verfügbar via `e?.context?.response?.text()`) auslesen und sowohl ins `console.error` als auch in die Toast-Beschreibung übernehmen.
- Damit sehen wir beim nächsten Versuch sofort, ob es 402 (Credits), 429 (Rate), 500 (Gateway-Crash) oder 413 (Briefing zu lang) ist.

### 2. Lokaler Plan-Fallback (Robustheit)
`src/hooks/useStoryboardTransition.ts`:
- Neue Hilfsfunktion `buildLocalFallbackPlan(briefing, projectId)` die clientseitig eine 3-Szenen-Arc (Hook / Reveal / CTA) erzeugt — exakt gleiche Struktur wie der Server-Fallback (engine `broll` oder `cinematic-sync` falls `@mention` im Text, Default-Voice aus Projekt).
- Im `catch`: statt nur Toast + Navigate-without-Plan → bei Status 500/timeout den lokalen Fallback bauen, `setState({ planSheetOpen: true, initialPlan: fallback })` setzen und Toast als "warn" statt "destructive" zeigen ("Auto-Analyse offline — Basis-Plan erstellt, bitte prüfen").
- Bei 402/429 bleibt das jetzige Verhalten (klare Meldung, kein Fallback) erhalten.

### 3. Server-seitiges Defensiv-Hardening
`supabase/functions/briefing-deep-parse/index.ts`:
- Pass-A `callGateway` in `try/catch` einpacken: bei Gateway-Fehler (statt zu werfen) ein leeres `manifest = { project: {}, scenes: [] }` zurückgeben und die bereits existierende Safety-Arc (Zeile 630-669) greifen lassen.
- Damit liefert die Funktion in nahezu allen Fällen einen `200 + plan`, statt 500.
- Pass-A Fehler trotzdem in `parser_meta.passA_error` persistieren, damit wir es im Plan-Sheet anzeigen können ("AI-Director offline, deterministischer Plan").

## Technische Details

- Kein Edge-Function-Vertragsbruch: Antwort-Shape bleibt `{ plan, version, timings }`.
- Lipsync-Pipeline (`compose-dialog-segments` v169) wird nicht berührt.
- `ProductionPlanSheet.tsx` (manueller Trigger) bekommt dieselbe verbesserte Fehlermeldung über den gemeinsamen `extractFunctionError(e)` Helper (neuer Mini-Util in `src/lib/functionsError.ts`, der `context.status` + Body extrahiert).

## Verifikation

1. Neuen Storyboard-Trigger ausführen → Toast zeigt jetzt konkreten Status.
2. Bei Pass-A Crash → War-Room schließt, Plan-Sheet öffnet mit Fallback-Arc, User kann sofort generieren.
3. Edge-Function-Logs (`briefing-deep-parse`) zeigen den Pass-A Error explizit.
