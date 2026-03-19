

# Plan: Objekt-basierte Text-Artefakte eliminieren

## Problem

Die `visualDescription` im Script beschreibt Objekte, die **inhärent Text/Zahlen enthalten**: "calendar", "dashboard", "analytics interface", "charts". Das Bildmodell rendert diese Objekte naturgemäß MIT Zahlen und Labels — egal wie stark die Negativ-Prompts sind. **Positive Prompt-Inhalte dominieren immer über Negativ-Prompts.**

## Verbesserungen seit letztem Render

- Keine menschlichen Silhouetten mehr (Script-Generator-Fix wirkt)
- CTA-Text vollständig sichtbar (Layout-Fix wirkt)
- Feature-Szene (iMac-Desk) ist nahezu perfekt

## Lösung: Zwei-Stufen-Filter

### Schritt 1: Script-Generator — Problematische Objekte verbieten

**Datei:** `supabase/functions/generate-universal-script/index.ts`

Neue Regel 15 hinzufügen:
- "NIEMALS Objekte beschreiben die inhärent Text oder Zahlen anzeigen: Keine Dashboards, Kalender, Charts, Diagramme, Bildschirme mit Daten, Monitore mit UI, Analytics-Interfaces, Spreadsheets, Whiteboards mit Notizen. Stattdessen die PHYSISCHE Umgebung beschreiben: Möbel, Pflanzen, Lampen, Büromaterial, Architektur, Beleuchtung."

Beispiel im JSON-Schema aktualisieren:
- Alt: "monitors showing colorful campaign interfaces"
- Neu: "a tidy desk with a closed laptop, potted plants, a warm desk lamp, bright office with glass walls, golden hour light"

### Schritt 2: Auto-Generate — Keyword-Sanitizer vor Bildgenerierung

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Einen Sanitizer einfügen, der vor dem API-Call problematische Keywords aus der `visualDescription` ersetzt:
- "dashboard" → "desk setup"
- "calendar" → "organized workspace"
- "analytics" / "chart" / "graph" / "statistics" → "clean workspace"
- "monitor showing" / "screen displaying" → "monitor on a desk"
- "spreadsheet" / "data" → "office supplies"

Dies ist ein Sicherheitsnetz falls das Script-Modell die Regeln ignoriert.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/generate-universal-script/index.ts` | Regel 15: Objekte mit inhärentem Text verbieten |
| `supabase/functions/auto-generate-universal-video/index.ts` | Keyword-Sanitizer als Sicherheitsnetz |

## Erwartetes Ergebnis

- Hintergründe zeigen atmosphärische Umgebungen statt Daten-Interfaces
- Kein Kalender, kein Dashboard, keine Charts mehr in AI-Bildern
- Geschätzter Qualitätsstand: **~97%**

## Hinweis

Reine Edge-Function-Änderungen — kein Bundle-Redeploy nötig.

