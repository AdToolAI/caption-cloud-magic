# Alle Exporte auf 12 parallele Arbeiter

## Was sich ändert

Jeder Export teilt seine Arbeit künftig auf bis zu **12 Arbeiter gleichzeitig** auf — egal ob
kurzer 10-Sekunden-Clip oder langes Video. Heute bekommen kurze Clips 6, mittlere 5, lange 8
und nur sehr lange 12 Arbeiter. Das war eine Sparmaßnahme aus der Zeit, als wir wenig
Kapazität hatten.

Erwartete Wirkung bei einem 10-Sekunden-Clip (241 Bilder), heute 6 Arbeiter à 41 Bilder:
mit 12 Arbeitern je 21 Bilder — grob **halbe Renderzeit** bei 4K und 8K, solange genug
Kapazität frei ist. Bei mittleren Clips (5 → 12 Arbeiter) fällt der Gewinn am größten aus.

## Wichtig zur Einordnung

- **Hochskalieren und Verbessern ("Enhance") laufen nicht bei uns**, sondern bei den
  Anbietern (Topaz, ByteDance). Dort haben unsere Arbeiter keinen Einfluss — diese
  Wartezeiten bleiben unverändert. Schneller werden ausschließlich die eigenen Exporte.
- **Der Gesamtvorrat bleibt bei 100 Plätzen** (AWS-Kontingent), davon 60 für Exporte.
  Mit 12 Arbeitern pro Export laufen 5 Exporte gleichzeitig statt bisher bis zu 12.
  Bei Andrang warten Nutzer also etwas häufiger kurz — der einzelne Export ist dafür
  deutlich schneller. Gründer behalten ihren reservierten Bereich.
- **Genau das erzeugt die Auslastung, die AWS sehen soll.** Sobald die höhere Quote
  (500+) freigegeben ist, wird der Pool angehoben und beides gilt zusammen.

## Umsetzung

`supabase/functions/_shared/render-concurrency.ts`:

- Alle vier Stufen (`short`, `standard`, `long`, `export`) auf `maxWorkers: 12`.
- `framesPerLambda = max(30, ceil(frames / 12))`; die 120-Bilder-Untergrenze
  (`FRAMES_PER_LAMBDA_MIN`) gilt nur noch für Clips ab 900 Bildern, damit lange Renders
  nicht in unnötig viele Mini-Blöcke zerfallen (jeder Block hat Anlaufkosten).
- `estimateWorkersFromDuration` liefert dadurch automatisch 12 für die Warteschlangen-Planung.

Damit die Warteschlange nicht sofort dichtmacht:

- `RENDER_SLOT_BUDGET_DEFAULT` von 60 auf **80** (deckt sich mit dem bereits dokumentierten
  Launch-Wert und der Anzeige im Frontend, `src/hooks/useRenderSystemLoad.ts`).
- `FOUNDER_RESERVE_HIGH_WATER` von 50 auf **68** (gleiche Quelle), damit die
  Gründer-Reserve weiterhin bei ~85 % Auslastung greift und nicht schon bei 4 Exporten.

Neu deployt werden müssen die Funktionen, die diese Datei nutzen:
`render-directors-cut`, `render-with-remotion`, `render-queue-add`, `render-queue-manager`.

Unangetastet: Abrechnung, Wallet, Encode-Qualitätsboden (JPEG 95 / CRF 16 / Bitraten),
Auflösungs-Mapping inklusive echtem 8K, Lip-Sync-Mux-Pfad, Video-Generierung,
Rohmaterial-Invariante.

## Prüfung

- Je ein 10-Sekunden-Testexport in HD, 4K und 8K; Renderzeit gegen die Messwerte von
  gestern (4K 5–10 Min, HD 1–2,5 Min) gegenhalten und im Ergebnis berichten.
- Logzeile `tier=…, maxWorkers=12, framesPerLambda=…` im Funktionsprotokoll bestätigen.
- Typecheck und Build.
