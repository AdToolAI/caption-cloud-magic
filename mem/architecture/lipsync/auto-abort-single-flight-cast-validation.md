---
name: Lip-Sync Auto-Abort, Single-Flight & Cast-Validierung
description: Ein Lip-Sync-Lauf pro Szene; bis zu 4 distinct Sprecher, kein Charakter doppelt; Fehler werden zentral via failLipSync abgebrochen + refundiert; poll-dialog-shots akzeptiert jetzt v5+shots[]; Auto-Retry nur noch bei transienten Klassen.
type: architecture
---

**Ziel**: Lip-Sync hängt nie mehr im Loader-Loop. Pro Szene immer nur EIN aktiver Auftrag. 1–4 verschiedene Sprecher, derselbe Charakter nie doppelt.

**Änderungen (Juni 2026)**:

- `supabase/functions/_shared/cast-validation.ts` (NEU): `validateCast()` lehnt >4 Sprecher, doppelte `character_id`, und zeitliche Überlappung desselben Charakters mit klaren Reason-Codes ab (`cast_invalid_too_many_speakers` / `cast_invalid_duplicate_character` / `cast_invalid_overlapping_turns`).
- `supabase/functions/_shared/lipsync-fail.ts` (NEU): zentrale `failLipSync({sceneId,userId,reason,refundCredits,syncApiKey,extraSyncJobIds})`. Idempotent: liest `dialog_shots.cost_credits`, refundet einmal, leert `syncso_inflight_jobs` der Szene, `DELETE`et Sync.so-Jobs best-effort, setzt `dialog_shots.status='failed'` + `lip_sync_status='failed'` + `twoshot_stage='failed'` + `clip_error`.
- `compose-dialog-scene` & `compose-dialog-segments`: rufen `validateCast(speakers)` VOR jedem Wallet-Debit. Bei Verstoss → `failLipSync` + 422 mit Reason+offenders. Kein Sync.so-Call.
- `poll-dialog-shots`:
  - **Root-Cause-Fix**: akzeptiert jetzt `state.version === 5` wenn `Array.isArray(state.shots)` (vorher `legacy_v5_ignored` → 3-Sprecher-Szenen lagen tot in der DB).
  - Step 5 terminal-fail nutzt jetzt `failLipSync` (Refund + Inflight-Cleanup + Sync.so DELETE) statt nur `refundIfNeeded` + lokales Update.
- `src/hooks/useTwoShotAutoTrigger.ts`:
  - Poll-Dialog-Kicker akzeptiert v5+shots[] zusätzlich zu v4.
  - Auto-Retry stark eingegrenzt: nur `syncso_circuit_open|syncso_concurrency|http_429|audio_mux_dispatch` werden auto-resettet. Alles andere (inkl. `cast_invalid_*`, `dialog_shots_failed`, `syncso_segments_FAILED`, `multi_speaker_*`, `dialog_missing_face_coords`, `raw_talking_head_source_blocked`) bleibt terminal und wartet auf User-Klick „Lip-Sync neu rendern".

**Webhook-Guard**: `compose-clip-webhook` blockt Auto-Lipsync bereits über `alreadyFailed` / `wasCanceled` (unverändert) — kein zweiter Lauf nach `failed`.

**Stuck-Scene-Cleanup**: Szene `07a2a25f-e0e5-4c0b-83b0-f6e4fb02526d` wurde via SQL refundet, Inflight-Slots geleert und auf `pending`/`master_clip` zurückgesetzt.

**Was bewusst NICHT geändert wurde**:
- 1-/2-Sprecher v5-Segments-Flow (compose-dialog-segments + sync-so-webhook) — funktioniert stabil, nur neue Validierung davor.
- Bestehende Refund-Pfade in poll-dialog-shots (multi-speaker-degrade), nutzen aber jetzt durchgängig failLipSync für den Final-Fail.
- UI-seitige Cast-Block-Anzeige im SceneDialogStudio (Server lehnt jetzt hart ab; UI-Hinweis kann später nachgezogen werden).
