---
name: v177 — Briefing→Storyboard Mapping Completeness
description: 3 Parser-Fixes — Performance Auto-Fill, lokaler Location-Fuzzy-Match, strikte Szenen-Anzahl-Erkennung. Keine Pipeline-Änderungen, kein Schreibzugriff auf dialog_shots / syncso_*.
type: architecture
---

## Symptome (vor v177)
1. `performance.{mimik,gestik,blick,energy}` blieb leer → keine ✨-Badges, keine Performance-Anweisung im Storyboard.
2. Slug-Mentions wie `@home-office` blieben unresolved obwohl Library-Eintrag „Home Office" existiert.
3. Briefing mit „3 Szenen × 10s" wurde von Gemini zu 5 Szenen aufgeblasen (Auto-Director-Fallback).

## Root Causes
1. Intelligent-Defaults-Block im Pass-A-Prompt deckte nur transition/textOverlay/tone ab; abschließende Regel „In LITERAL mode, DO NOT invent fields" verbot Performance-Auto-Fill.
2. Lokaler Fill-Pass nach Pass-B existierte nur für Cast, nicht für Locations.
3. Kein server-seitiger Guard: Gemini-Output war Single-Source-of-Truth für `scenes.length`.

## Fix (alle in `supabase/functions/briefing-deep-parse/index.ts`)

### A — Pass-A-Prompt erweitert
Performance als 4. Pflicht-Default im Intelligent-Defaults-Block:
- Hook → confident/open-palms/to-camera/4
- Pain → concerned/still/to-camera/2
- Reveal → focused/point/to-camera/3
- Proof → confident/open-palms/to-camera/3
- CTA → warm-smile/open-palms/to-camera/4
- default → neutral/still/to-camera/3

Dialog-Safety: keine face-occluding gestures auf Lip-Sync-Turns. Aufgefüllte Achsen müssen in `_meta.aiFilled` als `performance.{mimik|gestik|blick|energy}` gelistet werden.

Schlusszeile präzisiert: LITERAL-Mode verbietet das Erfinden von **narrative content** (voiceover.text, dialogTurns.text, brandAnchor copy); Intelligent Defaults gelten immer.

### B — Lokaler Location-Fuzzy-Match
Nach Pass-B, im selben `try`-Block wie Cast-Fill: für jede Szene mit `location.locationId === null` Substring-Match (beidseitig) via `normalizeMention` gegen `locations`-Library. Bei Treffer `locationId` + `locationName` setzen und passende `unresolved[]`-Einträge entfernen (Regex auf `scenes[N].location.locationId`).

### C — Server-Side Scene-Count-Guard
Nach Pass-A, vor Pass-B. Drei Detektoren auf `briefing`-Text:
- `/(\d+)\s*(szenen?|scenes?|shots?|beats?)\b/i` → numFromWord
- `/\b(?:szene|scene|shot)\s*(\d+)\b/gi` → maxMarker
- `/^\s*\d+[.):]\s+\S/gm` → listCount (≥3)

Präferenz: `maxMarker ≥ 2 > numFromWord > listCount`. Bei Mismatch wird `manifest.scenes` auf N getruncet/gepaddet (Padding mit Beat-Ring), `durationSec` gleichmäßig aus `project.totalDurationSec` neu verteilt. Telemetrie: `parser_meta.scene_count_corrected: { detected, gemini }`.

## Lip-Sync-Pipeline: 0 Impact
- Kein Schreibzugriff auf `dialog_shots`, `syncso_*`, `composer_scenes.dialog_*`, `clip_source`.
- v169.1 / v174 / v175 / v176 Invarianten unangetastet.
- Apply-Hook (`useApplyProductionPlan.ts`) Schutzfilter greift weiterhin — gerenderte/lip-sync-aktive Szenen werden nicht überschrieben.
- Performance-Werte werden im Apply-Hook über `mapExpression/mapGesture/mapGaze` auf strikte Enums gemapped — unbekannte Werte verworfen.
