## Briefing Intelligence v2 — Research, Pre-Apply Summary & Drift-Detection im Storyboard-Flow

Alles hängt am einzigen Einstiegspunkt **"Storyboard generieren"**. Kein zweiter Button. Der bestehende `ProductionWarRoom` wird zur Pipeline-Bühne erweitert, am Ende kommt eine Review-Gate und ein automatischer Drift-Check.

### 1. Erweiterter Storyboard-Flow (orchestriert in `useStoryboardTransition`)

```text
[Klick "Storyboard generieren"]
        ↓
ProductionWarRoom öffnet:

  Phase 1 — Briefing parsen          (Pass A, ~15-30s)        [bestehend]
  Phase 2 — Topic & Modus erkennen   (Pass 0, ~2s)            [NEU]
              Klassifiziert: storytelling | brand | product | tutorial
              Extrahiert: topic_seed, era, geography, brand_domain
  Phase 3 — Recherche                (Pass 0.5, ~20-60s)      [NEU]
              Lovable-AI Tool-Calling (web_search + fetch_url)
              Storytelling-Modus: Epoche, Setting, Tropen, Visual Refs
              Brand-Modus:        Domain + /about, Tonalität, Farben
              Live-Ticker im WarRoom: "🔎 Suche…" / "📄 Lese…"
              7-Tage-Cache in briefing_research_cache (neue Tabelle)
  Phase 4 — Slots auffüllen          (Pass B mit Research)    [erweitert]
              Pass B kennt ResearchDigest und füllt jeden leeren
              ProductionPlan-Slot deterministisch:
                cameraDirection · lighting · colorGrade · filmStyle
                per Scene: castEmotions · gestures · propsHint
                          locationVibe · transitionHint · musicMood
              Jedes Feld trägt _meta:{ origin, confidence, rationale }
  Phase 5 — Pre-Apply Review-Gate    (Sheet zeigt Summary)    [NEU GATE]
              WarRoom pausiert, ProductionPlanSheet öffnet automatisch
              und scrollt zum BriefingPlanSummary-Footer (siehe §2).
              User klickt entweder "← Bearbeiten" oder "✓ Bauen".
  Phase 6 — Apply auf Storyboard     (useApplyProductionPlan) [bestehend]
              UNVERÄNDERT, alle Lip-Sync-Schutzfilter aktiv.
  Phase 7 — Drift-Check              (siehe §3)               [NEU]
              Automatisch, persistiert in composer_drift_checks
              Ergebnis-Badge bleibt im Plan-Sheet sichtbar
```

Es gibt KEINEN separaten Analyse-Button — Phasen 1-4 laufen still im WarRoom, Phase 5 ist die einzige User-Interaktion, Phasen 6-7 laufen wieder automatisch.

### 2. BriefingPlanSummary — Sticky Review-Footer im ProductionPlanSheet

Neue Komponente, ganz unten im Sheet, sticky positioned. Wird nur sichtbar wenn der Plan fertig ist (Phasen 1-4 grün):

```text
┌─ Bevor wir das Storyboard bauen ──────────────────────────────┐
│                                                                │
│  📋 Was wir verstanden haben                                   │
│  Modus: Storytelling · Thema: Robin Hood · Sprache: Deutsch    │
│  Dauer: 6 Szenen ≈ 48s · Cast: 3 Charaktere · 2 Locations      │
│                                                                │
│  🔎 Was die KI recherchiert hat                                │
│  • Robin-Hood-Legende um 1190 n.Chr., Sherwood Forest          │
│  • Kingdom of Heaven (Scott) als visuelle Referenz             │
│  • 3 Quellen: wikipedia.org · britannica.com · imdb.com        │
│                                                                │
│  ✨ Was die KI ergänzt hat (12 Felder)                         │
│  • Kameraführung: Handheld-Steadicam, niedrige Augenhöhe       │
│  • Color Grade: Teal-Orange, leicht entsättigt                 │
│  • Mimik Robin: entschlossen, mit gelegentlichem Grinsen       │
│  • +9 weitere  [alle anzeigen]                                 │
│                                                                │
│  ⚠️ Konflikte & Risiken (0)                                    │
│     z.B. "Szene 4 hat VO 8s aber Dauer 6s" / "Cast @Robin      │
│     hat kein Anchor-Portrait für Lipsync"                      │
│                                                                │
│  💰 Erwartete Render-Kosten: €2.40-3.10 für 6 Szenen           │
│  ⏱  Erwartete Zeit:          ~8-12 Minuten                     │
│                                                                │
│  [← Zurück bearbeiten]    [✓ Storyboard jetzt bauen]           │
└────────────────────────────────────────────────────────────────┘
```

Daten kommen 1:1 aus ProductionPlan + `_meta`-Annotations + bestehender `estimateSceneRenderCost`. Kein zusätzlicher AI-Call.

### 3. Drift-Detection — automatischer Plan↔Storyboard Parity-Check

Sobald `useApplyProductionPlan` durchgelaufen ist (Phase 6), startet automatisch Phase 7. Vergleicht Feld-für-Feld jede Plan-Szene mit der real angelegten `composer_scenes`-Zeile.

**Logik** in `src/lib/video-composer/briefing/driftDetector.ts`:

| Feld im Plan | Feld in `composer_scenes` | Match-Strategie |
|---|---|---|
| `script` | `script` | exakt (trim) |
| `durationSeconds` | `duration_seconds` | exakt |
| `castIds[]` | aus `ai_prompt` extrahierte `@mentions` | Set-Equality |
| `locationId` | `@location` Mention | exakt |
| `shotDirector.{framing,angle,movement,lighting}` | `shot_director` jsonb | Tiefe Diff |
| `clipSource` | `clip_source` | exakt |
| Stil-Snippets (cameraDirection, colorGrade, gestures) | `ai_prompt` | Substring-Heuristik |
| `transition` | `transition_type` | exakt |

**Ergebnis** `DriftReport`:
```text
{
  status: 'clean' | 'minor' | 'major',
  scenes: [{ sceneIndex, sceneId, drifts: [{ field, expected, actual,
              severity, source: 'plan'|'storyboard'|'protected' }] }],
  summary: { totalDrifts, byField, byScene }
}
```

Persistiert in der bereits existierenden Tabelle `composer_drift_checks` (13 Spalten, 3 Policies — passt). Kein DB-Migration nötig für diese Tabelle.

**Neue DB-Migration nur für** `briefing_research_cache`:
```text
briefing_research_cache (
  id uuid pk, cache_key text unique, kind text,
  digest jsonb, sources jsonb, created_at, expires_at
) + GRANTs + RLS (read authenticated, write service_role)
```

**UI** — `DriftReportPanel` als Banner oben im ProductionPlanSheet, sobald Phase 7 fertig:

```text
✓ Storyboard erstellt — Drift-Check: 2 minor (✨ akzeptabel)
   └─ Szene 3: cameraDirection im Plan "Crane-Shot", im Storyboard "—"
              [Plan→Storyboard anwenden] [Plan korrigieren] [Ignorieren]
   └─ Szene 5: castIds im Plan [Robin, John], im Storyboard nur [Robin]
              [Fix anwenden]
```

Severity:
- **major** = Pipeline-relevante Felder (castIds, locationId, durationSeconds, clipSource) → rotes Banner, prominent
- **minor** = Stilfelder (cameraDirection, colorGrade, gestures) → gelbes Badge
- **clean** = alles übernommen → grünes Häkchen
- **protected** = Drift existiert, Szene ist aber lipsync-locked → grauer "nicht fixbar"-Hinweis statt Fix-Button

### Lip-Sync-Schutzgarantien (UNANTASTBAR)

- Research/Enrichment schreibt nur in ProductionPlan-Felder, NIE direkt in `dialog_shots`, `syncso_*`, `dialog_locked_at`, `lock_reference_url`
- Drift-Check ist read-only auf `dialog_shots` (zählt nur Existenz)
- "Fix anwenden" geht durch denselben geschützten `useApplyProductionPlan`-Pfad
- Geschützte Szenen werden nicht angefasst, Drift wird als `severity: protected` markiert

### Files

**Neu**:
- `src/components/video-composer/briefing/BriefingPlanSummary.tsx`
- `src/components/video-composer/briefing/DriftReportPanel.tsx`
- `src/lib/video-composer/briefing/driftDetector.ts`
- `src/hooks/useDriftCheck.ts`
- Migration: `briefing_research_cache` Tabelle

**Erweitert**:
- `supabase/functions/briefing-deep-parse/index.ts` — Pass 0 + Pass 0.5 + Research-Kontext in Pass B
- `src/lib/video-composer/briefing/productionPlan.ts` — `_meta`-Sibling pro Feld (rückwärtskompatibel)
- `src/hooks/useStoryboardTransition.ts` — orchestriert 7 Phasen, inkl. Pause vor Phase 6
- `src/components/video-composer/briefing/ProductionWarRoom.tsx` — Phasen-UI 2/3/5/7 + Live-Research-Ticker
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx` — Summary-Footer + Drift-Banner-Header
- `src/hooks/useApplyProductionPlan.ts` — returnt `appliedSceneIdMap` für Drift-Check

### Kosten

- Topic-Detector: ~€0.001
- Research-Pass: ~€0.03–0.12 (cached → 0€ ab dem 2. Mal)
- Pass A+B: bestehend ~€0.10–0.20
- Drift-Check: 0€ (rein deterministisch, kein AI-Call)
- Summary: 0€ (lokale Aggregation)

### Erfolgs-Metrik

- Manuelle QA-Klicks pro Briefing: "jede Szene öffnen" → 0
- Plan↔Storyboard-Parity-Rate: messbar als `clean`-Quote in `composer_drift_checks`
- Empty-Slot-Rate im Storyboard: <5 %

### Aufwand

~ 1 Build-Session: 1 Migration + Edge-Function-Erweiterung + 4 neue Frontend-Dateien + 4 erweiterte Dateien. Bestehender Apply-Pfad und Lip-Sync-Pipeline bleiben komplett unangetastet.

---

So umsetzen?