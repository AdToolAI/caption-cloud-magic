---
name: Lip-Sync Unified Multi-Pass Pipeline (v24)
description: compose-dialog-scene ist jetzt ein dünner Forwarder auf compose-dialog-segments. Per-Turn-Pipeline ausgemustert. 1-4 Sprecher laufen alle über den nachweislich stabilen Multi-Pass-Pfad (1 Master + N Sync.so-Passes mit options.segments[]). Watchdog erkennt jetzt auch syncso_dispatch_log-Jobs.
type: architecture
---

**Trigger (Juni 2026)**: Per-Turn-Pfad in `compose-dialog-scene` failte
strukturell für 3-4 Sprecher — Sync.so `lipsync-2-pro` lehnte JEDEN
Per-Turn-Preclip mit `"An unknown error occurred."` ab (Coord-/Frame-/
Temperature-Retries chancenlos). Der 1-2-Sprecher-Pfad
`compose-dialog-segments` (Multi-Pass per-speaker auf einem Master) lief
dagegen seit Wochen stabil.

**v24 Architektur**:

- **`compose-dialog-scene/index.ts`** ist auf ~95 Zeilen geschrumpft.
  Es nimmt nur noch `{scene_id}` entgegen und forwarded den Original-Body
  via `fetch(${SUPABASE_URL}/functions/v1/compose-dialog-segments)` mit
  Service-Role-Auth. QA-Mock-Header (`x-qa-mock`) wird durchgereicht. Status
  und Response-Body kommen 1:1 zurück. Keine Per-Turn-Helper, keine
  Face-Map-Rebuild, kein HappyHorse-Guard mehr (segments hat den eigenen).
- **`compose-dialog-segments`** bleibt unverändert. Es macht bereits:
  Cast-Validation (max 4 distinct), HappyHorse→Hailuo Master-Guard,
  Dedup-Claim (`twoshot_stage='composing_dialog'`), Multi-Pass-Chain
  (Pass-N-Input = Pass-N-1-Output), Refund via `failLipSync`, Webhook-
  Re-Arm via `{advance:true}`.
- **`lipsync-watchdog`** Fix: `hasRecordedProviderJob` checkt zusätzlich
  `syncso_dispatch_log` (created_at innerhalb 5min von updated_at). Damit
  klassifiziert er noch laufende Per-Turn-Legacy-Jobs korrekt als
  `watchdog_provider_timeout` (10 min TTL) statt `watchdog_preflight_aborted`
  (4 min) — relevant für historisch hängende v5+shots[]-Szenen während der
  Übergangszeit.

**Aufrufer-Kompatibilität**: Alle 3 Caller (`useTwoShotAutoTrigger`,
`sync-so-webhook` v5 re-arm, `poll-dialog-shots` advance) rufen weiterhin
`compose-dialog-scene` und merken nichts vom Forward.

**Pricing**: unverändert (`ceil(durSec) × 9 × N_passes`, N_passes = distinct
speakers, max 4). Siehe `mem://architecture/lipsync/sync-so-pro-model-policy`.

**Stuck-Scene-Cleanup**: `85ecc55a-5c58-4a5b-9ff2-6aca547cd111` wurde via
`reset-lipsync-scene` (oder direktes UPDATE wenn nötig) auf clean `pending`
zurückgesetzt; Inflight-Slots geleert; Credits via `failLipSync`-Pfad
refunded.

**Was bewusst NICHT geändert wurde**:
- compose-dialog-segments Internals (es funktioniert).
- sync-so-webhook v5-segments-Branch (passt zu Multi-Pass).
- `_shared/cast-validation.ts` (MAX_SPEAKERS=4 bereits korrekt).
- v23 Server-Owned State Machine (Client darf nicht resetten, nur Reset-
  Endpoint kann `failed→pending` flippen).

**Resultat**: Sync.so bekommt nur noch die Payload-Form, die nachweislich
durchläuft. Ein Code-Pfad für 1-4 Sprecher. Per-Turn-Architektur ist tot.
