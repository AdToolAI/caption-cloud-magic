# Plan v239 — Anchor-Repair-Overwrite endgültig entschärfen (Single + Multi-Speaker)

## Kernproblem (in einem Satz)
Der `v185-anchor-repair`-Pfad in `compose-dialog-segments/index.ts` überschreibt korrekt detektierte Plate-BBoxen (Gemini/AWS) mit einer Anchor-abgeleiteten Notfall-Box, sobald die Identitäts-Confidence unter 0.60 liegt — sowohl bei N=1 (Mund bleibt zu, falsche Region) als auch bei N≥2 (nur die niedrig-konfidenten Slots kippen, siehe „Sprecher 3+4 statt 1+2").

## Ziel
`v185-repair` wird von einem **standardmäßig aktiven Overwrite** zu einer **letzten Notfall-Bremse** — er darf nur noch feuern, wenn die Plate-Box eindeutig unbrauchbar ist (offensichtlich außerhalb des Bildes, Nullfläche, oder klarer False-Positive auf Non-Face-Region).

## Änderungen

### 1. `compose-dialog-segments/index.ts` — Repair-Gate härten (Zeile ~1859–1994)

- **Neue Priorität 1 — Gemini/AWS-Detection ist authoritativ**  
  Wenn `plateIdentityMap.faces[i]` eine BBox mit `confidence ≥ 0.70` **oder** `matchConfidence ≥ 0.55` liefert, wird dieser Slot als *trusted* markiert — unabhängig vom `coordSources`-Tag. Trusted-Slots werden nie repariert.
- **Neue Priorität 2 — Sanity-Check statt Anchor-Vergleich**  
  Für nicht-trusted Slots ersetzen wir den Anchor-in-BBox-Test durch drei objektive Sanity-Kriterien:
  1. BBox liegt komplett im Plate (mit ≤ 5 % Toleranz).
  2. BBox-Fläche zwischen 0.3 % und 25 % der Plate-Fläche.
  3. BBox-Aspect-Ratio zwischen 0.4 und 2.5.
  Fällt ein Kriterium, gilt der Slot als *broken* und wird repariert. Anchor-Drift alleine löst keinen Repair mehr aus.
- **Repair selbst bleibt unverändert** (Median-Nachbarn + Anchor-Zentrierung), aber nur für tatsächlich broken slots.
- **Neues Log**: `v239_repair_gate trusted=X/N sanity_ok=Y/N repaired=Z/N reasons=[...]` mit `scene_id` und Slot-Details für spätere Diagnose.

### 2. `compose-dialog-segments/index.ts` — Motion Content Gate für N=1 nachziehen (Zeile Umgebung `v113` / `v231`)
- Sicherstellen, dass der N=1 Byte-Check-Retry nach v239 nur noch dann feuert, wenn Sync.so nachweislich einen Noop lieferte — nicht wegen einer reparaturbedingt falschen BBox.

### 3. Beobachtbarkeit
- `plate_identity_min_confidence`, `plate_identity_min_margin`, und neu `v239_repaired_slots` in den bestehenden Diagnostik-Payload aufnehmen (`compose_diagnostics_events` / `scene_events`), damit wir bei Support-Tickets sofort sehen, welcher Slot repariert wurde und warum.

## Was NICHT geändert wird
- Kein Wechsel Gemini → AWS. Gemini liefert korrekte Daten; das Problem lag ausschließlich im Downstream-Overwrite.
- Keine Änderung an `v183-anchor-identity-slot-bridge`, `v189-identity-trust-gate` selbst (nur der Gate wird strenger), `v181`, `v185`-Preclip-Logik, oder Sync.so-Dispatch.
- Keine UI-, Briefing- oder Studio-Änderungen.

## Verifikation
1. **Multi-Speaker-Regression-Case** (Szene mit 4 Sprechern, gemischte Confidences): erwartet `v239_repair_gate trusted=4/4 repaired=0/4`, alle vier Speaker mit korrekter Lip-Motion.
2. **Single-Speaker-Case aus der aktuellen Meldung** (Szene `f663b958`): erwartet `trusted=1/1 repaired=0/1`, Mund folgt Skript, kein Character-Miss.
3. **Echter False-Positive-Case** (künstlich: BBox 5×5 auf Whiteboard): erwartet `repaired=1/N reasons=[area_too_small]`, Sync.so bekommt eine plausible Box.
4. **Logs** (`edge_function_logs`): `v239_repair_gate` erscheint für jede Szene; `v185_anchor_plate_bbox_repair` fällt bei sauberen Szenen auf 0.

## Technische Notizen
- Der Trust-Threshold `0.60` wird bewusst nur für den *Fallback*-Pfad gehalten. Die neue primäre Regel ist `detectorConfidence ≥ 0.70` (Gemini-nativ) — das entspricht dem Bereich, den wir empirisch in den Logs als „nie falsch" beobachten.
- Änderung ist rein additiv/Restriktion — keine DB-Migration, keine neuen Secrets, keine Client-Änderungen nötig.
- Rollout ist rückwärtskompatibel: fällt der neue Gate durch (z. B. plateIdentityMap fehlt), greift der bisherige v185-Pfad exakt wie heute.
