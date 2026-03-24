

# Plan: „Automatisieren" aus Sidebar ins UserMenu verschieben

## Zusammenfassung
Die drei Unterpunkte von „Automatisieren" (Kampagnen-Assistent, Integrationen, Instagram-Publishing) werden aus der Sidebar entfernt und als Gruppe im UserMenu-Dropdown unter einem „Automatisieren"-Label eingefügt.

## Änderungen

### 1. UserMenu erweitern (`src/components/layout/UserMenu.tsx`)
- Icons `Workflow` und `Share2` importieren
- Neuen Abschnitt nach Brand-Kit einfügen mit `DropdownMenuLabel` „Automatisieren" (über `t("hubs.automatisieren")`)
- Drei neue Einträge: Kampagnen (`/campaigns`), Integrationen (`/integrations`), Instagram-Publishing (`/instagram-publishing`)
- Separator davor und danach

### 2. Sidebar bereinigen (`src/components/AppSidebar.tsx`)
- `automatisieren`-Hub aus der `hubItems`-Definition entfernen (Zeilen 121–125)
- `expandedHubs` Default-Wert anpassen (kein `automatisieren` mehr)

### 3. CommandBar anpassen (`src/components/ui/CommandBar.tsx`)
- Automatisieren-Einträge bleiben (Suche soll weiterhin funktionieren), keine Änderung nötig

