# Finale Sprachprüfung der englischen UI

Der automatische Konsistenz-Check (`scripts/check-i18n-consistency.mjs`) läuft grün, ein eigener Roh-Scan über `src/` findet aber weiterhin **368 verdächtige deutsche Textstellen in 205 Dateien**. Diese Reste erscheinen in der englischen UI weiterhin auf Deutsch.

## Was noch offen ist (belegt durch Scan)

Beispiele aus dem Scan:

- `src/components/video-composer/SceneDialogStudio.tsx` (14 Stellen)
- `src/components/ai-video/ToolkitGenerator.tsx` (10)
- `src/pages/legal/AutopilotAUP.tsx` (9), `src/pages/legal/AIVideoRefundPolicy.tsx` (5)
- `src/lib/autopilot/preflight.ts` (8), `src/components/video-composer/ClipsTab.tsx` (8)
- `src/pages/MediaLibrary.tsx` (7), `src/components/directors-cut/steps/SceneAnalysisStep.tsx` (7)
- Toasts wie `Carousel erfolgreich erstellt!` (`src/pages/Carousel.tsx`), `Fehler beim Laden` (`src/components/admin/RenderLoadWidget.tsx`), `placeholder="(keine)"` (`src/pages/AITextStudio.tsx`), `aria-label="Löschen"` (`SceneSnippetPicker.tsx`), `"Speichern & Auto-Publish"` (`PlatformRingDialog.tsx`)

Zusätzlich gibt es lokale `t()`-Helfer mit unterschiedlicher Argument-Reihenfolge. In `StylePresetPicker.tsx` ist die Signatur `t(lang, de, en, es)`; in `SaveAsAssetMenu.tsx` stehen Aufrufe wie `t(language, 'Cancel', 'Abbrechen', 'Cancelar')`. Eine der beiden Reihenfolgen ist falsch — das muss pro Datei gegen die dort importierte/definierte Signatur geprüft werden, sonst sieht die englische UI Deutsch und umgekehrt.

## Vorgehen

1. **Vollständiges Inventar erstellen**: Scanner-Skript über `src/` (Komponenten, Seiten, Hooks, Lib) laufen lassen und alle Treffer als JSON-Inventar ablegen (Datei, Zeile, Text). Kommentare, `de:`-Felder des Wörterbuchs und Tests werden ausgeschlossen.
2. **Signatur-Audit der `t()`-Helfer**: Alle lokalen `t(lang, …)`-Definitionen einsammeln und jeden Aufruf gegen die richtige Reihenfolge prüfen; vertauschte Aufrufe korrigieren.
3. **Lokalisierung in Paketen**: Das Inventar in ~10 Pakete aufteilen und parallel abarbeiten. Jeder deutsche String wird auf `tx({ de, en, es })` bzw. das vorhandene Wörterbuch umgestellt — inklusive Toasts, Placeholders, `aria-label`, `title`, Select-Optionen und leeren Zuständen.
4. **Rechtstexte** (`src/pages/legal/*`) gesondert behandeln: vollständige EN/ES-Fassungen statt Wort-für-Wort-Ersetzungen.
5. **Verifikation**: Roh-Scan erneut ausführen (Ziel: 0 Treffer), `check-i18n-consistency.mjs`, Typecheck und Build. Anschließend Stichproben-Durchgang der Hauptrouten im Browser auf `en`, mit Screenshots der wichtigsten Seiten (Dashboard, AI Video Studio, Video Composer, Director's Cut, Media Library, Account, Legal).

## Technische Details

- Zentrale Helfer bleiben `src/lib/i18nText.ts` (`tx`) und `src/lib/translations.ts`.
- Keine Änderungen an Logik oder Datenflüssen — reine Text-/Präsentationsebene.
- Visuelle Prompts für KI-Modelle bleiben laut Projektregel auf Englisch; deutsche Prompt-Strings in Generator-Code werden nur dann angefasst, wenn sie sichtbare UI-Texte sind.
- Nach der Wave wird der Scanner als Skript im Repo belassen, damit neue deutsche Literale künftig auffallen.
