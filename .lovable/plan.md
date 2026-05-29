## Befund

Letzter Fehler-Run: Szene `ffefe177…` — Shot 0 ✓, Shot 1 ✓, Shot 2 (Samuel, Satz 3) → `sync_FAILED: An unknown error occurred.` trotz korrektem coords-locked Retry (`force_coords=true`, `frame_number_override=123`).

Beim Vergleich mit Artlist's Pipeline fällt eine echte Lücke auf:

In `poll-dialog-shots/index.ts` (Zeilen 245–250) bauen wir den Sync.so v2 Payload so:

```ts
input: [
  { type: "video", url: videoUrl, segments_secs: [window] },  // ✓ getrimmt
  { type: "audio", url: audioUrl },                            // ✗ FULL 8s-Track
]
```

- Video wird per `segments_secs: [[3.672, 6.564]]` auf das Turn-Fenster reduziert.
- Audio ist der **gesamte** Per-Speaker-Track (z. B. Samuels komplette 8s mit Sprache bei t=0–2.2s und t=3.8–6.4s, dazwischen Stille).

Sync.so beginnt Audio immer bei seinem `t=0`. Das hat zwei Folgen:

1. **Shot 0** (Samuels erster Satz, Video-Fenster [0, 2.35]): Audio-`t=0` enthält genau Samuels ersten Satz → funktioniert.
2. **Shot 2** (Samuels dritter Satz, Video-Fenster [3.67, 6.56]): Sync.so nimmt erneut Audio-`t=0` (Samuels ersten Satz) und versucht den 2.23s-Take auf ein 2.89s-Videofenster mit komplett anderem Mund-Movement zu mappen → „unknown error" bzw. visuell der falsche Satz / falscher Sprecher.

Das erklärt rückblickend auch die früheren Bugs („zweiter Satz von niemandem", „dritter Satz vom falschen Sprecher"): Sync.so sah ja immer nur den ersten Satz im Audio.

Artlist macht es so, wie Sync.so es eigentlich vorsieht: **Video- UND Audio-Input bekommen dasselbe `segments_secs`**, damit beide Seiten exakt auf dasselbe Zeitfenster getrimmt werden.

## Plan

1. **Audio `segments_secs` mitschicken (Kernfix)**
   - In `startSyncTurnJob()` (`poll-dialog-shots/index.ts`, Z. 245–250) das `window` zusätzlich auf den Audio-Input legen:
     ```ts
     { type: "audio", url: audioUrl, segments_secs: [window] }
     ```
   - Damit greifen Video und Audio dasselbe Zeitfenster, und Sync.so synchronisiert Samuels dritten Satz mit dem Video-Take an der richtigen Stelle.

2. **Fallback-Pfad anpassen**
   - Im 400-„segments invalid"-Fallback (Z. 294–315) bisher nur das Video-`segments_secs` entfernt. Symmetrisch auch das Audio-`segments_secs` strippen, damit das Fallback weiterhin als legacy-kompatibler Last-Resort funktioniert.

3. **Webhook-Pfad doppelt absichern**
   - `sync-so-webhook` startet beim Retry intern `startSyncTurnJob` (gleiche Funktion) — der Fix gilt damit automatisch auch für webhook-triggered Retries. Kein separater Patch nötig, aber kurz im Log verifizieren („audio=ISOLATED segments=[…]").

4. **Diagnose-Log erweitern**
   - DISPATCH-Log soll explizit zeigen, dass Audio jetzt fensterbeschränkt ist:
     `audio=ISOLATED window=[3.67,6.56]` statt `audio=ISOLATED window=[…]` allein für Video.

5. **Saubere Reproduktion**
   - Szene `ffefe177-9715-44a5-a961-e7851e8ffa36` zurücksetzen:
     - `dialog_shots=null`, `lip_sync_status='pending'`, `twoshot_stage='master_clip'`, `lip_sync_applied_at=null`, `clip_error=null`
     - `clip_url` und `source_clip_url` bleiben erhalten.
   - `compose-dialog-scene` erneut anstoßen.

6. **Validierung in Logs**
   - DISPATCH-Logs zeigen für jeden Turn `segments_secs` auf **beiden** Inputs.
   - Alle 3 Shots → `status=ready` mit Sync.so-Output-URL, kein „unknown error" mehr.
   - Lambda-Stitch (`DialogStitchVideo`) läuft → finale `clip_url`, alle drei Sätze auf den richtigen Sprechern.

## Memory-Update (nach Verifizierung)

`mem://features/video-composer/dialog-shot-pipeline` um Punkt 8 ergänzen:

> **8. WINDOW APPLIES TO BOTH INPUTS.** `startSyncTurnJob` muss `segments_secs: [window]` SOWOHL auf den Video- als auch auf den Audio-Input legen. Ohne das beginnt Sync.so beim Audio immer bei t=0 und mappt den ersten Satz auf ein späteres Video-Fenster — Folge: „unknown error" oder falsche Sprecher-Zuordnung. Das ist der eine Artlist-Parity-Unterschied, der Multi-Turn-Szenen brechen lässt.
