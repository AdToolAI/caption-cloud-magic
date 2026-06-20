# v139 — Radical Pipeline Consolidation

Ziel: Aus den 5.771 Zeilen `compose-dialog-segments` + 1.652 Zeilen `sync-so-webhook` einen **einzigen, geradlinigen Pfad** machen. Eine Strategie, eine Variante, ein Modell, ein Recovery-Mechanismus. Erwartet: ~2.000 Zeilen, 6–8 min/Scene statt 17–23 min.

## Prinzip
Aus der Forensik wissen wir: **v60 + v69 + v130 + v136** ist der einzige Pfad, der je dispatched. Alles andere ist Decke darüber. Wir entfernen die Decke, lassen den Pfad sichtbar.

---

## Stage 1 — Environment-Override neutralisieren (15 min, 0 Code-Zeilen)

`FEATURE_PLAN_D_FANOUT` Edge-Secret aktuell `"false"` → wird auf `"true"` gesetzt. Sofort-Effekt: nächster Lauf parallel statt seriell.

Verifikation: 1 Test-Scene, Log enthält **kein** `PLAN_D_FANOUT_BLOCKED_V128`, dafür neuen Marker `v139_fanout_active cap=2`.

---

## Stage 2 — Tote Zeilen löschen (~1.200 Zeilen weg)

### `sync-so-webhook/index.ts`
- `:1251–1366` — gesamter `if (canRetry) { … }` Block + die 4 `void variableX` Statements (~110 Zeilen)
- `:1137–1224` — v30/v37/v61 Variant-Ladder (`v121StopLoss`, `treatAsTransient`, `forceCoordsRepair`, `nextVariant`) (~90 Zeilen)

### `compose-dialog-segments/index.ts`
- `:125–126` — `LIPSYNC_MODEL`, `LIPSYNC_FALLBACK_MODEL` Konstanten
- `:515–544` — Body-Flag-Parsing für `isV41Retry`, `useV41Official`, `debugForceV56`, `retryNoAsd`, `forceMultipass`, `repairAudio` + alle Referenzen
- `:2843–2845` — `void v120ForcePreclip`, `void havePlateIdentityForDispatch`, `void hasPassPreclipForDispatch` + die zugehörigen Berechnungen ab `:2679` und `:2833`
- `:2860–2870` — v85-Log inkl. unerreichbarem `bbox-url-pro`-Branch
- `:3885–3887` — `if (!usePassPreclip) { syncOptions.occlusion_detection_enabled = true }` (unerreichbar)
- `:3083–3427` — gesamter Batch-Preclip-Block, **aber NUR um ihn umzubauen** (siehe Stage 4), nicht zu löschen

---

## Stage 3 — Strategien konsolidieren (~800 Zeilen weg)

### Eine Variante: `coords-pro`
- `:2846–2854` Variant-Normalisierung wird zu `const retryVariant = "coords-pro"` (Konstante).
- Alle `if (retryVariant === "…")` Branches im Dispatch-Builder (`:3986–4207`) auf den einen Pfad reduzieren.
- v82 `bbox-url-pro` bleibt **nur** als NOOP-Escalation-Stufe im Webhook (`webhook:619`).
- v130 `buildAsdStrategy` wird zu einer Funktion mit einer Code-Bahn: v136 preclip-centered für preclip-Pfad (der einzige).

### Eine Sprecher-Größe
- N=1 Path und N≥2 Path unifizieren. v60 ist bereits unified, aber es gibt N=1-Sonderzweige (`:1258–1285` Single-Speaker-Refund, `:1666` Visibility-Skip). Diese bleiben als **frühe Guards**, aber kein separater Dispatch-Pfad.

### Ein Recovery: NOOP-Escalation
- v134-Ladder bleibt unverändert (Stufe 0→bbox-url-pro, 1→coords-pro-box, 2→HARD FAIL).
- Webhook FAILED-Pfad macht **eine** Entscheidung: `noopSuspect` → Escalation. Sonst: terminal fail + refund. Keine Variant-Ladder, keine `canRetry`-Logik.

---

## Stage 4 — Bremsen lösen (~150 neue Zeilen, ~250 weg)

### Batch-Preclip Default AN
- `composer.batch_preclip_render` Default-Wert in DB auf `true` setzen (Migration).
- Code-Default in `:3064–3073` auf `true`, DB-Flag nur als Killswitch.
- Effekt: 1 paralleler Render-Batch (70 s) statt 4× serial × 30 s = 120 s.

### COORD REFRESH scoped (Fix C7)
- `:2554–2631` Loop wird auf den **aktuellen Pass** beschränkt (`if (p.idx !== currentPassIdx) continue`).
- Pixel-Schwelle für `changed`: `Math.abs(oldCoord[0] - freshCoord[0]) > 8 || Math.abs(oldCoord[1] - freshCoord[1]) > 8`.
- Sibling-Preclips bleiben unangetastet.

### Face-Gate-Log Wahrheit (Fix C1)
- `:2364` `console.error("FACE-GATE BLOCK …")` wird zu `gateOne`-Return-Wert, NICHT als Log emittiert.
- Log wird einmal **nach** v119-Demote emittiert: entweder `FACE-GATE BLOCK (hard)` oder `FACE-GATE SOFT_WARN (v119)`.

### Webhook-Recovery wenn Webhook nie kommt (Fix B11)
- Bestehender lipsync-watchdog wird auf `4 min` Hard-Timeout pro Pass reduziert (war 7).
- Bei Timeout: NOOP-Escalation-Pfad triggern statt nur Re-Probe.

---

## Stage 5 — Dokumentation & Versionierung (~80 Zeilen)

- `COMPOSE_DIALOG_SEGMENTS_VERSION = "v139.0"` im Code-Header.
- `FROZEN-INVARIANTS.md` I.9 korrigieren: `parallel_sync_so_passes` defaults `true`.
- 80+ `mem/architecture/lipsync/v*.md` Memory-Dateien → **eine** `CANONICAL.md` mit:
  - Aktive Strategien (Tabelle)
  - Happy-Path A→Z (aus Stage 0 Forensik)
  - Killswitches & Env-Flags
  - NOOP-Escalation-Ladder
- Alle v41–v137 Einzeldateien als `_archive/` Subfolder verschoben (read-only Referenz).
- `mem/index.md` bekommt einen Eintrag, ersetzt die 80 alten Lipsync-Einträge.

---

## Geplante Code-Bewegungen (geschätzt)

| Bereich | Vorher | Nachher | Delta |
|---------|--------|---------|-------|
| `compose-dialog-segments/index.ts` | 5.771 | ~1.700 | −4.070 |
| `sync-so-webhook/index.ts` | 1.652 | ~600 | −1.050 |
| `_shared/*` (twoshot-face-map, plate-face-identity, asd-strategy, etc.) | unverändert | unverändert | 0 |
| Neue: 1 Migration für DB-Defaults | — | ~40 | +40 |
| `mem/architecture/lipsync/CANONICAL.md` | — | ~300 | +300 |
| `mem/architecture/lipsync/_archive/*` | 80 Dateien | 80 Dateien (verschoben) | 0 |

**Netto:** ~5.000 Zeilen gelöscht, ~340 Zeilen neu.

---

## Verifikation (3-stufig)

### V1 — Build & Deploy
- `compose-dialog-segments` + `sync-so-webhook` deployen.
- Smoke-Test: `b1ee2ede`-ähnliche Scene mit 1 Sprecher → muss in <90 s durchlaufen.

### V2 — 4-Sprecher End-to-End
- Neue Scene mit 4 Sprechern starten.
- Erwartete Logs in dieser Reihenfolge:
  1. `v139_fanout_active cap=2`
  2. genau **ein** `plan_b_B_batch_preclip_complete ok=4/4`
  3. 4× `DISPATCH pass=N/4 model=sync-3` innerhalb von 80 s nach Start
  4. **kein** `PLAN_D_FANOUT_BLOCKED_V128`
  5. **kein** `FACE-GATE BLOCK` ohne folgendes `SOFT_WARN`
  6. **kein** zweites `batch_preclip_complete` (Sibling-Reinvalidierung gefixt)
- Erwartete Laufzeit: 6–8 min.
- Alle 4 Sprecher mit echtem Lip-Sync (kein NOOP).

### V3 — Failure-Mode-Test
- Eine Scene mit absichtlich kaputtem Audio einer Pass → NOOP-Escalation-Ladder muss greifen, Refund muss erfolgen, andere 3 Passes laufen normal weiter.

---

## Risiken & Rollback

| Risiko | Mitigation |
|--------|----------|
| Gelöschter Code wird doch noch gebraucht | Git-History bleibt; v138-Branch-Tag vor dem Cleanup setzen |
| Plan-D Fan-out überlastet Sync.so | `concurrencyCap` ist DB-konfigurierbar (default 2, max 4) |
| Batch-Preclip-Default AN bringt unerwartete Lambda-Last | DB-Flag bleibt als Killswitch erreichbar |
| Memory-Konsolidierung verliert wichtige Details | `_archive/` bleibt vollständig, nur nicht mehr im Index |

Rollback in 1 Schritt: `FEATURE_PLAN_D_FANOUT="false"` setzen → SERIAL-Modus wieder aktiv (alter Pfad bleibt im Code für Notfall, weil v60-Chain selbst nicht angetastet wird).

---

## Reihenfolge der Umsetzung

1. **Migration** für `composer.batch_preclip_render = true` Default
2. **Stage 1** Env-Secret setzen
3. **Stage 4** Bremsen-Fixes (C1, C7, B11, Batch-Default Code)
4. **Stage 2** Toter Code raus
5. **Stage 3** Strategien konsolidieren
6. **Stage 5** Docs + Memory
7. Deploy, V1 → V2 → V3

Nach jedem Stage ist die Pipeline funktional (kein Big-Bang). Wenn V2 oder V3 fehlschlägt, kann Stage 3 zurückgerollt werden ohne Stage 4 anzufassen.

---

## Was bewusst NICHT angefasst wird

- `_shared/plate-face-identity.ts`, `plate-face-detect.ts`, `twoshot-face-map.ts` — funktionieren.
- Audio-Mux-Lambda (`render-sync-segments-audio-mux`) — separate Function, nicht im Scope.
- v138 NOOP Hard-Fail Logik — bleibt aktiv, ist korrekt.
- Sync.so Modell `sync-3` + `cut_off` + `auto_detect` — funktioniert laut Pass-1-Log.
- Frontend / UI / Wallet — komplett unangetastet.
