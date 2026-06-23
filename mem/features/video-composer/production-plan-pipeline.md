---
name: Production Plan Pipeline (Briefing Deep Parse)
description: 2-Pass-AI-Pipeline die ein Briefing in einen editierbaren Drehplan überführt und mit hartem Lip-Sync-Schutz auf das Storyboard anwendet
type: feature
---

# Production Plan Pipeline

## Architektur
```
Briefing-Text  →  briefing-deep-parse (Edge Fn, 300s)  →  ProductionPlanSheet  →  useApplyProductionPlan  →  Storyboard
                  Pass A: Gemini 2.5 Pro Strukturextraktion
                  Pass B: Gemini 2.5 Pro Resolver gegen Library
                  Persistenz: composer_production_plans (versioniert)
```

## Beteiligte Dateien
- `supabase/functions/briefing-deep-parse/index.ts` — 2-Pass Edge Function, Pro-Modell, isolierter Codepfad
- `src/lib/video-composer/briefing/productionPlan.ts` — Zod-Schema `ProductionPlan` mit resolved cast/location
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx` — editierbares Drehbuch-Formular
- `src/hooks/useApplyProductionPlan.ts` — Apply mit Schutzfilter
- `composer_production_plans` Tabelle (RLS auth.uid()=user_id)

## Lip-Sync-Schutzgarantien (UNANTASTBAR)
Der Apply-Hook delete-t eine Szene NUR wenn ALLE Kriterien erfüllt sind:
- `clip_status === 'pending'`
- `clip_url IS NULL`
- `lipSyncStatus IS NULL`
- `dialogLockedAt IS NULL`
- `lockReferenceUrl IS NULL`
- Keine Zeile in `dialog_shots` mit `scene_id`

Trifft EIN Kriterium nicht zu → Szene bleibt, neue Plan-Szenen werden dahinter angefügt. Apply schreibt nie direkt in `dialog_shots`, `syncso_*`, `dialog_locked_at`, `lock_reference_url`. Schreibt nur Felder die der manuelle Composer-Editor auch schreibt, über `onUpdateScenes` (→ existierender debounced persist-Pfad).

DB-Probe (`select scene_id from dialog_shots where scene_id in (...)`) ist Safe-Fail: bei Fehler werden ALLE Kandidaten als geschützt behandelt.

## Aufruf
Im Briefing-Tab Button "Briefing analysieren". Öffnet `ProductionPlanSheet` (ersetzt das alte schmale `BriefingImportDialog`).
