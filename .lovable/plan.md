# Antwort auf deine zwei Fragen

## 1. Wird damit das Hauptproblem behoben?

Ja, sehr wahrscheinlich. Die aktuelle Analyse zeigt: Sync.so läuft durch, aber die ersten zwei Sprecher bekommen sehr wahrscheinlich falsche/verschobene Face-Crops.

In der letzten erfolgreichen Szene `731a4a05` sind die gespeicherten Sprecher-Koordinaten auffällig:

| Sprecher | Koordinate | Bewertung |
|---|---:|---|
| Samuel | `[618,313]` | verdächtig: viel zu tief / mittig |
| Matthew | `[550,154]` | plausibel, aber links von Samuel |
| Kailee | `[798,169]` | plausibel |
| Sarah | `[1032,161]` | plausibel |

Das passt exakt zum Symptom: Sprecher 3 und 4 sprechen, Sprecher 1 und 2 nicht. Der Fehler hängt also wahrscheinlich vor Sync.so: beim Mapping `Sprecher -> Gesicht -> Preclip`, nicht primär beim Sync.so-Payload.

## 2. Wird die Pipeline damit schneller?

Der Mapping-Fix allein macht sie nicht wesentlich schneller. Er verhindert falsche/no-op Läufe.

Die 23 Minuten kommen zusätzlich daher, dass die vier Sync.so-Passes aktuell faktisch seriell laufen. Im Code existiert zwar bereits ein Parallel-Fanout (`composer.parallel_sync_so_passes=true`), aber er ist durch einen zweiten Kill-Switch blockiert: `FEATURE_PLAN_D_FANOUT=false`. Dadurch wird trotz aktivem DB-Flag weiter passweise verkettet.

## Plan v137

### A. Hauptproblem: Speaker-Face-Mapping reparieren

1. In `twoshot-face-map.ts` die Face-Auswahl härten:
   - erkannte Plate-Faces nach robustem y-Band filtern, damit Ausreißer-/Hintergrund-Bboxes nicht als Sprecher-Slot zählen
   - danach strikt links-nach-rechts auf die tatsächliche Sprecheranzahl mappen
   - wenn weniger valide Faces als Sprecher vorhanden sind: klarer Forensik-Fehler statt stiller Heuristik

2. In `plate-face-identity.ts` Identity-Matching absichern:
   - Top-1/Top-2 Similarity-Margin prüfen
   - bei ambigen Matches, besonders ähnlichen Gesichtern, nicht blind dieselbe Face-ID mehrfach verwenden
   - Ambiguity als Telemetrie speichern

3. In `pass-face-preclip.ts` jeden 720x720 Preclip validieren:
   - Face nach dem Crop erkennen
   - prüfen, ob das dominante Gesicht nahe am Crop-Zentrum liegt
   - wenn nicht: einmal mit korrigierter Koordinate recenter/retry

4. In `compose-dialog-segments/index.ts` Forensik pro Pass speichern:
   - `coord_source`
   - `plate_face_count`
   - `plate_face_bboxes`
   - `mapping_decision_log`
   - `preclip_face_centroid`
   - `preclip_recenter_attempts`

### B. Geschwindigkeit: Parallelisierung sicher aktivieren

1. Den bestehenden Parallel-Fanout wieder nutzbar machen:
   - `composer.parallel_sync_so_passes` bleibt Feature-Flag
   - zusätzlich eine sichere Code-Konfiguration statt blockierendem Env-Kill-Switch verwenden
   - Concurrency-Cap erstmal konservativ auf 2 setzen

2. Erwarteter Effekt:
   - 4 Sprecher laufen nicht mehr komplett seriell
   - bei Cap 2 sollten 23 Minuten grob Richtung 10-14 Minuten fallen
   - bei späterem Cap 3/4 eventuell weiter Richtung 6-9 Minuten, aber erst nach stabilen Tests

3. Race-Safety bleibt erhalten:
   - per-pass Updates weiter über atomare Slot-Updates/RPC
   - Webhook chained nur noch ausstehende Passes
   - keine mehrfachen Pass-Dispatches

### C. Timing-Forensik ergänzen

1. Pro Pass Zeitstempel speichern:
   - preclip render start/end
   - Sync.so dispatch time
   - webhook completion time
   - mux/stitch time

2. Damit sehen wir künftig sofort, ob Wartezeit bei Preclip, Sync.so, Webhook oder Final-Mux liegt.

### D. Dokumentation

Neue Memory-Doku:
- `mem/architecture/lipsync/v137-speaker-face-mapping-and-parallel-fanout.md`

Updates:
- `mem/index.md`
- `.lovable/plan.md`

## Erfolgskriterium

Nach sauberem Neustart der Szene muss im Forensik-Panel sichtbar sein:

- alle 4 Sprecher haben plausible `coords`
- `coord_source` ist `identity` oder `slot_filtered`, nicht `heuristic`
- `preclip_face_centroid` liegt nahe `[360,360]`
- Sprecher 1-4 zeigen sichtbaren Lip Sync
- Laufzeit ist deutlich unter 23 Minuten, ideal zuerst ca. 10-14 Minuten mit Cap 2
