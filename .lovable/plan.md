# Plan: Board-Dauer folgt dem Briefing (Single Source of Truth)

## Problem
Das Briefing sagt „15 Sekunden / 3 Szenen à 5s", aber das Briefing-Board steht auf 30s Gesamtdauer. Aktuell versucht die Pipeline beide Werte zu versöhnen — Ergebnis: 3 Szenen à 10s (30s), weil der Reducer auf die Board-Zahl zurückfällt.

## Lösung: Briefing-Zeit gewinnt, Toggle wird auto-synced
Sobald `detectScriptTimingMode` eine belastbare Skript-Dauer erkennt (Tier 1 Marker oder Tier 2 Sub-Shots mit Zeitfenstern), schreiben wir diese Dauer zurück in den Board-State — der Toggle bewegt sich sichtbar auf 15s. Kein Widerspruch mehr zwischen Board und Skript.

## Änderungen

### 1. Server: `briefing-deep-parse` gibt kanonische Dauer zurück
`supabase/functions/briefing-deep-parse/index.ts`
- Response um `canonical_duration_seconds` + `canonical_scene_count` + `source: 'script' | 'board'` erweitern (aus `scriptTiming`).
- Nur setzen wenn `scriptTiming.confidence >= 'high'` (Tier 1/2 mit Zeitfenstern), sonst `null`.

### 2. Client: Board-State auto-updaten beim Analyse-Ergebnis
`src/hooks/useBriefingAnalyze.ts` (bzw. der Hook, der `briefing-deep-parse` aufruft und das Sheet öffnet)
- Nach erfolgreicher Analyse: wenn `canonical_duration_seconds` gesetzt und ≠ aktueller Board-Dauer → `onUpdateBoard({ totalDurationSec: canonical, sceneCount: canonicalCount })` aufrufen.
- Toast: „Dauer aus Briefing übernommen: 30s → 15s".

### 3. UI: Sichtbarer Hinweis im Sheet
`src/components/video-composer/briefing/ProductionPlanSheet.tsx`
- Neben „Gesamtdauer 15s" Chip: „⟳ aus Briefing übernommen (vorher 30s)" wenn Auto-Sync griff.
- Kleiner „Rückgängig"-Link, der Board wieder auf den alten Wert setzt (User-Escape).

### 4. Reducer-Fallback entfernen
`supabase/functions/briefing-deep-parse/index.ts` Reducer
- Wenn `scriptTiming.confidence high` vorhanden: Board-Dauer wird komplett ignoriert (nicht mehr als max/min-Klammer benutzt).
- Wenn kein belastbares Skript-Timing: Board-Dauer bleibt Fallback wie heute.

## Nicht-Ziele
- Keine Änderung am Detector selbst — der funktioniert bereits (J1 verifiziert).
- Kein Auto-Sync bei unsicherem Timing (`confidence: 'low'`) — dort bleibt Board maßgeblich.
- Keine Umstellung der Lip-Sync/Ensemble-Logik.

## Ergebnis
Briefing „15s, 3 Szenen à 5s" → Toggle springt auf 15s, Sheet zeigt 3 Szenen à 5s, keine widersprüchlichen Zahlen mehr.