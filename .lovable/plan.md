

## Plan: Top-Leiste entfernen + „Deine Videos"-Header schlanker machen

### Änderungen in `src/pages/Home.tsx`

**1. Top-Bar komplett entfernen**
Die schmale Leiste oben mit „💡 Tipp des Tages · ∞ Unbegrenzte Credits · 🕐 Nächster Post" wird vollständig entfernt.

**2. „Deine Videos (10)"-Überschrift entfernen**
Der Titel-Block links neben den Action-Buttons wird gelöscht. Die Action-Bar rückt nach links und gewinnt Platz.

**3. Drei Infos kompakt in die Action-Bar integrieren**
Links in der nun freien Action-Bar werden drei kleine Pills (h-9, rounded-full, Outline-Stil passend zu den vorhandenen Buttons) platziert:

- **💡 Tipp** — Icon-Button mit Hover-Tooltip (zeigt den vollen Tipp-Text). Platzsparend.
- **∞ Unlimited** — Gold-Akzent-Pill mit Infinity-Icon (Enterprise-Status, gemäß Memory `enterprise-status-display`).
- **🕐 Kein Post geplant** — Outline-Pill mit Clock-Icon.

**4. Layout-Ergebnis**
```text
[💡] [∞ Unlimited] [🕐 Kein Post]  |  [+ Schnell planen] [📅 Kalender] [📄 Vorlage] [📈 Performance]  ‹ ›
```

Darunter direkt die Video-Grid-Kacheln (ohne extra Header).

### Styling
- Höhe `h-9`, `rounded-full`, konsistent mit vorhandenen Buttons.
- Border `border-border/40`, Hintergrund leicht transparent (Glas-Look gemäß James Bond 2028 Memory).
- Gold-Akzent nur für das ∞-Icon (Enterprise-Marker).
- Icons aus `lucide-react`: `Lightbulb`, `Infinity`, `Clock`.

### Betroffene Datei
- `src/pages/Home.tsx`

### Erwartetes Ergebnis
- Mehr vertikaler Platz (zwei Zeilen weg: Top-Bar + Videos-Überschrift).
- Alle Infos bleiben sichtbar, nur kompakter.
- Action-Bar wirkt aufgeräumter und konsistent.
- Video-Grid rückt höher in den Viewport.

