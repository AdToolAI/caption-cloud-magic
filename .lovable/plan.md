# V436 — v117 Plate-Gate False-Positive: RCA-Abschluss + minimaler Fix

Der von dir ausgelöste Referenzlauf für V435 ist nicht am Render gescheitert, sondern an einem Gate,
das gegen seinen eigenen dokumentierten Vertrag blockt. Belegte Fakten aus diesem Lauf:

| Zeitpunkt (UTC) | Ereignis |
|---|---|
| 00:24:54 | Harter Reset, `plate_generation` 3 → 4, Artefakte gepurgt |
| 00:24:54 → 00:30:40 | `base_video` (HappyHorse, Job `1mbs4fwq…`) → `succeeded` |
| 00:31:02 | `compose-dialog-segments` startet, `plateDims` per mp4_probe = 1284×718 |
| 00:31:13 | `v158_plate_hydration … speakers=4 boxes=4/4 mouths=0/4` |
| 00:31:13 | `plate-identity unavailable — using anchor-rescale coords` |
| 00:31:13 | `v117_plate_quality_gate_BLOCK plate_identity_unavailable` → 960 Credits erstattet |

Ergebnis in der DB: `lip_sync_status=failed`, `pipeline_substate=lipsync_failed`, `clip_url` leer,
`plate_ready_generation=NULL`. **Null Sync-Pässe → null V435-Pins.**

## Zwei belegte Defekte

**D1 — Gate widerspricht dem v117-Vertrag.**
Der Codekommentar über dem Gate hält ausdrücklich fest, dass nur *physisch fehlende Gesichter*
blocken dürfen und ein Identity-Resolution-Ausfall über den Slot-Order-Fallback abgedeckt ist.
Die Bedingung enthält aber zusätzlich `!plateIdentityMap` — genau der Fall, der hier eintrat,
während die Box-Hydration 4 von 4 Gesichtern hatte.

**D2 — Fehlermeldung passt nicht zum reason-Zweig.**
Bei `reason = plate_identity_unavailable` wird trotzdem der Text „recognized: 0 of 4" gerendert.
Das hat die Diagnose in die falsche Richtung geschickt (vermeintlicher Render-Fehler).

Nicht belegt und deshalb kein Teil einer Behauptung: *warum* `resolvePlateFaceIdentities` `null`
lieferte. Ein `resolve threw`-Warning steht nicht im Log, ein stiller Null-Rückweg ist also
wahrscheinlicher — das wird gemessen, nicht geraten.

## Umfang des Fix-Gates

**Schritt 1 — Diagnose scharfstellen (read-then-fix)**
`resolvePlateFaceIdentities` bekommt an jedem Rückweg, der kein Ergebnis liefert, einen expliziten
Grundcode im Log (`no_anchor`, `provider_empty`, `provider_error`, `expected_count_mismatch`, …).
Ohne diesen Grund wird D1 nicht angefasst — sonst tauschen wir einen False-Positive gegen einen
stillen Fehlstart.

**Schritt 2 — D1 korrigieren, eng begrenzt**
`!plateIdentityMap` allein blockt nicht mehr. Geblockt wird künftig nur noch, wenn
- die hydrierten Box-Koordinaten weniger Sprecher abdecken als erwartet (`boxes < speakers`), oder
- der Split-Screen-Detektor anschlägt.
Liegt eine vollständige Box-Hydration vor (`boxes = speakers`), läuft der Dispatch mit
Slot-Order-Koordinaten weiter und protokolliert `v117_soft_pass_identity_unavailable`.
Keine Änderung an Schwellwerten, Provider-Auswahl, Retry-Stufen, Mux oder State-Machine.

**Schritt 3 — D2 korrigieren**
Die Nutzermeldung wird pro reason-Zweig korrekt gewählt, dreisprachig (EN/DE/ES), und nennt bei
Identity-Ausfall den tatsächlichen Grund statt einer erfundenen Gesichtszählung.

**Schritt 4 — Regressionstests**
Tests für die Gate-Entscheidungstabelle: `boxes<speakers` → BLOCK, Split-Screen → BLOCK,
`identityMap=null` bei `boxes=speakers` → PASS, `identityMap` vorhanden aber `resolved<speakers`
→ PASS. Plus ein Test, dass die Meldung zum reason-Zweig passt.

## Außerhalb dieses Gates

- Kein zweiter Samuel-Lauf. Der V435-Referenzlauf wird erst nach deinem separaten GO neu gestartet,
  weil jeder Lauf einen echten Plate-Render kostet.
- Der falsche UI-Text „Starting lip-sync…" während der Plate-Phase bleibt vorerst stehen; er ist
  kosmetisch und wird separat behandelt.
- Keine Anpassung der V435-Kalibrierung. MAD-Ratio bleibt `telemetry_only`.

## Abschluss

Ein Urteil in der Form:
`V436 = PASS — v117 GATE CONTRACT RESTORED, IDENTITY-NULL REASON INSTRUMENTED, MESSAGE/REASON PARITY, <n> TESTS GREEN → V435 PHASE 1 BEREIT FÜR NEUSTART`
oder ein ehrliches BLOCKED mit Begründung.
