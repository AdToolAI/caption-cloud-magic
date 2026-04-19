

## Plan: Sidebar-Icon und AppHeader-Brand auf eine Linie bringen

### Diagnose (aus Screenshot + Code)
- Beide Sparkles-Icons sind **gleich groß** (`h-5 w-5` = 20px, beide via `Brand compact`)
- **Sidebar-Brand-Container**: `pt-2 pb-3` (8px top) → Icon bei ~8px vom Top
- **AppHeader**: `h-14` (56px), Brand vertikal zentriert → Icon bei ~18px vom Top
- **Resultat**: Sidebar-Icon sitzt höher und wirkt dadurch optisch "kürzer/kleiner", weil es nicht auf einer Linie mit dem Header-Brand steht

### Fix — Sidebar-Brand-Container exakt auf Header-Höhe (`h-14`) bringen
Damit das Icon mittig im selben 56px-Slot wie der Header-Brand sitzt.

### Änderung — minimal

**`src/components/AppSidebar.tsx` (Z. 39–41)**

Aktuell:
```tsx
<div className="flex flex-col items-center pt-2 pb-3 border-b border-border bg-card">
  <Brand compact showText={false} />
</div>
```

Neu:
```tsx
<div className="flex items-center justify-center h-14 border-b border-border bg-card">
  <Brand compact showText={false} />
</div>
```

- `h-14` → exakt gleiche Höhe wie `AppHeader`
- `items-center justify-center` → Icon wird vertikal + horizontal mittig platziert
- Border-bottom bleibt, sodass die Trennlinie unter Sidebar-Brand und Header bündig durchläuft

### Was NICHT geändert wird
- Icon-Größe (`h-5 w-5`) bleibt — sie ist bereits identisch
- Header bleibt unverändert
- Ticker bleibt unverändert
- Keine weiteren Layout-Änderungen

### Risiko
- Null. Reine Höhen-Anpassung in einem Container.

