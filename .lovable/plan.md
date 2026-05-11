# Stage 13 — Picker-System Final Audit & Polish

**Ziel:** Sicherstellen, dass *alle* visuellen Picker im Projekt entweder dem **Comparable-Thumbnail**-Pattern (locked Base-Scene + Effekt) oder dem **Animated-Tile**-Pattern (locked Base-Scene + CSS-Loop, gated by `data-play`) folgen. Anschließend die beiden Memory-Regeln auf "applied universally" setzen.

Damit ist die Picker-Architektur projektweit konsistent und das Stage-9–13 Vorhaben abgeschlossen.

---

## Vor-Audit (was bereits konform ist)

Schnell-Check hat ergeben:

- **Director's Cut Filter Library** (20 Filter, `LookPanel.tsx` → `FILTER_CATEGORIES`) → nutzt bereits `LookPresetTile` mit gemeinsamer `_bases`-Master-Scene + Live-CSS-Filter. ✅
- **Color Grading** (10 Grades, `LookPanel.tsx` → `COLOR_GRADES`) → nutzt ebenfalls `LookPresetTile` mit live CSS. ✅
- **Transitions Picker** (`TransitionPreviewTile.tsx`) → animiert via `data-play` (hover + active). ✅
- **Scene Animations** (`SceneAnimationPreviewTile.tsx`) → animiert via `data-play`. ✅
- **Movement Tiles** (`MovementPreviewTile.tsx`) → animiert via `data-play`. ✅
- **Cinematic Style Presets** → Stage 12 erledigt (Identity/Comparable Toggle).

D.h. der Audit dürfte überwiegend bestätigend sein. Trotzdem brauchts einen sauberen Pass, weil verstreute Stellen (DC-Steps, Studio-Visual-Library, ältere Selector-Komponenten, Visual-Effects-Step) Verdachtsfälle bleiben.

---

## Audit-Pass (read-only)

Pro Picker eine kurze Sicht- und Code-Prüfung. Output ist eine Findings-Tabelle:

| Picker | Datei | Pattern | Status |
|---|---|---|---|
| DC Filter Library (20) | `LookPanel.tsx` | Comparable | ✅ erwartet |
| DC Color Grading (10) | `LookPanel.tsx` | Comparable | ✅ erwartet |
| DC Transition Picker | `directors-cut/ui/TransitionPicker.tsx` | Animated | prüfen |
| DC Scene Animations | wo immer eingebunden | Animated | prüfen |
| DC Ken-Burns | `KenBurnsImage.tsx` + Picker | Animated | prüfen |
| Style-Look Step | `steps/StyleLookStep.tsx` | offen | prüfen |
| Visual-Effects Step | `steps/VisualEffectsStep.tsx` | offen | prüfen |
| Special-Effects Step | `steps/SpecialEffectsStep.tsx` | offen | prüfen |
| AI-Style-Transfer | `features/AIStyleTransfer.tsx` | offen | prüfen |
| Composer Visual Styles | `composerVisualStyles.ts` Picker | offen | prüfen |
| Video TransitionSelector | `components/video/TransitionSelector.tsx` | Animated | prüfen |

Nichts wird in dieser Phase verändert.

---

## Fix-Pass (nur für Findings ≠ ✅)

Pro Non-Konform-Picker eine der folgenden minimal-invasiven Maßnahmen — keine Re-Designs, kein Verhaltenswechsel:

1. **Picker zeigt nur Emoji/Text statt Visual** → Wrapper-Tausch auf `LookPresetTile` (für CSS-Filter-artige Effekte) oder ein Animated-Tile-Pendant. Kein neues Asset nötig wenn live-CSS reicht.
2. **Picker nutzt unterschiedliche Source-Bilder pro Tile** → Quelle vereinheitlichen auf bestehende Base-Scene (`_bases/framing.jpg` als Master).
3. **Animated-Tile loopt immer (statt nur bei hover/active)** → `data-play` Gating nachziehen wie in `MovementPreviewTile` / `TransitionPreviewTile`.
4. **Transition/Anim-Tiles ohne CSS-Keyframes** → existierende Klassen aus `motionTiles.css` einsetzen.

Out of scope: neue Filter, neue Animationen, neue Base-Scenes (außer `_bases/filter.jpg` falls ein Filter-Picker tatsächlich nicht auf Master-Scene gemappt ist).

---

## Memory-Updates (nach Fix-Pass)

- `mem://design/studio-presets/comparable-thumbnail-rule.md` → finaler Status: *"applied universally to Shot Director (49), Cinematic Style Presets compare-mode (12), DC Filter Library (20), DC Color Grading (10) — same locked base scene per family."*
- `mem://design/studio-presets/animated-tile-rule` → finaler Status: *"applied universally — all Transition/SceneAnim/Movement/Ken-Burns pickers loop via `data-play` (hover + active) on a locked base scene."*
- `mem://index.md` → die zwei Einträge auf den neuen Stand aktualisieren.

---

## Reihenfolge & geschätzter Aufwand

1. Audit-Pass (read-only) — ~5 Tool-Calls, ~5 min.
2. Findings-Report posten (kurz, tabellarisch).
3. Fix-Pass nur falls Findings ≠ leer — Aufwand klein bis mittel.
4. Memory-Updates — trivial.

**Gesamt:** klein bis mittel, je nach Findings. Falls alles ✅, ist Stage 13 nur Audit + Memory-Flip.

Nach Stage 13 ist der ursprüngliche 5-Stage-Plan vollständig abgeschlossen.
