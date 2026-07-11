# Fix: Reduce false anchor-identity swaps on N≥2 (Gemini Pro-Confirmation)

## Kontext
Der Fehler `anchor_identity_swap_detected` im Screenshot stammt aus dem **Anchor-Audit vor Hailuo** (`_shared/identity-audit.ts`), nicht aus der Lipsync-Pipeline. Die Lipsync-Pipeline (Plate/Face-Detect, Mund-Landmarks, ASD) nutzt weiterhin unverändert **AWS Rekognition** — wird nicht angefasst.

## Was gebaut wird

### `_shared/identity-audit.ts` — v171 Pro-Confirmation auf N≥2 ausweiten

Aktueller Zustand:
- N=1: Flash sagt `mismatch` → zweiter Pass mit `google/gemini-2.5-pro`. Nur bei beidseitiger Bestätigung Hard-Fail. Sonst Softpass.
- N≥2: Ein einzelner Flash-Mismatch → hart `reason=swap` → Hailuo/Sync.so blockiert.

Änderung:
- Wenn Flash bei N≥2 verdächtig viele Mismatches meldet (**≥ 50 % aller Refs** oder „all mismatched" wie im Screenshot), zweiten Pass mit `google/gemini-2.5-pro` mit identischem Prompt + Portraits fahren.
- `reason=swap` wird nur zurückgegeben, wenn **Flash UND Pro** übereinstimmend mindestens einen Slot als Mismatch markieren.
- Widerspricht Pro (alle `match` oder `uncertain`), Softpass mit `v171.decision="softpass_ok_multi"` + Log-Eintrag in `audio_plan.twoshot.anchor_face_audit.v171`.
- Einzelne Mismatches unter dem Schwellwert bleiben beim v111-Verhalten (Face-Lock-Retry via `strictSwapMode`) — nichts ändert sich am Retry-Ladder.
- `ANCHOR_AUDIT_VERSION` **8 → 12** bumpen, um gepinnte Audits aus der Zeit zwischen den Versionen zu invalidieren.

### Was **nicht** angefasst wird
- Lipsync-Pipeline (`plate-face-detect.ts`, `plate-face-identity.ts`, ASD-Strategy, Rekognition-Aufrufe) — bleibt unverändert.
- `compose-scene-anchor` und der Face-Lock-Attempt-3 (v131.6) — bleiben.
- `compose-video-clips` Hard-Abort-Zweig — bleibt. Er reagiert nur nicht mehr auf False-Positives.
- Progress-Bar-Fix — separat, kein Teil dieses Plans.

## Verifikation
1. 4-Cast-Anchor, Flash meldet „all four mismatched", Pro widerspricht → Softpass, Pipeline läuft weiter.
2. Echter Swap (Flash + Pro melden übereinstimmend Mismatch) → weiterhin Hard-Fail → v131.6 Face-Lock-Attempt-3 kann noch fangen.
3. 1 einzelner Slot-Mismatch bei N=4 → alter v111-Pfad (Face-Lock-Retry) — unverändert.
4. `audio_plan.twoshot.anchor_face_audit.v171.decision` in `composer_scenes` einsehbar für Forensik.
