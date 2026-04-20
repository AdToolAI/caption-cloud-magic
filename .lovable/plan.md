
# Plan: AI Superuser zeigt weiter nur 10 Szenarien, weil das Backend noch auf altem Stand läuft

## Diagnose

Das Problem sitzt aktuell nicht mehr im Admin-Frontend:

- `src/pages/admin/AISuperuserAdmin.tsx` enthält bereits alle 15 Szenarien in `ACTIVE_SCENARIOS`
- Die UI zählt dynamisch mit `scenarios.length`
- Trotzdem zeigen die letzten echten Läufe nur 10 Szenarien

Die entscheidende Evidenz kommt aus den Backend-Daten und Logs:

- In `public.ai_superuser_runs` tauchen in den letzten Läufen nur 10 `scenario_name`-Werte auf
- Die Logs von `ai-superuser-test-runner` zeigen explizit:
  - `Starting 10 scenarios in mode=full`

Das heißt: Die Datei im Codebase hat 15 Szenarien, aber die aktuell laufende Backend-Funktion ist noch eine ältere Deployment-Version mit nur 10.

## Umsetzung

### 1. `ai-superuser-test-runner` neu deployen
Die aktuell im Projekt liegende Version von `supabase/functions/ai-superuser-test-runner/index.ts` enthält bereits diese 5 zusätzlichen Szenarien:

- `Trial Lifecycle Check`
- `Calendar Publish Dispatcher`
- `Stripe Webhook Reachability`
- `Social Health Check`
- `Consistency Watcher`

Diese Version muss erneut auf Lovable Cloud deployed werden, damit die aktive Laufzeitversion nicht mehr bei 10 stoppt.

### 2. Volltest erneut ausführen
Nach dem Redeploy:

- im Admin den `Komplett-Test` starten
- erwarten: Log `Starting 15 scenarios in mode=full`
- erwarten: 15 verschiedene `scenario_name`-Einträge in `ai_superuser_runs`

### 3. UI-Verifikation
Danach muss der KI-Superuser automatisch korrekt rendern:

- grüner Banner: `Alle 15 Szenarien laufen stabil`
- Tabelle: 15 Zeilen
- Kennzahl `Szenarien`: 15
- Gesamtlatenz mit den bereits angehobenen Schwellenwerten bewerten

## Zusätzliche Absicherung

Damit Frontend und Backend künftig nicht wieder auseinanderlaufen, wird der Szenario-Katalog an einer Stelle zentralisiert.

### Empfohlene Härtung
Eine dieser zwei Varianten umsetzen:

#### Variante A — Shared Config
- gemeinsame Szenario-Liste in einer geteilten Datei definieren
- Admin-UI und Test-Runner importieren beide dieselbe Quelle

#### Variante B — Backend als Source of Truth
- `ai-superuser-test-runner` liefert zusätzlich die aktive Szenario-Liste zurück
- Admin-UI rendert anhand dieser Liste statt einer harten Whitelist

Variante A ist für Wartbarkeit sauberer, Variante B ist robuster gegen Deploy-Drift.

## Betroffene Dateien

- `supabase/functions/ai-superuser-test-runner/index.ts`
- optional zur Härtung:
  - `src/pages/admin/AISuperuserAdmin.tsx`
  - neue gemeinsame Konfigurationsdatei für Szenarien

## Erwartetes Ergebnis

- 15 Szenarien werden wirklich ausgeführt
- 15 Szenarien werden im Admin angezeigt
- kein Widerspruch mehr zwischen Codebase, Logs und UI
- künftige Szenario-Erweiterungen brechen nicht mehr durch doppelte Pflege auseinander
