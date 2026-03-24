

# Plan: Hook-Generator vollständig entfernen

## Zu löschende Dateien
- `src/pages/HookGenerator.tsx`
- `src/components/hook-generator/HookGeneratorHeroHeader.tsx` (+ Ordner)
- `supabase/functions/generate-hooks/index.ts` (+ Ordner)

## Zu bearbeitende Dateien

| Datei | Änderung |
|-------|----------|
| `src/App.tsx` | Import + Route `/hook-generator` entfernen |
| `src/components/AppSidebar.tsx` | Eintrag `hook-generator` aus Erstellen-Array entfernen |
| `src/components/ui/CommandBar.tsx` | Hook-Generator-Eintrag (Zeile 66) entfernen |
| `src/components/CommandPalette.tsx` | Hook-Command (Zeile 34) entfernen |
| `src/lib/translations.ts` | `hookGenerator`-Key in allen 3 Sprachen + gesamten `hooks`-Block (DE) entfernen |
| `src/features/recommendations/RecoCard.tsx` | Hook-Empfehlung entfernen oder auf `/generator` umleiten |
| `src/components/analytics/AnalyticsDashboard.tsx` | `hooks_history`-Query entfernen/anpassen |
| `supabase/functions/ai-queue-worker/index.ts` | `hooks`→`generate-hooks` Mapping entfernen |
| `supabase/functions/edge-function-warmer/index.ts` | `generate-hooks` aus Warmer-Liste entfernen |

**Hinweis:** Die `hooks_history`-Tabelle in der Datenbank bleibt bestehen (historische Daten). Sie kann bei Bedarf separat gelöscht werden.

