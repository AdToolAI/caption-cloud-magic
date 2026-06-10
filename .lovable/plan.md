# Plan B — Pipeline-Speedup für 4-Sprecher-Dialoge

## Ziel
4-Sprecher-Szene zuverlässig **unter 7 Minuten**. Erwartete Einsparung: **75–150 s** (von heute ~6–9 min auf ~4–6 min).

## Was angefasst wird — und was NICHT

✅ Angefasst: Reihenfolge/Parallelisierung von **eigenen** Render-Schritten (TTS, Anchor, Preclip-Lambda).
🚫 Nicht angefasst: Sync.so-Payload, Retry-Ladder (v82/v84), v60 serial-chain (FROZEN I.9), v69 Single-Face-Preclip-Invariant, Pricing, Refund-Pfad, Watchdog-Logik.

## Hebel A — TTS und Anchor-Plate parallel

**Heute (seriell in `compose-video-clips`):**
```text
[TTS+Mux: 30–60s] → [Anchor+Hailuo: 60–120s] → [compose-dialog-segments]
```

**Neu (parallel via Promise.all):**
```text
[TTS+Mux: 30–60s] ┐
                  ├─→ [compose-dialog-segments]
[Anchor+Hailuo:   ┘
 60–120s]
```

**Einsparung:** min(TTS, Anchor) ≈ **30–60 s**

**Risiko-Absicherung:**
- Promise.all mit `allSettled`, nicht `all` — ein Fehler in einem Branch killt den anderen nicht
- Beide Branches schreiben in **disjunkte** Felder von `composer_scenes` (TTS → `audio_url`/`speaker_windows`; Anchor → `clip_url`/`anchor_url`), kein Write-Konflikt
- Wenn **eine** Seite fehlschlägt: existierender idempotenter Refund + bestehende „retry single side"-Pfade greifen unverändert
- Hinter Flag `system_config.composer.parallel_tts_anchor` (default `false` → muss explizit aktiviert werden)

## Hebel B — v69 Preclips für alle 4 Passes vorrendern statt pro Pass

**Heute (in `compose-dialog-segments`, pro Pass beim Dispatch):**
```text
Pass 0: [Preclip 5–15s] → [Sync.so 25–45s] → [Mux 10–20s]
Pass 1: [Preclip 5–15s] → [Sync.so 25–45s] → [Mux 10–20s]
Pass 2: [Preclip 5–15s] → [Sync.so 25–45s] → [Mux 10–20s]
Pass 3: [Preclip 5–15s] → [Sync.so 25–45s] → [Mux 10–20s]
                                              Σ Preclip: 20–60s
```

**Neu (alle 4 Preclips parallel direkt vor Pass 0):**
```text
[4× Preclip parallel: 8–18s] → Pass 0 [Sync.so+Mux] → Pass 1 → 2 → 3
                                Σ Preclip-Overhead: 8–18s
```

**Einsparung:** **12–42 s** (3 Preclip-Rendervorgänge eingespart)

**Risiko-Absicherung:**
- Sync.so-Serial-Chain (v60) bleibt **unverändert** — Webhook chained Pass 1..N-1 weiter über `pendingIdxs[0]`
- Preclip-URLs werden pro Pass in `composer_scenes.passes[i].preclip_url` persistiert (Feld existiert bereits, sonst JSONB-add)
- Webhook prüft erst `passes[i].preclip_url`; wenn vorhanden → direkt Sync.so dispatchen ohne neu zu rendern
- **Bestehender Full-Plate-Fallback** in compose-dialog-segments greift unverändert, wenn ein einzelner Preclip-Render scheitert
- Lambda-Concurrency: 4 parallele Preclip-Renders bleiben weit unter dem max-5-Workers-Limit
- Hinter Flag `system_config.composer.batch_preclip_render` (default `false`)

## Was NICHT in diesem Plan ist (bewusst weggelassen)

- **Sync.so Passes parallel statt seriell** — verbietet FROZEN-Invariant I.9 (v60), war Root-Cause der `provider_unknown_error`. Nicht verhandelbar.
- **Audio-Mux pro Pass entfernen** — strukturelle Änderung an DialogStitch-Input-Shape, zu riskant für „so vorsichtig wie möglich"
- **framesPerLambda tunen** — kleiner Gewinn, separates Ticket wert
- **Retry-Ladder kürzen** — würde Recovery-Rate senken

## Rollout-Plan

1. Beide Flags in `system_config` default `false` einführen + Migration
2. Code für A+B deployen (beide Pfade existieren parallel zur alten Logik via Flag-Gate)
3. **1 Testszene** (4 Sprecher) manuell mit Flag A=true rendern → Logs+Output prüfen → wenn grün, Flag persistieren
4. Dasselbe für Flag B
5. Nach 24 h ohne Regression: Flags als Default in Code ziehen, alten Pfad in v93-Cleanup entfernen

## Telemetrie

Beide Hebel loggen explizite Marker:
- `plan_b_A_parallel_tts_anchor_start` / `_complete` mit `ms_tts` / `ms_anchor` / `ms_saved`
- `plan_b_B_batch_preclip_start` / `_complete` mit `preclip_count` / `ms_total` / `ms_saved_estimate`

→ macht Effekt im Edge-Log sofort verifizierbar.

## Erwartete Endzeit (4 Sprecher, beide Flags aktiv)

```text
TTS+Anchor parallel:       60–120s
Batch-Preclip (4×):          8–18s
Sync.so Pass 0 + Mux:       35–65s
Sync.so Pass 1 + Mux:       35–65s
Sync.so Pass 2 + Mux:       35–65s
Sync.so Pass 3 + Mux:       35–65s
DialogStitch Final:         20–40s
                          ─────────
                          228–438s = 3:48 – 7:18 min
```

Worst-Case knapp am Ziel, Best-Case deutlich drunter. Wenn das nicht reicht, ist der **einzige** verbleibende große Hebel C (Audio-Mux-Konsolidierung) — eigene Diskussion wert.

## Technische Details

### Hebel A — Dateien
- `supabase/functions/compose-video-clips/index.ts`: Sequenz `awaitTTS → awaitAnchor` ersetzen durch `Promise.allSettled([ttsPromise, anchorPromise])`, anschließend Result-Check + Refund-Branch pro Seite. Gate: `if (config.parallel_tts_anchor)`.

### Hebel B — Dateien
- `supabase/functions/compose-dialog-segments/index.ts`: vor Pass-0-Dispatch `Promise.all(passes.map(renderPreclipLambda))` ausführen, Ergebnisse in `passes[i].preclip_url` schreiben, dann normaler Dispatch-Pfad. Gate: `if (config.batch_preclip_render && speakers.length >= 2)`.
- `supabase/functions/sync-so-webhook/index.ts`: beim Chain-Dispatch `pendingIdxs[0]` prüfen ob `passes[i].preclip_url` schon gesetzt → bereits-rendered-Pfad nehmen. Reine Read-Only-Erweiterung.

### Config-Migration
```sql
INSERT INTO system_config(key, value, description) VALUES
  ('composer.parallel_tts_anchor', 'false'::jsonb, 'Plan B Hebel A'),
  ('composer.batch_preclip_render', 'false'::jsonb, 'Plan B Hebel B')
ON CONFLICT (key) DO NOTHING;
```
