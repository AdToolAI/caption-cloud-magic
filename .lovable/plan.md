## Kurzfassung

Die Pipeline ist von ~10 Min (v169) auf 11–13 Min (v187) gestiegen, weil zwei Konfig-Defaults sich seit v169 verschlechtert haben, plus eine kleine Kette an neuen Sicherheits-Gates die seriell laufen. Es gibt keinen einzelnen Bug — der Fix ist eine Kombination aus **3 Config-Schaltern + 1 Parallelisierung + Dead-Code-Aufräumen**.

## Regressions-Budget (4 Sprecher)

| Stage | v169 | v187 | Delta |
|---|---|---|---|
| Preflight + Visibility-Gate | ~20s | ~30–50s | +10–30s |
| Sync.so Fan-Out (Wall-Clock) | ~3 Min (alle 4 parallel) | ~5–6 Min (2 Wellen à 2) | **+2–3 Min** |
| Advance-Lock-Kollisionen | ~0 | 0–120s | **+0–2 Min** |
| Audio-Mux DB-Reads (v183/v190) | 3 RTs | 5 RTs | +100–500ms |
| Remotion-Stitch Lambda | 3–4 Min | 3–4 Min | ~0 |
| **Gesamt** | **~10 Min** | **11–13 Min** | **+1–3 Min** |

Haupttreiber: **`concurrencyCap=2`** und **`FEATURE_PER_PASS_LOCK=false`**.

## Fix-Plan

### Schritt 1 — Quick Wins (Config, sofort wirksam)

1. **`composer.sync_so_concurrency_cap = 4`** in `system_config` schreiben (Migration).
   - `compose-dialog-segments` fanned dann alle 4 Sprecher gleichzeitig zu Sync.so aus, statt sie in 2 seriellen Wellen abzuarbeiten. Größter Einzelgewinn: −2 bis −3 Min.

2. **`FEATURE_PER_PASS_LOCK = true`** in den Edge-Function-Env-Vars.
   - Jeder Sync.so-Pass hält seinen eigenen Advance-Lock. Wenn zwei Passes fast zeitgleich fertig werden, kollidieren die Webhooks nicht mehr, keine 2-Min-Watchdog-Wartezeit. −0 bis −2 Min.

3. **`FEATURE_PRECLIP_PREFANOUT = true`** in den Edge-Function-Env-Vars.
   - Reine Retry-Absicherung, kein Impact auf den Happy Path, aber −90s auf Fallback-Pfaden.

### Schritt 2 — Code-Änderungen (kleiner Turn)

4. **Turn-Visibility-Gate parallelisieren** in `compose-dialog-segments/index.ts` (Zeilen 2521–2614): die serielle `for`-Schleife über die Sprecher durch `Promise.all(speakers.map(...))` ersetzen. −0 bis −20s Preflight bei Cold-Cache.

5. **Default `concurrencyCap` von 2 auf 4 hardcoden** (Zeile 6442). Absicherung, damit ein fehlender DB-Row nie wieder zurück auf seriell fällt. DB-Row bleibt Kill-Switch nach unten.

6. **Audio-Mux `system_config`-Read entfernen** (`render-sync-segments-audio-mux/index.ts:248–258`). Flag ist seit v190 default ON — `silentFacesV183Enabled = true` fest verdrahten. −1 DB-RT pro Mux.

### Schritt 3 — Cleanup (kein Perf-Effekt, aber Hygiene)

7. `SilentFaceFreeze`-Komponente in `DialogStitchVideo.tsx` (Zeilen 315–365) löschen — seit v190 tot.
8. Per-Shot `silentSlots` aus `ShotSchema` (Zeilen 81–91) entfernen — seit v190 tot.
9. `v164SilentSlotsByExcludedIdx` (`render-sync-segments-audio-mux/index.ts:323–324`) löschen — dead code mit `void`-Marker.
10. `COMPOSE_DIALOG_SEGMENTS_VERSION` auf `"v192"` bumpen (Log-Grep-Hygiene).

## Erwartetes Ergebnis

Nach Schritt 1–2 sollte eine 4-Sprecher-Szene wieder in **~9–10 Min** durchlaufen (Ziel v169-Niveau, ggf. leicht darunter, weil v153.2 bbox-url-pro Preclip-Round-Trips im Happy Path spart, die v169 noch hatte).

## Nicht Teil dieses Plans

- Der v190 Ghost-Avatar-Rollback (`composer.silent_faces_v183 = false`) bleibt eigenständig; er ist parallel gültig und Config-Schalter #1 (`sync_so_concurrency_cap`) schließt ihn nicht aus.
- Ein späterer Plan v190.1 (Plate-Freeze-Crop als Anchor statt `portrait_url`) wird separat aufgesetzt.

## Technische Details

- **Migrationen:**
  - `INSERT INTO public.system_config (key, value) VALUES ('composer.sync_so_concurrency_cap', '4'::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();`
  - (Ghost-Avatar-Rollback-Row `composer.silent_faces_v183 = false` bleibt wie im Vor-Plan.)
- **Env-Vars** (Edge Function Secrets) für `compose-dialog-segments`:
  - `FEATURE_PER_PASS_LOCK=true`
  - `FEATURE_PRECLIP_PREFANOUT=true`
- **Code-Edits:**
  - `supabase/functions/compose-dialog-segments/index.ts`
    - Zeile 6442: `let concurrencyCap = 4;`
    - Zeilen 2521–2614: `for … await validateFrameFace` → `Promise.all(speakers.map(async …))` mit demselben Cache-Verhalten
  - `supabase/functions/render-sync-segments-audio-mux/index.ts`
    - Zeilen 248–258: `system_config`-Read entfernen, `const silentFacesV183Enabled = true;`
    - Zeilen 323–324: dead map löschen
  - `src/remotion/templates/DialogStitchVideo.tsx`
    - Zeilen 81–91: `silentSlots` aus `ShotSchema` streichen
    - Zeilen 315–365: `SilentFaceFreeze` löschen
  - `COMPOSE_DIALOG_SEGMENTS_VERSION = "v192"`
- **Kein Remotion-Bundle-Rebuild nötig**, solange `DialogStitchVideo`-Cleanup mit dem nächsten regulären Bundle-Deploy geht. Wenn `SilentFaceFreeze` gelöscht wird, muss neu deployt werden — bereits im Standard-Deploy-Flow enthalten.
- **Kein Risiko für laufende Renders:** alle Änderungen wirken erst beim nächsten `compose-dialog-segments`-Aufruf bzw. nächsten Mux-Dispatch.

## Rollback

Jede der drei Config-Änderungen ist eine 1-Zeilen-Umkehr (Migration überschreiben bzw. Env-Var zurücksetzen). Code-Edits sind isoliert; einzelne Reverts möglich ohne Wechselwirkung.