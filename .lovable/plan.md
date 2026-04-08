

## Plan: James Bond 2028 Design Upgrade + erweiterte Filter-Bibliothek

### Problem

Der Director's Cut Studio sieht derzeit wie ein Standard-Dark-Mode-Editor aus (`bg-[#1a1a1a]`, `border-[#2a2a2a]`, etc.) — ohne das James Bond 2028 Design-System (Glassmorphism, Gold-Akzente, Cyan-Glow, Neon-Effekte), das im Rest der App verwendet wird. Außerdem gibt es nur 8 Filter und 6 Color Grades — zu wenig für einen professionellen Editor.

### Lösung

**1. Filter-Bibliothek massiv erweitern** (LookPanel.tsx)

Aktuelle 8 Filter → **20 Filter** in 4 Kategorien:
- **Klassisch**: Original, Cinematic, Vintage, Film Noir, Muted
- **Stimmung**: Warm, Cool, Golden Hour, Dreamy, Moody
- **Kreativ**: Vivid, Neon Nights, Cyberpunk, Cross Process, Lomography
- **Film**: Kodak Portra, Fuji Velvia, Technicolor, Bleach Bypass, Infrared

Aktuelle 6 Color Grades → **10 Color Grades**:
- Bestehende + Hollywood Blue, Sunset Glow, Forest Green, Coral Reef

**2. James Bond 2028 Styling** — Editor-Shell upgraden

Betroffene Elemente und ihre Änderungen:

| Element | Aktuell | Neu (James Bond 2028) |
|---|---|---|
| Header-Bar | `bg-[#242424]` flach | Glassmorphism `bg-[#0a0a1a]/80 backdrop-blur-xl` + subtile Gold-Border unten |
| Sidebar | `bg-[#1e1e1e]` flach | `bg-[#0a0a1a]/90 backdrop-blur-lg` + Cyan-Glow auf aktivem Tab |
| Tab-Trigger aktiv | `bg-[#00d4ff]/20` | Cyan-Glow-Ring `shadow-[0_0_12px_rgba(0,212,255,0.3)]` + Gold-Akzent-Linie |
| Timeline-Header | `bg-[#1a1a1a]` | Dunkler Gradient mit subtiler Scanline-Textur |
| Export-Button | Gradient blau-lila | Gold-Gradient `from-[#F5C76A] to-[#d4a843]` mit Glow |
| Szenen-Blöcke | `bg-[#6366f1]` | Glassmorphism + Cyan/Gold-Border je nach Selektion |
| Trennlinien | `border-[#2a2a2a]` | `border-[#F5C76A]/10` subtiler Gold-Shimmer |
| Properties-Panel | `bg-[#1e1e1e]` flach | Glassmorphism-Hintergrund |
| Studio-Titel | Weißer Text | Gold-Gradient-Text mit kleinem Glow |

**3. Glow-Effekte und Farbakzente hinzufügen**

- **Aktiver Tab**: Cyan-Glow-Shadow unter dem Icon
- **Playhead**: Gold-Glow-Linie statt einfacher gelber Linie
- **Szenen-Selection**: Cyan-Neon-Border mit Pulsieren
- **Sidebar-Sektions-Header**: Gold-Akzent-Punkt vor dem Text
- **Slider-Thumbs**: Cyan-Glow auf Hover
- **Filter-Kacheln (aktiv)**: Subtiler Glow-Ring in Cyan
- **Export-Button**: Gold mit Shimmer-Animation

### Dateien

| Aktion | Datei | Umfang |
|--------|-------|--------|
| Edit | `src/components/directors-cut/studio/sidebar/LookPanel.tsx` | 20 Filter + 10 Color Grades, Gold/Cyan-Styling auf Kacheln |
| Edit | `src/components/directors-cut/studio/CapCutEditor.tsx` | Header, Main-Shell: Glassmorphism + Gold-Akzente |
| Edit | `src/components/directors-cut/studio/CapCutSidebar.tsx` | Tab-Leiste: Glow-Effekte, Glassmorphism-Background |
| Edit | `src/components/directors-cut/studio/CapCutTimeline.tsx` | Szenen-Blöcke, Playhead: Gold/Cyan-Glow |
| Edit | `src/components/directors-cut/studio/sidebar/FXPanel.tsx` | Glassmorphism-Cards, Gold-Akzente auf Switch/Icons |
| Edit | `src/components/directors-cut/studio/sidebar/CutPanel.tsx` | Glassmorphism + Akzent-Farben |
| Edit | `src/components/directors-cut/studio/CapCutPropertiesPanel.tsx` | Glassmorphism-Background |

### Designprinzipien

- **Subtil, nicht überladen**: Gold- und Cyan-Akzente nur an interaktiven Elementen und Fokuspunkten
- **Glassmorphism nur auf Panels**: `backdrop-blur` + halbtransparente Backgrounds
- **Konsistenz**: Gleiche Glow-Intensität überall, gleiche Gold-Töne (`#F5C76A`)
- **Deep Black Base**: `#050816` / `#0a0a1a` als Basis statt `#1a1a1a`

