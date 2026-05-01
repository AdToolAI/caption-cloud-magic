## Kontext

Live Sweep zeigt 3 echte Fehler (keine Test-Probleme — echte Produktions-Bugs):

| Provider | Symptom | Root Cause (aus Edge-Logs) |
|---|---|---|
| Pika 2.2 Std | HTTP 502 "Pika submission failed" | Replicate **404** auf Slug `pika-labs/pika-text-to-video` — Modell wurde umbenannt/depubliziert |
| Vidu Q2 | HTTP 502 "Vidu submission failed" | Replicate **404** auf Slug `vidu/vidu-q2-reference-to-video` — gleicher Klasse |
| Hedra Talking Head | HTTP 500 "HeyGen talking_photo upload failed [400]" | HeyGen-Code **401028**: "You have exceeded your limit of 3 photo avatars" — jeder Sweep-Run lädt einen neuen Avatar hoch statt zu recyclen |

Alle drei sind echte Bugs, die auch normale User treffen, sobald sie Pika/Vidu nutzen oder mehrere Talking-Head-Renders machen.

## Phase A — Pika 2.2 Replicate-Slug fixen (`generate-pika-video/index.ts`)

Aktuell:
```
'pika-2-2-standard': 'pika-labs/pika-text-to-video',
'pika-2-2-pro':      'pika-labs/pika-text-to-video',
```

Aktion:
1. Replicate-Modell-Catalog-Lookup (kurzes `curl https://api.replicate.com/v1/models?search=pika`) und korrekten aktuellen Slug für Pika 2.2 ermitteln. Erwartung: `pika/pika-v2-2` oder `pika-labs/pika-2-2`. Falls kein offizielles Modell mehr existiert, Pika temporär als "deprecated" markieren und im Toolkit ausgrauen.
2. Beide Slugs auf den gefundenen aktuellen Pfad mappen (oder Std/Pro getrennt, falls Replicate beide hat).
3. Input-Format gegen die neue Modell-Schema-Page abgleichen (Pika 2.2 hat `image` statt `first_frame_image` in manchen Versionen). Bei Schema-Drift Felder anpassen.
4. Smoke-Test gegen `qa-live-sweep` mit Pika allein.

## Phase B — Vidu Q2 Replicate-Slug fixen (`generate-vidu-video/index.ts`)

Gleiche Methode wie Pika:
1. Korrekten aktuellen Replicate-Slug für Vidu Q2 (Reference-to-Video) ermitteln. Erwartung: `vidu-studio/vidu-q2-multi-reference` oder `vidu/q2-reference`.
2. Slug + Inputs (Reference-Roles-Mapping) anpassen.
3. Wenn Vidu nicht mehr auf Replicate verfügbar ist, auf Vidu-Direct-API umstellen oder Modul deprecaten.

Beide Functions geben den Replicate-Fehler bereits sauber zurück + refunden Credits — der Refund-Pfad ist okay.

## Phase C — HeyGen Avatar-Recycling (`generate-talking-head/index.ts` + `qa-live-sweep-bootstrap`)

Problem: HeyGen Free/Starter erlaubt nur 3 gespeicherte Talking Photos. Jeder Render legt einen neuen an → Limit erreicht → 401028.

Aktion (zwei Layer):

1. **In `generate-talking-head`**: Vor jedem Upload `GET https://api.heygen.com/v2/talking_photo.list` aufrufen, die ältesten Avatare (älter als z.B. 1h, mit Prefix `qa-` oder `lovable-`) per `DELETE /v2/talking_photo/{id}` entfernen. So bleibt das Free-Limit immer mit Headroom.
2. **In `qa-live-sweep-bootstrap`**: Wenn ein Talking-Photo bereits hochgeladen wurde, dessen `talking_photo_id` in `system_config` (key `qa.heygen_talking_photo_id`) speichern und beim nächsten Sweep wiederverwenden. Nur wenn der gespeicherte Eintrag von HeyGen abgelaufen/gelöscht ist, wird neu hochgeladen.
3. **In `qa-live-sweep`**: Optional `talkingPhotoId` direkt aus `system_config` übergeben statt `imageUrl` — spart den Upload komplett.

Zusätzlich: Wenn HeyGen 401028 trotzdem auftritt, in `generate-talking-head` den Fehler in eine **strukturierte 402-Response** (`HEYGEN_AVATAR_LIMIT`) verwandeln statt 500, damit Live Sweep das als "skip mit Cost-Issue" statt als roten Fail anzeigt.

## Phase D — Live-Sweep-Coverage-Verbesserung (klein)

In `qa-live-sweep/index.ts` Zeile 225:
- Für Talking-Head-Test gezielt `test-portrait.png` (das Phase-1-Asset) aus dem Bucket verwenden, nicht `test-image.png`. Das ist konsistent mit dem Deep-Sweep-Fix der vorherigen Iteration und vermeidet "no face detected" Folgefehler nach dem Avatar-Recycling-Fix.

## Reihenfolge

1. **Phase A (Pika)** — kürzester Fix, höchster Hebel für User.
2. **Phase B (Vidu)** — gleiche Mechanik.
3. **Phase C (HeyGen Recycling)** — etwas mehr Code, aber löst dauerhaftes Limit-Problem.
4. **Phase D** — Mini-Patch im Sweep selbst.
5. Re-run Live Sweep → erwartet 12/12 grün (oder Pika/Vidu sauber als "model deprecated" mit klarer Meldung, falls Replicate die Modelle wirklich entfernt hat).

## Was ich nicht vorschlage

- Keine generelle Replicate-Catalog-Sync-Cron — overkill für 2 Slugs. Beim nächsten 404 fixen wir punktuell.
- Kein Wechsel weg von HeyGen — die API funktioniert, nur unsere Avatar-Hygiene fehlt.
- Kein Aufbohren des Bug-Harvesters (der hat die 3 Bugs ja bereits aufgespürt — System funktioniert).

**Soll ich starten mit Phase A (Pika-Slug-Fix inklusive Replicate-Catalog-Lookup)?**
