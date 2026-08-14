# v430 Final-Acceptance-Audit — Bericht + nächste Schritte

Reiner Audit, keine Codeänderungen. Ergebnis: **1 echter Regressions-Bug gefunden** (Output-Invariante bei abgeschlossenem Lip-Sync). Alles andere PASS.

## 1. Ergebnis pro Vertrag

| Vertrag | Ergebnis | Belegt durch |
|---|---|---|
| Client-Reader-Scanner (5E) — keine neuen Legacy-Reads | PASS | `clientReaderContract5E.test.ts` grün (5 Tests) |
| Writer-Inventar (5A) — nur eingefrorene Lip-Sync-Writer legacy-only | PASS | `legacyWriterAllowlist.test.ts` grün, Liste unverändert |
| `pipeline_state` vs. Legacy-Spiegel in der Live-DB | PASS | 4.246 Szenen (45 Tage): 0 `state_conflicts`, 0 `pipeline_state IS NULL`, 0 Substate-Abweichungen |
| Output-Invariante `clip_url = processed ?? base` | **FAIL** | 236 Szenen verletzen sie; Details unten |
| Continuity-Invarianten | PASS | 0 Zeilen mit `continuity_stale = true`, 0 Zeilen mit Output ohne `first_rendered_at` |
| Provider-Matrix Client/Server-Parität | PASS | `providerMatrix.test.ts` grün, Diff nur Kommentare |
| `visual_source = NULL` → Legacy-Parität | PASS | alle 4.246 Zeilen sind `NULL`, Paritätstest grün |
| Gesamte Composer-Suite | PASS | 409/409 Tests, `tsgo` sauber |
| Vollständiger E2E-Smoke (10 Pfade) | OFFEN | siehe Abschnitt 4 — erst nach dem Fix sinnvoll |

Hinweis: Die Dateien unter `supabase/functions/_shared/*.test.ts` sind Deno-Tests und laufen bewusst nicht in Vitest (https-Imports). Kein Regressionsbefund.

## 2. Der gefundene Bug (Blocker für die v430-Abnahme)

**Symptom:** Bei fertigen Lip-Sync-Szenen liefert `resolveSceneOutput()` die **Basis-Platte statt des fertig gemischten Clips**. Betroffen sind 228 Szenen mit abgeschlossenem Lip-Sync (plus 8 weitere Randfälle).

**Ursache:** Schritt 1 hat als Marker für „fertig gemischt" den Wert `lip_sync_status = 'applied'` angenommen. Die eingefrorene Lip-Sync-Kette schreibt in der Praxis aber `'done'`.

- Backfill-Migration setzte `base_video_url = lip_sync_source_clip_url` (Platte) für alle Zeilen,
- `processed_video_url` blieb dabei leer, weil die Bedingung auf `'applied'` prüfte,
- in der gesamten Live-DB ist `processed_video_url` bei **keiner einzigen** Zeile gesetzt,
- Resolver-Reihenfolge `processed → base → clip_url` liefert deshalb die Platte.

Vor v430 lasen UI und Export direkt `clip_url` (den gemischten Clip) — die Umstellung auf den Resolver hat das Verhalten also sichtbar verändert.

**Geplante Korrektur (v430.0 Hotfix, minimal):**
1. `resolveSceneOutput.ts` + Backend-Spiegel: `'done'` als gleichwertig zu `'applied'` behandeln (ein Wertepaar, keine neue Semantik).
2. Einmalige Daten-Migration: `processed_video_url = clip_url` für Zeilen mit abgeschlossenem Lip-Sync, deren `clip_url` von `base_video_url` abweicht. Fehlgeschlagene/abgebrochene Zeilen bleiben unangetastet.
3. Regressionstest: fertige Lip-Sync-Zeile im `'done'`-Format → `effectiveUrl` ist der gemischte Clip, `isLipsynced = true`.
4. Erneuter DB-Invariantencheck: 0 Verletzungen.

Keine Änderung an Lip-Sync-Writern, State Machine, Continuity oder UI-Gates.

## 3. Danach: v430.1 — Lip-Sync-Intent-Gates (Mini-Step)

Inventar in `SceneCard.tsx`: rund 30 Stellen lesen `dialogMode` bzw. `engineOverride` direkt; der kanonische Vertrag ist `isLipSyncIntentional()` (Veto über `lipSyncWithVoiceover`, dann `dialogMode`, dann Opt-in-Engines).

Vorgehen strikt zweistufig:
1. **Paritätstest zuerst:** heutige Sichtbarkeitsmenge der Toolbar/Aktionen über eine Fixture-Matrix (alle Kombinationen aus `lipSyncWithVoiceover` × `dialogMode` × `engineOverride`) einfrieren.
2. Ersetzen **nur dort**, wo der Test dieselbe sichtbare Menge beweist. Jede Abweichung wird dokumentiert und **nicht** umgestellt — keine stillen UX-Änderungen.

## 4. E2E-Smoke-Abnahme

Der Smoke über alle zehn Pfade (normale AI-Szene, Upload/Stock, Lip-Sync 1 Sprecher, Multi-Speaker, Lip-Sync-Retry, kompletter Re-Render, Frame/Continuity über zwei Szenen, Continuity stale → aktualisieren → neu rendern, Cancel/Retry/Failed, Export/Assembly) verbraucht echte Renderzeit und Guthaben. Er wird nach dem Hotfix als eigener Durchlauf gefahren, mit Protokoll pro Pfad: erwarteter `pipeline_state`-Verlauf, `effectiveUrl`-Quelle, Continuity-Flags, Ledger-Buchung.

## 5. Ausgangsbasis für v431 — verbliebene Legacy-only Lip-Sync-Writer

| Pfad | Legacy-Schreibstellen |
|---|---|
| `compose-dialog-segments` | 55 |
| `sync-so-webhook` | 23 |
| `lipsync-watchdog` | 8 |
| `remotion-webhook` (Lip-Sync-Fan-in) | 7 |
| `render-sync-segments-audio-mux` | 6 |
| `compose-twoshot-audio` | 3 |
| `reset-lipsync-scene` | 3 |
| `cancel-dialog-lipsync` | 2 |
| `report-lipsync-motion-probe` | 2 |
| `_shared/lipsync-fail.ts` | 2 |

Summe: 10 Pfade, 111 Schreibstellen. v431 wird daraus in Phasen zerlegt (vollständiges Mapping Legacy-Write → Ziel-`pipeline_state`/`substate`, dann gruppenweise Migration, Webhook-/Race-Tests, Watchdog zuletzt, Reverse-Bridge global erst bei 0 Legacy-only Runtime-Writern). Der Migrationsvertrag dafür wird separat aufgestellt.

## 6. Nächster Schritt

Freigabe für den **v430.0-Hotfix** aus Abschnitt 2 (der einzige gefundene Regressions-Bug). Danach E2E-Smoke, dann v430.1, dann v431-Vertrag.
