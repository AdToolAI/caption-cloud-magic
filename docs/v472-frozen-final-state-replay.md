# V472 — Final-State Replay der eingefrorenen S01-Pässe (READ-ONLY)

Scope: kein Provider-Call, kein DB-Write, kein Rerender. Die sechs eingefrorenen
Pässe von Szene `be60d106…` (Run `95b11254…`, Gen 15) werden mit der heutigen
Endlogik nachgerechnet:

`V469 mouth-visibility → V471 authoritative ROI → V465 mouth_over_frame (N=6)
→ V466 gray band (einmalige N=16-Nachmessung) → Endzustand`

Harness: `/tmp/v472/replay.py` (V469-Port + V471-ROI-Port auf dem
Produktions-Still-Pfad), Artefakte: gepinnte `preclip-a0.mp4` /
`provider-output-a0.mp4` je Pass.

## Ergebnis

| Pass | Sprecher | Frozen-Ausgang | V469 | ROI cy prod → V471 | V465 N=6 | N=16 | Endzustand heute |
|---|---|---|---|---|---|---|---|
| P0 | Sarah | NOOP terminal | **pass** (usable 1.00, aspect 0.69) | 0.5426 → 0.6083 | **1.301 NOOP** (prod-ROI 1.317) | — | **NOOP terminal** (`ssw:noop_fail`) |
| P1 | Sarah | NOOP terminal | pass (usable 1.00, aspect 0.74) | 0.5426 → 0.6083 | 2.338 INDET (prod-ROI 1.812 NOOP) | 2.419 INDET | **motion_unverified** (nicht-terminal, kein Refund, nicht grün) |
| P2 | Samuel | grün | pass | 0.5476 → 0.6126 | 4.220 MOVED | — | **GRÜN** |
| P3 | Samuel | NOOP terminal | pass | 0.5476 → 0.6126 | **3.829 MOVED** (prod-ROI 2.512 INDET) | — | **GRÜN** |
| P4 | Matthew | grün | pass | 0.5401 → 0.6082 | 2.190 INDET (prod-ROI 3.007 MOVED) | 2.238 INDET | **motion_unverified** (nicht-terminal) |
| P5 | Kay Mark | `canceled_by_scene_failure` | unevaluated (kein Track) | — | kein gepinntes Artefakt | — | **nie dispatched** |

## Befunde

1. **V469 blockiert in dieser Plate NICHTS.** Die Annahme „P0 wird wegen ~90°
   Profil vor Sync.so geblockt" ist durch die eingefrorene Evidenz widerlegt:
   der persistierte Face-Track von P0 hat `usable_frame_rate = 1.00`,
   `median_face_aspect = 0.687`, `mouth_landmark_rate = 1.00`, kein
   Silhouetten-Randtreffer. Der Profilbefund aus V468 stammte aus den
   Kontaktbögen, nicht aus der Track-Geometrie — V469 sieht hier kein positives
   Unbrauchbarkeits-Signal und bleibt (korrekt) fail-open.
2. **P0 ist ein echter NOOP.** Auch mit der autoritativen V471-ROI bleibt
   `mouth_over_frame = 1.301` (prod-ROI 1.317) klar unter 2.00. P0 war nie ein
   Messfehler. Ein S01-Canary auf dieser Plate würde also erneut rot — nicht
   wegen V469, sondern weil der Provider auf P0 real fast nichts am Mund tut.
3. **V471 repariert zwei Fälle.** P1 (belegter False-NOOP) fällt jetzt in das
   Grauband und läuft als `motion_unverified` durch; P3 kippt von terminalem
   NOOP zu klar MOVED (3.829).
4. **V471 macht P4 vorsichtiger.** P4 fällt von 3.007 (MOVED) auf 2.190
   (INDETERMINATE, N=16 2.238) — nicht terminal, aber nicht mehr grün. Die enge
   ROI sitzt bei P4 (kleinstes Gesicht, `moff dx −0.5 / dy 5.5`) am
   konservativen Rand. Keine Terminalitätsänderung, aber als Sensitivität notiert.
5. **P5 wurde nie dispatched** — Abbruch durch die Szenen-Terminalisierung, es
   existiert kein Provider-Artefakt.

## Konsequenz für den Canary

Ein Canary **auf dieser Plate** kann per Konstruktion kein 6/6-Erfolg werden:
P0 stirbt korrekt als echter NOOP. Er würde nur eine Frage beantworten, nämlich
ob P1/P3 live so laufen wie hier vorhergesagt (INDET → N16 → `motion_unverified`
bzw. MOVED).

Für einen echten 6/6-Erfolg braucht es eine Plate, in der jeder benötigte Turn
eine lipsync-fähige Mundpose enthält. Der verbleibende Produktpunkt ist damit
nicht mehr „Lip-Sync funktioniert nicht", sondern: **gezielte Plate-/Turn-
Regeneration, wenn die generierte Plate für einen Sprecher keine bearbeitbare
Mundpose liefert** — und V469 ist dafür in der aktuellen Form noch kein
ausreichender Detektor (Befund 1).

Keine Codeänderung in diesem Gate.
