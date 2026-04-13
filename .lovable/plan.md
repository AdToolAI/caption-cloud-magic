

## Plan: Linke Sidebar breiter, rechte Sidebar schmaler

### Änderung
In `src/components/directors-cut/studio/CapCutEditor.tsx`:

- **Linke Sidebar**: `w-80` (320px) → `w-96` (384px) — mehr Platz für Audio-Effekte, Musik-Liste etc., kein Scrollbar nötig
- **Rechte Properties-Sidebar**: `w-80` (320px) → `w-64` (256px) — schmaler, da Properties weniger Platz brauchen

### Datei
- **Edit**: `src/components/directors-cut/studio/CapCutEditor.tsx` (2 Stellen: Zeile 1446 und 1711)

