

## Bugfix: Rohe i18n-Keys im Music-Tab („videoComposer.musicSearchLabel" etc.)

### Problem
Im Music-Tab werden drei rohe Übersetzungs-Keys angezeigt:
- `videoComposer.musicSearchLabel`
- `videoComposer.musicSearchPlaceholder`
- `videoComposer.musicSearchHint`

### Ursache
In `AudioTab.tsx` (Zeilen 245, 256, 260) steht z. B.:
```tsx
{t('videoComposer.musicSearchLabel') || 'Suchen (Titel, Künstler, Stichwort)'}
```

Der `||`-Fallback funktioniert hier **nicht**, weil `useTranslation().t()` bei einem fehlenden Key den Key selbst als nicht-leeren String zurückgibt — und nicht-leere Strings sind truthy. Folge: Der Key wird gerendert.

In `src/lib/translations.ts` fehlen diese drei Keys in **allen drei Sprachblöcken** (EN/DE/ES). Außerdem wird in der gleichen Datei in Zeile 301 `searchByQuery` referenziert — auch dieser Key sollte vorsichtshalber ergänzt werden.

### Fix
**Datei:** `src/lib/translations.ts`

Im `videoComposer.*`-Bereich aller drei Sprachen (EN/DE/ES) — neben den vorhandenen Keys wie `backgroundMusic`, `genre`, `mood`, `searchMusic` — diese vier Keys ergänzen:

**DE**
```ts
musicSearchLabel: 'Suchen (Titel, Künstler, Stichwort)',
musicSearchPlaceholder: 'z.B. Beach Sunset, Lofi Chill, Hans Zimmer...',
musicSearchHint: 'Leer lassen, um nach Genre + Stimmung zu suchen.',
searchByQuery: 'Suche „{query}"',
```

**EN**
```ts
musicSearchLabel: 'Search (title, artist, keyword)',
musicSearchPlaceholder: 'e.g. Beach Sunset, Lofi Chill, Hans Zimmer...',
musicSearchHint: 'Leave empty to search by genre + mood.',
searchByQuery: 'Search "{query}"',
```

**ES**
```ts
musicSearchLabel: 'Buscar (título, artista, palabra clave)',
musicSearchPlaceholder: 'p. ej. Beach Sunset, Lofi Chill, Hans Zimmer...',
musicSearchHint: 'Déjalo vacío para buscar por género + estado de ánimo.',
searchByQuery: 'Buscar "{query}"',
```

Optional, da der `||`-Fallback ohnehin trügerisch ist, in `AudioTab.tsx` Zeile 301 die String-Interpolation umstellen auf:
```ts
t('videoComposer.searchByQuery', { query: musicQuery.trim() })
```
(passend zum bestehenden `{count}`-Pattern, das `useTranslation` schon unterstützt).

### Verifikation
1. Music-Tab öffnen → statt `videoComposer.musicSearchLabel` steht „Suchen (Titel, Künstler, Stichwort)"
2. Placeholder im Input zeigt echten Beispieltext
3. Hint unter dem Input zeigt deutsche/englische/spanische Erklärung
4. Sprache umschalten (DE → EN → ES) → alle drei Texte folgen korrekt
5. Suchquery eingeben → Button-Label zeigt z. B. „Suche „Hans Zimmer"" statt rohem Key

### Risiko & Aufwand
- **Risiko: Sehr niedrig.** Reine Übersetzungs-Ergänzung, keine Logik-Änderung.
- **Aufwand:** ~2 Minuten — eine Datei (`translations.ts`), 4 Keys × 3 Sprachen.

