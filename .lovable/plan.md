## Root cause (forensisch bestätigt)

Aus den Edge-Function-Logs zum Zeitpunkt des Fehlers:

```
ERROR [compose-dialog-segments] scene=d08783e6 dispatch FAILED pass=0 status=400
body={"message":["options.active_speaker_detection.coordinates must contain at least 2 elements"],
      "error":"Bad Request","statusCode":400}
```

Das ist **kein Sync.so Edge-Case und kein Audio/Plate-Problem** — es ist ein triviales Payload-Shape-Regression-Bug, eingeführt mit **v136 Preclip-Centered Coords**.

### Bug 1 (Blocker — `syncso_segments_dispatch_400`)

Datei: `supabase/functions/compose-dialog-segments/index.ts`, **Zeile 4156**

```ts
coordinates: [[centerXY, centerXY]],   // ❌ nested array, length 1
```

Sync.so liest `coordinates` als flaches `[x, y]` (2 Elemente). Wir senden `[[360, 360]]` (1 Element, das wiederum ein Array ist) → Sync.so antwortet 400 "must contain at least 2 elements". Jeder einzelne Pass schlägt **bevor Sync.so überhaupt rechnet** fehl → `Lip-Sync abgebrochen` Banner in der UI.

Beweis: Alle anderen v60–v130-Pfade nutzen das korrekte flache Schema:
- Zeile 4242: `coordinates: clampSyncCoords(pass.coords)` → `[x, y]`
- `clampSyncCoords` (Zeile 329) gibt `[number, number]` flach zurück.

Nur v136 hat fälschlich eine zusätzliche Klammerebene.

### Bug 2 (Sekundär — Qualität, nicht Blocker)

```
WARNING [plate-face-identity] probe kailee HTTP 400
WARNING [plate-face-identity] gemini google/gemini-2.5-pro HTTP 400
```

Alle 4 v133-Per-Char-Probes + der Cross-Check (gemini-2.5-pro) bekommen 400 vom Lovable AI Gateway. Folge: Plate-Identity fällt auf Legacy-Pfad zurück, ASD-Strategy kann auf `last_resort_auto` / v119 SOFT_WARN demoten — was die Pipeline anfälliger macht. Erklärt das "alles geht schief"-Gefühl: selbst wenn Bug 1 nicht zugeschlagen hätte, wäre die Identity-Zuordnung degradiert.

Wahrscheinliche Ursachen (zu verifizieren in Stage B):
- Image-URLs in `content[].image_url.url` sind Supabase Signed URLs, die expired sind, oder
- Gateway lehnt das Multi-Image-Payload-Shape für `gemini-2.5-flash`/`gemini-2.5-pro` ab (kürzlich geänderte Spec — siehe `mem/architecture/gemini-vision/mp4-payload-shapes.md`)

---

## Plan

### Stage A — Hotfix (sofort, 1 Zeile)

Datei: `supabase/functions/compose-dialog-segments/index.ts`

- Zeile 4156: `coordinates: [[centerXY, centerXY]]` → `coordinates: [centerXY, centerXY]`
- Zeile 4160 belassen (`preclip_asd_coords = [centerXY, centerXY]` ist bereits korrekt — war nur das Dispatch-Payload falsch)
- Version-Bump: `COMPOSE_DIALOG_SEGMENTS_VERSION = "v139.1"`
- Diagnose-Log-Ergänzung: vor dem Sync.so `fetch` einmal pro Pass `console.log` mit `coords_shape=[len, isArrayOfNumber]` damit jede zukünftige Regression sofort sichtbar ist.
- Pre-Dispatch Assertion: wenn `auto_detect === false`, prüfe `Array.isArray(coordinates) && coordinates.length === 2 && coordinates.every(n => Number.isFinite(n))` — sonst werfe **bevor** Sync.so-Aufruf, mit klarem Error-Code `BAD_COORDS_SHAPE` statt Sync.so 400.

Erwartung: Dispatch geht durch, Pipeline läuft die 6–9 Minuten wie in v139 Stage 1 geplant.

### Stage B — Diagnose & Fix Gemini-Probe HTTP 400

Datei: `supabase/functions/_shared/plate-face-identity.ts`

- Bei `!resp.ok` zusätzlich `await resp.text()` loggen (max 500 Zeichen), damit wir den Gateway-Fehler-Body sehen.
- Prüfen ob `params.frameUrl` / `params.portraitUrl` öffentlich erreichbar sind (HEAD probe vor Gemini-Call, einmal pro Aufruf, mit 2s timeout) → bei 403/404 sofort `last_resort_auto` mit klarer Begründung statt blind Gemini zu callen.
- Falls Image-URL ok ist, das Payload-Shape gegen `mem/architecture/gemini-vision/mp4-payload-shapes.md` abgleichen.

Stage B nur ausführen wenn Stage A nicht reicht (also wenn der erste 4-Sprecher-Run noch immer auf Identity-Fallback geht).

### Stage C — Memory & Docs

- `mem/architecture/lipsync/v139-stage-1-brakes-released.md` ergänzen um v139.1 Regression-Fix-Entry.
- Neue Memory `mem/architecture/lipsync/v136-coords-shape-canonical.md`: "Sync.so sync-3 `coordinates` MUSS flach `[x, y]` sein (2 Number-Elemente). Niemals nested. Pre-Dispatch Assertion vorhanden."

### Was NICHT angefasst wird

- v138 Plan-D Fan-out, v139 Stage 1 Brakes Released (Coord-Refresh Scoping, Batch-Preclip default ON, Plan-D default ON) — alles korrekt, läuft nur nie an, weil Bug 1 vorher abbricht.
- Sync.so `sync-3`, `sync_mode: cut_off`, Webhook-Pfad, Stitch-Pipeline.
- Audio/Plate/Preclip-Renderer, Frontend, Wallet, Refunds.

### Verifikation

1. Dieselbe 4-Sprecher-Szene neu generieren.
2. Edge-Logs erwarten: kein `dispatch FAILED ... status=400`, stattdessen `v139_fanout_active cap=2`, 4× `DISPATCH`, 4× Sync.so Webhook, Stitch ok.
3. Wenn weiterhin Gemini-Probe HTTP 400 erscheint → Stage B aktivieren.

---

## Aufwand

- Stage A: ~6 Zeilen Code-Änderung, ~10 Zeilen Assertion + Log, sofort deploybar.
- Stage B: ~30 Zeilen, nur bei Bedarf.
- Stage C: 2 Memory-Files.

Stage A ist die alleinige Ursache des Banners auf dem Screenshot. Die anderen v138/v139 Konsolidierungen aus dem vorigen Plan bleiben relevant für Speed/Cleanup, sind aber unabhängig.
