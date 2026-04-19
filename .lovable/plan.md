

## Befund

Aktuell hat `PlatformRingDialog.tsx` 3 Tabs: **Inhalt** (Idee + Caption + Hashtags + Reasoning), **Medien** (Upload), **Zeitplan**. Der User will eine bessere Trennung:

1. **Tab "Vorschau"** (neu, primär) → Caption + Medien zusammen → fertiges Post-Mockup
2. **Tab "Strategie"** (umbenannt von Inhalt) → KI-Idee + Reasoning + Tipps + Strategie-Kontext (Phase, Wochenziel, Engagement-Insights)
3. **Tab "Zeitplan"** → bleibt

## Plan: Dialog-Tabs neu strukturieren

### Tab 1: **Vorschau** (Standard-Tab beim Öffnen)
Live-Mockup wie der finale Post aussieht — Caption + Medien Seite an Seite/übereinander:

```text
┌─────────────────────────────────┐
│ [IG Avatar] @username           │
├─────────────────────────────────┤
│                                 │
│   [ Medien-Preview / Upload ]   │  ← Drag&Drop, zeigt hochgeladene Bilder/Videos
│                                 │
├─────────────────────────────────┤
│ ❤ 💬 ✈                          │
│ @username Caption-Text hier...  │  ← Editierbare Caption (inline)
│ #hashtag1 #hashtag2             │
└─────────────────────────────────┘
[ Caption-Editor (Textarea) ]
[ Hashtags (Input) ]
[ ✨ Mit KI verbessern ]
```

- Plattform-spezifischer Mockup-Frame (IG/FB/X/LinkedIn/YouTube Style)
- Medien direkt im Mockup sichtbar → fühlt sich wie "fertiger Post" an
- Caption + Hashtags darunter editierbar

### Tab 2: **Strategie** (umbenannt von "Inhalt")
Erklärt **warum** dieser Post existiert und wo der User in der Gesamtstrategie steht:

```text
┌── Wo du gerade stehst ──────────┐
│ 📍 Woche 2 von 4 · Phase: Trust │
│ Level: Fortgeschritten           │
│ Engagement-Trend: ↑ +12%         │
└──────────────────────────────────┘

┌── Die Idee ──────────────────────┐
│ 💡 Behind the Scenes: Packing... │
│                                  │
│ Warum genau dieser Post?         │
│ Deine Story-Views sind 3x höher  │
│ als deine Feed-Posts. BTS-Content│
│ funktioniert besonders gut bei   │
│ deiner Zielgruppe (25-34).       │
└──────────────────────────────────┘

┌── Tipps für maximale Wirkung ────┐
│ ✓ Vertikales Format (9:16)       │
│ ✓ Erste 3 Sek = Hook             │
│ ✓ Posten Mo 21:00 (peak time)    │
│ ✓ Stories cross-posten           │
└──────────────────────────────────┘

┌── Was die KI über dich weiß ─────┐
│ Top-Format: Reels (78% Engage)   │
│ Beste Zeit: Mo/Mi/Fr 21:00       │
│ Top-Theme: Behind-the-Scenes     │
└──────────────────────────────────┘
```

Daten dafür kommen aus:
- `strategy_post.reasoning` (bereits vorhanden) → "Warum dieser Post"
- `profiles.experience_level` + `engagement_score` → Level/Trend
- `strategy_posts` Liste der Woche → "Woche X von Y"
- Neue/erweiterte Felder in `strategy_post`: `tips: string[]`, `phase: string` (z. B. "Trust Building", "Conversion") — wenn nicht vorhanden, aus `reasoning` per einfacher Heuristik ableiten oder leer lassen

### Tab 3: **Zeitplan** (unverändert)
Date/Time-Picker, Auto-Publish-Toggle.

### Backend — leichte Erweiterung
- `generate-week-strategy` Edge Function: AI-Prompt um zusätzliche Felder pro Post ergänzen:
  - `tips: string[]` (3–5 konkrete Action-Tipps)
  - `phase: string` (Trust Building / Awareness / Conversion / Retention / Community)
- Migration: `strategy_posts` bekommt `tips TEXT[]` und `phase TEXT` Spalten (nullable, idempotent).
- Bestehende Posts ohne diese Felder → Tab "Strategie" zeigt Reasoning + Standard-Tipps basierend auf Plattform.

### Frontend — Datei-Änderungen
- **`PlatformRingDialog.tsx`** komplett umstrukturieren:
  - Tabs: `["preview", "strategy", "schedule"]`, Default `preview`
  - Neue Sub-Komponente `PostPreviewMockup` (plattform-spezifisches Frame, Medien + Caption inline)
  - Neue Sub-Komponente `StrategyContextPanel` (Position in Wochenplan, Reasoning, Tipps, Engagement-Insights)
- **`useStrategyMode.ts`**: 
  - Hook `getWeekProgress(post)` → returns `{ weekIndex, totalWeeks, phase, level }` für Strategie-Tab
- **`generate-week-strategy/index.ts`**: AI-Prompt um `tips` + `phase` erweitern, Insert-Statement um neue Spalten ergänzen
- **Migration**: 2 neue Spalten auf `strategy_posts`

### Erwartetes Ergebnis
- **Vorschau-Tab** zeigt direkt beim Öffnen den fertig aussehenden Post mit Medien + Caption → User sieht sofort, was gepostet wird.
- **Strategie-Tab** erklärt Position in der Strategie (Woche X von Y, Phase, Level, Engagement-Trend) + warum genau dieser Post + konkrete Tipps + KI-Insights über den User.
- **Zeitplan-Tab** unverändert für Time-/Date-Anpassung.
- Der User versteht jeden Vorschlag im Kontext seiner Reise — keine Black-Box mehr.

