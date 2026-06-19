## Was wir aus der Forensik wissen (Szene `6b4fda29…`)

```
Sprecher 2 (turn 1, coords [564,137], frame 101)
  21:26  DISPATCH coords-pro                → 21:27  NOOP (sync_output_unchanged)
  21:27  ESCALATE coords-pro (auto-retry)   → 21:29  NOOP wieder  ← Game Over
         → fällt in PASS_DONE_SUSPECT (status=done, sync_noop_suspect=true)
         → finaler Mux nimmt den NOOP-Output → Speaker 2 öffnet Mund nicht.
```

Drei Befunde, alle adressierbar ohne die Pipeline-Architektur anzutasten:

1. **NOOP-Eskalation bringt nichts**: Bei NOOP wird `retry_variant=coords-pro` gesetzt — aber die **Koordinaten, der frame_number, das Modell und der ASD-Mode bleiben identisch**. Sync.so kriegt zweimal dieselbe Eingabe → liefert zweimal denselben NOOP-Output. Eine echte Eskalation müsste den *Eingangsvektor* ändern.
2. **`coord_refresh_terminal_blocked` blockiert genau die Änderung, die helfen würde**: Wenn frischere Coords (Plate-Identity-Source) für den Retry da sind, weigern wir uns sie zu übernehmen, weil der Pass-Status „terminal" ist. Korrekt für *failed*-Passes, kontraproduktiv beim aktiven NOOP-Retry, den wir selbst gerade starten.
3. **Forensik blind auf Speaker-Ebene**: `turn_idx` ist in jedem `syncso_dispatch_log`-Eintrag `<nil>`, daher müssen wir Speaker 2 derzeit über Coords zurückrechnen. Ohne dieses Feld können wir das hier nie schnell debuggen.

---

## Plan v134 — NOOP-Recovery deterministisch + Sync-3-konform

### Ziel
- Erste-Try-Erfolgsrate für Multi-Speaker-Szenen messbar erhöhen.
- Wenn doch ein NOOP auftritt: **genau einmal sinnvoll eskalieren**, dann hart abbrechen mit Refund — kein Endlos-Loop.
- Wall-Time-Ziel für 4-Sprecher-Szene: **≤ 6 min** (vorher 12).
- Zero-Risk für die laufende v128/v133-Logik: keine Strukturänderung an `compose-dialog-segments`, nur am NOOP-Recovery-Pfad im Webhook + 2 Helper.

### Sync.so-3-Konformität (Quelle: `mem://architecture/lipsync/sync-3-doc-strict-options-v106`)
Erlaubte Felder: `sync_mode`, `active_speaker_detection`.  
Erlaubte ASD-Modi: `{auto_detect: true}` ODER `{auto_detect: false, bounding_boxes}` ODER `{…, bounding_boxes_url}`.  
**Nicht** dazumixen: `temperature`, `occlusion_detection_enabled` (lösen reproduzierbar `provider_unknown_error` aus).  
Der Plan bewegt sich strikt innerhalb dieser drei zulässigen ASD-Konfigurationen.

---

### Schritt 1 — Echte NOOP-Eskalations-Leiter (deterministisch, max. 2 Stufen)
Datei: `supabase/functions/sync-so-webhook/index.ts` (Block 595–690, „v129.26 auto-escalate").

Statt nur `retry_variant: "coords-pro"` ohne Effekt zu setzen, baut der Webhook eine echte Eskalations-Stufe:

```
NOOP #1 (auto-escalate) :
  - Wechsel ASD-Modus:  auto_detect:true  →  bounding_boxes_url
    (lädt vorhandene `preclip_bbox_json` der Plate, sync-3-konform)
  - +120ms keep_lead_in_sec auf dem Audio-Trim (öffnet phonetisch sauberer)
  - Force refresh coords falls candidate_coords vorhanden ist (siehe Schritt 2)
NOOP #2 (auto-escalate) :
  - Fallback Modell auf  lipsync-2-pro  (chained, single-face plate)
    — laut Memory der „proven path" wenn sync-3 deterministisch noops
NOOP #3 :
  - Hard-Fail: status=failed, error_class=`sync_noop_unrecoverable`
  - Idempotenter Refund (deterministische UUID aus job_id)
  - Scene reset auf `needs_clip_rerender` mit klarem User-Hint
    „Sprecher X (Turn Ys–Zs) konnte nicht lippensynchronisiert werden — Plate neu rendern"
```

Pass-State bekommt ein neues Feld `noop_escalation_step: 0|1|2` statt nur boolean `noop_retry_attempted`. Single source of truth, kein Magic.

---

### Schritt 2 — `coord_refresh_terminal_blocked` während Auto-NOOP-Retry aufheben
Datei: `supabase/functions/compose-dialog-segments/index.ts` (Block 2543–2580).

Aktuell: terminal-Guard verbietet jeden Coord-Refresh.  
Neu: Wenn wir SELBST einen NOOP-Retry starten (Webhook setzt `status=pending` + neuen `noop_retry_attempt_id`), darf dieser eine Pass die `candidate_coords` übernehmen, weil er gerade vom terminalen Zustand wegbewegt wird. Andere Pässe bleiben geschützt.

Konkret: Guard greift nur noch wenn `p.status === "done" && !p.noop_retry_attempt_id` (oder `failed`). Beim aktiven Retry zählt der Pass als „re-opened" und wird nicht geblockt.

---

### Schritt 3 — `turn_idx` + Speaker-Identität in jedes Dispatch-Log
Datei: `supabase/functions/_shared/syncso-preflight.ts` (Helper `logSyncDispatch`).

Jeder Eintrag in `syncso_dispatch_log` bekommt verpflichtend:
- `turn_idx` (aus pass.idx),
- `speaker_name`,
- `pass_state` (`pending|dispatched|done|failed|noop_retry_1|noop_retry_2`),
- `noop_escalation_step`.

Damit ist die nächste Diagnose 30 Sekunden statt 20 Minuten. **Keine Schema-Migration nötig** — alle Spalten existieren bereits in `syncso_dispatch_log`.

---

### Schritt 4 — Sofort-Workaround für genau diese Szene
Sprecher-2-Pass auf `needs_clip_rerender` zurücksetzen, NOOP-Output verwerfen, Refund. Nutzt vorhandenen `reset-lipsync-scene` mit `speaker_idx`-Targeting. Kein neuer Code, nur ein Aufruf nachdem v134 deployed ist.

### Schritt 5 — UI-Transparenz (klein, ohne Pipeline-Touch)
Datei: `src/components/video-composer/SceneInlinePlayer.tsx`.

Lip-Sync-Banner zeigt zusätzlich:
- `Pass 2/4 · NOOP-Retry 1/2 läuft (coords-pro + bounding_boxes_url)`
- ETA = laufende Sekunde aus dem Pass + Median-Pass-Dauer der letzten 50 Pässe (existiert bereits in `syncso_dispatch_log`).

Damit weiß der User immer, ob's noch läuft oder festhängt. Kein Polling-Touch.

---

### Was wir bewusst NICHT machen
- ❌ Keine Änderung am Plan-D-Fanout-Orchestrator (parallel dispatch funktioniert).
- ❌ Keine Schema-Migration (alle Felder vorhanden).
- ❌ Kein neuer Provider, kein Modell-Swap außerhalb der `sync-3 → lipsync-2-pro`-Achse (beide bereits validiert).
- ❌ Kein neuer Polling-Rhythmus (Webhook-getrieben bleibt Webhook-getrieben).
- ❌ Kein Berühren von Plate-Identity (v133), Pre-Gate (v132), oder Coord-Resolution.

### Wall-Time-Erwartung
- Bester Fall (0 NOOPs): ~3–4 min für 4 Sprecher (heute auch schon erreichbar, dann erfreulich konsistent).
- Mit 1 NOOP pro Pass: ~5–6 min statt 8–10 min, weil Stufe 1 (`bounding_boxes_url`) deterministisch öffnet.
- Worst-Case (3 NOOPs in Folge auf einem Pass): Hard-Fail nach ~4 min mit Refund — der User wartet nie wieder 12+ min auf ein NOOP-Resultat.

### Validierung nach Deploy
1. Genau diese Szene `6b4fda29…` erneut laufen lassen (Clean Restart).  
2. Forensik in `syncso_dispatch_log` für Sprecher 2: muss `turn_idx=1`, `speaker_name="Matthew Dusatko"`, `noop_escalation_step≤2` zeigen.  
3. Lambda-Mux nimmt Sprecher-2-Output aus dem **finalen Retry**, nicht aus dem ersten NOOP.  
4. Wall-Time im UI-Banner messen und protokollieren.

### Geänderte Dateien
- `supabase/functions/sync-so-webhook/index.ts` (NOOP-Eskalations-Leiter v134)
- `supabase/functions/compose-dialog-segments/index.ts` (Terminal-Guard verfeinern)
- `supabase/functions/_shared/syncso-preflight.ts` (Log-Helper: turn_idx + speaker_name pflicht)
- `src/components/video-composer/SceneInlinePlayer.tsx` (Pass-Status im Banner)
- `mem/architecture/lipsync/v134-noop-escalation-ladder.md` (neu — dokumentiert Pfad + ASD-Matrix)
- `mem/index.md` (Eintrag v134 hinzufügen, v131-Watchdog-Eintrag bleibt)
