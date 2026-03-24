

# Plan: Erklärvideo Studio löschen + Hintergrund-Ersatz → Smart Background umbenennen

## 1. Erklärvideo Studio vollständig löschen

### Zu löschende Dateien
- `src/pages/ExplainerStudio.tsx`
- `src/components/explainer-studio/` (ganzer Ordner, 14+ Dateien)
- `src/types/explainer-studio.ts`
- `src/hooks/useExplainerScript.ts`
- `supabase/functions/generate-explainer-script/index.ts`
- `supabase/functions/auto-generate-explainer/index.ts`
- `supabase/functions/render-explainer-video/index.ts`
- `supabase/functions/check-explainer-render/index.ts`

### Zu bearbeitende Dateien

| Datei | Änderung |
|-------|----------|
| `src/App.tsx` | Import + Route `/explainer-studio` entfernen |
| `src/components/AppSidebar.tsx` | Eintrag `/explainer-studio` entfernen |

**Hinweis:** Die `explainer`-Kategorie im Universal Video Creator bleibt bestehen — das ist ein separates Feature mit eigener Pipeline.

---

## 2. Hintergrund-Ersatz → „Smart Background" umbenennen

| Datei | Änderung |
|-------|----------|
| `src/components/AppSidebar.tsx` | `titleKey` von `nav.backgroundReplacer` → neuen Key oder direkt „Smart Background" |
| `src/lib/translations.ts` | `backgroundReplacer` → „Smart Background" (EN), „Smart Background" (DE), „Smart Background" (ES) |
| `src/components/background/BackgroundReplacerHeroHeader.tsx` | Titel-Text auf „Smart Background" ändern |
| `src/pages/BackgroundReplacer.tsx` | Seitentitel/Header auf „Smart Background" |
| `src/pages/MediaLibrary.tsx` | Toast-Texte „Hintergrund-Ersatz" → „Smart Background" |

