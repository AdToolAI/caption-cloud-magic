

# Plan: KI-Reel-Skript Generator entfernen

## Zusammenfassung
Das gesamte Reel-Script-Feature wird aus der App entfernt — Seite, Komponenten, Route, Sidebar-Eintrag, Command-Bar-Einträge und die zugehörige Edge Function.

## Zu löschende Dateien
- `src/pages/ReelScriptGenerator.tsx`
- `src/components/reel-script/ReelScriptHeroHeader.tsx` (+ leerer Ordner `reel-script`)
- `supabase/functions/generate-reel-script/index.ts` (+ Ordner)

## Zu bearbeitende Dateien

| Datei | Änderung |
|-------|----------|
| `src/App.tsx` | Import + Route `/reel-script-generator` entfernen |
| `src/components/AppSidebar.tsx` | Eintrag `reel-script-generator` aus `erstellen`-Array entfernen, `Film`-Import bereinigen |
| `src/components/ui/CommandBar.tsx` | Reel-Script-Eintrag + `Film`-Import entfernen |
| `src/components/CommandPalette.tsx` | Reel-Script-Command entfernen |
| `src/lib/translations.ts` | `nav.reelScript` und `reelScript.*`-Block in allen 3 Sprachen entfernen |
| `supabase/functions/ai-queue-worker/index.ts` | `reel_script`-Mapping entfernen |

