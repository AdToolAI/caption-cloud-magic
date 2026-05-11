# Plan — Visual Picker System: Vollendung in 5 Stages

Sequenzielle Implementierung der offenen Punkte nach Stage 8. Jede Stage ist in sich abgeschlossen und kann separat approved werden.

---

## Stage 9 — Memory-Flip & Dokumentation

**Ziel:** Den dokumentarischen Stand mit dem Code synchronisieren.

- `mem://design/studio-presets/comparable-thumbnail-rule.md` Status aktualisieren: "rule defined, predates" → "rule defined and applied to all 49 Shot Director tiles (6 axes, locked base scenes in `_bases/`)"
- `mem://index.md` Eintrag entsprechend nachziehen
- Kurzer Verweis auf `_bases/{axis}.jpg` als Referenz-Quelle für künftige Re-Edits

**Aufwand:** Trivial (nur Memory-Writes).

---

## Stage 10 — Visual QA Sweep der 49 Tiles

**Ziel:** Identitäts-/Wardrobe-/Location-Drift erkennen und gezielt re-editieren.

1. Browser-Screenshot der Shot-Director-Picker im Toolkit aufnehmen (alle 6 Achsen-Grids).
2. Per Sicht-Audit Drift-Kandidaten markieren (typische Risiken: lighting-axis verliert das Trenchcoat-Outfit; lens-axis driftet in Gesicht).
3. Pro driftende Kachel: einzelner `imagegen.edit_image`-Re-Run vom passenden `_bases/{axis}.jpg` mit verschärftem Identity-Lock.
4. Erwartete Größenordnung: 5–10 Re-Edits.

**Out of scope:** Keine Code-Änderungen, keine neuen Base-Scenes.

**Aufwand:** Klein bis mittel (abhängig von Drift-Anzahl).

---

## Stage 11 — Library-Hubs visualisieren (Pose / Wardrobe / Vibe / Prop)

**Ziel:** Die 4 bereits existierenden Variant-Tabellen (siehe Memory `pose-sheets-and-vibe-variants`) bekommen ein Comparable-Picker-UI nach demselben Muster wie Shot Director.

**Achsen:**
| Hub | Source | Variants |
|---|---|---|
| Avatar Pose | `avatar_pose_variants` | 4 pro Avatar |
| Avatar Wardrobe | `avatar_wardrobe_variants` | 4 Outfits |
| Location Vibe | `location_vibe_variants` | 5 Stimmungen |
| Location Prop | `location_prop_variants` | 4 Dressings |

**Arbeit:**
1. Neuer wiederverwendbarer `<VariantPickerGrid axis="pose|wardrobe|vibe|prop" entityId={…} />` analog zu `PresetGrid`, mit gleichem Comparable-Locking-Visual (eine Base-Composition pro Avatar/Location, nur die Achsen-Variable variiert).
2. Mounten in `/avatars` Detail-Drawer und `/brand-locations` Detail-Drawer.
3. Hover-/Active-State + selected-ring im Bond-2028-Stil.
4. Keine neuen Edge-Functions — die Variants werden bereits beim Anlegen generiert.

**Out of scope:** Keine neuen Variant-Generations-Pipelines, kein Marketplace-Hook.

**Aufwand:** Mittel (1 neue Komponente + 2 Mount-Punkte).

---

## Stage 12 — Cinematic Style Presets (12) vereinheitlichen

**Ziel:** Die 12 One-Click Director-Looks bekommen optional ein **zweites Vergleichs-Tile** mit einer gemeinsamen Base-Scene, sodass Nutzer beide Modi sehen können:
- **Identity-Tile** (Status quo) — der charakteristische Look-Look (Noir, Cyberpunk, …) in jeweils eigener passender Szene.
- **Comparable-Tile** (neu) — dieselbe Trenchcoat/Tokyo-Base-Scene mit dem Style-Preset angewendet.

**Arbeit:**
1. Neue Base-Scene `src/assets/studio-presets/_bases/style.jpg` (neutralerer Look damit Presets sichtbar sind).
2. 12 `imagegen.edit_image`-Calls, je Preset → `src/assets/studio-presets/style/{id}--compare.jpg`.
3. `CinematicStylePresetCard` bekommt einen Toggle "Identity / Comparable" oder zeigt beide nebeneinander.
4. Memory `cinematic-style-presets` ergänzen.

**Out of scope:** Keine Änderung an den Preset-Definitionen oder am Auto-Inject-Verhalten.

**Aufwand:** Klein bis mittel (1 Base + 12 Edits + UI-Toggle).

---

## Stage 13 — Filter / Color-Grading / Transitions / Scene-Anim Audit

**Ziel:** Sicherstellen, dass alle anderen Studio-Picker entweder dem **Comparable-Thumbnail**- oder dem **Animated-Tile**-Pattern folgen.

**Audit-Scope (laut Memory):**
- Director's Cut Filter Library (20 Filter + 10 Color-Gradings)
- Transitions Picker (`TransitionPreviewTile`)
- Scene-Animations (`SceneAnimationPreviewTile`)
- Ken-Burns Effect Picker

**Arbeit:**
1. **Audit-Pass** (read-only): Pro Picker prüfen: nutzt er bereits eine locked Base-Scene? Loopt Animation via `data-play`?
2. **Findings-Liste** mit pro-Picker-Status: ✅ konform / ⚠️ teilweise / ❌ inkonsistent.
3. **Fix-Pass** für non-konforme Picker:
   - Filter/Color-Grading (30 Tiles): Falls Tiles aktuell unterschiedliche Source-Bilder nutzen → Backfill von einer Base-Scene `_bases/filter.jpg` mit 30 Edits.
   - Transitions/Scene-Anim: Falls `data-play` nicht überall durchgezogen → angleichen.
4. Memory `comparable-thumbnail-rule.md` & `animated-tile-rule.md` final auf "applied universally" setzen.

**Out of scope:** Kein Re-Design der Picker selbst, keine neuen Filter.

**Aufwand:** Mittel (Audit klein, Fix-Pass abhängig von Findings, ggf. 30 Image-Edits).

---

## Reihenfolge & Risiko

1. Stage 9 (Memory) — sofort, blockiert nichts.
2. Stage 10 (QA) — vor allen Folge-Stages, damit Stage 8 als wirklich abgeschlossen gilt.
3. Stage 11 (Library-Hubs) — größter Nutzergewinn, eigenständig.
4. Stage 12 (Cinematic Presets) — kosmetisch, kann jederzeit.
5. Stage 13 (Filter-Audit) — Abschluss, vereinheitlicht das gesamte Picker-System.

Jede Stage einzeln approval-bar — bitte nach Approval Stage 9 starten.
