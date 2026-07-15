## Beobachtung

Wenn du auf `/home` (oder einer anderen langen Seite) nach unten scrollst und dann eines der Social-Icons rechts der Suchleiste anklickst, verschwindet die Headbar kurz. Grund ist **keine Änderung an der Header-Komponente selbst** — der Header ist korrekt `sticky top-0 z-50`.

Zwei Effekte greifen zusammen:

1. **Route-Wechsel behält Scrollposition** — Die Social-Icons rufen `navigate('/integrations?connect=…')` auf. React Router 6 setzt bei Navigation den `scrollY` **nicht** zurück (`ScrollRestoration` ist nicht aktiviert). Die neue Seite wird also mitten im Scroll gerendert.
2. **Lazy-Loading + Suspense-Fallback** — `/integrations` ist `React.lazy` und zeigt kurz einen `min-h-screen`-Spinner. In diesem Moment ist `document.scrollHeight` kurzzeitig kleiner als das alte, der Browser klemmt `scrollY` auf den neuen Max-Wert, und der `sticky`-Header rutscht mit — daher wirkt es, als „verschwinde" er, obwohl er nur auf einer Zwischenposition landet.

Kein Bug in `AppHeader`, `SocialConnectionIcons` oder Radix-Tooltip.

## Fix

Eine einzige neue Komponente, ein Import in `src/App.tsx`. Rein UX.

### 1) Neue Datei `src/components/layout/ScrollToTop.tsx`
```tsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Setzt scrollY beim Route-Wechsel auf 0 — verhindert, dass der sticky
 *  Header nach Navigation auf einer Zwischenposition „hängen" bleibt. */
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    // instant, damit während Suspense-Fallback nichts flackert
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}
```

### 2) `src/App.tsx` (~Zeile 170)
`<ScrollToTop />` direkt innerhalb des Routers, oberhalb des Layout-Wrappers einhängen. Kein visuelles Element, nur Effekt.

## Nicht enthalten
- Keine Änderung an `AppHeader.tsx`, `SocialConnectionIcons.tsx`, `index.css` (`overflow-x: clip` bleibt — funktioniert korrekt mit `sticky`).
- Kein `hideOnScroll`-Verhalten — der Header soll ja sichtbar bleiben, nicht ausblendbar werden.
- Kein Anti-Anchor-Verhalten für Anker-Links (`#…`) nötig, da wir aktuell keine In-Page-Anchors nutzen; falls doch, ist der Effekt trivial erweiterbar.

## Verifikation
- `/home` → runter scrollen → beliebiges Social-Icon oben klicken → `/integrations` öffnet oben, Header sichtbar.
- Gleiches Verhalten bei allen anderen Header-Actions (Community-Button, Notification-Bell, Language-Switcher-Route, User-Menu-Einträge).