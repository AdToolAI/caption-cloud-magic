

# Plan: Theme-Toggle Icons tauschen

## Problem
Die Icons sind vertauscht — der Mond sollte den Dark-Mode repräsentieren und die Sonne den Light-Mode. Aktuell zeigt der Dark-Mode die Sonne und der Light-Mode den Mond.

## Änderung

### `src/components/ui/ThemeToggle.tsx` — Icons swappen (Zeile 33-37)
Aktuell:
```tsx
{theme === 'dark' ? <Sun /> : <Moon />}
```
Ändern zu:
```tsx
{theme === 'dark' ? <Moon /> : <Sun />}
```

Eine Zeile, fertig.

