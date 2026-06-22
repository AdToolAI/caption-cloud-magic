# Kompatibilitäts-Check & Aktivierung Per-Pass-Lock

## Ergebnis der Pfad-Prüfung — alle 5 anderen Lock-Callsites sind kompatibel ✅

| Callsite | Hält Lock auf | Wann | Risiko bei `FEATURE_PER_PASS_LOCK=true` |
|---|---|---|---|
| `compose-dialog-segments` (initial Pass 0 vom Client) | `(scene, 0)` | bei Dispatch | ✅ unverändert |
| `compose-dialog-segments` (Self-Invoke Pass 1..N) | `(scene, N)` | bei Fanout | ✅ **das ist der Fix** — kein scene_lock_busy mehr |
| `sync-so-webhook` (v5 RMW-Block) | `(scene, 0)` über `withDialogLock` | wenn ein Sync.so-Job fertig wird | ✅ safe — Hot-Path nutzt schon `update_dialog_pass_slot` RPC (Z. 708/800/974); Full-Row-Writes nur in Terminal-/Error-Pfaden |
| `lipsync-watchdog` | `(scene, 0)` über `withDialogLock` | alle 60 s als Aufsicht | ✅ supervisory, kein Dispatch-Race |
| `cancel-dialog-lipsync` | `(scene, 0)` | bei User-Cancel | ✅ exklusive Operation |
| `remotion-webhook` (preclip/stitch) | `(scene, 0)` | bei Lambda-Done | ✅ anderes Konzept (Render), kein Dispatch-Race |

## Warum keine Sibling-Race-Risiken

1. **Hot-Path bereits RPC-atomic**: `sync-so-webhook` schreibt Pass-Ergebnisse über `update_dialog_pass_slot(scene, pass_idx, patch)` — atomic per Slot, kein Lost-Update auch wenn `compose-dialog-segments` parallel Pass N+1 dispatched.
2. **Full-Row-Writes nur in Terminal-States**: Die 11 Full-Row-`UPDATE`s im Webhook (Recovery, all-done, failed) laufen erst, wenn die Szene komplett ist oder definitiv failed → kein aktiver Dispatcher mehr.
3. **Timing-Window passt**: Pass 0 hält `(scene,0)` ~70 s, Sync.so-Webhook für Pass 0 kommt nach ~110–120 s → Lock ist längst frei, kein Block.
4. **Webhook-vs-Dispatcher**: `sync-so-webhook` für Pass-Fertigstellung will `(scene,0)`. `compose-dialog-segments` Pass 2 hält `(scene,2)`. **Verschiedene Partitionen → keine Kollision.**

## Aktivierungs-Plan

### Schritt 1 — Secret anlegen (1 Klick deinerseits)
Ich rufe `add_secret` mit Name `FEATURE_PER_PASS_LOCK` auf. Du trägst Wert `true` ein.

### Schritt 2 — N=2 Testlauf (Soll: ~3:30 statt ~6:00)
- 2-Sprecher-Szene rendern
- Edge-Function-Logs prüfen: erwartet `v168_per_pass_lock ACQUIRED pass=0` und `pass=1` mit <2 s Abstand
- Kein `scene_lock_busy` mehr für Pass 1
- Wallclock-Vergleich

### Schritt 3 — N=3 Test (Soll: ~5:00 statt ~8:30)
Nur wenn N=2 grün.

### Schritt 4 — N=4 Test (Soll: ~7:30–8:00 statt 11:40)
Nur wenn N=3 grün.

### Sofort-Rollback
Du setzt `FEATURE_PER_PASS_LOCK=false` → alle Locks fallen zurück auf `(scene, 0)`-Partition = exaktes Legacy-Verhalten in <30 s.

## Was NICHT angefasst wird

- ✅ Webhook-/Watchdog-/Cancel-Pfade bleiben auf `(scene, 0)` (keine API-Änderung an `withDialogLock`)
- ✅ `try_claim_mux_dispatch` unverändert
- ✅ Sync.so Plan-Limit headroom: cap auf 4 belassen, Creator-Plan erlaubt 6
- ✅ Keine Code-Änderung in den 5 anderen Callsites → null Regressionsrisiko

## Bestätigung gewünscht

Sage **„Secret anlegen"** und ich rufe `add_secret` auf. Dann trägst du `true` ein und wir machen den N=2 Test.
