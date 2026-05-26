## Ziel

Die drei statischen Dropdowns (`Workspace · Mandant · Marke`) im Calendar-Header durch einen **adaptiven Context-Switcher** ersetzen, der sich an die tatsächliche Account-Struktur des Nutzers anpasst. Die Filterlogik dahinter (`workspace_id`, `client_id`, `brand_kit_id`) bleibt 1:1 erhalten — geändert wird nur die UI-Schicht.

## Verhalten je Account-Typ

| Fall | Was wird angezeigt |
|---|---|
| 1 Workspace · 0 Clients · ≤1 Brand (Solo) | Nur ein dezenter Brand-Chip mit Logo/Name (oder gar nichts, wenn keine Brand). Kein Dropdown. |
| 1 Workspace · 0 Clients · >1 Brand | Ein einziger Pill `🎨 [Brand] ▾` (Brand-Switch). |
| ≥1 Client (Agentur) | Pill `👤 [Mandant] ▾`. Wahl eines Mandanten filtert die Brand-Liste automatisch (Kaskade). Brand-Pill erscheint nur wenn der Mandant >1 Brand hat. |
| Mehrere Workspaces | Workspace-Switch wandert in ein kleines Icon-Menü (⚙ links neben dem Context-Pill). |
| Power-User | Rechts ein `Sliders`-Icon öffnet ein Popover mit allen drei klassischen Selects + "Filter zurücksetzen". |

Ergebnis: Der Header ist im Normalfall ~60 % schlanker, Solo-User sehen keine leeren Agentur-Filter mehr.

## Komponenten

**Neu:**
- `src/components/calendar/ContextSwitcher.tsx` — Hauptkomponente. Bekommt `workspaces`, `clients`, `brands`, aktuelle Auswahl und Setter. Entscheidet selbst, welche Pills sie rendert (Logik s. Tabelle oben).
- `src/components/calendar/ContextSwitcherPopover.tsx` — "Mehr Filter"-Popover mit den 3 vollen Selects als Fallback/Power-Mode.
- `src/components/calendar/ContextPill.tsx` — Wiederverwendbarer Glassmorphism-Pill im Bond-2028-Stil (gold border, cyan hover-glow, ChevronDown, optionales Icon).

**Geändert:**
- `src/components/calendar/CalendarHeader.tsx` — Block mit den drei `<Select>`-Elementen ersetzt durch `<ContextSwitcher ... />`. Sync-/Integrations-Buttons rechts bleiben unverändert.

**Unverändert:** `Calendar.tsx` (State + Query-Keys), alle Filterlogik, alle Child-Views.

## Technische Details

- **Auto-Selection beim Mount:** Wenn nach dem Laden `selectedBrand === ""` und es genau 1 Brand gibt → auto-set. Analog für Workspace (war schon so) und Client (nur wenn genau 1 vorhanden).
- **Mandant→Brand-Kaskade:** Wenn `clients.length > 0` und ein Mandant ausgewählt wird, filtere die Brand-Liste auf `brand.client_id === selectedClient` (Feld existiert; falls nicht, kein Filter — degradiert sauber).
- **Pill-States:** `default` (neutral), `active` (gold border + leichter cyan glow), `disabled` (opacity 0.4). Hover: subtle scale + cyan ring (Bond-Tokens, keine Hardcoded-Farben).
- **Mobile:** Pills wrappen wie bisher (`flex-wrap`); Popover wird zum `Sheet`.
- **Keine i18n-Änderungen** — bestehende Keys `calendar.selectWorkspace/Client/Brand` werden für die Labels im Popover wiederverwendet; neue Pill-Labels lesen direkt `workspace.name` / `client.name` / `brand.brand_name`.

## Animation (Bond 2028)

- Pill-Wechsel: `framer-motion` `layout` für sanften Reflow beim Einblenden/Verstecken.
- Aktive Pill: dünner animierter Gold-Underline (cyan→gold Gradient), 800 ms loop.

## Out of Scope (Stage 2, falls gewünscht)

- "⌘K"-Quick-Switcher für Brand/Mandant
- Persistente "Last used context" in localStorage pro User
- Multi-Brand-Selektion (gleichzeitige Mehrfachfilterung)
- Anwendung des gleichen Switchers auf andere Module (Analytics, Planner)

## Akzeptanzkriterien

1. Solo-User mit 1 Brand sieht **gar keinen** Workspace/Mandant-Dropdown — nur den Brand-Chip (oder nichts).
2. Agentur-User mit 3 Mandanten sieht 1 Mandant-Pill; Brand-Pill nur wenn der gewählte Mandant >1 Brand hat.
3. Power-User kann jederzeit über das Sliders-Icon das volle Filter-Popover öffnen.
4. Alle bestehenden Query-Keys (`['calendar-events', selectedWorkspace, selectedClient, selectedBrand]`) erhalten weiterhin korrekte Werte → keine Cache-Brüche.
5. Mobile bleibt nutzbar (Pills wrappen, Popover wird zu Sheet).
