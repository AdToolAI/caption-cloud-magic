

# Plan: Theme-Toggle reparieren & futuristischen Light-Mode erstellen

## Problem
Der Dark-Mode ist der Default (`:root` = dunkel), aber der ThemeToggle sucht nach einer `dark`-Klasse und toggled diese. Da Dark der Default ohne Klasse ist, funktioniert der Toggle nicht korrekt. Der Light-Mode muss stattdessen über die `.light`-Klasse aktiviert werden.

Außerdem ist der aktuelle Light-Mode generisch — er braucht ein futuristisches Redesign passend zum James-Bond-Theme.

## Änderungen

### 1. `src/components/ui/ThemeToggle.tsx` — Toggle-Logik fixen
- Default-State auf `'dark'` setzen (da Dark der Default ist)
- Statt `dark`-Klasse zu togglen, die `light`-Klasse hinzufügen/entfernen
- localStorage beim Start auslesen und anwenden
- Icons tauschen: Im Dark-Mode → Sun-Icon zeigen (zu Light wechseln), im Light-Mode → Moon-Icon (zu Dark wechseln)

### 2. `src/index.css` — Futuristischen Light-Mode designen
Die `.light`-Klasse bekommt ein modernes, futuristisches Farbschema:
- **Background**: Helles Silber-Weiß mit leichtem Blau-Schimmer (`220 25% 96%`)
- **Primary**: Elektro-Blau/Violet statt langweiligem Lila (`230 85% 55%`)
- **Accent**: Beibehaltenes Cyan für Konsistenz
- **Cards**: Reines Weiß mit subtilen blauen Schatten
- **Shadows/Glows**: Blaue Glows statt Gold (Light-Mode-Version)
- **Gradient-Variablen**: Light-Mode Gradients (blau→cyan statt gold→cyan)
- **Glass**: Helleres Glassmorphism mit weißem Frost-Effekt

### Technisch
- 2 Dateien: `ThemeToggle.tsx` + `index.css`
- Keine neuen Dependencies

