---
name: v170 Cast-Integrity Audit (Artlist parity)
description: Anchor-Audit prüft Cast-Integrität (no clone, no swap, no missing pro Reference), nicht Total-Headcount. Bystanders, Crowd, Pedestrians, depicted persons auf Screens/Photos/Mirrors/Posters/Statues sind erlaubt. countHumans/countFaces sind reine Telemetrie.
type: architecture
---

## Invariante (FROZEN)

> Der Composer-Anchor-Audit prüft **Cast-Integrität**, nicht Total-Headcount.
>
> Failure-Gründe (blocken):
> 1. **clone** — eine Cast-Reference erscheint zweimal als reale Person (Triptych, Split-Panels, Doppelgänger).
> 2. **swap** — ein Cast-Slot zeigt eindeutig die falsche Person (Sex/Alter/Gesicht).
> 3. **missing** — eine Cast-Reference taucht gar nicht auf.
> 4. **ambiguous** — Audit nicht entscheidbar.
>
> Explizit ERLAUBT (kein Failure):
> - Background-Pedestrians, Bystanders, Crowd, vorbeilaufende Personen
> - Coworker im Hintergrund, Café-Gäste, unbekannte Statisten
> - Depicted Persons auf Laptop-/Phone-/TV-Screens, gerahmte Fotos, Spiegelungen, Poster, Statuen, Mannequins

## Warum

Heißt-Headcount-Vergleich (`humanCount > expectedFaces → fail`) hat False-Positives produziert, sobald Nano Banana 2 eine plausible Office-Szene mit Laptop-Display (→ Gesicht on-screen) oder eine Café-Szene mit Gästen im Hintergrund komponiert hat. Artlist erlaubt diese Fälle — wir auch.

Lipsync-Pipeline ist davon unbeeinflusst, weil Plate-Face-Targeting (v77/v78) Cast-Gesichter über Portrait-Match findet, nicht über „nimm das größte Gesicht im Frame".

## Eingriffspunkte

### `_shared/identity-audit.ts`
- Läuft jetzt auch für N=1 (`portraitUrls.length < 1`).
- Prompt formuliert Bystanders & depicted Persons explizit als Extras, die NICHT in `perReference.appearances` zählen.
- `reason "extra"` ist aus der Failure-Logik entfernt; `totalPeople/extraPeople` werden nur noch defensiv eingelesen, blocken aber nicht.
- Priorität: `swap > clone > missing > ambiguous`.

### `compose-video-clips/index.ts`
- `evaluate()` ruft `countFacesInImage`/`countHumansInImage` weiterhin auf, **rein als Telemetrie**.
- `needsRetry = identityFailure !== null` (keine Headcount-Retries mehr).
- `okFinal = identityFailure === null`.
- Hard-Abort blockt nur noch `clone | swap | missing | ambiguous`. Alle `anchor_extra_person_detected`-Pfade sind entfernt.
- `ANCHOR_AUDIT_VERSION 10 → 11` invalidiert kaputte gepinnte Anchors.

### `compose-scene-anchor/index.ts`
- `EXACT_COUNT_SUFFIX` (N=1 & N≥2) erlaubt explizit Background-Extras; verbietet weiter Cast-Duplikate, Triptychon, Spiegel-Duplikate des Cast.
- `TWO_SHOT_NEGATIVE` streicht „extra bystander / coworker / crowd" aus der AVOID-Liste.
- `STRICT_RETRY_SUFFIX` adressiert Clone/Triptych/Swap, nicht Extras.
- v168 Anti-Triptych für N=1 bleibt wirksam (das ist Clone, nicht Extra).

## Was unverändert bleibt

- v131.6 Face-Lock Attempt-3 (Swap-Recovery)
- v167 Plate-Prompt (camera-lock + subtle mouth motion bei N=1)
- v168 Anti-Clone Anchor Lock (N=1 darf nicht 3× Samuel sein)
- v169 N=1 Tail-Talk-Fix (Overlay-Mode bypass)
- v77/v78 Plate-Face-Targeting (Lipsync findet Cast-Face auch mit Bystanders im Frame)
- Refund-/Watchdog-Pfade

## Verifikation

1. **N=1 Laptop-Szene mit Gesicht im Display** → Audit `ok`, Szene rendert.
2. **N=1 in Coworking-Space mit 3 vorbeilaufenden Personen** → Audit `ok`.
3. **N=4 Cast, 1 spricht** → Audit prüft 4× appearances=1, faceMatch=match; Lipsync läuft nur auf aktivem Sprecher (v90).
4. **Regression Triptychon N=1** → `reason=clone` → blockt korrekt.
5. **Regression Swap N=2** → `reason=swap` → Face-Lock-Retry feuert (v131.6).
