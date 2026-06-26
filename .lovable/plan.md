## Plan: Drift Auto-Fix + Hormozi-Captions

Zwei unabhängige Features, nacheinander ausgeliefert. Keine Eingriffe in die Lip-Sync-Pipeline.

---

### Feature 1 — Drift Auto-Fix (Briefing-Loop schließen)

**Ziel:** Die bestehende `DriftReportPanel`-Card bekommt einen "Storyboard angleichen"-Button, der safe Felder automatisch vom `ProductionPlan` in die `composer_scenes` schreibt.

**Safe-Liste (auto-fixable):**
- `durationSeconds` (sofern Provider die Dauer unterstützt — sonst skip mit Hinweis)
- `voiceoverText` (nur wenn Szenenfeld leer ist; bestehender Text wird NIE überschrieben)
- `aiPrompt` (nur wenn leer oder < 8 Zeichen)

**Hard-Excluded (niemals auto-fix):**
- Lip-Sync-Engine, `dialogMode`, `dialog_shots`, `syncso_*`
- Cast / `characterShots` / Anchor-Slots (Identity-Bridge bleibt unangetastet)
- Scene-Count (Hinzufügen/Löschen von Szenen bleibt manuell)

**Implementierung:**
- Neu: `src/lib/video-composer/briefing/driftAutoFix.ts` — pure Builder, gibt `{ updates: Partial<ComposerScene>[], skipped: DriftFinding[] }` zurück.
- `DriftReportPanel.tsx`: Button "Safe Auto-Fix anwenden" (nur sichtbar wenn ≥1 auto-fixable Finding); Bestätigungs-Dialog mit Diff-Vorschau (vorher/nachher), schreibt via existierendem Composer-Scene-Update-Hook, persistiert Audit-Eintrag in `composer_plan_drift_reports` (`auto_fix_applied_at`, `fixed_fields[]`).
- Findings, die nicht in der Safe-Liste sind, bleiben sichtbar mit Label „manuell prüfen".

---

### Feature 2 — Hormozi-Style Captions

**Ziel:** Word-by-Word animierte Untertitel mit Keyword-Highlights als optionaler Caption-Style im Director's Cut Export. Eigenständiges Feature, keine Composer-Pipeline-Änderung.

**Scope:**
- Neuer Caption-Style „Hormozi" in der bestehenden Subtitle-Library (zusätzlich zu aktuellen Stilen).
- Word-Level Timing: bereits vorhanden über ElevenLabs/Whisper-Output (`word_timestamps`); falls nur Satz-Timing existiert → linear über Wortanzahl interpolieren (Fallback).
- Renderer: neue Remotion-Komponente `HormoziCaption.tsx` unter `src/remotion/components/` — Pop-In-Scale + Highlight-Box für Keywords, max 3 Wörter pro Frame.
- Keyword-Detection: Lovable-AI-Call (Gemini Flash) extrahiert 1–3 Power-Words pro Satz → in DB-Feld `subtitle_keywords` cached pro Clip.
- UI: Style-Switcher in `DirectorsCut` Subtitle-Panel — Toggle „Hormozi-Mode" + Farbpicker für Highlight (Default: Gold #F5C76A).
- Burned-in: läuft über die existierende Subtitle-Hard-Crop-Pipeline (Memory: Burned-in Subtitle Reframe) — keine Änderungen nötig.

**Edge Function:** `extract-subtitle-keywords` (Lovable AI Gateway, Gemini 3 Flash, structured output) — Input: Subtitle-Array; Output: pro Subtitle `{ keywords: string[] }`. Caching in `translation_cache`-Style Tabelle wiederverwendbar.

---

### Reihenfolge
1. Drift Auto-Fix (klein, ~1 Session) — schließt offenen Loop sofort.
2. Hormozi-Captions (mittel, ~2 Sessions) — eigenständiges Conversion-Feature für Solo-Creator.

### Out of Scope
- Magic Mode (durch Briefing Intelligence v2 abgedeckt — gestrichen)
- Skit-Templates (redundant — gestrichen)
- Auto-Fix für Cast/Lip-Sync (Pipeline-Schutz)

Soll ich so loslegen?
