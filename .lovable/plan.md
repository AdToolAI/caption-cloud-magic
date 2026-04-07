

## Plan: TypeScript-Fehler beheben

### Analyse

Die Fehler fallen in **4 Kategorien**, die alle behoben werden sollten:

| Kategorie | Anzahl | Ursache |
|-----------|--------|---------|
| `SupabaseAuthClient` fehlende Methoden (`signOut`, `mfa`, `getSession`, etc.) | ~20 | Veraltete oder korrupte Supabase-Typdefinitionen |
| `SheetContent` akzeptiert kein `className`/`side` | ~8 | TypeScript erkennt die Props nicht korrekt |
| `Helmet` nicht als JSX nutzbar | 1 | React 18 Typ-Inkompatibilität mit `react-helmet-async` |
| `CSSProperties` fehlende Eigenschaften | ~8 | Falsche Import-Quelle für CSSProperties |

### Ursache

Höchstwahrscheinlich sind die `node_modules` nach der `esbuild`-Installation in einem inkonsistenten Zustand. Die Supabase-Auth-Typen und Radix-UI-Typen werden nicht korrekt aufgelöst.

### Lösung

**Schritt 1: Dependencies neu installieren**
- `node_modules` löschen und `bun install` neu ausführen, um saubere Typdefinitionen zu erhalten

**Schritt 2: Falls Fehler bestehen bleiben — gezielte Fixes:**

- **Helmet-Fix** (`src/components/SEO.tsx`): Type-Cast oder `@ts-expect-error` hinzufügen, da dies ein bekanntes Kompatibilitätsproblem zwischen `react-helmet-async` und React 18 Typen ist

- **CSSProperties-Fix** (`NativeTextOverlayRenderer.tsx`, `useTransitionRenderer.ts`): Sicherstellen, dass `React.CSSProperties` statt einer eigenen `CSSProperties`-Definition verwendet wird

- **SheetContent-Fix** (`sheet.tsx`): Die `SheetContentProps`-Interface erweitern, sodass `className` explizit enthalten ist:
  ```ts
  interface SheetContentProps
    extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
      VariantProps<typeof sheetVariants> {
    className?: string;
  }
  ```

- **Supabase-Auth-Typen**: Falls nach Neuinstallation weiterhin fehlerhaft, die `@supabase/supabase-js`-Version prüfen und ggf. auf eine stabile Version pinnen

**Schritt 3: Build verifizieren**
- `vite build` ausführen und prüfen, ob alle Fehler behoben sind

### Ergebnis
Sauberer Build ohne TypeScript-Fehler, stabile Typdefinitionen für alle Komponenten.

