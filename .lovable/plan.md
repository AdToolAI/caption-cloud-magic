

## Sidebar sticky machen beim Scrollen

### Problem
Die Sidebar nutzt `collapsible="none"`, was in der Shadcn-Sidebar-Komponente einen einfachen `div` ohne `fixed`/`sticky` Positionierung rendert. Daher scrollt die Sidebar mit dem Content weg, statt wie der Header fixiert zu bleiben.

### Lösung
Eine Zeile in `AppSidebar.tsx` ändern: Der `<Sidebar>`-Komponente die Klasse `sticky top-0 h-screen` hinzufügen. Damit bleibt die Sidebar beim Scrollen fixiert, genau wie der Header.

### Datei
- `src/components/AppSidebar.tsx` — Zeile 39: `className` um `sticky top-0 h-screen` erweitern

