

# Plan: Verwaltungs-Einträge in UserMenu verschieben

## Zusammenfassung
Die Sidebar-Einträge unter „Verwaltung" (Brand-Kit, Credits, Konto, Abrechnung) sowie die „Auxiliary Pages" (Preise, FAQ, Support) werden aus der Sidebar entfernt und stattdessen ins UserMenu-Dropdown (oben rechts) integriert.

## Änderungen

### 1. UserMenu erweitern (`src/components/layout/UserMenu.tsx`)
- **Brand-Kit** hinzufügen (Icon: `Briefcase`, Route: `/brand-kit`)
- **Preise** hinzufügen (Icon: `Tag`, Route: `/pricing`)
- **FAQ** hinzufügen (Icon: `HelpCircle`, Route: `/faq`)
- Credits, Konto, Abrechnung, Support bleiben (sind bereits vorhanden)
- Gruppierung mit Separatoren: User-Info → Credits + Brand-Kit → Konto + Abrechnung → Preise + FAQ + Support → Abmelden

### 2. Sidebar bereinigen (`src/components/AppSidebar.tsx`)
- Gesamten `verwaltung`-Hub entfernen (Zeilen 142–147: Brand-Kit, Credits, Konto, Abrechnung)
- „Auxiliary Pages"-Block entfernen (Zeilen 328–353: Preise, FAQ, Support)
- `expandedHubs` Default-Wert anpassen (kein `verwaltung` mehr)

