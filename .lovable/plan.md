# V453 — 2×2-Panel-Anker: Detektor auf Raster erweitern

## Was tatsächlich passiert ist (belegt)

Szene `be60d106…` (Rooftop, Projekt `ed82075f…`) ist heute um 22:50 UTC mit
`motion_probe_indeterminate` gescheitert. Der Grund liegt aber nicht im
Lip-Sync, sondern eine Stufe früher:

Das **Anker-Bild der Szene ist selbst eine 2×2-Kollage** — vier separate
Portraits in zwei Reihen mit sichtbaren Trennlinien (heruntergeladen und
visuell geprüft, 1376×768). Aus diesem Anker entsteht zwangsläufig eine
Panel-Platte, deshalb sind auch nach „Clip 6/6" wieder vier Fenster zu sehen.

Warum der bestehende Schutz nicht griff: der Klassifizierer
`supabase/functions/_shared/split-screen-layout.ts` (V445/V447) ist
**eindimensional**. Er verlangt, dass alle Gesichter auf **einer** Grundlinie
liegen (`ySpreadPct <= 5%`). Bei einem 2×2-Raster liegen zwei Gesichter oben
und zwei unten — die y-Streuung ist gross, das Urteil lautet „kein
Split-Screen", und der V446-Anker-Gate lässt das Bild durch. Der Detektor
erkennt bisher nur Streifen nebeneinander, nicht Raster.

## Was gebaut wird

### 1. Raster-Erkennung im Klassifizierer
`classifySplitScreenLayout` bekommt zusätzlich zur bestehenden Streifen-Regel
eine Raster-Regel (bestehende Regeln bleiben unverändert):

- Gesichtszentren werden nach y in Zeilen gruppiert (Toleranz 5 % Bildhöhe).
- Raster-Verdikt, wenn: ≥ 2 Zeilen, jede Zeile hat gleich viele Gesichter
  (≥ 2), die Spaltenmitten der Zeilen stimmen überein (≤ 6 % Bildbreite),
  Zeilen sind gleichmässig über die Höhe verteilt und die Gesichtshöhen
  streuen ≤ 25 %.
- Neuer Reason-String `split_screen_grid(rows=…, cols=…, …)`, damit
  Streifen- und Raster-Fall in der Telemetrie unterscheidbar bleiben.

### 2. Zweites, bildbasiertes Signal (Naht-Detektor)
Unabhängig von der Gesichtserkennung wird auf dem Anker geprüft, ob bei
x = W/2 bzw. y = H/2 (und bei 3 Spalten W/3, 2W/3) eine harte
Inhalts-Diskontinuität mit lokalem Luminanz-Einbruch liegt. Nur wenn beide
Kriterien (Bruchkante + dunkle Linie) zutreffen, gilt es als Naht. Das
schliesst den Fall, in dem Rekognition nicht alle Gesichter findet und die
Geometrie-Regel deshalb fail-open geht.

### 3. Anker-Prompt und Pin-Invalidierung
- `ANCHOR_AUDIT_VERSION` 15 → 16: alle gepinnten Anker (inklusive der
  aktuellen Kollage) werden beim nächsten Lauf neu komponiert.
- Negativ-Prompt und Retry-Direktive in `compose-video-clips` bekommen
  explizite Raster-Begriffe: `2x2 grid`, `quad grid`, `two rows of portraits`,
  `stacked panels`, `grid of headshots`.

### 4. Verhalten bei Treffer (unverändert)
Panel-Anker → Retry mit Anti-Panel-Direktive → bei erneutem Treffer
harter Block **vor** jeder bezahlten Provider-Dispatch, mit dem bestehenden
idempotenten v117-Refund-Pfad und der bereits lokalisierten Fehlermeldung.

## Tests
- Neue Fälle im bestehenden Deno-Test: echtes 2×2-Raster (Treffer),
  3×2-Raster (Treffer), echte Gruppenaufnahme mit Tiefenstaffelung
  (kein Treffer), Zwei-Personen-Kollage (weiterhin Treffer),
  Streifen N≥3 (weiterhin Treffer).
- Naht-Detektor mit synthetischen Bildern (Kollage vs. durchgehende Szene).

## Technische Details
- `supabase/functions/_shared/split-screen-layout.ts` — Raster-Regel.
- `supabase/functions/_shared/anchor-seam-probe.ts` (neu) — Naht-Detektor.
- `supabase/functions/compose-video-clips/index.ts` — Gate-Verdrahtung,
  Audit-Version, Prompt/Negativ-Prompt.
- `supabase/functions/compose-dialog-segments/index.ts` — nutzt denselben
  Klassifizierer, profitiert ohne Änderung.
- Deploy: `compose-video-clips`, `compose-dialog-segments`.
- Kein Eingriff in V443/V450/V452 (Mess-Logik, Frozen Wire, Kamerapfad).

## Nicht Teil dieses Gates
Kein automatischer Rerender. Nach Deploy startest du genau einen manuellen
Lauf der Rooftop-Szene; danach lässt sich sauber unterscheiden, ob das
Anker-Modell ohne Kollage liefert oder ob der Gate korrekt blockt.
