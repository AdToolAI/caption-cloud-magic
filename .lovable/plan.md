# V459 abschliessen, danach V460 — v400 T8–T12 Contract Parity Audit (read-only)

Zwei Probleme, strikt getrennt. Kein Detector-Schwellenwert wird angefasst, solange nicht
bewiesen ist, dass ein eingefrorener Provider-Output sichtbare Lippenbewegung hat.

## Gemessener Ausgangsbefund (Szene be60d106, Run a3b5541b)

- Pass 0 (Sarah) und Pass 4 (Matthew) sind mit `sync_noop_unrecoverable` terminal
  gescheitert; Pass 5 (Kay Mark) hat um 17:50:34 die NOOP-Ladder erschöpft, während der
  Watchdog eine Sekunde vorher den Fan-out geschlossen hat. Pass 5 steht deshalb bis heute
  auf `pending` in einem terminalen Run.
- Die Motion-Deltas der Fehlläufe: Pass 0 = −29.04, Pass 4 = −1.29, Pass 5 = −0.78
  (NOOP-Schwelle 3.68). Alle drei sind **negativ** — der Provider-Output hat im gemessenen
  Mundband weniger Bewegung als der Eingang.
- Framing der sechs Pässe: `cam_dynamic` ist bei **fünf von sechs** Pässen `false`;
  nur Pass 2 hat einen dynamischen Kamerapfad. Beide NOOP-Fehlläufe sind statisch.
- `face_share`: Pass 4 = **0.218** — unter dem v400-Floor von 0.24, trotzdem dispatcht.
  Die Crop-Grösse dieses Passes ist 128 px, also exakt der `minCropSizePx`-Boden.
- Refund: Der Watchdog hat 960 Credits erstattet — in den Credit-Ledger. Belastet wurden
  4,50 € im Euro-Ledger (`ai_video_wallets`). Die Erstattung landet weiterhin in der
  falschen Kasse.

Das genügt, um die Reihenfolge festzulegen — es genügt **nicht**, um die Ursache des NOOP
zu benennen. Genau das klärt V460.

## Schritt 1 — V459 sauber zu Ende bringen (Determinismus, kein Qualitätsthema)

1. **Callback/Fence-Race schliessen.** Ein Pass, dessen Ladder-Eskalation bereits läuft,
   darf nicht durch einen parallel gesetzten Fan-out-Fence in `pending` zurückbleiben.
   Der Fence prüft künftig auch laufende Ladder-Attempts; ein Pass wird beim Schliessen
   terminal (`canceled_by_scene_failure`) statt `pending`.
2. **Refund in die richtige Kasse.** `failLipSync` erstattet gegen den Ledger, aus dem
   belastet wurde: `ai_video_wallets.balance_euros` plus `ai_video_transactions`-Zeile vom
   Typ `refund`, Betrag aus der Run-Belastung. Ein Refund je (Szene, Run), idempotent.
3. **Belastung zuordenbar machen.** Die Deduction bekommt `metadata.scene_id` und
   `metadata.run_id`, damit Refund und Belastung ohne Zeitstempel-Raten zusammenfinden.
4. **402 ehrlich anzeigen.** `INSUFFICIENT_CREDITS` wird als „Guthaben reicht nicht:
   4,50 € nötig, X € verfügbar" (EN/DE/ES) angezeigt statt „Edge Function returned a
   non-2xx status code".

Keine Gates, keine Schwellen, kein Provider-Payload. Das bleibt im Rahmen des Freeze.

## Schritt 2 — V460: v400 T8–T12 Contract Parity Audit (READ-ONLY, keine Provider-Kosten)

Untersucht werden ausschliesslich die bereits vorhandenen, eingefrorenen Artefakte der
Pässe 0, 4 und 5 (Preclip-MP4s und Provider-Outputs liegen alle vor). Kein neuer Dispatch,
keine Credits, keine Codeänderung an der Kette in diesem Schritt.

Je Pass wird gegen den v400-T8-Vertrag geprüft und protokolliert:

1. Ist über die gesamte Preclip-Dauer **physisch nur ein Gesicht** sichtbar?
2. Bleibt exakt der zugewiesene Sprecher im Crop (kein Identitätswechsel)?
3. Folgt der Crop der Kopfbewegung dynamisch — oder steht er (heute: 5/6 statisch)?
4. Wo liegt der Mund im finalen 720×720-Preclip? Zielwert v400 ≈ 62 % Höhe.
5. Wie gross ist das Gesicht in **Provider-Pixeln**, nicht nur als normalisierter
   `face_share`?
6. Wird das Gesicht beim Gehen oder im 3/4-Profil zeitweise zu klein, verdeckt oder
   nahezu seitlich?
7. Bleibt der Mund über **alle** Frames vollständig im Crop?
8. Zeigt der eingefrorene Provider-Output visuell wirklich keinen zusätzlichen
   Mouth-Motion? (Frame-Gegenüberstellung Input/Output, mehrere Zeitpunkte.)

Ergebnis ist ein Befundbericht mit Frame-Belegen pro Pass und genau einer Einordnung:

- **Fall A — Provider-Output hat wirklich keinen Lip-Sync.** Detector bleibt unangetastet.
  Der Fehler liegt vor dem Outcome-Gate: Preclip/Framing/Tracking oder Provider-Parameter.
  → V461 repariert T8/T9.
- **Fall B — Output hat sichtbaren Lip-Sync, der Detector sagt NOOP.** Erst dann darf die
  Messmethode beziehungsweise die Kalibrierung geändert werden — mit dem sichtbaren
  Beweis als Referenzfall.
- **Fall C — der Preclip verletzt v400** (mehr als ein Gesicht, statischer Crop bei
  bewegtem Kopf, Mund ausserhalb 62 %, Gesicht zu klein). → Wiederherstellung des
  T8-Vertrags: ein sichtbares Gesicht, dynamisches Tracking, Mund ≈ 62 %, ausreichende
  Gesichtsgrösse, Gate vor dem Provider. Danach ein kontrollierter Lauf.

Der bereits gemessene Befund (5/6 statisch, `face_share` 0.218 unter dem Floor) macht
Fall C zur wahrscheinlichsten Einordnung — bewiesen ist er noch nicht.

## Freeze-Status

- Schritt 1 liegt vollständig innerhalb der erlaubten Änderungen (Determinismus,
  Refund-Korrektur, Copy).
- Schritt 2 ist read-only und braucht keinen Unfreeze.
- Der Unfreeze wird **erst** beantragt, wenn der Befund vorliegt, und dann mit dem
  konkreten Scope, den der Befund benennt — Preclip-Framing und Dynamic Tracking
  ausdrücklich eingeschlossen, Detector-Schwellen ausdrücklich nur bei Fall B.

## Danach

STOP vor jedem neuen S01-Lauf. Erst Befundbericht, dann Entscheidung, dann genau ein
kontrollierter Lauf.
