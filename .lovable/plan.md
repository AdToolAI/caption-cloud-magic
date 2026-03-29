

## Feature: Picture Studio State bei Navigation beibehalten

### Problem
Wenn man auf eine andere Seite navigiert und zurückkommt, sind Prompt, Einstellungen und generierte Bilder weg — weil `useState` beim Unmount gelöscht wird. Der User möchte den Zustand bei Navigation behalten, aber bei F5/Refresh soll alles zurückgesetzt werden.

### Lösung
Ein **modulbasierter In-Memory-Cache** (kein localStorage/sessionStorage, da diese auch bei F5 bestehen bleiben). Eine einfache Variable auf Modulebene, die den Zustand zwischen Mounts speichert, aber bei Page Reload automatisch leer ist.

### Änderungen

**1. Neuer Cache-Helper: `src/components/picture-studio/imageGeneratorCache.ts`**
- Exportiert `get/set/clear` Funktionen für einen modulweiten Cache
- Speichert: `prompt`, `style`, `aspectRatio`, `quality`, `editMode`, `referenceImage`, `generatedImages`
- Lebt nur im JS-Speicher → bei F5 automatisch weg

**2. `src/components/picture-studio/ImageGenerator.tsx`**
- Bei Mount: Initialwerte aus Cache lesen statt Defaults
- Bei jeder Änderung (Prompt, Style, generierte Bilder etc.): Cache aktualisieren
- Kein Cleanup bei Unmount → Daten bleiben für nächsten Mount erhalten

### Technisches Detail
```text
Navigation weg → Component unmounts → useState weg
                                     → Module-Cache bleibt ✓
Navigation zurück → Component mounts → liest aus Cache ✓

F5 Refresh → JS-Module neu geladen → Cache leer ✓
```

### Betroffene Dateien
| Datei | Änderung |
|---|---|
| `src/components/picture-studio/imageGeneratorCache.ts` | Neu: In-Memory-Cache |
| `src/components/picture-studio/ImageGenerator.tsx` | Cache lesen bei Mount, schreiben bei Änderung |

