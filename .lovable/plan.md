

# Plan: 5 fehlende Szenarien im AI-Superuser-Dashboard sichtbar machen

## Problem

Das Backend (`ai-superuser-test-runner`) führt seit dem letzten Deploy **15 Szenarien** aus. Das Frontend (`src/pages/admin/AISuperuserAdmin.tsx`) hat aber eine harte Whitelist (`ACTIVE_SCENARIOS`) mit nur den ursprünglichen 10 Namen. Die 5 neuen Phase-2-Szenarien werden als „orphaned" verworfen und **erscheinen nicht in der Tabelle** — auch wenn sie laufen und Daten in `ai_superuser_runs` schreiben.

Deshalb siehst du immer noch „Alle 10 Szenarien laufen stabil" im grünen Banner und nur 10 Zeilen in der Status-Tabelle.

## Fix

### 1. Whitelist erweitern (`AISuperuserAdmin.tsx`)
Die 5 neuen Namen ergänzen — exakt so wie sie im Backend definiert sind:

```
- 'Trial Lifecycle Check'
- 'Calendar Publish Dispatcher'
- 'Stripe Webhook Reachability'
- 'Social Health Check'
- 'Consistency Watcher'
```

### 2. Verifikation nach dem Edit
- „Komplett zurücksetzen" drücken → leert alte Runs
- „Komplett-Test" auslösen → erwartet **15 Zeilen** in der Status-Tabelle
- Banner sollte „Alle 15 Szenarien laufen stabil" zeigen
- Summen-Card „Letzter Run (gesamt)" steigt von ~30s auf ~35–45s (5 zusätzliche `fast` Health-Checks à ~1–3s)

### 3. Optionaler Bonus — Schwelle „normal" anpassen
Die Card-Beschreibung sagt aktuell „< 30s ist normal". Mit 15 statt 10 Szenarien aktualisieren wir auf „< 45s ist normal", damit die Card nicht fälschlich orange wird:

- `totalLatencyClass`: Schwellen von 30s/60s → 45s/75s heben
- Card-Untertitel: „Summe aller 15 Szenarien — < 45s ist normal"

## Geänderte Dateien

- `src/pages/admin/AISuperuserAdmin.tsx` (Whitelist + Schwellen + Untertitel)

## Erwartetes Ergebnis

- ✅ 15 Szenarien sichtbar in der Status-Tabelle
- ✅ Banner zeigt „Alle 15 Szenarien laufen stabil"
- ✅ Pass-Rate-Übersicht enthält die neuen 5 System-Health-Checks
- ✅ Keine fälschlichen Orange-/Rot-Markierungen wegen veralteter Latenz-Schwellen

