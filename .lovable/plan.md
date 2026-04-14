

## Plan: News Radar über den Header verschieben und kompakter machen

### Änderungen

**`src/App.tsx`** (Zeilen ~130-136):
- NewsTicker-Import hinzufügen
- Den `<NewsTicker />` direkt **vor** dem Header rendern (sowohl vor `<Header />` als auch vor `<AppHeader />`), nur für eingeloggte User
- Die Logik bleibt: nur anzeigen wenn `user` existiert

**`src/pages/Home.tsx`** (Zeile 558):
- `{user && <NewsTicker />}` entfernen — wird jetzt global in App.tsx gerendert

**`src/components/dashboard/NewsTicker.tsx`**:
- Höhe von `h-6` auf `h-5` reduzieren (ca. 4px weniger)
- Schriftgrößen leicht verkleinern: `text-[10px]` → `text-[9px]`
- Badge-Text `text-[8px]` → `text-[7px]`
- Insgesamt wird der Ticker ~2-3cm schmaler/kompakter

### Betroffene Dateien
- `src/App.tsx` — NewsTicker global einbinden
- `src/pages/Home.tsx` — NewsTicker-Zeile entfernen
- `src/components/dashboard/NewsTicker.tsx` — Höhe und Schriftgrößen reduzieren

### Was sich nicht ändert
- Keine funktionalen Änderungen, keine DB-Migration
- Toggle-Logik bleibt erhalten
- Scroll-Animation bleibt identisch

