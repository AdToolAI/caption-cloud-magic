# Option A — Speaker Priority Framing (Plan)

Nach detaillierter Analyse: Der Pfad ist heute **strikt 1-Plate-pro-Szene**. Alle Speaker-Passes verketten sich auf **dasselbe** Master-Video (`compose-dialog-segments` header: "Pass N Input = Pass N-1 Output"). Option A bricht dieses Kernmodell auf **N-Plates-pro-Szene** — das ist der richtige Weg, aber wir müssen **behutsam** vorgehen, um die FROZEN-Invarianten (v69/v151/v242/v247/v248/v251) nicht anzufassen.

## Guardrails (werden NICHT verändert)

- v242 Row-Major-Face-Sort — unverändert, läuft jetzt pro Plate statt einmalig
- v247/v248 Rekognition + 42% Re-Zoom — unverändert
- v251/v252 AWS-only Detector — unverändert
- v69 Single-Face-Preclip — unverändert, greift wie bisher pro Pass
- `neutralTwoShotPrompt` FROZEN-Suffixe (LOCKED static camera, CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE) — 1:1 im neuen Prompt übernommen
- N=1-Szenen und Dialoge OHNE `[CastActions]` — **komplett unangetastet**

## Trigger-Gate (hart, konservativ)

Neue Funktion `shouldUseSpeakerPriorityFraming(scene)` in `compose-video-clips/index.ts`:

```
scene.dialogMode === true
&& getSceneCastActions(scene).length >= 2
&& hasAsymmetricCastDirection(castActionsBlock)   // Telefon/Laptop/Drucker/...
&& speakers.length >= 2 && speakers.length <= 4
&& featureFlag "speaker_priority_framing" enabled
```

Alles außerhalb dieses Gates fällt zurück auf den heutigen 1-Plate-Pfad — **null Regression** für Standard-Szenen.

## Umsetzung in 3 Phasen

### Phase 1 — Prompt & N Anchors (kein Credit-Impact bis Phase 3)

1. **Neuer Prompt-Builder** `speakerPriorityFramingPrompt(speakerIdx, cast, names, actions)` neben `neutralTwoShotPrompt` in `compose-video-clips/index.ts`. Beschreibt: aktiver Speaker steht/sitzt **frontal, mundlesbar zur Kamera** (Framing-Prio 1); andere führen ihre CastAction im **Mid-/Background** aus. FROZEN-Suffixe unverändert übernommen. Für `speakerIdx` bekommt jeder Pass einen eigenen Prompt-Text.
2. **`compose-scene-anchor`**: `speakerIdx` und `speakerFocusName` in den `promptHash`-Input aufnehmen (`:250-252`) — dadurch erzeugt jeder Pass automatisch einen eigenen Cache-Eintrag, **keine Schema-Migration nötig**. Konsolidierung: die doppelte `ASYM_RE` (`compose-scene-anchor:157`) auf die kanonische `CAST_ACTION_ASYM_RE` aus `compose-video-clips` angleichen (sonst Drift-Risiko).
3. **`composeAnchor()` Schleife** (`compose-video-clips/index.ts:2200-2263`): bei aktivem Gate über `speakers` iterieren, pro Pass 1× `compose-scene-anchor` aufrufen. Ergebnisse in `dialog_shots.passes[i].plate_image_url` schreiben (`composer_scenes.dialog_shots` ist jsonb — **keine Migration**). Das globale `reference_image_url` bleibt gesetzt (Speaker-0-Plate) als Legacy-Fallback für UI-Vorschau.
4. **v170 Cast-Integrity-Audit** (`:2272-2441`) läuft **pro** neu gerendertem Plate — Klon-/Swap-Detection greift also weiterhin, jetzt N-fach. Der bestehende Retry-Ladder (Attempt-3 Face-Lock, Soft-Pass bei headcount-ok) bleibt strukturell unverändert, nur wird er pro Pass durchlaufen.

### Phase 2 — N i2v Videos + Pass-spezifischer Dispatch

5. **Provider-Dispatch pro Plate**: die bestehenden Provider-Blöcke (`:2909-3293`, Hailuo/Kling/Wan/Seedance/Luma/Veo) so umbauen, dass bei aktivem Gate N sequentielle i2v-Calls mit je eigenem `first_frame_image = passes[i].plate_image_url` und `duration = passes[i].endSec - passes[i].startSec` laufen. Ergebnis-URLs in `dialog_shots.passes[i].plate_video_url`.
6. **`compose-dialog-segments` entkoppeln**: `sourceClipUrl`-Resolution (`:1013-1020`) erweitern —
   - falls `passes[i].plate_video_url` gesetzt → dieser wird Input für Pass i (keine Verkettung)
   - falls fehlend → **heutiger Pfad bleibt aktiv** (Kette Pass-N-Input = Pass-N-1-Output)
   Der Header-Kommentar (`:1-53`) wird ergänzt um den neuen "Independent-Plate"-Modus. `preclipUrl`/v69 arbeitet unverändert pro Pass.
7. **`resolvePlateFaceIdentities` pro Pass-Plate**: Aufruf (`compose-dialog-segments:1683-1694`) läuft pro Plate mit `expectedFaceCount = speakers.length`. Row-Major-Sort v242 unverändert.

### Phase 3 — Stitching + Credits

8. **Video-Stitching-Layer**: Zwischen `compose-video-clips` und `compose-dialog-segments` einen leichten Concat-Step einfügen — die N Plate-Videos müssen zur Szenen-Gesamtdauer aneinandergereiht werden, damit der Audio-Mux die Speaker-Turns korrekt überblenden kann. Zwei Umsetzungsvarianten (Entscheidung im Bau):
   - **Variante a (bevorzugt)**: Remotion-Lambda-Concat (existierender `invoke-remotion-render`-Pfad, schon für Preclips genutzt) — deterministisch, bereits verdrahtet.
   - **Variante b**: FFmpeg-Concat in einer neuen kleinen Edge-Function, falls Lambda-Latenz zu hoch wird.
9. **Credit-Anpassung** (`:324-332` + `:3666-3682`): pro-Pass-Kostenkomponente einführen. Faustformel: `sceneCost = perSpeakerDuration × CLIP_COSTS[...] × N_speakers` statt `sceneDuration × CLIP_COSTS[...]`. Wallet-Check und `deduct_ai_video_credits`-Payload analog anpassen. **UI-Cost-Preview** in der Szenen-Karte muss die höhere Zahl vor Render zeigen — sonst Überraschungs-Abzug.

## Persistenz-Schema (kein Migration-Zwang)

`composer_scenes.dialog_shots.passes[i]` bekommt neue optionale Felder (jsonb):

```
plate_image_url:       string   // Anchor pro Speaker
plate_video_url:       string   // i2v-Ergebnis pro Speaker
plate_source:          "speaker-priority-v1"
plate_face_identity:   {...}    // Row-Major-Cache pro Plate
```

Alle Felder optional → alte Rows/Runs bleiben lesbar, Legacy-Pfad greift automatisch.

## Rollout / Telemetrie

- **Feature-Flag** `SPEAKER_PRIORITY_FRAMING` (env, default OFF).
- **Log-Tags** `v260_spf_gate`, `v260_spf_plate_ready_i`, `v260_spf_plate_failed_i` — analog zu bestehender `v250_server_cast_actions_injected`-Logik.
- **Fallback-Kaskade**: schlägt ein Pass-Plate fehl → dieser eine Pass fällt auf das globale `reference_image_url` zurück (nicht die ganze Szene). Cast-Integrity-Audit bleibt scharf.
- **Erste Woche live**: nur intern (Owner-Account) einschalten, Success-Rate messen, dann für alle.

## Zusatz (aus letzter Runde mitversprochen)

- **Diagnose-Log `face_gate_verdict` pro Speaker** in `syncso_dispatch_log`.
- **UI-Toast** wenn nach Render nur X/N Passes durchkamen ("Lip-Sync bei N-X Sprechern übersprungen").

Beide sind Pfad-agnostisch und werden in Phase 1 mit ausgeliefert, damit Du bei etwaigen Fehlern sofort siehst, welcher Speaker warum stumm blieb.

## Was NICHT gebaut wird (bewusst)

- Kein Umbau der v69/v151/v242/v247/v248/v251-Pfade
- Kein Eingriff in `neutralTwoShotPrompt` selbst (nur additiver neuer Builder daneben)
- Kein Eingriff in Row-Major-Sort, Hungarian-Matching, Rekognition-Konfiguration
- Kein Eingriff in Single-Speaker- oder Nicht-Dialog-Szenen
- Kein DB-Schema-Change (nur jsonb-Felder + Cache-Key-Erweiterung)
- Keine Änderung an bestehenden Refund-Pfaden

## Erwarteter Effekt

- Lip-Sync-Trefferrate auf Aktionsszenen: von aktuell **1/N** auf **N/N** bei asymmetrischen Cast-Actions.
- Cast-Actions werden weiterhin korrekt ausgeführt (Prompt-Injection bleibt aktiv).
- Standard-Dialog-Szenen (ohne Actions): **null Änderung**.
- Kosten pro Aktionsszene: +30–40 % (transparent im UI vor Render).

## Verifikation nach Bau (pro Phase)

- Phase 1: Log zeigt N `v260_spf_plate_ready_i` pro Aktionsszene; Cache erzeugt N Einträge in `scene_anchor_cache`; N=1-Szenen zeigen keine SPF-Log-Tags.
- Phase 2: `dialog_shots.passes[i].plate_video_url` gesetzt; `compose-dialog-segments` loggt "independent-plate mode".
- Phase 3: Wallet-Deduction stimmt mit Preview überein; Cast-Integrity-Audit-Log pro Pass sichtbar.
- Integration: Aktionsszene mit 4 Sprechern rendert 4 unterschiedliche Frames (jeweils anderer frontal), alle 4 Sync.so-Passes greifen.

Freigabe? Ich baue Phase 1 zuerst allein und wir schauen uns die N-Plate-Ergebnisse an, bevor ich Phase 2/3 anfasse.