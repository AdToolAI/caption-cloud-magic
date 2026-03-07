

## Diagnose: Warum das Video minimalistisch aussieht

Aus den Screenshots und dem Code sind **3 konkrete Probleme** sichtbar:

### Problem 1: Text viel zu klein
`TextOverlayLayer` nutzt `fontSize: 42` — auf einem 1920×1080 Canvas ist das winzig. Screenshot 1 zeigt den Text kaum sichtbar auf schwarzem Hintergrund.

### Problem 2: Kein Kontrast-Overlay
Text liegt direkt auf dem Hintergrundbild ohne Dimming-Layer. Screenshot 2: "Der Zeitdieb im Alltag" verschwindet fast im bunten Bild.

### Problem 3: Ken Burns / Background-Animationen nicht angeschlossen
Das Payload liefert `backgroundAnimation` (zoomIn, panLeft etc.) und `animation` pro Szene, aber `SceneRenderer` (Zeile 451-463) ignoriert beides komplett — nur `BackgroundLayer` + `TextOverlayLayer`.

---

## Plan: Phase 1 vervollständigen + Phase 2 integrieren (ein Schritt)

### 1. TextOverlayLayer aufwerten
- `fontSize`: 42 → **72** (mit dynamischer Skalierung basierend auf Textlänge)
- Semi-transparenten **Darkening-Gradient** hinter dem Text einfügen (`linear-gradient(transparent, rgba(0,0,0,0.6))` für Position bottom, invertiert für top)
- Text-Shadow verstärken für bessere Lesbarkeit

### 2. Ken Burns in SceneRenderer integrieren
- `scene.backgroundAnimation` auswerten
- Bestehende Komponenten `ZoomIn`, `PanEffect` aus `src/remotion/components/animations/` um das Hintergrundbild wrappen
- Fallback: kein Animation-Wrapper wenn `type === 'none'`

### 3. Szenen ohne Bild: Gradient-Fallback verbessern
- Wenn `background.type === 'gradient'`: statt nur 2-Farben-Verlauf → visuell ansprechenderen Fallback mit Szenen-Titel groß zentriert + animiertem Gradient

### Betroffene Dateien
| Datei | Änderung |
|---|---|
| `src/remotion/templates/UniversalVideo.tsx` | TextOverlayLayer (fontSize, contrast overlay), SceneRenderer (Ken Burns integration) |

Nach Umsetzung: **Bundle deployen + Test-Render** um die Verbesserungen zu validieren.

