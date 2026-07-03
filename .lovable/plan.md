## Problem

Bei 1175 px Viewport bleibt die Sidebar-Tab-Leiste horizontal (3-Spalten-Grid + Settings-Zeile). Selbst mit `StudioSidebarTabs` sitzen `SCHNITT / LOOK & FARBE / EFFEKTE` bzw. `UNTERTITEL / AUDIO / EXPORT` in zwei Reihen à 3 Spalten und werden bei schmalen Panels rechts abgeschnitten. Die Sidebar wird nie **nach unten** länger, weil das Grid horizontal skaliert.

## Wie es seriöse Plattformen lösen

CapCut, Descript, Adobe Premiere, DaVinci Resolve, Figma, VS Code — alle nutzen dasselbe Muster:

```text
┌──┬─────────────────────┐
│⚙ │                     │
│✂ │   Panel-Inhalt      │
│🎨│                     │
│✨│                     │
│💬│                     │
│🎵│                     │
│⬇ │                     │
└──┴─────────────────────┘
```

Eine **fixe, schmale Icon-Rail (48–56 px)** links am äußeren Rand mit **vertikal gestapelten** Tabs. Icon + optional Mini-Label darunter. Tooltip beim Hover zeigt den vollen Namen. Der Content daneben füllt den Rest. Das Feature-Set wächst **nach unten** statt in die Breite — genau was der User fordert.

## Umsetzung

### 1. `StudioSidebarTabs` komplett auf vertikale Rail umbauen

`src/components/studio-shell/StudioSidebarTabs.tsx` — nur noch **ein** Layout, keine Breakpoints mehr:

- `<TabsList>` wird zu einer schmalen vertikalen Spalte (`w-14`, `flex-col`), an der **linken Kante** der Sidebar fixiert.
- Jeder Tab: 48×48 px Button, Icon 18px zentriert, darunter ein 9px-Label in 2 Zeilen erlaubt (`text-[9px] leading-tight text-center line-clamp-2`), Badge als goldener Dot oben rechts.
- Aktiver Tab: goldener Left-Border (`border-l-2 border-[#F5C76A]`) + weicher Glow, kein volles Hintergrund-Rechteck.
- Tooltip via `title` mit vollem Label + Count.
- Settings-Tab ganz unten mit `mt-auto`, getrennt durch dünnen Divider.
- Die Rail scrollt niemals horizontal — bei sehr kleinen Viewports mit `overflow-y-auto` scrollbar (kommt aber praktisch nie vor).

### 2. `CapCutSidebar` — Rail links, Content rechts

`src/components/directors-cut/studio/CapCutSidebar.tsx`:

- Wrapper wird zu `flex flex-row` mit zwei Kindern:
  - **Links**: `StudioSidebarTabs` in fixer 56px-Spalte
  - **Rechts**: `flex-1 min-w-0` für `TabsContent` (Panel-Inhalt)
- `useContainerWidth` und die 3-Modus-Logik entfallen — nicht mehr benötigt.

### 3. `CapCutEditor` — neue Panel-Breiten

`src/components/directors-cut/studio/CapCutEditor.tsx`:

- Sidebar-Default zurück auf **320 px** (56 Rail + 264 Content). Auf `< 1280 px` Viewports **288 px** (56 + 232). Kollabiert (nur Rail sichtbar) bei `sidebarCollapsed`: **56 px**.
- `PanelDivider` min = 56 (nur Rail), max = 560.
- Preview-Mittelspalte bleibt `flex-1 min-w-0` — bekommt bei 1175 px Viewport jetzt **~615 px** statt gequetschten Raum.

### 4. Verifikation via Playwright

Screenshots bei 1175×758, 1280×800, 1440×900:

- Keine abgeschnittenen Tabs, alle 7 Tabs (Schnitt, Look, FX, Untertitel, Audio, Export, Settings) vertikal sichtbar.
- Kein horizontaler Scroll.
- Preview-Fläche breiter als bisher.
- Kollaps-Modus zeigt nur die 56 px Rail.

## Nicht enthalten

- Keine Änderungen an Panel-Inhalten, Timeline, Preview, Inspector.
- Keine Business-Logik / i18n-Keys angefasst.
- `useContainerWidth` bleibt bestehen (wird ggf. später wiederverwendet), aber nicht mehr im Studio-Pfad importiert.
