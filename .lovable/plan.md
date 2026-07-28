## Ziel
Der Bereich „Why this tool wins the game" (`MissionFeatures.tsx`) wird zum **Live-Metrik-Cockpit** im Bond-2028-Look — ohne erfundene Zahlen. Alle Werte sind qualitative Demo-Visualisierungen mit deutlich sichtbarem **„Beta Preview"**-Label.

## Neue Section-Struktur

```text
[Warum AdTool • Beta Preview]
  Why this tool wins the game
  Drei Schritte … skalierbar.

┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
│ 01  📅 Plan Cockpit   │ │ 02  📊 Signal Cockpit │ │ 03  🚀 Scale Cockpit  │
│                       │ │                       │ │                       │
│ Mini-Kalender-Heatmap │ │ Live-Sparkline        │ │ Radiale Progress-Ringe│
│ (7×4 pulsierende Slots│ │ + animierter Counter  │ │ + „Auto-Publish"-     │
│  in Gold, „optimal"-  │ │ (Reach ▲, CTR ▲) mit  │ │ Ticker mit fließenden │
│  Slots leuchten)      │ │ Rising-Bars           │ │ Kanälen (TikTok,      │
│                       │ │                       │ │  Meta, YT, X)         │
│ „Plane deinen Monat"  │ │ „Optimiere Performance│ │ „Skaliere Kampagnen"  │
│  Beschreibung…        │ │  Beschreibung…        │ │  Beschreibung…        │
│                       │ │                       │ │                       │
│ [Beta Preview]  →     │ │ [Beta Preview]  →     │ │ [Beta Preview]  →     │
└───────────────────────┘ └───────────────────────┘ └───────────────────────┘

Untere Leiste: 4 Micro-Beweiskacheln (rein qualitativ):
  ⚡ Multi-Provider  │  🎬 Cinematic Lip-Sync  │  🧠 Cast & World Lock  │  🔒 Beta-Preisgarantie
```

## Umsetzung (Frontend only, `MissionFeatures.tsx` + 3 neue Cockpit-Komponenten)

1. **Neue Komponenten** unter `src/components/landing/cockpits/`:
   - `PlanCockpit.tsx` — 7×4 Grid pulsierender Zellen; goldene „optimal slots" leuchten in Wellen (framer-motion `staggerChildren` + Opazitäts-Loop). Keine Zahlen, nur Slots.
   - `SignalCockpit.tsx` — SVG-Sparkline animiert per `pathLength`, darunter 4 kleine Rising-Bars. Ein weicher Counter (0 → „▲") ohne konkrete KPI-Zahl — stattdessen Labels „Reach", „CTR", „Watch-Time" mit ▲-Pfeil.
   - `ScaleCockpit.tsx` — 4 kleine radiale Progress-Ringe (SVG `strokeDashoffset` Animation) für Kanäle (TikTok/Meta/YT/X) + darüber laufender „Auto-Publish"-Ticker mit `translateY`-Loop.
   - Alle drei sind pure Presentational-Komponenten, respektieren `prefers-reduced-motion`, kein Data-Fetching, kein Netzwerk.

2. **`MissionFeatures.tsx` Refactor**:
   - Karten werden höher, Cockpit-Visual sitzt oben (h ~180px), darunter Icon+Titel+Beschreibung.
   - Hover: Bond-Goldrand-Glow (`shadow-glow-gold`), leichter 3D-Tilt via `whileHover={{ y: -4 }}`, Cockpit-Animation beschleunigt.
   - Jede Karte bekommt ein kleines **„Beta Preview"**-Chip unten links (Cyan-Punkt + Text), damit klar ist: Visualisierung, keine echten KPIs.
   - Step-Nummer (01/02/03) bleibt als große Ghost-Zahl im Hintergrund.

3. **Untere Beweisleiste (neu, gleiche Section)**:
   - 4 kleine Glas-Kacheln mit Icon + Kurz-Label (rein qualitativ, keine Zahlen). Fade-In bei Viewport-Sicht.

4. **Übersetzungen** in `src/lib/translations.ts`:
   - Neue Keys (EN/DE/ES): `landing.mission.betaPreview`, `landing.mission.cockpit.plan.label`, `.signal.label`, `.scale.label`, `landing.mission.proof.multiProvider|lipSync|castLock|priceGuarantee`.
   - Bestehende Titel/Beschreibungen unverändert.

5. **Design-Tokens**: Nur bestehende Tokens (`primary`, `gold-dark`, `accent`, `shadow-glow-gold`, `card`, `border`). Keine hartkodierten Farben.

6. **Motion-Regeln**: Alle Loops respektieren `useReducedMotion()` von framer-motion (freeze auf statisches Frame).

## Ehrlichkeits-Guard
- **Kein einziger konkreter Zahlenwert** (kein „+248%", kein „12.400 Reichweite"). Nur Pfeile (▲), Slot-Leuchten, Fortschrittsringe ohne %-Zahl.
- **Beta-Preview-Chip** auf jeder Cockpit-Karte.
- Beweisleiste zeigt nur Feature-Namen, keine Metriken.

## Nicht enthalten
- Kein Backend-Call, keine echten Nutzerdaten (per deiner Antwort ausgeschlossen).
- Keine Änderung an Text der Section-Headline oder Subtitle.
- Keine Änderung an anderen Landing-Sections.

## Technische Details
- Neue Dateien: `PlanCockpit.tsx`, `SignalCockpit.tsx`, `ScaleCockpit.tsx`.
- Geänderte Dateien: `MissionFeatures.tsx`, `src/lib/translations.ts`.
- Libraries: framer-motion (bereits im Projekt), keine neuen Deps.
- Accessibility: `aria-hidden` auf reine Deko-SVGs, `role="img"` mit `aria-label` auf Cockpit-Container.
