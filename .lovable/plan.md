

## Quick-Link zu Social-Verbindungen im User-Menü

Im User-Dropdown (oben rechts) füge ich zwischen „Abrechnung" und „Preise" einen neuen Eintrag **„Verbindungen"** mit Link2-Icon ein, der direkt zur `/integrations`-Seite führt.

### Änderung

**Datei:** `src/components/layout/UserMenu.tsx`

Neuer Menüeintrag nach „Abrechnung":

```tsx
<DropdownMenuItem asChild>
  <Link to="/integrations" className="flex items-center gap-2 cursor-pointer">
    <Link2 className="h-4 w-4" />
    <span>{t("nav.integrations")}</span>
  </Link>
</DropdownMenuItem>
```

- Icon `Link2` (bereits in lucide-react, passend zur Integrations-Seite)
- Übersetzungs-Key `nav.integrations` mit Fallback auf „Verbindungen" / „Connections" / „Conexiones" (EN/DE/ES) — falls Key fehlt, ergänze ich ihn in den Translation-Files

### Position im Menü

```
Credits
─────────
Einstellungen
Abrechnung
Verbindungen   ← NEU
─────────
Preise
FAQ
Support
─────────
Abmelden
```

### Aufwand
~1 Min, 1 Datei (+ ggf. 3 Translation-Keys).

