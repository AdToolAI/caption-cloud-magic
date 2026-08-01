## Was im letzten Lauf wirklich passiert ist

Szene `89c5e01c` (4 Sprecher, HappyHorse-Plate), 01.08.2026, 20:12–20:20 UTC:

```text
20:12:33  Pass 1 (Matthew)  dispatch → Sync.so
20:12:33  Pass 3 (Kailee)   dispatch → Sync.so
20:13:34  Pass 0 (Turn 1)   COMPLETED · verdict=moved (score 19.0) ✔
20:14:42  Pass 1 (Matthew)  COMPLETED · verdict=passthrough (outVsIn 0.57 < 3) ✘
20:14:43  Pass 1            NOOP-Ladder exhausted → hard fail → SZENE = failed
20:16:24  Pass 3 (Kailee)   COMPLETED · verdict=passthrough (outVsIn 1.95 < 3) ✘
20:16:25  Pass 3            hard fail → Fehlertext "Kailee (Turn 5.0–7.2s)"
20:16:37  fremder Webhook   ignored_due_scene_failed
20:20:12  Pass 2 (Sarah)    NEU dispatcht → status=rendering  ← trotz failed Szene
```

Damit sind die beiden Beobachtungen erklärt — und beide sind echte Defekte:

**1. "Szene früh fehlgeschlagen, aber Lip-Sync läuft trotzdem"**
Sync.so *wurde* aufgerufen (Pass 0/1/3). Der Kailee-Text stammt aus Pass 3. Danach hat der Dispatcher um 20:20 Pass 2 (Sarah) trotzdem noch an Sync.so geschickt, obwohl die Szene seit 20:14 terminal `failed` ist. Der Fehler-Check greift beim Webhook (`ignored_due_scene_failed`), aber **nicht** vor dem Dispatch. Ergebnis: bezahlte Sync.so-Jobs nach dem Abbruch, belegte Slots und die widersprüchliche UI ("Szene fehlgeschlagen" + "Lip-Sync läuft").

**2. v359 (mitziehender Crop) war in diesem Lauf gar nicht aktiv**
Log: `v359_camera_path mode=static size=396 moving=false travel_px=0 contained=1.000`, Track: `detection_ratio=1.00 peak_motion_px=10`. Das Gesicht bewegt sich hier nur 10 px — der Planer fällt korrekt auf statisch zurück, und die Abdeckung ist 100 %. **Der Passthrough hat in diesem Lauf also nichts mit Bewegung/Crop zu tun.** Die v359-Hypothese ist für diese Szene widerlegt.

Offen und unbewiesen: warum Sync.so bei Pass 1/3 nicht animiert — bzw. ob es überhaupt Passthrough ist. Auffällig ist `sizeRatio 3.18/3.22`: Sync.so hat neu enkodiert, das Mundband aber laut Messung nicht verändert. Der Verdict misst das Band an fixer Relativposition; bei Crop-Größe 396 → 720 hochskaliert kann das Band danebenliegen und einen **falschen** Passthrough melden. Genau das muss zuerst geklärt werden, bevor wieder an der Pipeline geschraubt wird.

## Plan v360

**Schritt 1 — Forensik zuerst (kein Code-Fix)**
Frames aus Pass-1-Input (`p2-preclip-…mp4`) und dem Sync.so-Output an denselben Zeitpunkten ziehen und nebeneinander ansehen: bewegt sich der Mund im Output sichtbar oder nicht?
- Bewegt er sich → der Verdict ist falsch (Mundband-Position), und wir haben funktionierende Passes fälschlich verworfen.
- Bewegt er sich nicht → echter Provider-Passthrough; dann Vergleich der Payload von Pass 0 (moved) vs. Pass 1/3 (passthrough): BBox-JSON, Audio-Länge, Segment-Fenster, Crop-Größe.

**Schritt 2 — Dispatch-Stopp bei terminaler Szene**
In `compose-dialog-segments` und im Retry-/Watchdog-Pfad vor jedem Sync.so-Dispatch den aktuellen Szenenstatus lesen; ist `dialog_shots.status` bzw. `clip_status` terminal `failed`, den Pass als `skipped_scene_failed` markieren, Slot freigeben und **nicht** dispatchen. Verhindert bezahlte Jobs nach dem Abbruch und die widersprüchliche UI.

**Schritt 3 — Ergebnis aus Schritt 1 umsetzen**
- Fall "Verdict falsch": Mundband aus den tatsächlich persistierten Preclip-Bboxen (Clip-Raum) ableiten statt aus der Konstante (0.5/0.6), plus Skalierungsfaktor Crop→720. Danach die Szene neu bewerten, ohne neu zu rendern.
- Fall "echter Passthrough": Unterschied Pass 0 ↔ Pass 1/3 isolieren und gezielt angleichen; keine neuen Geometrie-Gates.

**Was ich bewusst nicht tue:** keine neue Schwelle, kein zusätzliches Vor-Dispatch-Gate und keine Änderung an der Camera-Path-Logik — die hat in diesem Lauf korrekt statisch entschieden.

### Technische Notiz
Betroffene Dateien voraussichtlich: `supabase/functions/_shared/mouth-motion-verdict.ts` (Mundband-Ableitung), `supabase/functions/compose-dialog-segments/index.ts` (Dispatch-Guard), `supabase/functions/lipsync-watchdog/index.ts` (Retry-Guard). Schritt 1 ist reine Analyse ohne Codeänderung.
