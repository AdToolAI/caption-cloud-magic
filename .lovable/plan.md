

# Diagnose & Plan: Schwarze Szenen + Qualitätssprung zu Loft-Film-Niveau

## Analyse der Screenshots

Die Screenshots zeigen klar zwei Kernprobleme:

1. **Schwarze Szenen ab Szene 3+**: Die Bilder werden von `generate-premium-visual` (Replicate Flux) generiert. Wenn mehrere Szenen parallel erzeugt werden, schlagen einige fehl — der SVG-Fallback wird zwar generiert, aber `isValidRemoteUrl()` filtert SVG-Storage-URLs möglicherweise aus, oder die Remotion `<Img>` Komponente kann die SVG nicht laden. Das Ergebnis: `GradientFallback` (schwarz).

2. **Text ist nur ein kleiner Titel in der Mitte**: Aktuell setzt `auto-generate-universal-video` (Zeile 988-993) nur `scene.title` als `textOverlay.text`. Der eigentliche Inhalt — der **Voiceover-Text** (`scene.voiceover`) — wird nirgends visuell dargestellt. Bei Loft-Film steht IMMER ein aussagekräftiger Satz im Bild, nicht nur ein Titel wie "AdTool AI: Deine All-in-One Lösung!".

3. **Kein strukturiertes Layout**: Alles ist zentriert, gleiche Schriftgröße, keine Hierarchie. Loft-Film nutzt klare Aufteilungen (Headline oben, Beschreibung unten, Icon/Visual daneben).

## Root Causes

### Schwarze Szenen
- `generate-premium-visual` Aufrufe scheitern teilweise (Rate Limits, Timeouts bei parallelen Requests)
- SVG-Fallback-URLs aus Supabase Storage werden möglicherweise von `isValidRemoteUrl()` akzeptiert, aber die SVG-Datei kann von Remotion Lambda nicht gerendered werden (Lambda hat kein SVG-Rendering für `<Img>`)
- **Fix**: Robustere Retry-Logik + PNG-Fallback statt SVG + sequentielle statt parallele Bild-Generierung

### Minimaler Text
- `textOverlay.text = scene.title` → nur der Szenen-Titel (z.B. "Hook") wird angezeigt
- Der eigentliche Voiceover-Text wird nicht als visueller Text verwendet
- **Fix**: `textOverlay.text` auf den Voiceover-Text setzen, `scene.title` als Badge/Label verwenden

### Fehlendes Layout-System
- Aktuell: TextOverlay ist immer zentriert, eine Schriftgröße, keine Struktur
- **Fix**: Szenentyp-basiertes Layout-System (Split-Layouts, Headline+Subtitle, Badge+Text)

---

## Plan: 3 Schritte zum Loft-Film-Niveau

### Schritt 1: Schwarze Szenen eliminieren

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

- **Retry-Logik**: Wenn `generate-premium-visual` fehlschlägt, 2 Retries mit vereinfachtem Prompt
- **PNG-Fallback statt SVG**: `generateSVGPlaceholder` durch `generatePNGPlaceholder` ersetzen — ein einfarbiges PNG-Bild mit Gradient, das Remotion Lambda sicher rendern kann (kein SVG-Rendering nötig)
- **Sequentielle Batches**: Statt `Promise.all(alle 5+ Szenen gleichzeitig)` → Batches von 2-3 mit kurzer Pause, um Rate Limits zu vermeiden

### Schritt 2: Voiceover-Text als visuellen Haupttext verwenden

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts` (Zeile ~988)

Aktuell:
```
textOverlay: {
  enabled: true,
  text: scene.title || '',  // ← NUR der Titel!
}
```

Neu: Den Voiceover-Text als Haupttext, den Titel als Label/Badge:
```
textOverlay: {
  enabled: true,
  text: scene.voiceover || scene.title || '',  // ← Der gesprochene Text
  headline: scene.title || '',                  // ← Neues Feld: Headline
}
```

### Schritt 3: Professionelles Layout-System in der Remotion-Komponente

**Datei:** `src/remotion/templates/UniversalCreatorVideo.tsx`

Die `TextOverlay`-Komponente komplett neu gestalten mit einem szenentyp-basierten Layout:

**Hook/Intro Layout:**
```text
┌─────────────────────────────┐
│                             │
│      [HOOK Badge]           │
│   GROSSE HEADLINE           │
│   (72px, Bold, Glow)        │
│                             │
│   Unterstützender Text      │
│   (28px, 80% Opacity)       │
│                             │
└─────────────────────────────┘
```

**Problem/Solution Layout:**
```text
┌─────────────────────────────┐
│  [PROBLEM Badge]            │
│                             │
│  Kernaussage als            │
│  großer Text (48px)         │
│  mit Highlight-Wort         │
│                             │
│         ──── Gradient ────  │
└─────────────────────────────┘
```

**CTA Layout:**
```text
┌─────────────────────────────┐
│                             │
│   Hauptaussage (56px)       │
│                             │
│   ┌─────────────────┐       │
│   │  CTA-Button     │       │
│   └─────────────────┘       │
│                             │
└─────────────────────────────┘
```

Konkrete Änderungen an `TextOverlay`:
- **Typografie-Hierarchie**: Headline (48-72px, Bold) + Body (24-32px, Regular)
- **Scene-Type Badge**: Farbiges Label (z.B. "HOOK", "PROBLEM", "LÖSUNG") oben links
- **Smart Text-Kürzung**: Voiceover-Text auf max. 2 Zeilen kürzen (für visuelle Darstellung), Rest wird nur gesprochen
- **Position-System**: Hook/CTA = zentriert, Problem = unten-links, Solution = unten-rechts
- **Text-Shadow + Backdrop**: Stärkerer Kontrast durch mehrschichtige Schatten

### Dateien die geändert werden

| Datei | Änderung |
|---|---|
| `supabase/functions/auto-generate-universal-video/index.ts` | Retry-Logik, PNG-Fallback, sequentielle Batches, Voiceover als textOverlay.text |
| `src/remotion/templates/UniversalCreatorVideo.tsx` | TextOverlay komplett neu: Layout-System, Typografie-Hierarchie, Scene-Type Badges |

### Erwartetes Ergebnis

- **Keine schwarzen Szenen mehr** — jede Szene hat ein sichtbares Bild (echtes oder hochwertiges Fallback)
- **Lesbarer, aussagekräftiger Text** — der gesprochene Inhalt erscheint als großer, kontrastreicher Text
- **Strukturierte Layouts** — jeder Szenentyp hat ein eigenes, professionelles Layout
- **Typografie-Hierarchie** — Headlines groß und bold, Supporting-Text kleiner und dezenter
- **Visuell nahe an Loft-Film** — klare Komposition, nicht mehr "random Text über Bild"

