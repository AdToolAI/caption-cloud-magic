## Problem

`https://useadtool.ai/home` führt für ausgeloggte Besucher zu einer fast leeren/kaputten Seite (siehe Screenshot: nur Header + Hero-Headline, dann schwarze Fläche). Grund:

- `/home` rendert `<Home />` — das interne Dashboard, das auf eingeloggte User + Supabase-Daten (Posts, Strategy, Welcome-Bonus, Posting-Times …) angewiesen ist.
- Die Route ist in `src/App.tsx:186` **nicht** mit `<ProtectedRoute>` umschlossen, anders als praktisch alle anderen App-Routen (`/account/delete`, `/brand-characters`, `/library`, …).
- Folge: Ohne Session laufen die Hooks ins Leere, Sections rendern leer → "Abstellseite".

Externe Backlinks, alte Bookmarks und Google-Snippets, die auf `/home` zeigen, landen damit auf einer toten Seite statt auf der Marketing-Startseite `/`.

## Lösung

Eine Zeile in `src/App.tsx`: `/home` schützen und ausgeloggte Besucher transparent auf die Landing-Page `/` umleiten.

### Änderung in `src/App.tsx` (Zeile 186)

```tsx
<Route
  path="/home"
  element={
    <ProtectedRoute redirectTo="/">
      <Home />
    </ProtectedRoute>
  }
/>
```

Damit:
- **Ausgeloggt** → `/home` → Redirect auf `/` (Landing `<Index />`)
- **Eingeloggt** → `/home` → Dashboard wie bisher
- Bestehender Flow `/` → `/home` für eingeloggte User (Zeile 183) bleibt unverändert → keine Redirect-Loop.

Falls `ProtectedRoute` aktuell hart auf `/auth` redirected (statt konfigurierbar): kurz `src/components/ProtectedRoute.tsx` prüfen und ggf. ein optionales `redirectTo`-Prop ergänzen (Default `/auth`), damit `/home` speziell auf `/` zurückfällt — Marketing-Besucher sollen nicht direkt auf der Login-Maske landen.

## Out of Scope

- Kein Umbau an `Home.tsx`, kein neues Routing, keine SEO-Änderung.
- `canonical="/home"` im Dashboard bleibt — Crawler folgen der Redirect-Kette ohnehin nicht hinein, weil `/home` nicht in `sitemap.xml` steht.
