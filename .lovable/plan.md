

## Plan: Sidebar wiederherstellen + zweite Scrollbar gezielt entfernen

### Missverständnis-Korrektur
Die linke Icon-Sidebar war gewollt und soll **bleiben**. Im Bild sind rechts **zwei vertikale Scrollbars** sichtbar — die linke davon ist die **innere Scrollbar des `SidebarContent`**, die rechte ist die normale Dokument-Scrollbar. Entfernt werden soll nur die innere Sidebar-Scrollbar.

### Ursache
In `src/components/ui/sidebar.tsx` (Zeile 334) hat `SidebarContent` ein hartes `overflow-y-auto`. Unsere `AppSidebar` versucht das mit `[&::-webkit-scrollbar]:hidden [scrollbar-width:none]` zu verstecken, aber:
- Die Klasse landet auf dem `SidebarContent`-Wrapper, nicht zuverlässig auf dem Element, das tatsächlich scrollt
- In bestimmten Render-Zuständen (z. B. wenn der Inhalt knapp die Höhe überschreitet) erscheint die native Scrollbar trotzdem

### Schritte

1. **`src/App.tsx`** — Sidebar wieder einsetzen
   - Import `AppSidebar` ergänzen
   - Layout zurück auf `flex` umstellen
   - In `AppLayout` wieder `{user && !isLandingRoute && <AppSidebar />}` rendern
   - `SidebarProvider` in `AppContent` bleibt (existiert bereits)

2. **`src/components/AppSidebar.tsx`** — innere Scrollbar zuverlässig unterdrücken
   - `SidebarContent` so konfigurieren, dass es **nicht mehr scrollt**:
     - die wenigen Hub-Icons passen immer in die Viewport-Höhe
     - daher `overflow-hidden` statt `overflow-y-auto` durchsetzen
   - Konkret: zusätzliche Klasse `!overflow-hidden` (Tailwind important) auf `SidebarContent` setzen, plus weiterhin `[&::-webkit-scrollbar]:hidden [scrollbar-width:none]` als Fallback
   - Damit verschwindet die zweite (linke) Scrollbar im rechten Bereich endgültig

3. **Sichtprüfung**
   - Auf Home prüfen: nur noch die normale Dokument-Scrollbar ist sichtbar
   - Sidebar-Icons bleiben voll bedienbar (kein Overflow nötig, da nur wenige Items)

### Betroffene Dateien
- `src/App.tsx`
- `src/components/AppSidebar.tsx`

### Ergebnis
- Linke Icon-Sidebar ist wieder da
- Nur noch **eine** vertikale Scrollbar rechts (die echte Seiten-Scrollbar)
- Die störende zweite Scrollbar direkt daneben ist weg

