# Problem

Im Director's Cut ist die linke Spalte (CapCutSidebar) in der aktuellen Viewport-Breite (1175 CSS px) so breit, dass das Gesamt-Layout **Sidebar (400px) + Preview + rechter Inspector (288px)** horizontal überläuft. Sichtbar wird das an den 6 Tab-Buttons `SCHNITT / LOOK & FARBE / EFFEKTE / UNTERTITEL / AUDIO / EXPORT` plus `EINSTELLUNGEN`, die zwar in einem `grid-cols-3` sitzen, aber das ganze Panel nach rechts drücken und rechts vom Rand abgeschnitten werden.

Zusätzlich sehen die Tabs bei enger Breite „übergroß" aus, weil sie 2-zeilig mit Icon + UPPERCASE-Label + Badge in einem 400-px-Panel gezwungen sind — es gibt keinen Icon-Only-Fallback.

# Ziel

Eine **professionelle, responsive Lösung** für die linke Sidebar, die
- bei engen Viewports (≤ ~1280 px) automatisch in einen **Icon-only Rail-Modus** (48–56 px) wechselt,
- bei mittleren Breiten das aktuelle 2-Zeilen-Grid mit gekürzten Labels behält,
- bei breiten Viewports das gewohnte volle Layout zeigt,
- kein horizontales Überlaufen des 3-Spalten-Editors mehr verursacht,
- und als **wiederverwendbares Muster** für andere Feature-Sidebars (Video Composer, Picture Studio, Universal Creator) verwendbar ist.

# Umsetzung

## 1. Neuer wiederverwendbarer Baustein `StudioSidebarTabs`
Datei: `src/components/studio-shell/StudioSidebarTabs.tsx` (neu)

- Props: `tabs: { value, icon, label, count?, glow? }[]`, `value`, `onValueChange`, `settingsTab?`, `containerWidth: number`.
- Rendert je nach `containerWidth` **drei Layouts**:
  - `< 200 px` → **Rail**: 1 Spalte, nur Icons, `title`-Tooltip, Badge als Punkt.
  - `200–360 px` → **Compact**: 3 Spalten, Icon + kleines Label (`text-[10px]`, `truncate`), Badge oben rechts.
  - `≥ 360 px` → **Expanded**: aktuelles 3-Spalten-Layout mit vollen Labels.
- Settings-Tab immer in eigener Zeile (im Rail-Modus als Icon unten fixiert).
- Nutzt vorhandene shadcn `Tabs`/`TabsTrigger`, damit Radix-Semantik erhalten bleibt.
- Alle Farbtokens (Cyan/Purple/Pink/Gold-Glow) bleiben unverändert.

## 2. CapCutSidebar auf `StudioSidebarTabs` umstellen
Datei: `src/components/directors-cut/studio/CapCutSidebar.tsx`

- Sidebar bekommt eine `ResizeObserver`-basierte Breitenmessung (`useContainerWidth`) statt hart „grid-cols-3".
- Die 6 Library-Tabs + Settings werden an `StudioSidebarTabs` durchgereicht.
- Kein sonstiger Panel-Content wird geändert (CutPanel, LookPanel, FXPanel, ExportPanel bleiben identisch).

## 3. Sidebar-Breite realistischer takten
Datei: `src/components/directors-cut/studio/CapCutEditor.tsx`

- `min={320}` → `min={56}` (erlaubt Rail-Kollaps per Drag).
- Default 400 bleibt, aber bei **erster Sitzung** wird `sidebarWidth` gegen `window.innerWidth` gedeckelt:
  - Wenn `innerWidth < 1280` → Default 288 (Compact).
  - Wenn `innerWidth < 1024` → Default 64 (Rail).
- `sidebarCollapsed`-Button bleibt und schaltet weiterhin auf 48 px hart.
- Persistenz in `localStorage` bleibt, aber wird gegen die neuen Min-Werte validiert.

## 4. Kein Horizontal-Overflow mehr
Datei: `src/components/directors-cut/studio/CapCutEditor.tsx`

- Am äußersten Editor-Container `min-w-0 overflow-hidden` sicherstellen und Preview-Mittelspalte auf `flex-1 min-w-0` setzen, damit die Sidebar-/Inspector-Breiten den Preview-Bereich schrumpfen können statt nach rechts zu drängen.

## 5. Wiederverwendung für weitere Features (nur Vorbereitung, keine Migration in diesem Schritt)
- `StudioSidebarTabs` wird generisch geschrieben, damit es später im Video Composer (`SceneCard`-Umgebung), Picture Studio (`PictureStudio.tsx` Tabs) und Universal Creator ohne Änderung eingesetzt werden kann.
- In diesem Plan wird nur der Baustein bereitgestellt + Director's Cut umgestellt. Weitere Feature-Pages folgen separat, sobald das Muster hier verifiziert ist.

# Verifikation

- Playwright-Screenshot bei 1175×758, 1280×800 und 1440×900:
  - keine horizontale Scrollbar am Editor-Root,
  - Sidebar-Tabs komplett sichtbar (Rail bei 1175, Compact bei 1280, Expanded bei 1440),
  - Preview + Inspector nicht abgeschnitten.
- Tabs weiterhin klickbar (Radix-Behavior), aktive Farbe/Glow korrekt.
- Kein Regressions-Impact auf CutPanel/LookPanel/FXPanel/ExportPanel-Inhalte.

# Geänderte / Neue Dateien

- neu: `src/components/studio-shell/StudioSidebarTabs.tsx`
- neu: `src/hooks/useContainerWidth.ts`
- geändert: `src/components/directors-cut/studio/CapCutSidebar.tsx` (nur Tab-Header-Block)
- geändert: `src/components/directors-cut/studio/CapCutEditor.tsx` (Default-Breite, min, overflow-Guards)

# Explizit **nicht** Teil dieses Plans

- Keine Änderung an Panel-Inhalten, Timeline, Preview oder Inspector.
- Keine Migration von Composer/Picture Studio/Universal Creator in diesem Schritt.
- Keine Änderung an Business-Logik, Backend oder i18n-Keys.