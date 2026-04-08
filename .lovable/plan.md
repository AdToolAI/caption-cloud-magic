

## Plan: Szenen-Management komplett neu — groß, klar, voll interaktiv

### Problem

Die Szenen-Blöcke auf der Timeline sind 48px kleine Kästchen mit nur einer Zahl. Delete ist ein 4px roter Punkt bei Hover. Kein Split-Button, keine Trim-Handles, kein visuelles Feedback. Nutzer können Szenen weder anpassen noch sinnvoll verwalten.

### Lösung

**Video-Track auf 80px vergrößern** und jeden Szenen-Block zu einem vollwertigen, interaktiven Element umbauen:

```text
┌──────────────────────────────────────────────────┐
│ ▌  ⠿  [1]  Roboter und Menschen arbei...   ✂ 🗑 ▌│  80px
│ T       0:00 – 0:06  (6.0s)                    T│
│ R                                               R│
│ I  ════════════════════════════════════════════  I│
│ M       ▓▓▓▓▓▓▓▓▓▓▓▓ Farbverlauf ▓▓▓▓▓▓▓▓▓▓   M│
└──────────────────────────────────────────────────┘
  ↑ Trim links (cursor-ew-resize)        Trim rechts ↑
```

### Änderungen

**1. `CapCutTimeline.tsx` — DraggableScene komplett neu**

- **Video-Track Höhe**: `TRACK_HEIGHT` bleibt 48 für Audio, neues `VIDEO_TRACK_HEIGHT = 80` nur für Video
- **Szenen-Block zeigt:**
  - Grip-Handle (⠿) — **immer sichtbar**, nicht nur bei Hover
  - Szenen-Nummer in Badge
  - Beschreibung (truncated)
  - Zeitangabe: `0:00 – 0:06 (6.0s)`
  - ✂ Split-Button (oben rechts) — splittet am Playhead **wenn er über dieser Szene steht**
  - 🗑 Delete-Button (oben rechts neben Split) — **immer sichtbar**, nicht nur bei Hover
- **Trim-Handles**: Links und rechts 6px breite Bereiche mit `cursor-ew-resize`. Bei Drag: `start_time` / `end_time` anpassen (min 1s Dauer). Visueller Indikator (heller Strich) bei Hover.
- **Farbverlauf**: Verschiedene Farben pro Szene-Index (indigo, purple, blue, emerald, amber), Blackscreen = dunkler
- **Split-Indikator**: Gestrichelte vertikale Linie am Playhead innerhalb des Video-Tracks

**2. `CapCutTimeline.tsx` — Neue Props**

- `onSplitAtPlayhead?: () => void` — für den ✂ Button direkt auf der Szene
- `onTrimScene?: (sceneId: string, newStart: number, newEnd: number) => void` — für Trim-Handles

**3. `CapCutEditor.tsx` — Trim-Handler + Props durchreichen**

- `handleTrimScene(sceneId, newStart, newEnd)` — aktualisiert die Szene und synchronisiert nachfolgende Szenen
- Beide neuen Props an `CapCutTimeline` weitergeben

**4. `CutPanel.tsx` — Szenenliste erweitert**

- Editable Szenen-Name (Klick → Inline-Edit)
- Start/End-Zeit per Eingabefeld anpassbar (nicht nur per Trim-Handle)
- "Neue leere Szene" Button direkt in der Liste

### Dateien

| Aktion | Datei |
|--------|-------|
| Stark editieren | `CapCutTimeline.tsx` — DraggableScene neu, VIDEO_TRACK_HEIGHT, Trim-Handles, Split-Button, Split-Indikator |
| Editieren | `CapCutEditor.tsx` — handleTrimScene + Props |
| Editieren | `CutPanel.tsx` — Inline-Edit für Name und Zeiten |

### Ergebnis

Szenen sind groß, zeigen Name + Dauer + Zeitbereich. ✂ und 🗑 sind immer sichtbar. Trim-Handles an den Rändern erlauben In/Out-Anpassung per Drag. Split-Indikator zeigt wo geschnitten wird. Nutzer hat volle Kontrolle über Anzahl und Grenzen aller Szenen.

