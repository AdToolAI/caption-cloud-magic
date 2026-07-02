## Bug: Ein Undo-Klick springt bis zum allerersten Schritt zurück

Ursache liegt komplett in `src/hooks/useEditorHistory.ts` + wie `CapCutEditor` ihn benutzt. Zwei strukturelle Fehler kaskadieren:

### 1. `commit()` verwirft den pending Snapshot statt ihn zu flushen

```ts
const commit = useCallback(() => {
  if (debounceRef.current) {
    clearTimeout(debounceRef.current);       // ← cancelt den geplanten Push
    debounceRef.current = null;
  }
}, []);
```

Der Undo-Button ruft `history.commit(); history.undo();`. `commit()` löscht den Timer, der Snapshot für die *letzte Aktion* landet nie in `past`, und `undo()` popt stattdessen einen viel älteren Zustand. Kombiniert mit Bug 2 = Sprung zum Anfang.

### 2. Effect-Cleanup killt den Debounce bei jedem Re-Render

```ts
useEffect(() => {
  ...
  return () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);  // ← feuert bei JEDEM re-render
  };
}, [state, enabled, equals]);
```

Dependencies enthalten `state` — d.h. jede weitere Szenen-/Audio-Änderung baut den Effect ab und der Cleanup canceled den 350ms-Timer, bevor er je Push machen kann. `past` bleibt in der Praxis leer bis auf den allerersten Snapshot.

### 3. Debounce coalesced verschiedene Aktionen

350ms Fenster + JSON.stringify-Equality → Trim + Split + Move innerhalb kurzer Zeit werden zu einem einzigen Undo-Schritt zusammengefasst statt drei.

## Fix — `src/hooks/useEditorHistory.ts`

1. **`commit()` synchron flushen**: Timer clearen UND den pending `previous`-Wert direkt in `past` schieben. Dafür `previous` in einem `pendingRef` mitpflegen, das im Effect gesetzt wird.
2. **Effect-Cleanup entfernen** — Timer nur bei Unmount canceln (separater one-shot Effect mit leerem Dep-Array).
3. Debounce auf 200 ms senken (nur noch Safety-Net gegen Slider-Drag-Bursts).

## Fix — `src/components/directors-cut/studio/CapCutEditor.tsx`

Vor jeder diskreten Nutzeraktion `history.commit()` aufrufen, damit jeder Schritt exakt ein Undo-Step ist:

- `handleTrimScene` (Start-/End-Trim commit)
- `handleSplitAtPlayhead` / `handleSplitAtTrim`
- `handleDeleteScene` / Ripple-Delete
- `handleInsertClip` (Media-Import in Timeline)
- Reorder / Move-Handler

Reihenfolge pro Aktion: `history.commit()` → State-Update. Der Debounce bleibt für Slider-Drags als Fallback.

## Verifikation

1. Video importieren → Szene splitten → Trim vorne setzen → Szene löschen. Undo-Button zeigt „3 Schritte". Erster Klick: Löschung rückgängig. Zweiter: Trim zurück. Dritter: Split zurück.
2. Slider-Drag am Trim-Handle: nach dem Loslassen genau **ein** Undo-Step (Debounce fasst zusammen).
3. Ctrl+Z per Tastatur verhält sich identisch zum Button.

## Nicht betroffen

- Kein Backend-/Render-Pfad ändert sich.
- `useComposerHistory` (DB-basiert, Composer) bleibt unangetastet.
- Andere Consumer von `useEditorHistory` gibt es aktuell nicht.
