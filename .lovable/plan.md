## Status quo

Live Sweep zeigt **10/12 grün**, 2 rote Zeilen:

1. **Hedra Talking Head → HEYGEN_AVATAR_LIMIT (401028)** — echter Bug.
2. **Pika 2.2 Std → HTTP 410** — kein Bug, sondern absichtlich so codiert (Provider-Migration). Nur die Klassifizierung im Sweep-Reporter ist falsch.

## Ursache 1: HeyGen-Cache ist leer

DB-Check: `system_config` enthält **keinen** Eintrag für `qa.heygen_talking_photo_id`. Der Bootstrap-Step `qa-live-sweep-bootstrap` wurde entweder nie ausgeführt oder ist beim letzten Versuch beim HeyGen-Upload gescheitert (vermutlich, weil das Account schon 3 Photos hatte und die Prune-Liste damals nicht griff).

Konsequenz: `qa-live-sweep` liest `talkingPhotoId = undefined`, übergibt nichts an `generate-talking-head`, das versucht einen frischen Upload — und HeyGen lehnt mit 401028 ab.

## Ursache 2: Pika 410 wird als "failed" gewertet

`generate-pika-video` gibt absichtlich **HTTP 410** mit Code `PIKA_PROVIDER_MIGRATION` zurück. Der Sweep-Reporter behandelt jeden Non-2xx als Fehler.

## Fix

### Phase A — HeyGen Bootstrap härten und automatisch laufen lassen

1. **`qa-live-sweep` ruft den Bootstrap on-demand auf**, falls `qa.heygen_talking_photo_id` fehlt: vor dem Talking-Head-Test einmal `ensureHeyGenTalkingPhoto` (extrahiert in `_shared/heygen-bootstrap.ts`) ausführen → Cache schreiben → ID verwenden. Damit ist der Sweep selbstheilend; kein manueller "Bootstrap Assets"-Klick mehr nötig.
2. **Robusterer Prune in `ensureHeyGenTalkingPhoto`**: Vor dem Upload gezielt `talking_photo.list` lesen und alle `is_preset === false` Einträge per DELETE entfernen, mit kurzer Wartezeit (300 ms) zwischen Deletes, damit HeyGen die Quota wirklich freigibt. Falls nach Prune immer noch 401028 kommt: einmal retry nach 1 s.
3. **Persistenz-Sanity-Check**: Nach dem `upsert` in `system_config` direkt nochmal lesen und loggen — verhindert silent failures bei RLS oder Trigger-Konflikten.

### Phase B — Pika 410 als "expected" markieren

In `qa-live-sweep/index.ts` die Pika-Provider-Definition mit `expectedStatus: 410` und `expectedReason: "PIKA_PROVIDER_MIGRATION"` annotieren. Der Reporter zeigt solche Einträge als **graues "skipped (expected)"** statt als rotes "failed" — bleibt sichtbar dokumentiert, zählt aber zur Erfolgsquote (12/12 grün, 1 davon expected-skip).

### Phase C — Memory-Update

Memory `mem://architecture/video-edge-functions/no-per-user-rate-limit` ergänzen:
> *Sweep ist selbstheilend: HeyGen-Bootstrap wird on-demand ausgeführt, falls Cache leer ist. Pika 410 ist `expected` bis Provider-Migration abgeschlossen.*

## Erwartetes Ergebnis nach Re-Run

- Hedra Talking Head → **succeeded** (~0.30 €)
- Pika 2.2 Std → **expected (HTTP 410)** in grau, nicht rot
- Gesamt: **12/12 effektiv grün**, ~6.6 € pro Run

## Dateien, die ich anfassen werde

- `supabase/functions/_shared/heygen-bootstrap.ts` (neu, extrahiert die `ensureHeyGenTalkingPhoto`-Logik)
- `supabase/functions/qa-live-sweep-bootstrap/index.ts` (importiert aus dem Shared-Modul)
- `supabase/functions/qa-live-sweep/index.ts` (on-demand Bootstrap + Pika-expected-Status)
- `src/components/admin/qa-cockpit/*` (Reporter-Komponente, die `expected`-Status grau rendert)
- Memory-Datei

Soll ich loslegen?
