

## Plan: Localize Composer Page — All Components

### Problem
The entire Composer page (`/composer`) and all its sub-components still contain hardcoded German strings, visible when the UI language is set to English.

### Files & Changes (10 files)

| File | German Strings to Replace |
|------|--------------------------|
| **`src/lib/translations.ts`** | Add `composer` namespace with ~80 keys (EN/DE/ES) |
| **`src/components/composer/ComposerHeroHeader.tsx`** | "Content veröffentlichen", "Erstellen und veröffentlichen...", "Channels ausgewählt" |
| **`src/pages/Composer.tsx`** | "Post erstellen", "Verfassen Sie Ihre Nachricht...", "Standard", "Direkt", "Optimieren", "Voiceover", "Post-Inhalt", "Was möchten Sie teilen?", "Zusätzliche Beschreibung", "überschreitet das Character Limit...", "Jetzt posten", "Veröffentlichen...", "YouTube-Einstellungen konfigurieren", "Verbindungen verwalten", "Live-Vorschau", "So wird Ihr Post aussehen", all toast messages (~15 German toasts) |
| **`src/components/composer/CharacterCounter.tsx`** | "Wählen Sie Channels aus, um Zeichenlimits zu sehen" |
| **`src/components/composer/ComposerPreview.tsx`** | "Wählen Sie mindestens einen Channel...", "Vorschau erscheint nach Eingabe...", "YouTube Video-Vorschau", "Ihr Browser unterstützt kein...", "Bitte laden Sie ein Video hoch...", "Klicken Sie auf das ⚙️ Icon...", "Ihr Profil" |
| **`src/components/composer/ChannelSelector.tsx`** | "Ziel-Kanäle", "Einstellungen", "Wählen Sie mindestens einen Kanal aus" |
| **`src/components/composer/MediaUploader.tsx`** | "Ungültige Auswahl", "Bilder und Videos können nicht gemischt...", "Nur 1 Video erlaubt", "Zu viele Dateien", "Datei zu groß", "Ungültiger Dateityp", "Drag & Drop oder klicken zum Upload", "Max. 4 Bilder...", "Streaming-Video" |
| **`src/components/composer/PublishToSocialTab.tsx`** | "Plattformen auswählen", "Nicht verbunden", "Titel (YouTube)", "Video Titel für YouTube...", "Deine Caption...", "Beschreibung (YouTube)", "Veröffentlichung", "Sofort veröffentlichen", "Planen", "Datum auswählen", "Uhrzeit", "Veröffentliche...", "Jetzt veröffentlichen", "Veröffentlichung planen" |
| **`src/components/composer/YouTubeConfigModal.tsx`** | "YouTube Einstellungen", "Sichtbarkeit", "Öffentlich", "Nicht gelistet", "Privat", all description texts, "PFLICHT", "Kategorie", "Tags", "Erweiterte Einstellungen", "Lizenz", "Einbettbar", "Öffentliche Statistiken", "Abbrechen", "Speichern" |
| **`src/components/composer/ChannelConfigModal.tsx`** | "Einstellungen", "Medien-Profil", "Standard (keine Anpassung)", "Auto-Fix", "Medien automatisch anpassen", "Zeitversatz", "Sofort (+0h)", "+1 Stunde", etc., "Wasserzeichen (erweitert)", "Abbrechen", "Speichern" |
| **`src/components/optimization/OptimizationPanel.tsx`** | "AI-Optimierung", "Lass die KI deinen Post analysieren...", "Post optimieren", "Analysiere...", "Optimierungs-Score", "Beste Posting-Zeit", "Verbesserungsvorschläge", "Hoher/Mittlerer/Niedriger Impact", "Aktuell:", "Vorschlag:", "Alternative Hooks", "Verbesserung(en) anwenden", "Neu analysieren" |
| **`src/components/publishing/PlatformOptimizationHelper.tsx`** | All platform tips and specs (already shown in current-code) — ~20 strings |

### Approach
- Add `useTranslation` hook to each component
- Add all keys under `composer` namespace in translations.ts
- For `PublishToSocialTab.tsx`: also fix hardcoded `de` locale import to use dynamic locale based on language

### Result
The entire Composer page and all modals/panels will display fully in the selected language.

