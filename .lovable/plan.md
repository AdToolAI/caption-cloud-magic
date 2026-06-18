## Was passiert ist

Watchdog hat die Szene `4e9f8c73…` nach 4 min als `watchdog_preflight_aborted` gekillt — **bevor** Hailuo den Master-Clip fertig hatte. Sync.so wurde nie disponiert.

### Timeline

| Zeit | Event |
|------|-------|
| 13:01:31 | `compose-video-clips` startet Hailuo i2v (`twoshot_stage='master_clip'`, `clip_url=null`) |
| 13:07:01 | `lipsync-watchdog` → `watchdog_preflight_aborted` → Szene `failed`, Refund |
| 13:09:42 | Hailuo-Webhook landet → `compose-clip-webhook` ruft `compose-dialog-segments` → **409 `reset_required`** |

Forensik zeigt deshalb `pass_not_found (HTTP 404)`: `dialog_shots.passes = []`. MediaPipe / v129.21.1 sind nicht involviert — der Pfad wurde nie erreicht.

### Root Cause

`supabase/functions/lipsync-watchdog/index.ts` Zeile 409:
```ts
} else if (!hasJob && ageMs > STALE_PREFLIGHT_MS) {
  reason = "watchdog_preflight_aborted";
}
```
Kein Guard für „Master-Clip rendert noch beim Provider". `STALE_PREFLIGHT_MS = 4 min` ist zu kurz für Hailuo i2v mit 4-Personen-Anchor (typisch 6–10 min).

---

## Fix (v129.21.2 — eine Datei)

`supabase/functions/lipsync-watchdog/index.ts`:

1. **Helper im Filter-Loop** (vor dem Stale-Block):
   ```ts
   const masterClipInFlight =
     d.twoshot_stage === "master_clip" &&
     !d.clip_url &&
     typeof d.replicate_prediction_id === "string" &&
     d.replicate_prediction_id.length > 0;
   ```

2. **Zeile 409 erweitern** — Preflight-Abort nur, wenn der Master-Clip **nicht** noch beim Provider hängt:
   ```ts
   } else if (!hasJob && !masterClipInFlight && ageMs > STALE_PREFLIGHT_MS) {
     reason = "watchdog_preflight_aborted";
   }
   ```

3. **Diagnostik-Log**, wenn der Skip greift:
   ```ts
   if (masterClipInFlight && !hasJob && ageMs > STALE_PREFLIGHT_MS) {
     console.log(
       `[lipsync-watchdog] preflight-skip scene=${d.id} ` +
       `reason=master_clip_in_flight age=${Math.round(ageMs/1000)}s pred=${d.replicate_prediction_id}`
     );
   }
   ```

**Failsafe**: `STALE_HARD_MS = 25 min` bleibt unverändert → echte Hailuo-Hänger werden weiterhin gekillt + refundiert (Zeile 405/406).

Keine Änderungen an: `compose-dialog-segments`, `compose-clip-webhook`, MediaPipe/Face-Detect, Forensik-UI, Wallet, Refund-Logik, oder anderen Edge-Functions.

---

## Verifikation

1. Neue 4-Sprecher-Test-Szene starten (gleiches Setup wie `4e9f8c73…`).
2. Erwartung nach ~6–10 min:
   - `compose-dialog-segments` läuft durch
   - `dialog_shots.passes` füllt sich
   - Sync.so dispatched korrekt
3. Watchdog-Logs prüfen: `[lipsync-watchdog] preflight-skip … reason=master_clip_in_flight` darf 1–3× erscheinen, `watchdog_preflight_aborted` nicht.
4. Failsafe-Test (optional): künstlich Hailuo-Hang → nach 25 min muss `watchdog_hard_timeout` greifen + Refund.

---

## Bewusst NICHT Teil dieses Fixes

- Speed-Optimierung (Fast-Lane / HeyGen-Mode) — du hast „max Qualität" gewählt, Pipeline bleibt 8–12 min.
- MediaPipe-Detector (läuft bereits korrekt seit v129.21.1).
- Forensik-Sheet (404 verschwindet automatisch, sobald wieder Passes existieren).
