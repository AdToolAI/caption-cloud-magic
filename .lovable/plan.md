

## Plan: Doppelte Scrollbar entfernen — nur eine globale Scrollbar

### Diagnose
Im Screenshot sind **zwei vertikale Scrollbars** sichtbar:
1. **Browser-Scrollbar ganz rechts** (für die Page)
2. **Sidebar-Scrollbar** direkt links daneben — kommt aus `SidebarContent` in `src/components/ui/sidebar.tsx` Z. 334:
   ```
   "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden ..."
   ```
   Da `AppSidebar` `h-screen` ist und die Hub-Icons fast immer in den Viewport passen, ist die zweite Scrollbar überflüssig und optisch störend.

### Fix — minimal, nur in `src/components/AppSidebar.tsx`

In Z. 45 die `SidebarContent`-Klasse erweitern, sodass die Scrollbar dort visuell **versteckt** wird (Inhalt bleibt scrollbar bei Bedarf, aber kein sichtbarer Track):

Aktuell:
```tsx
<SidebarContent className="bg-card border-r border-border h-full flex flex-col items-center py-3 gap-1">
```

Neu:
```tsx
<SidebarContent className="bg-card border-r border-border h-full flex flex-col items-center py-3 gap-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
```

- `[&::-webkit-scrollbar]:hidden` → versteckt Scrollbar in Chrome/Safari/Edge
- `[scrollbar-width:none]` → versteckt Scrollbar in Firefox
- Funktional bleibt Scrollen erhalten (Mausrad/Touch), nur die Track-Anzeige verschwindet

### Wirkung auf andere Seiten
Die User hat erwähnt, das Problem tritt **auch auf anderen Seiten** auf. Da die Sidebar global ist (`AppSidebar`), wirkt der Fix automatisch auf **allen Seiten mit Sidebar**.

### Was NICHT geändert wird
- `src/components/ui/sidebar.tsx` (shadcn-Komponente bleibt unangetastet — Override per Tailwind-Arbitrary-Class)
- Sidebar-Funktionalität, Inhalt, Styling
- Globale Page-Scrollbar bleibt (das ist die richtige/erwartete)

### Risiko
Null. Reine CSS-Anpassung, scoped über Tailwind-Selektor auf eine Komponente.

