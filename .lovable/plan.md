# Lip-Sync-Pipeline: Stabilisierungsplan

## Ausgangslage (belegt)

Für Szene `69d56a49…` zeigt `syncso_dispatch_log` vier erfolgreiche Dispatches mit Face-Share bis 30,9 %. Die Pixel-Analyse der Sync.so-Ergebnisse ergab eine Änderung von nur 0,36–2,59/255 gegenüber dem Input: **der Provider liefert No-Op-Clips und meldet trotzdem `completed`**. Die Bewegungsprüfung lief bisher nur clientseitig (Best-Effort) und wurde nicht ausgelöst — also wurden statische Clips als `done` akzeptiert und gemuxt.

Kernproblem ist damit nicht die Geometrie, sondern: **wir vertrauen dem Provider-Statuscode statt dem tatsächlichen Bild.** Alle bisherigen Einzel-Fixes (v33x–v34x) haben an Gates gedreht, ohne diese eine Lücke zu schließen.

## Leitprinzipien

1. Einzige Wahrheit für „Lip-Sync ist gelungen" ist ein **serverseitig gemessenes Mundbewegungs-Signal**, nicht der Provider-Status.
2. Gates dürfen nur **blocken**, nie **freigeben**. Kein Gate darf ohne Messung „trusted" sagen.
3. Jeder Abbruch ist **terminal, sichtbar und rückerstattet** — kein stiller Hänger.
4. Keine neuen Heuristiken ohne Messwert, der sie widerlegen kann.

## Phase 1 — Server-Motion-Verdict (der eigentliche Fix)

Neue geteilte Komponente `_shared/mouth-motion-verdict.ts` plus Ausführung in `render-sync-segments-audio-mux` **vor** dem Mux und **vor** dem Setzen von `status = 'done'`:

- Frames aus dem Sync.so-Output an N Zeitpunkten innerhalb des Sprechfensters ziehen (bestehende `face-frame-extract.ts`-Infrastruktur nutzen).
- Für jeden Sprecher-Slot die Mundregion aus der bekannten Preclip-Geometrie ausschneiden und die **Differenz-Varianz gegenüber dem Input-Plate an denselben Zeitpunkten** berechnen.
- Verdikt pro Pass: `moved` / `static`. Schwelle einmalig kalibriert an einem bekannt-guten Clip vom 27.07. und als Konstante hinterlegt, nicht pro Szene getunt.
- `static` ⇒ Pass gilt als fehlgeschlagen, unabhängig vom Provider-Status.

Der clientseitige Probe-Hook in `SceneClipProgress` wird auf reine Anzeige reduziert und trifft keine Freigabeentscheidung mehr.

## Phase 2 — Deterministische Preclip-Geometrie

Ein einziger Pfad in `pass-face-preclip.ts`, der aus echten Landmarks bzw. Face-Bbox eine Crop-Box mit garantiertem Face-Share erzeugt. Dazu:

- Sämtliche parallelen Rettungs-/Synthetik-Pfade und konkurrierenden Face-Share-Floors aus v33x–v34x konsolidieren auf **einen** Floor und **eine** Berechnungsfunktion.
- `syncso-face-gate.ts` verliert alle „trust ohne Probe"-Ausnahmen. Fehlt die Messung, wird nicht dispatcht.
- Geometrie jedes Passes wird persistiert, damit Phase 1 exakt dieselbe Mundregion messen kann wie beim Zuschnitt verwendet.

## Phase 3 — Retry und Provider-Fallback

- Pass mit Verdikt `static`: **ein** automatischer Retry mit engerem Crop (höherer Face-Share).
- Zweites `static`: Fallback auf den alternativen Lip-Sync-Provider für genau diesen Pass.
- Auch dann `static`: Szene terminal auf `failed` mit klarer Ursache `provider_returned_static_output`, automatischer Credit-Refund, kein Mux.
- `lipsync-watchdog` bleibt Sicherheitsnetz gegen Hänger, ist aber nicht mehr der einzige Ausweg.

## Phase 4 — Observability und Regressionsschutz

- Jede Pass-Auswertung schreibt Verdikt, Messwert, Face-Share und Provider in `syncso_dispatch_log`.
- Kleine Admin-Ansicht: letzte 50 Passes mit Verdikt und Ursache — damit „trifft kein Lip-Sync" künftig in einer Minute statt in einer Session beantwortbar ist.
- Ein Referenzclip als Golden Sample: liefert das Verdict-Modul dort nicht `moved`, ist die Messung selbst kaputt.

## Reihenfolge und Abnahme

Phase 1 zuerst und isoliert testen — ab da kann kein statischer Clip mehr als fertig gelten. Danach 2, 3, 4.

Abnahmekriterium: eine Vier-Sprecher-Szene erzeugt entweder ein Video mit messbarer Mundbewegung in allen vier Slots, oder einen klar begründeten, rückerstatteten Fehlschlag. Ein stiller Erfolg ohne Bewegung ist danach technisch nicht mehr möglich.

## Technische Details

- Neu: `supabase/functions/_shared/mouth-motion-verdict.ts`
- Geändert: `render-sync-segments-audio-mux`, `pass-face-preclip.ts`, `syncso-face-gate.ts`, `compose-dialog-segments`, `lipsync-watchdog`
- Entfernt/zusammengeführt: konkurrierende Face-Share-Floors und Trust-Ausnahmen aus v334–v342
- Client: `SceneClipProgress` nur noch Anzeige
- Migration: Verdikt-Felder in `syncso_dispatch_log`
