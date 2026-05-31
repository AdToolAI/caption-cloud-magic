## Bug
Beim Öffnen des Storyboards mit 3 Charakteren crasht der gesamte Storyboard-Tab mit `Cannot read properties of undefined (reading 'toLowerCase')`. Die ComposerTabErrorBoundary fängt den Fehler ab und zeigt die rote Karte.

## Root Cause
`src/components/video-composer/CastConsistencyMap.tsx`, Zeile 44:

```ts
(promptText.includes(character.name.toLowerCase()) || promptText.includes(firstName))
```

`character.name` wird hier **ohne** Optional Chaining gelesen, obwohl Zeile 34 oben bereits defensiv `character.name?.trim()` verwendet. Sobald in der Cast-Liste auch nur **ein** Eintrag ohne `name` landet (z. B. ein Avatar/Library-Asset, das im 3-Character-Setup zusätzlich injiziert wird), wirft die `.toLowerCase()`-Kette und reißt den ganzen Tab mit, obwohl der Nutzer alle "echten" Charaktere mit Namen angelegt hat.

Sekundär: Zeile 125 (`c.name.slice(...)`) und ggf. die Gitter-Spalten-Header haben dasselbe Problem — bei 1–2 Charakteren reichten die Strings noch, bei 3 wird wahrscheinlich ein leerer Slot mitgerendert.

## Fix (1 Datei, rein defensiv, keine Logik-Änderung)
**`src/components/video-composer/CastConsistencyMap.tsx`**

1. Am Anfang der `CastConsistencyMap`-Komponente die `characters`-Liste filtern: nur Einträge mit `typeof c?.name === 'string' && c.name.trim().length > 0` durchlassen. Verhindert, dass ein einziger kaputter Library-Eintrag den gesamten Storyboard-Tab zerlegt.
2. In `getAnchor` Zeile 44 auf `character.name?.toLowerCase() ?? ''` umstellen und den `promptText.includes('')`-Fall via `if (!fullName) return …`-Guard ausschließen.
3. `c.name.slice(0, 2)` (Zeile 125) auf `(c.name ?? '??').slice(0, 2)` härten als Belt-and-suspenders.

## Warum nicht mehr
- Pipeline (`compose-video-clips`, `compose-scene-anchor`, `twoshot-face-map`) ist nicht betroffen — der Crash ist reines Frontend-Rendering.
- Keine Migration nötig, keine Edge-Function-Änderung.
- 1- und 2-Character-Storyboards bleiben funktional identisch.

## Verifikation
- Storyboard mit 3 Charakteren neu öffnen → keine rote Fehler-Karte mehr, Cast Consistency Map zeigt 3 Spalten.
- Optional: in der Browser-Konsole bestätigen, dass `[ComposerTabErrorBoundary] Storyboard … toLowerCase` nicht mehr geloggt wird.
