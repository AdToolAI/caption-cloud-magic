## Vereinfachte Strategie

Da es nur noch **ein Abomodell** gibt, ist der hardcodierte 10-Videos-pro-Stunde-Limit in 13 Edge-Functions reines Legacy aus der Free-Tier-Ära. Er hat heute exakt zwei Effekte:
1. Bricht den Live Sweep (9 von 10 Fehlern im letzten Run).
2. Bremst zahlende User aus, ohne irgendeinen Schutz zu liefern (sie haben das Abo ja bezahlt).

Lösung: **Limit ersatzlos entfernen.**

Wallet/Credit-Drain ist bereits durch den Wallet-Balance-Check (`Insufficient credits` → 402) abgesichert — der ist der echte Schutz, nicht der Stundenlimit.

## Phase A: Per-User-Rate-Limit entfernen

In allen 13 Video-Edge-Functions den `count >= 10`-Block ersatzlos löschen:
- `generate-ai-video`
- `generate-kling-video`
- `generate-hailuo-video`
- `generate-grok-video`
- `generate-seedance-video`
- `generate-wan-video`
- `generate-vidu-video`
- `generate-veo-video`
- `generate-runway-video`
- `generate-pika-video`
- `generate-luma-video`
- `generate-ltx-video`
- (und identischer Pattern-Check, falls in `generate-talking-head` vorhanden)

Beibehalten bleiben:
- Wallet-Balance-Check (402 INSUFFICIENT_CREDITS)
- JWT-Auth-Check
- Input-Validierung
- QA-Mock-Header-Bypass

Nicht angefasst: `_shared/rate-limiter.ts` (das ist die generische Plan-basierte Middleware für andere AI-Calls und wird nicht von den Video-Functions benutzt).

## Phase B: HeyGen Cached Talking Photo

Unverändert sinnvoll, weil HeyGen ein **echtes externes Provider-Limit** ist (3 Avatare/Konto, nicht von uns kontrollierbar):

1. In `qa-live-sweep-bootstrap` einmalig ein Talking Photo hochladen und die `talking_photo_id` in `system_config.qa.heygen_talking_photo_id` ablegen.
2. `qa-live-sweep` übergibt diese ID direkt an `generate-talking-head` (neuer optionaler Parameter `talkingPhotoId`) → kein Upload mehr nötig.
3. In `generate-talking-head`: Wenn `talkingPhotoId` mitkommt, Upload + Pruning komplett überspringen.
4. Bei 401028 trotzdem (z. B. weil das gecachte Photo abgelaufen ist): einmaliger Re-Upload mit aggressivem Pruning, dann sauberes 402 mit Code `HEYGEN_AVATAR_LIMIT` falls erneut blockiert.

## Phase C: Stable Audio Timeout

In `qa-live-sweep/index.ts`: Timeout für den Audio-Test von 90 s auf **180 s** anheben. Replicate Cold-Start für Stable Audio 2.5 liegt mit Queue gerne bei 120–150 s.

## Reihenfolge

1. **Phase A** (Limit entfernen) — eliminiert 9 Fehler, ist ein Mini-Diff pro Function.
2. **Phase B** (HeyGen Cached ID) — eliminiert den 10. Fehler.
3. **Phase C** (Audio Timeout) — eliminiert den Timeout-Fehler.
4. Re-run Live Sweep → Erwartung: 11/12 grün + 1 erwartetes Pika-410.

## Memory-Update

Nach Umsetzung lege ich eine kurze Memory ab:
> *"Video-Edge-Functions haben keinen Per-User-Stunden-Limit mehr. Schutz erfolgt via Wallet-Balance-Check (402). Hintergrund: nur ein Abomodell, Legacy-Limit war Free-Tier-Relikt."*

## Was ich nicht vorschlage

- Keine Plan-basierte Staffelung (es gibt nur einen Plan).
- Keine Sweep-Bypass-Header-Logik (überflüssig, wenn der Limit ganz weg ist).
- Keinen Eingriff in den generischen `RateLimiter` für andere AI-Calls (orthogonal).

**Soll ich starten? Phase A ist in einem Schritt für alle 13 Functions machbar.**