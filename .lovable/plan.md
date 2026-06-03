## Diagnose (verifiziert anhand der Logs)

**Was wirklich passiert** für Scene `85ecc55a` (3 Sprecher):

- Per-Turn-Pipeline rendert 2 Preclips (Turn 1 = 1.3s, Turn 2 = 3.17s).
- Beide Preclips werden an Sync.so `lipsync-2-pro` mit `coordinates`+`frame_number`+`sync_mode=cut_off` geschickt.
- **Jeder einzelne Dispatch failt mit `"An unknown error occurred."`** — 6 von 6 Versuchen (3 retries pro Turn mit variierten Frames/Coords). Sync.so kann diese Preclip+Coord+ASR-Payload strukturell nicht verarbeiten.
- Scene `f3e2e8b4` davor: identisches Symptom (`sync_FAILED: An unknown error occurred.`).

**Zwei eindeutige Befunde**:

1. Der 3-4-Sprecher Per-Turn-Pfad (`compose-dialog-scene` + per-turn Preclips) ist strukturell tot bei Sync.so — Coord-/Frame-/Temperature-Retries helfen nicht.
2. Der 1-2-Sprecher Multi-Pass-Pfad (`compose-dialog-segments` mit `segments[]` auf EINEM Master-Clip) läuft seit Wochen stabil.
3. Bonus-Bug: `lipsync-watchdog.hasRecordedProviderJob()` erkennt Per-Turn-Jobs nicht (Job-ID wird auf shot nie persistiert, nur im `syncso_dispatch_log`). Folge: falsches `watchdog_preflight_aborted` statt `watchdog_provider_timeout` — Symptom identisch, Reason irreführend.

## Ziel

Eine einzige, stabile Lipsync-Pipeline für **1–4 Sprecher**, modelliert auf dem bewährten 2-Sprecher-Pfad. Per-Turn-Architektur wird ausgemustert. Cast hart auf 4 unterschiedliche Charaktere limitiert (Artlist erlaubt typisch 4 — siehe Recherche).

## Architektur (vereinheitlicht)

```text
N Sprecher (1..4)
  ↓
1× Master-Clip (Hailuo i2v, ganze Szene, alle Personen sichtbar)
  ↓
N parallele Sync.so-Passes (1 pro distinct character_id)
  jeder Pass: { input: [video=master, audio=joined-vo-for-this-speaker],
                options.segments=[{start,end} pro Turn dieses Sprechers],
                options.active_speaker_detection.coordinates=[face des Sprechers im Master] }
  ↓
ffmpeg-Overlay/Stitch der N Pass-Outputs → finaler Szenen-Clip
```

Vorteile vs. Per-Turn:
- 1 Master-Clip statt N Preclips → keine Preclip-Coord-Drift, Sync.so akzeptiert Payload nachweislich
- 1 Sync.so-Job pro Sprecher (max 4) statt 1 pro Turn (kann 10+ sein) → drastisch weniger Provider-Calls
- Identische Payload-Form wie 2-Sprecher-Pfad → ein Code-Pfad, ein Verifikationspfad

## Umsetzungsschritte

### 1. `compose-dialog-segments` auf N=1..4 erweitern
- Cast-Validation (`_shared/cast-validation.ts`) vor jedem Debit: 1–4 distinct `character_id`, keine Duplikate, keine zeitlichen Overlaps.
- Für jeden distinct Sprecher: bestehende Multi-Pass-Logik durchlaufen lassen — pro Pass `segments[]` aus den Turns dieses Sprechers bauen, `coordinates` aus der Face-Map des Masters für genau diesen Charakter.
- Audio-Pre-Mix pro Sprecher: alle seine Turn-VOs in einen einzelnen Audio-Stream einfügen, Stille zwischen Turns, gleiche Länge wie Master.
- Stitch (ffmpeg) wie bei 2-Sprecher: Pass-Outputs übereinanderlegen, jeder Pass stellt nur den Mund seines Bereichs zur Verfügung.

### 2. Per-Turn-Pfad einfrieren
- `compose-dialog-scene` (per-turn) wird in `compose-dialog-segments` umgeleitet (sanftes Fallthrough; gleiche Eingangs-Payload).
- `dialog_shots.version = 5 + shots[]` wird weiter unterstützt für laufende historische Szenen, aber neue Runs gehen ausschließlich auf `version = 6` (Multi-Pass-Format).
- `poll-dialog-shots` per-shot-Branch bleibt für Übergangszeit aktiv, Watchdog killt sie aber jetzt korrekt.

### 3. Cast-Limit hart auf 4 erzwingen
- `validateCast()` rejected `>4` mit `cast_invalid_too_many_speakers`.
- UI (`SceneDialogStudio`/`SceneCard`): Sprecher-5 Button disabled + Tooltip „Max 4 Sprecher pro Szene (Artlist-Standard)".

### 4. Watchdog reparieren
- `lipsync-watchdog.hasRecordedProviderJob()` checkt zusätzlich:
  ```
  EXISTS(SELECT 1 FROM syncso_dispatch_log
         WHERE scene_id=$1 AND created_at > scene.updated_at - 5min)
  ```
- Damit klassifiziert er laufende Multi-Pass-Szenen korrekt als `provider_timeout` (10 min TTL) statt `preflight_aborted` (4 min).

### 5. Aktuelle stuck Szene bereinigen
- Über bestehenden `reset-lipsync-scene`-Endpoint (SQL-Insert via Insert-Tool, nicht Migration): `85ecc55a-…` auf clean `pending` zurücksetzen, Inflight-Jobs leeren, Credits refunden falls nicht refundet.

### 6. Verifikation
- 3-Sprecher-Szene starten → erwartet: 1 Master-Render + 3 parallele Sync.so-Passes → finaler Clip mit korrekter Mund-Animation pro Person.
- 1- und 2-Sprecher-Szenen weiterhin grün (gleicher Code-Pfad, gleiche Payload).
- 4-Sprecher-Szene: akzeptiert. 5-Sprecher: hart abgelehnt vor Debit.
- Doppelter Charakter in derselben Szene: hart abgelehnt vor Debit.
- Watchdog killt eine künstlich hängende Szene mit korrekter Reason.

### Technische Details (für Code-Pfade)

**Geänderte/neue Dateien:**
- `supabase/functions/compose-dialog-segments/index.ts` — Speaker-Loop von 2 auf 1–4 ausweiten, pro-Sprecher Audio-Mix, pro-Sprecher Face-Coords aus Master-Face-Map ziehen.
- `supabase/functions/compose-dialog-scene/index.ts` — Internal-Redirect auf `compose-dialog-segments` für alle N, oder Wrapper, der die Payload auf das v6-Multi-Pass-Format transformiert.
- `supabase/functions/lipsync-watchdog/index.ts` — `hasRecordedProviderJob` um `syncso_dispatch_log`-Check erweitern.
- `supabase/functions/_shared/cast-validation.ts` — `MAX_SPEAKERS = 4` (bereits gesetzt), kein Funktions-Change nötig.
- `src/components/video-composer/SceneDialogStudio.tsx` (oder Equivalent) — Add-Speaker-Button bei N=4 disabled.
- `mem/architecture/lipsync/unified-multi-pass-v6.md` (NEU) — Architektur-Doku.

**Pricing**: bleibt `ceil(durSec) × 9 × N_passes` (N_passes = distinct speakers, max 4) — entspricht aktueller `sync-so-pro-model-policy`.

**Refund**: idempotent via `failLipSync()` (unverändert).

**Webhook**: `sync-so-webhook` v5-segments-Zweig bleibt, weil Multi-Pass v6 dieselbe Webhook-Form liefert.

## Erwartetes Ergebnis

Eine Pipeline für 1–4 Sprecher. Keine eigene Per-Turn-Architektur mehr. Sync.so bekommt nur noch die nachweislich akzeptierte Multi-Pass-Payload. Watchdog killt Hänger korrekt. UI blockiert ungültige Casts vor jedem Provider-Call. Wir stochern nicht mehr im Dunkeln — wir nutzen den einen Pfad, der nachweislich funktioniert.