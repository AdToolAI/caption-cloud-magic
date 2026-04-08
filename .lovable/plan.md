

## Plan: Filter & Color Grading zum Funktionieren bringen

### Problem

Es gibt **zwei ID-Mismatches**, die dafür sorgen, dass weder Filter noch Color Grading im Video sichtbar werden:

**1. Filter-IDs:** LookPanel definiert 20 Filter mit eigenen IDs (z.B. `neon_nights`, `kodak_portra`, `fuji_velvia`, `technicolor`, `moody`). Die Preview-Komponente (`computeFilterForTime`) sucht aber in `AVAILABLE_FILTERS` aus `types/directors-cut.ts`, wo nur 21 Filter mit teils anderen IDs stehen. Einige IDs stimmen überein (`cinematic`, `vintage`, `noir`, `cyberpunk`, `dreamy`, `infrared`, `cross_process`, `bleach_bypass`), aber viele neue IDs aus LookPanel fehlen komplett → kein CSS-Filter wird angewendet.

**2. Color-Grading-IDs:** LookPanel sendet IDs wie `teal_orange`, `moonlight`, `matrix`, `hollywood_blue`, `sunset_glow`, `forest_green`, `coral_reef`. Die `NativePreviewEffects`-Komponente hat einen `COLOR_GRADE_MAP` mit völlig anderen Keys (`warm`, `cool`, `vintage`, `cinematic`, `sunset`, `forest`, `ocean`, `pastel`). **Kein einziger** LookPanel-Grading-Key existiert in der Map → Color Grading hat null Effekt.

### Lösung

**Datei 1: `src/types/directors-cut.ts`** — AVAILABLE_FILTERS erweitern

Alle fehlenden Filter-IDs aus LookPanel hinzufügen mit passenden CSS-Preview-Strings:
- `golden_hour`, `moody`, `neon_nights`, `lomography`, `kodak_portra`, `fuji_velvia`, `technicolor`

**Datei 2: `src/components/directors-cut/preview/NativePreviewEffects.tsx`** — COLOR_GRADE_MAP synchronisieren

Alle LookPanel-Grading-IDs mit CSS-Filtern hinzufügen:
- `teal_orange` → Teal-Shadows + Orange-Highlights
- `moonlight` → Blaue Kühle + niedriger Kontrast
- `golden_hour` → Warmes Sepia + Sättigung
- `matrix` → Grüner Hue-Rotate
- `hollywood_blue` → Blauer Tint
- `sunset_glow` → Warme Orange-Töne
- `forest_green` → Grüner Hue-Shift
- `coral_reef` → Pink/Coral Hue-Rotate
- `bleach_bypass` → Desaturiert + Kontrast

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Edit | `src/types/directors-cut.ts` | 7 fehlende Filter-IDs zu AVAILABLE_FILTERS hinzufügen |
| Edit | `src/components/directors-cut/preview/NativePreviewEffects.tsx` | 9 fehlende Color-Grade-Keys zu COLOR_GRADE_MAP hinzufügen |

### Ergebnis

Alle 20 Filter und alle 10 Color Grades werden sofort in der Video-Vorschau sichtbar, sowohl global als auch pro Szene.

