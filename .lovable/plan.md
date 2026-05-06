## Ziel

Die eingeloggte Startseite (`/home`) wirkt aktuell zusammengequetscht: Heatmap + Aktivitäten + Streak teilen sich eine enge Zeile, Performance-KPIs stehen winzig neben den KI-Tipps, und der Inhalt nutzt die Breite bei mittleren Viewports (~1060px) schlecht. Wir bauen ein ruhigeres, modernes Layout im James‑Bond‑2028‑Stil mit mehr Atemraum und klarer Hierarchie – ohne neue Features.

## Was sich für den Nutzer ändert

- Mehr Luft zwischen den Blöcken, größere Section-Überschriften, klare visuelle Hierarchie.
- Performance bekommt eine eigene, breite Zeile mit großen KPI-Karten (statt drei Mini-Tiles neben einem Tipps-Block).
- Heatmap nimmt die volle Breite ein (deutlich besser lesbar) – Recent Activity rückt darunter.
- Streak wandert in eine schmale rechte Sidebar-Spalte neben Recent Activity, statt mit drei Spalten in eine Section gequetscht.
- KI-Empfehlungen + News-Insight sitzen als ruhige 2‑Spalten-Zeile unter Performance.
- Auf Tablet/Notebook (≈1060px) wird zuerst auf 1‑Spalten-Stack umgeschaltet, statt zwei Spalten zu quetschen – sauberer Breakpoint bei `xl` (1280px) statt `lg`.

## Neue Reihenfolge der Sektionen

```text
1. FirstVideoExpressHero (unverändert, nur mehr Margin)
2. DashboardVideoCarousel (Hero-Banner, unverändert)
3. Diese Woche – Wochen-Timeline (volle Breite, mehr Padding)
4. Schnellaktionen / FeatureGrid (unverändert)
5. Performance-Überblick (volle Breite, 3 große KPI-Karten + Sparkline-Akzent)
6. KI-Empfehlungen | News-Insight  (xl: 2 Spalten, sonst gestapelt)
7. Beste Posting-Zeiten – Heatmap (volle Breite)
8. Letzte Aktivitäten (2/3) | Streak (1/3)  (xl: 2 Spalten, sonst gestapelt)
```

## Technische Änderungen

Nur `src/pages/Home.tsx` wird angefasst – keine neuen Dependencies, keine Backend-Changes.

- Container-Spacing: `py-4 space-y-4` → `py-8 space-y-10`, `max-w-7xl` bleibt.
- Alle Grids von `lg:grid-cols-2` → `xl:grid-cols-2` und `gap-4` → `gap-6`, damit bei 1060px kein 2‑Spalten-Quetsch mehr passiert.
- Performance-Section eigenständig in voller Breite, KPI-Karten mit `p-6`, größerer Value-Schrift (Tailwind: `text-3xl`/`text-4xl`) – nutzt vorhandene `MetricCard` (ggf. `size="lg"` Prop, sonst Wrapper-Klassen).
- Heatmap-Section eigenständig in voller Breite (raus aus dem 2‑Spalten-Grid mit Recent Activity).
- Recent Activity + Streak in neue Zeile: `grid xl:grid-cols-3 gap-6` mit `xl:col-span-2` für Activity, `xl:col-span-1` für Streak.
- KI-Empfehlungen + (optional) News-Insight als neue 2‑Spalten-Zeile direkt unter Performance.
- `Section`-Komponente: konsistente `bg`-Nutzung – abwechselnd `default` / `muted`, damit Blöcke optisch trennen.

## Was NICHT geändert wird

- Datenquellen, Hooks, KPI-Berechnung, Strategy-Mode-Logik, Carousel, Editor-Dialoge.
- Andere Seiten (`/`, `/personalized-dashboard` etc.) bleiben unberührt.
- Keine neuen Bilder/Assets.

## Nach Approval

Ich setze die Layout-Änderungen direkt in `src/pages/Home.tsx` um und prüfe das Ergebnis bei 1060px und 1440px Viewport.
