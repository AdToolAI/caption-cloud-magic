# Plan: „Zeitleiste" → **Heatmap-Radar** im Content Command Center

Die aktuelle Zeitleiste (ein abgeschnittener horizontaler Monats-Stream mit hässlicher weißer Scrollbar und nur einer leeren „Kampagnen"-Zeile) wird durch einen **Heatmap-Radar** ersetzt — die wertvollste, sofort sichtbare Pipeline-Ansicht in einer 7×24-Matrix.

## Was der User sieht

Ein vollflächiges Glass-Panel im Bond-2028-Look:

```text
        00 01 02 … 08 09 10 11 12 13 14 15 … 23
Mo      ·  ·  ·    ·  ●  ◐  ·  ·  ◐  ·  ·     ·
Di      ·  ·  ·    ◐  ·  ●● ·  ·  ·  ◐  ·     ·
Mi      ·  ·  ·    ·  ·  ●  ·  ·  ·  ·  ●     ·
Do      ·  ·  ·    ◐  ·  ●  ·  ·  ◐  ·  ·     ·
Fr      ·  ·  ·    ·  ·  ●  ·  ·  ·  ●● ·     ·
Sa      ·  ·  ·    ·  ·  ·  ·  ·  ·  ·  ·     ·
So      ·  ·  ·    ·  ·  ·  ·  ·  ·  ·  ·     ·
```

**3 visuelle Layer überlagert:**
1. **Cyan-Glow (Hintergrund)** — Optimale Posting-Zeiten aus `usePostingTimes` (Score → Helligkeit)
2. **Gold-Dots (Vordergrund)** — Geplante Posts. Ein Dot pro Post, mehrere stapeln sich (●● = 2 Posts, Größe wächst)
3. **Rotes Pulse-Ring** — Konflikte (≥3 Posts in 1h-Slot)

**Toolbar oben:**
- Channel-Toggle (Instagram/TikTok/LinkedIn/X/Facebook/YouTube/all) — filtert beide Layer
- Range-Switch: „Diese Woche" / „Nächste 4 Wochen" (aggregiert) / „Nur Mo–Fr"
- Legende: Gold=Geplant · Cyan=Optimal · Rot=Konflikt
- Counter: „X Posts geplant · Y goldene Slots ungenutzt"

**Interaktion:**
- **Hover Zelle** → Floating Card mit: Wochentag+Uhrzeit, alle Posts in diesem Slot (Thumbnail+Caption-Preview), Score-Reasons der Posting-Times
- **Click leere Cyan-Zelle** → öffnet Day-Cockpit für nächstes konkretes Datum dieses Slots, vorbefüllt mit Uhrzeit (greift in `handleDateClick` ein)
- **Click Gold-Dot** → öffnet bestehenden Post zur Bearbeitung
- **Right-Click** → „Best Slot vorschlagen lassen" (jumped zur hellsten freien Cyan-Zelle)

## Insight-Strip (unter der Heatmap)

Drei Bond-Glass-Cards generiert aus dem Datenabgleich:
1. **„Goldene Lücke"** — Bester ungenutzter Slot diese Woche (z.B. „Mi 19:00 — Score 94, keine Posts geplant") + CTA „Slot nutzen"
2. **„Konflikt-Warnung"** — Wenn ≥1 Slot mit Stau („Fr 11:00: 3 Posts gleichzeitig") + CTA „Verteilen"
3. **„Channel-Balance"** — Pie-Mini: Verteilung der geplanten Posts pro Kanal + Hinweis bei Schieflage

## Bond-2028-Optik

- Glass-Panel mit vertikaler Gold-Glow-Akzentlinie links (Enterprise-Pattern)
- Achsen-Labels in **Playfair Display Small-Caps** (Wochentag) + **JetBrains Mono Tabular** (Stunden)
- Zellen 28×28px mit 4px Gap, abgerundete Ecken
- Cyan-Layer: `radial-gradient` mit Score-modulierter Opacity (0.05 – 0.45)
- Gold-Dots: Glow-Shadow + subtiler 3s-Pulse bei Konflikten
- Hover: Zelle hebt sich (scale 1.08), Gold-Outline-Ring
- Empty-State: wenn 0 Posts → großes „Erstelle deinen ersten Post, um die Heatmap zu füllen" mit Cyan-Layer trotzdem sichtbar (zeigt die Slot-Empfehlung als Mehrwert sofort)
- **Keine horizontale Scrollbar** — Heatmap passt by-design in den Viewport (responsive: bei <900px werden Stunden zu 3h-Buckets gruppiert)

## Technisch

**Neu:**
- `src/components/calendar/views/HeatmapView.tsx` — Hauptkomponente
- `src/components/calendar/heatmap/HeatmapGrid.tsx` — 7×24 Grid-Rendering
- `src/components/calendar/heatmap/HeatmapCellPopover.tsx` — Hover-Detail
- `src/components/calendar/heatmap/HeatmapInsightStrip.tsx` — 3 Insight-Cards
- `src/lib/calendar/heatmap-aggregation.ts` — Pure-Function-Aggregation (Posts → Day×Hour-Bucket, Posting-Times → Score-Bucket, Konflikt-Detection)

**Geändert:**
- `src/pages/Calendar.tsx` — `case "timeline"` → `case "heatmap"` rendert `<HeatmapView>`; Tab-Label „Zeitleiste" → „Heatmap"; Icon `Timer` → `LayoutGrid`/`Activity`
- `src/components/calendar/CalendarToolbar.tsx` — Tab-Key + Label tauschen

**Wiederverwendet:**
- `usePostingTimes({ platform, days: 14 })` — bereits vorhanden, liefert Score+Reasons pro Slot
- `posts`-Array aus `transformedPosts` (gleiches Format wie Kanban)
- `handleDateClick(date)` — bereits implementiert für „leeren Slot klicken"
- Bond-2028-Tokens aus `index.css` (`--primary`, `--accent`, Glass-Klassen)

**Entfernt/Deprecated:**
- `TimelineView.tsx` bleibt im Repo (Code-Wiederverwendung möglich), aber aus dem Tab-Switch raus

**Daten-Flow:**
```text
posts (workspace, range)
  ├─→ aggregateToBuckets(posts) → Map<"Mon-09", Post[]>
  └─→ detectConflicts(buckets, threshold=3) → ConflictSet

usePostingTimes(activeChannel)
  └─→ slotsToScoreMap(days) → Map<"Mon-09", { score, reasons }>

→ HeatmapGrid bekommt: { bucketMap, scoreMap, conflicts, onCellClick, onPostClick }
```

**Out-of-Scope (Stage 2):**
- Drag-to-move Posts in andere Zellen
- Multi-Channel-Overlay (mehrere Channels gleichzeitig stacked)
- Export der Heatmap als PNG
- AI-„Auto-Verteilen": Konflikte automatisch in goldene Lücken schieben

## Ergebnis

Aus der nutzlosen Kampagnen-Linie wird ein **strategisches Pipeline-Cockpit**: Auf einen Blick siehst du *wann* du postest, *wann du posten solltest*, *wo du dich selbst kannibalisierst* — und mit einem Klick füllst du die goldenen Lücken. Sofortiger Mehrwert auch für leere Boards, weil die Posting-Times-Empfehlungen direkt anzeigen, *wo der erste Post hin sollte*.
