

## Plan: AI-Skript für leere Untertitel generieren

### Feature
Nach dem Erstellen leerer Untertitel erscheint ein neuer Button "KI-Skript für Untertitel". Der User beschreibt kurz das Thema (z.B. "Werbung für Firma XY"), die KI generiert ein Skript passend zur Gesamtdauer aller Untertitel-Slots und füllt sie automatisch.

### Umsetzung

**1. Neue Edge Function** `supabase/functions/generate-subtitle-script/index.ts`
- Erhält: `idea`, `segments` (Array mit `{startTime, endTime}`), `tone`, `language`
- Berechnet Gesamtdauer und Wort-Budget aus den Segmenten
- Prompt: "Schreibe ein Skript mit genau N Segmenten, jedes Segment hat X Sekunden Sprechzeit"
- KI liefert ein Array von Texten zurück, eines pro Segment
- Nutzt Lovable AI Gateway (`google/gemini-2.5-flash`)

**2. UI in CapCutSidebar.tsx** (nach dem "Leere Untertitel erstellen"-Button, Zeile ~1233)
- Nur sichtbar wenn leere Untertitel existieren (`existingCaptions.length > 0 && existingCaptions.some(c => !c.text)`)
- Textarea für Themenbeschreibung + Tone-Select (Freundlich/Professionell/Energetisch)
- "KI-Skript generieren" Button
- Bei Erfolg: jeder leere Untertitel-Slot wird mit dem passenden Segment-Text gefüllt via `onCaptionsGenerated`

**3. Translations** `src/lib/translations.ts`
- Neue Keys: `dc.aiSubtitleScript`, `dc.aiSubtitleScriptDesc`, `dc.aiSubtitleScriptPlaceholder`, `dc.generateSubtitleScript`, `dc.subtitlesFilled` (DE/EN/ES)

### Dateien
- **Neu**: `supabase/functions/generate-subtitle-script/index.ts`
- **Edit**: `src/components/directors-cut/studio/CapCutSidebar.tsx` — UI für Skript-Input + Fill-Logik
- **Edit**: `src/lib/translations.ts` — Neue Übersetzungskeys

