---
name: v328 — Server-Plan-Rescue & Prosa-Fallback-Parser
description: Verhindert, dass ein Client-Timeout den korrekten AI-Plan durch generische "Hook beat for …"-Prompts ersetzt
type: architecture
---

## Symptom
Storyboard-Prompts lauteten „Hook beat for AdTool AI: cinematic medium-close-up shot …",
obwohl das Briefing (Prosa, z. B. „Der falsche Aufzug") korrekt war. In
`composer_production_plans` lag der richtige AI-Plan — die Szenen kamen aber vom
Local-Fallback (`buildLocalFallbackPlan` in `useStoryboardTransition.ts`).

## Root Cause
Der Client-Fetch auf `briefing-deep-parse` lief in Timeout/Abbruch, obwohl die Edge
Function serverseitig fertig wurde und ihren Plan persistierte. Das Grace-Window
öffnete danach den Local-Fallback — ohne den persistierten Plan zu prüfen.
Zweitens las `extractSceneHints` nur strukturierte Marker (`SHOT:`, `DIALOG:`),
sodass Prosa-Briefings zu generischen Templates degradierten.

## Fix (v328)
- **Server-Plan-Rescue**: vor dem Local-Fallback wird der neueste
  `composer_production_plans.manifest` des Projekts (created_at >= Analyse-Start)
  geladen, validiert und mit `_meta.source = 'ai-recovered'` verwendet.
- **Prosa-Parser**: Szenentitel, beschreibende Prosa (→ `anchorPromptEN`),
  wörtliche Rede ohne `DIALOG:`-Präfix inkl. Sprecher-Label, sowie
  Sekundenfenster („0–5 Sekunden") werden extrahiert. Marker-Zeilen (OVERLAY: …)
  zählen nie als Dialog. Szenenanzahl folgt den Text-Szenen statt dem Beat-Ring.
- **Sichtbarkeit**: Plan-Sheet zeigt „Basis-Plan — AI-Analyse fehlgeschlagen"
  bzw. „AI-Plan wiederhergestellt".

## Invariante
Ein Local-Fallback darf nie stillschweigend als AI-Ergebnis erscheinen.
