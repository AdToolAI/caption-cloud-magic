

## Fix: Filter-Flackern beim Szenenwechsel

### Problem

Der `useTransitionRenderer` RAF-Loop setzt `base.style.filter = videoFilterRef.current` auf **jedem Frame** (Zeile 152-157). Aber `videoFilterRef` wird über eine React-Kette aktualisiert:

```text
visualTimeRef → displayTime (setState) → currentScene (useMemo) → videoFilter (useMemo) → videoFilterRef (useEffect)
```

Das ist 2-3 Frames Verzögerung. Beim Szenenwechsel zeigt der RAF-Loop noch den **alten** Filter für ~2ms, bevor React den neuen Wert durchpropagiert hat. Das erklärt:
- **Szene 3**: Nach dem Übergang kurz das ungefilterte Bild (alter Filter noch im Ref)
- **Szene 4**: Am Anfang kurz den Filter der vorherigen Szene (Ref noch nicht aktualisiert)

### Lösung

Den Filter **synchron im RAF-Loop** berechnen statt über den React-State-Umweg. Der Renderer kennt bereits `visualTimeRef.current` und die `scenes` — er braucht nur zusätzlich `sceneEffects` und `effects`, um den korrekten Filter direkt für die aktuelle Zeit zu bestimmen.

### Umsetzung

**1. `useTransitionRenderer.ts` — Neue Parameter + synchrone Filter-Berechnung**
- Zusätzliche Parameter: `scenes`, `effects`, `sceneEffects`, `AVAILABLE_FILTERS` (oder ein bereits vorberechneter Filter-Resolver-Callback)
- Sauberer Ansatz: Ein `computeFilterForTime(time)` Callback, der von `DirectorsCutPreviewPlayer` übergeben wird
- Im RAF-Loop: `const currentFilter = computeFilterForTime(visualTimeRef.current)` statt `videoFilterRef.current`

**2. `DirectorsCutPreviewPlayer.tsx` — Callback bereitstellen**
- `computeFilterForTime` als `useCallback` erstellen, der dieselbe Logik wie das `videoFilter`-Memo nutzt, aber für eine beliebige Zeit
- Szene-Lookup + Filter-Berechnung in einer Funktion zusammenfassen
- Diesen Callback als Ref an `useTransitionRenderer` übergeben (damit der RAF-Loop immer die aktuellste Version hat)

### Betroffene Dateien
- `src/components/directors-cut/preview/useTransitionRenderer.ts` — `videoFilterRef` durch `computeFilterRef` ersetzen
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — `computeFilterForTime` Callback + Ref erstellen und übergeben

### Ergebnis
- Filter wird synchron im selben RAF-Frame berechnet wie die Zeitposition
- Kein 2-3 Frame Delay mehr beim Szenenwechsel
- Keine sichtbaren Filter-Blitzer mehr

