

## Befund

Aktuell zeigt jede Szenenkarte (`SceneCard.tsx`) bei AI-Quelle drei separate Hinweis-Boxen (Blau/Amber/Rot). Das wirkt redundant und unprofessionell, wenn 5 Szenen vorhanden sind = 15 Boxen.

Besser: **Ein** zusammengefasster Hinweis-Block **einmal oben** im Storyboard-Tab, gut sichtbar oberhalb aller Szenen.

## Plan

### 1. Hinweise aus `SceneCard.tsx` entfernen
Die drei Boxen (Z. ~198–217: Blau "Prompt-Vorlage", Amber "Personen-Variation", Rot "Credits-Warnung") komplett aus der Szenenkarte entfernen. Auch die nicht mehr benötigten Icon-Imports (`Lightbulb`, `AlertTriangle`, `CreditCard`) bereinigen.

### 2. Neuer kombinierter Hinweis-Block in `StoryboardTab.tsx`
Direkt **unter der Summary-Bar** (über der Szenenliste) eine elegante Hinweis-Karte einfügen — im James-Bond-2028-Stil:
- Glasmorphismus-Hintergrund (`bg-card/40 backdrop-blur-sm border border-amber-500/20`)
- Linker goldener Akzent-Strich (vertikale Linie, passend zum Enterprise-Status-Pattern)
- Überschrift "Wichtige Hinweise zur AI-Generierung" mit `Sparkles`-Icon in Gold
- Drei kompakte Bullet-Points (statt drei Boxen):
  1. **Prompt-Qualität:** Präzise Prompts liefern bessere Ergebnisse — passe die Vorlage an dein Produkt/deine Marke an.
  2. **Personen-Konsistenz:** AI-generierte Personen können zwischen Szenen variieren. Für konsistente Charaktere setze auf abstrakte Szenen oder verwende Stock-Footage.
  3. **Credits-Verbrauch:** Credits werden **sofort** beim Generieren abgebucht — auch bei nicht passendem Ergebnis. Prüfe deinen Prompt sorgfältig vor dem Start.
- Optional: Klick-zum-Einklappen (Standardmäßig aufgeklappt, per `useState` zusammenklappbar) — für Power-User, die den Hinweis nach dem ersten Lesen wegklappen wollen. Status in `localStorage` persistieren.

### 3. Lokalisierung
Bestehende Keys in `src/lib/translations.ts` umbenennen/zusammenführen:
- `videoComposer.aiTipsTitle` — "Wichtige Hinweise zur AI-Generierung" / "Important AI Generation Tips" / "Notas importantes sobre la generación con IA"
- `videoComposer.aiTipPrompt` — Prompt-Qualität-Text (DE/EN/ES)
- `videoComposer.aiTipPersons` — Personen-Konsistenz-Text (DE/EN/ES)
- `videoComposer.aiTipCredits` — Credits-Warnung-Text (DE/EN/ES)
- `videoComposer.aiTipsCollapse` / `aiTipsExpand` — "Hinweise ausblenden" / "Hinweise einblenden"

Alte, jetzt ungenutzte Keys aus `SceneCard` (falls vorhanden) entfernen.

### 4. Bedingte Anzeige
Hinweis-Block nur anzeigen, wenn **mindestens eine Szene** mit `clipSource === 'ai'` existiert. Bei reinen Stock-Workflows wird er ausgeblendet → kein Visual Noise.

## Geänderte Dateien
- `src/components/video-composer/SceneCard.tsx` — Drei Hinweis-Boxen + Icon-Imports entfernen
- `src/components/video-composer/StoryboardTab.tsx` — Neuer kombinierter Hinweis-Block mit Collapse + localStorage
- `src/lib/translations.ts` — Konsolidierte Keys (DE/EN/ES)

## Verify
- Storyboard-Tab mit AI-Szenen: **Ein** eleganter goldener Hinweis-Block direkt unter der Summary-Bar
- Szenenkarten sind aufgeräumt — keine wiederholten Hinweis-Boxen mehr
- Klick auf "Hinweise ausblenden" → Block kollabiert, Status bleibt nach Reload erhalten
- Bei reinem Stock-Workflow (keine AI-Szenen): Hinweis-Block wird **nicht** angezeigt
- Sprachen DE/EN/ES korrekt durchgeschaltet

