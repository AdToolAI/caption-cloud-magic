

## Plan: State bei Navigation beibehalten, bei F5 zurücksetzen

### Problem
Aktuell wird `clearDraft()` bei jedem Mount der DirectorsCut-Komponente aufgerufen (Zeile 144–150). Das heißt: auch bei SPA-Navigation (z.B. in die Sidebar und zurück) geht alles verloren. Der Draft liegt in `sessionStorage`, was F5 eigentlich überlebt — das ist das Gegenteil vom gewünschten Verhalten.

### Lösung

**1. F5-Erkennung statt blindem Clear** (`DirectorsCut.tsx`, Zeile 144–150)
- `performance.getEntriesByType('navigation')` prüfen: wenn `type === 'reload'` → `clearDraft()` aufrufen
- Sonst: `loadDraft()` aufrufen und alle States damit initialisieren (Video, Szenen, Audio, Effekte etc.)

**2. Draft beim Mount wiederherstellen** (`DirectorsCut.tsx`)
- Wenn kein Reload UND Draft vorhanden → alle `useState`-Initialwerte aus dem Draft setzen
- Alternative: Lazy Initializer in `useState(() => draft?.field ?? default)` für alle relevanten States

**3. Technische Umsetzung**
```text
// Pseudo-Code
const isPageReload = performance.getEntriesByType('navigation')[0]?.type === 'reload';

useEffect(() => {
  if (isPageReload) {
    clearDraft();           // F5 → Reset
  } else {
    const draft = loadDraft();
    if (draft?.selectedVideo) {
      setSelectedVideo(draft.selectedVideo);
      setScenes(draft.scenes || []);
      // ... alle anderen States
    }
  }
}, []);
```

### Dateien
- **Edit**: `src/pages/DirectorsCut/DirectorsCut.tsx` — Mount-Logik: Draft laden statt löschen, F5-Erkennung

