

## Plan: Sidebar verbreitern + Übergänge zwischen Szenen im CutPanel

### Problem

1. **Sidebar zu schmal** — `w-72` (288px) schneidet Inhalte ab
2. **Keine Möglichkeit, Übergänge zu setzen oder zu entfernen** — `transitions` und `onTransitionsChange` werden zwar als Props durchgereicht, aber im CutPanel nicht genutzt

### Lösung

**1. Sidebar verbreitern** (`CapCutEditor.tsx`)

`w-72` → `w-80` (320px) an beiden Sidebar-Stellen (Zeile 1433 und 1696)

**2. Übergangs-Blöcke zwischen Szenen** (`CutPanel.tsx`)

Zwischen jeder Szene in der Szenen-Liste wird ein kleiner, anklickbarer Übergangs-Block eingefügt:

- **Standard: Kein Übergang** — der Block zeigt nur ein "+" Icon und "Übergang hinzufügen"
- **Bei Klick**: expandiert zu einem Mini-Grid mit Übergangstypen (Keine, Fade, Crossfade, Slide, Zoom, Wipe, Blur, Push) + Dauer-Slider (0.1s – 3.0s)
- **Aktiver Übergang**: wird farblich hervorgehoben mit Typ-Name und Dauer, kann per Klick auf "Entfernen" wieder gelöscht werden
- Der Übergang wird der **nachfolgenden** Szene zugeordnet (nutzt bestehendes `TransitionAssignment`-Interface)

Neue Props für CutPanel: `onTransitionsChange` (Callback)

**3. Props durchreichen** (`CapCutSidebar.tsx`)

`onTransitionsChange` an CutPanel weiterleiten

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Edit | `CapCutEditor.tsx` | `w-72` → `w-80`, `onTransitionsChange` an Sidebar |
| Edit | `CapCutSidebar.tsx` | `onTransitionsChange` an CutPanel durchreichen |
| Edit | `CutPanel.tsx` | Übergangs-Blöcke zwischen Szenen mit Typ-Auswahl + Dauer-Slider |

### Ergebnis

- Sidebar ist breiter, alle Inhalte sichtbar
- Zwischen jeder Szene kann optional ein Übergang gesetzt oder entfernt werden
- 8 Übergangstypen + einstellbare Dauer direkt im Schnitt-Panel

