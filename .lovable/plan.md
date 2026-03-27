

## Fix: Filter im Preview Player nicht sichtbar

### Problem
Der `useTransitionRenderer` Hook schreibt direkt auf `element.style.filter = ''` — sowohl beim Zurücksetzen nach Transitions (`clearStyles`) als auch bei allen nicht-Blur-Transitions (`base.style.filter = ''`). Das **überschreibt** den von React gesetzten `filter`-Wert (der die visuellen Filter wie cinematic, vintage etc. enthält).

Da der rAF-Loop permanent läuft, wird `style.filter` ständig auf `''` gesetzt, selbst wenn keine Transition aktiv ist.

### Lösung
Den `useTransitionRenderer` so ändern, dass er **niemals** `style.filter` direkt setzt, außer beim Blur-Transition-Typ. Stattdessen einen separaten CSS-Ansatz für Blur verwenden oder den React-Filter als Basis beibehalten.

**Konkret in `useTransitionRenderer.ts`:**

1. **`clearStyles`**: `el.style.filter = ''` entfernen — Filter wird von React verwaltet
2. **`applyStyles`**: Alle `base.style.filter = ''` und `incoming.style.filter = ''` Zeilen entfernen
3. **Blur-Transition**: Statt `style.filter` direkt zu setzen, den Blur-Effekt über ein separates Wrapper-Element oder über eine CSS-Variable steuern, die den bestehenden Filter nicht überschreibt. Einfachste Lösung: Blur als zusätzlichen Filter **anhängen** statt zu ersetzen — dafür den aktuellen `filter`-Wert des Elements auslesen oder den Blur über ein eigenes Overlay-Div anwenden.

**Einfachster Ansatz**: Den `baseFilter` als Parameter an den Hook übergeben und bei Blur diesen als Prefix verwenden:

```typescript
// clearStyles: filter nicht anfassen
function clearStyles(el: HTMLElement) {
  el.style.opacity = '';
  el.style.transform = '';
  el.style.clipPath = '';
  // NICHT: el.style.filter = '';
}

// Blur-Transition: baseFilter beibehalten
case 'blur':
  base.style.filter = `${baseFilter || ''} blur(${progress * 8}px)`.trim();
  incoming.style.filter = `${baseFilter || ''} blur(${(1 - progress) * 8}px)`.trim();
```

### Dateien
- `src/components/directors-cut/preview/useTransitionRenderer.ts` — filter-Handling korrigieren
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — `videoFilter` als Ref an den Hook übergeben

