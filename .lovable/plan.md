## Ja — mit diesem Fix schneidet der Splitten-Button endlich genau da, wo du die Trim-Werte setzt.

### Was heute schiefläuft

Du gibst im Inspector **Start = 2.1s** ein → das ändert nur die **Crop-Range** der Szene (Quelle wird gekürzt, keine neue Szene entsteht). Klickst du dann **„Splitten"**, feuert der alte Handler am **Video-Playhead** (`0:00`) — nicht am Trim-Wert. Weil Playhead exakt am Rand steht, blockt der 0.5 s-Guard mit *„Zu nah am Szenenrand"*. Das ist die falsche Semantik: dein Trim-Wert wird ignoriert.

### Fix

**A. Splitten-Button neu verdrahten (Trim → echte Schnitte)**

`SceneTrimInspector.tsx` + `CapCutEditor.tsx` bekommen einen neuen Handler `onSplitAtTrim`. Semantik nach CapCut-Vorbild:

- Splittet die Szene an den aktuell eingegebenen Trim-Grenzen `srcIn`/`srcOut` → produziert bis zu 3 echte Timeline-Segmente:
  1. `[hardMin, srcIn)` falls `srcIn > hardMin` (Head-Cut)
  2. `[srcIn, srcOut]` — dein getrimmter Bereich (bleibt selektiert)
  3. `(srcOut, hardMax]` falls `srcOut < hardMax` (Tail-Cut)
- Timeline-Positionen (`start_time` / `end_time`) werden fortlaufend gerippelt.
- `additionalMedia`, Filter, Effekte, `video_url` werden per Spread auf alle Segmente vererbt; jedes bekommt eine neue Scene-ID.
- Fallback: Wenn Trim = Full Source (nichts abgeschnitten), fällt der Button auf Playhead-Split zurück.

**B. Playhead-Split-Guard lockern**

`handleSplitAtPlayhead`: `0.5s`-Guard → `0.05s` (~1.5 Frames @ 30 fps). Zusätzlich splittet die Funktion jetzt auch die **Quellen-Range** (`original_start_time` / `original_end_time`), sodass beide Hälften wirklich unterschiedliche Video-Ausschnitte zeigen — nicht beide die ganze Quelle wie bisher.

**C. UX-Klarheit im Inspector**

- Splitten-Button aktiviert, sobald `srcIn > hardMin` **oder** `srcOut < hardMax` (mind. eine echte Trim-Grenze existiert) — nicht mehr abhängig vom Playhead.
- Tooltip: *„An Trim-Grenzen teilen (2.10s / 15.00s)"* mit deinen aktuellen Werten.
- **S**-Shortcut & Timeline-Toolbar-„Am Playhead teilen" bleiben unverändert für den Playhead-basierten Cut.

### Konkreter Workflow danach

1. Szene auswählen → Trim auf `2.1s` setzen → **Splitten** → Szene wird in `0-2.1s` + `2.1s-15s` aufgeteilt, beide bleiben auf der Timeline.
2. Oder Playhead auf `x` fahren + **S** → sauberer Split an dieser Stelle, auch dicht am Rand.

### Betroffene Dateien

- `src/components/directors-cut/studio/SceneTrimInspector.tsx` — neuer `onSplitAtTrim`-Prop, Enable-Logik, Tooltip.
- `src/components/directors-cut/studio/CapCutEditor.tsx` — `handleSplitAtTrim` implementieren, Guard lockern, Source-Range-Split in `handleSplitAtPlayhead`.
- `src/components/directors-cut/studio/CapCutPropertiesPanel.tsx` — Prop durchreichen.

Keine DB-, Edge-Function-, i18n- oder Dependency-Änderungen.