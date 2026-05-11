# Stage 14 — "Stil ändern"-Dialog visuell auf Studio-Niveau bringen

## Problem (was du siehst)

Im Composer → Szene → **Stil ändern → Feintuning → Shot Director** rendert die rechte Detail-Spalte aktuell **nur Textzeilen** ("Vogelperspektive · Subjekt wirkt klein.") statt der Thumbnail-Tiles, die wir in Stage 9–13 gebaut haben.

Grund: `SceneShotDirectorPanel` hat zwei Layouts:
- `popover` → nutzt `PresetGrid` (Thumbnails ✅, animierte Movement-Tiles ✅, Live-Effekte ✅)
- `master-detail` (verwendet im "Stil ändern"-Dialog) → eigene Text-Liste, **bypasst PresetGrid komplett**

Die ganzen Stages 9–13 (49 Shot-Director-Bilder, comparable thumbnails, motion tiles, locked base scenes) sind also gebaut, werden aber in diesem Dialog nicht gezeigt. Im AI Video Toolkit (popover-Layout) und in den restlichen Pickern sieht man sie sehr wohl.

## Fix (eine Datei, klein)

**Datei:** `src/components/video-composer/SceneShotDirectorPanel.tsx`

Im `MasterDetail`-Component (Zeilen ~213–256) den Text-`<button>`-Loop ersetzen durch:

```tsx
<PresetGrid
  category={active}
  options={SHOT_CATEGORIES[active]}
  selectedId={value[active]}
  onSelect={(id) => setCategory(active, id)}
  lang={lang}
/>
```

Damit bekommt der Dialog automatisch:
- 2-Spalten Thumbnail-Grid (`framing/establishing.jpg`-basierte comparable thumbnails)
- Animierte Tiles für `movement` (CSS-Loop on hover/active via `MovementPreviewTile`)
- Active-Checkmark + Hover-Border
- Identische Optik zum Toolkit-Picker → konsistent über das ganze Produkt

Die Beschreibungstexte (z.B. "Subjekt wirkt klein") landen weiterhin im `title=`-Tooltip jedes Tiles (so wie in `PresetGrid` schon implementiert).

## Verifikation

1. `/video-composer` → Szene öffnen → "Stil ändern" → Tab "Feintuning"
2. Linke Achsen-Liste klickbar (Winkel/Licht/Bewegung/…)
3. Rechte Spalte zeigt jetzt **Bild-Tiles** statt Text
4. "Bewegung" → Hover über Tile = CSS-Animation läuft
5. Selection-Sync zur Sidebar bleibt erhalten

## Was NICHT geändert wird

- Linke Master-Spalte (Achsen-Liste) — bleibt
- Header-Bar mit "Alle leeren" — bleibt
- `popover`-Layout — bleibt unverändert
- Keine neuen Assets, kein neuer State, keine API-Änderung

## Memory

Kein neuer Memory-Eintrag nötig — Stage 13 `comparable-thumbnail-rule` deckt diesen Fall bereits ab; der Dialog war schlicht eine Lücke in der Anwendung der Regel.

## Aufwand

~1 Edit, ~5 Zeilen netto, 1 Verifikations-Klick.
