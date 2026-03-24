

# Plan: Eingeloggte User direkt zum Dashboard leiten

## Zusammenfassung
Wenn ein User eingeloggt ist und `/` aufruft, wird er automatisch zum Dashboard (`/home`) weitergeleitet. Die Landing-Page (`Index`) ist nur für nicht-eingeloggte Besucher sichtbar.

## Änderung

### `src/App.tsx` — Route `/` anpassen (Zeile 133)
Die statische `<Route path="/" element={<Index />} />` wird durch eine bedingte Logik ersetzt:

```tsx
<Route path="/" element={user ? <Navigate to="/home" replace /> : <Index />} />
```

Das ist alles — `user` ist bereits im `AppLayout` Scope verfügbar. Eingeloggte User landen auf `/home` (Dashboard), Besucher sehen die Landing-Page.

