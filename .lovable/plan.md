

## Drei Bugs fixen: Impressum-Route, Logout-Redirect, Login-Redirect

### Probleme

1. **Impressum-Link fuehrt zur Startseite**: Der Footer-Link zeigt auf `/imprint`, aber es gibt keine Route dafuer. Der Catch-All (`*`) leitet zu `/home` weiter.

2. **Logout leitet nicht zur Startseite**: Nach `signOut()` gibt es keinen expliziten Redirect zu `/`. Der User landet auf der aktuellen Seite oder wird durch den Catch-All umgeleitet.

3. **Login leitet zum KI-Text-Studio statt Dashboard**: In `Auth.tsx` Zeile 40 steht `navigate('/generator')` statt `navigate('/home')`.

### Aenderungen

**1. `src/App.tsx`** — Direkte Route fuer `/imprint` hinzufuegen (wie bei `/privacy` und `/terms`):
```tsx
<Route path="/imprint" element={<Legal />} />
```
Ausserdem `/imprint` zur `isLandingRoute`-Liste hinzufuegen.

**2. `src/pages/Legal.tsx`** — In der `actualPage`-Logik `/imprint` ergaenzen, damit die Seite den richtigen Inhalt zeigt.

**3. `src/components/layout/UserMenu.tsx`** — Nach `signOut()` zur Startseite navigieren:
```tsx
const navigate = useNavigate();
// onClick:
await signOut();
navigate('/');
```

**4. `src/pages/Auth.tsx`** Zeile 40 — Login-Redirect von `/generator` auf `/home` aendern:
```tsx
navigate('/home');
```

**5. `src/pages/Auth.tsx`** — `Footer` Import durch `BlackTieFooter` ersetzen (gleicher Fix wie bei Legal-Seiten).

