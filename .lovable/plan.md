

## Plan: Linke Sidebar vollständig entfernen

### Ziel
Die `AppSidebar` wird aus dem App-Shell entfernt. Damit verschwindet auch der Sidebar-interne Scroll-Container (`data-sidebar="content"` mit `overflow-y-auto`), der die zweite vertikale Scrollbar im Bild verursacht.

### Navigation nach Entfernen
- Die Hauptnavigation läuft bereits über die **Hub-Seiten** (`/hub/:hubKey`) und das Home-Dashboard.
- Im `AppHeader` ist die Navigation zu Home und den Hubs erreichbar (Logo/Brand + ggf. Menü).
- Routing bleibt komplett unverändert, alle Routen funktionieren weiter.

### Änderungen

1. **`src/App.tsx`**
   - Import `AppSidebar` entfernen.
   - In `AppLayout` Zeile 135 das `{user && !isLandingRoute && <AppSidebar />}` löschen.
   - Den `SidebarProvider` in `AppContent` entfernen (wird ohne Sidebar nicht mehr gebraucht). Falls einzelne Komponenten weiterhin `useSidebar()` verwenden, bleibt der Provider zur Sicherheit erhalten — wird im Code geprüft.
   - Wrapper-`div` in `AppLayout` vereinfachen: Das äußere `flex` wird nicht mehr benötigt, Content nimmt volle Breite.

2. **`src/components/AppHeader.tsx`** (nur falls nötig)
   - Sicherstellen, dass Brand/Logo links sichtbar ist und zu `/home` linkt, damit der Einstiegspunkt zur Navigation klar bleibt.
   - Kein Umbau, nur Sichtprüfung.

3. **`src/index.css`**
   - Bisherige Sidebar-bezogene Workarounds (z. B. `[data-sidebar="content"]`-Overrides) entfernen, da nicht mehr nötig.

4. **Datei `src/components/AppSidebar.tsx`**
   - Bleibt im Projekt liegen (nicht löschen), aber wird nicht mehr verwendet. Kann später bei Bedarf reaktiviert werden.

### Ergebnis
- Nur noch **eine vertikale Scrollbar** (Dokument-Scroll).
- Mehr horizontaler Platz für den Hauptcontent.
- Navigation über Header + Hub-Seiten, wie es ohnehin schon vorgesehen ist.

### Risiko
Niedrig. Falls einzelne Seiten direkt `useSidebar()` aufrufen, bleibt der `SidebarProvider` im Tree erhalten — die Sidebar selbst wird einfach nicht mehr gerendert.

