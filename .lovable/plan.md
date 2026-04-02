

## Fix: Reframe-Transform wird vom Ken-Burns-Loop überschrieben

### Problem

Die Reframe-Einstellung (`scale` + `translateY`) wird korrekt als JSX-Inline-Style auf den `kenBurnsWrapperRef` gesetzt. Aber der RAF-Loop (requestAnimationFrame) überschreibt `kbWrapper.style.transform` **jeden Frame**:

- Mit Ken Burns aktiv: Zeile 678 setzt `scale(zoom) translate(panX%, panY%)` — Reframe fehlt
- Ohne Ken Burns: Zeile 683 setzt `transform: 'none'` — Reframe wird gelöscht

Das JSX-Style hat keine Chance, weil der imperative RAF-Code es sofort überschreibt.

### Lösung

Im RAF-Loop (Zeilen 662–684) muss der Reframe-Transform **mit** dem Ken-Burns-Transform kombiniert werden:

**Zeile 678** — Ken Burns aktiv:
```text
Vorher:  scale(zoom) translate(panX%, panY%)
Nachher: scale(zoom) translate(panX%, panY%) scale(safeZoom) translateY(safeOffsetY%)
```

**Zeile 683** — Ken Burns nicht aktiv:
```text
Vorher:  none
Nachher: scale(safeZoom) translateY(safeOffsetY%)  // oder 'none' wenn disabled
```

Dazu brauchen wir einen Ref für `subtitleSafeZone`, damit der RAF-Loop darauf zugreifen kann ohne React-Re-Renders.

### Betroffene Datei

`src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`:
1. Neuen `subtitleSafeZoneRef` anlegen (wie `kenBurnsRef`)
2. Helper-Funktion `buildSafeZoneTransform()` die den CSS-String liefert
3. In Zeile 678: Ken-Burns-Transform + Safe-Zone-Transform kombinieren
4. In Zeile 683: Statt `'none'` den Safe-Zone-Transform setzen (oder `'none'` wenn disabled)
5. JSX-Inline-Style auf dem Wrapper kann entfallen (wird sowieso überschrieben)

