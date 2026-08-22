# V453 — Grid-Collage-Erkennung im Anker (2x2), danach ein Rerender

## Befund der Read-Only-Diagnose

Szene `be60d106` (Rooftop-Test, Projekt V449):

- `clip_status = ready`, `lip_sync_status = failed`, `clip_error = motion_probe_indeterminate`, `twoshot_stage = needs_clip_rerender`, Plate-Generation 3.
- Der geladene Anker-Still (1376x768) ist tatsächlich eine **2x2-Kachel-Collage**: vier Portraits, zwei Reihen, sichtbare schwarze Trennlinien — kein gemeinsamer Raum.

Ursache, warum der V445/V446-Panel-Gate das durchgelassen hat: Der Klassifizierer in `supabase/functions/_shared/split-screen-layout.ts` erkennt ausschließlich **einreihige** Panel-Layouts. Erste harte Bedingung ist `sameBaseline` (y-Streuung der Gesichtsmitten <= 5 % der Plate-Höhe). Bei einem 2x2-Raster liegen die Gesichter auf **zwei** Baselines (ca. H/4 und 3H/4), die y-Streuung ist damit ~25 % — der Gate feuert nie, es gibt keinen Strict-Retry, und die Kachel-Platte geht in Clip und Lip-Sync.

Der Lip-Sync-Fehler (`motion_probe_indeterminate`) ist Folgeschaden derselben Platte, nicht der eigentliche Auslöser.

## Was gebaut wird

1. **Raster-Erkennung ergänzen** (`split-screen-layout.ts`, rein additiv):
   - Gesichter werden in Zeilen-Cluster gruppiert (y-Mitten, Toleranz relativ zur Plate-Höhe).
   - Ein Treffer liegt vor, wenn es >= 2 Zeilen gibt, jede Zeile >= 1 Gesicht hat, die Zeilenmitten nahe an den idealen Rasterlinien (H/(2R), 3H/(2R), …) liegen, die x-Mitten je Zeile an den Spaltenmitten sitzen und die Gesichtshöhen vergleichbar sind.
   - Bestehende Einreihen-Regeln (N=2-Spaltenregel, N>=3-Baseline-Regel) bleiben unverändert; nur wenn sie nicht greifen, läuft der Raster-Check.
   - Neue Begründung: `split_screen_grid(rows=…, cols=…, …)` — geht durch dieselbe Block-/Strict-Retry-/Refund-Bahn wie V446.
2. **Strict-Retry-Text schärfen** in `compose-scene-anchor`: explizit gegen 2x2-Raster / Video-Call-Grid / Kachel-Collagen, zusätzlich zu den bestehenden Streifen-/Spalten-Verboten.
3. **Tests**: neuer Deno-Testfall mit den echten Boxen dieses 2x2-Ankers (Treffer) plus Negativfälle (echte Gruppenaufnahme mit zwei Bildebenen darf nicht blockiert werden).
4. **Deploy**: nur `compose-video-clips` und `compose-scene-anchor`.
5. **Danach genau ein Rerender** von S01 (`be60d106`) im Projekt V449 — Reset der Lip-Sync-Kette und ein Owner-Lauf, keine weiteren Läufe.

## Nicht Teil dieses Gates

Keine Änderung an Motion-Metrik, Preclip-Geometrie, V450-NOOP-Retry, V452-Tracking oder am Frontend. Kein Frontend-Publish.

## Akzeptanz

- Der aktuelle 2x2-Anker wird vom Klassifizierer als Split-Screen erkannt (Test beweist das mit den realen Koordinaten).
- Bestehende V445/V446/V447-Tests bleiben grün.
- Der Rerender erzeugt eine Platte mit einem durchgehenden Raum; sonst blockt der Gate vor dem Video-Call und erstattet die Credits.
