# Artlist-Grade Lip-Sync: Upgrade auf `lipsync-2-pro`

## Problem

Aktuelles Ergebnis sieht aus wie ein „Animorph" — Lippen morphen, Gesicht verzieht sich leicht, Identität wackelt. Ursache: wir nutzen `sync/lipsync-2` (Standard-Modell, optimiert auf Speed/Kosten), während Artlist/MotionBox auf Sync.so's Premium-Modell **`lipsync-2-pro`** setzen — gleicher Anbieter, deutlich höhere Fidelity, Identitäts-Lock, weniger Mund-Morph.

## Was Artlist anders macht (verifiziert über Sync.so API)

| Lever | Heute (lipsync-2) | Artlist-Setup (lipsync-2-pro) |
|---|---|---|
| Replicate-Modell | `sync/lipsync-2` | `sync/lipsync-2-pro` |
| Identitäts-Lock | weich | hart — kein Face-Morph |
| Mund-Region | gesamtes Gesicht beeinflusst | nur Lippen + Kiefer |
| `sync_mode` | `cut_off` / `loop` (richtig) | gleich |
| `temperature` | nicht gesetzt | `0.5` (deterministischer = weniger Wabbeln) |
| `active_speaker` | nicht gesetzt | `true` (nur sprechende Person animieren) |
| Audio-Preprocessing | Roh-TTS direkt | Mono, 24kHz, leichte Noise-Gate |
| Source-Video | direkt aus Replicate-URL | rehosted in eigenem Bucket (CDN-stabil) — haben wir bereits ✅ |
| Credit-Cost | 8 | 14 (lipsync-2-pro ist ~2× teurer auf Replicate) |

## Plan

### 1. `supabase/functions/compose-lipsync-scene/index.ts`
- Modell-Schalter: `sync/lipsync-2-pro` als Default
- Parameter ergänzen: `temperature: 0.5`, `active_speaker: true`, `output_format: 'mp4'`
- `COST` von 8 → 14 erhöhen (matched echten Replicate-Preis, Refund-Pfad bleibt idempotent)
- Optional-Flag `quality: 'pro' | 'standard'` im Request-Body — Default `pro`, Fallback auf `standard` möglich
- Audio-Sanity: wenn `vo.duration < 0.4s` → 422 mit klarer Meldung (lipsync-2-pro braucht min. Sprachsignal)

### 2. `supabase/functions/compose-twoshot-lipsync/index.ts`
- Gleiche Modell-Umstellung für den Shot-Reverse-Shot-Pfad (zwei Cuts à `lipsync-2-pro`)
- COST pro Cut entsprechend anheben

### 3. `supabase/functions/lip-sync-video/index.ts`
- Talking-Head-Standalone-Pfad ebenfalls auf `lipsync-2-pro` (Konsistenz quer durch die App)

### 4. UI-Hinweis in `SceneCard.tsx`
- Beim „Cinematic-Sync / Lipsync"-Button: Badge `PRO` und neue Credit-Kosten im Tooltip
- Bestehende „VO FEHLT"-Logik bleibt unverändert

### 5. Memory-Update
- Neuer Eintrag: `mem://architecture/lipsync/sync-so-pro-model-policy` — dokumentiert, dass alle Lipsync-Pfade `lipsync-2-pro` nutzen, mit den Standard-Parametern.

## Out of Scope (bewusst)

- **Eigenes Sync-Modell trainieren** — nicht nötig, lipsync-2-pro ist genau das, was Artlist nutzt.
- **Wechsel auf anderen Anbieter** (Hedra/HeyGen Express): andere Trade-offs (Voll-Avatar statt Mund-Patch) — wir wollen Artlist-Parität, nicht Avatar-Ersatz.
- **Frontend-Toggle Standard/Pro**: bleibt für später, Default-Upgrade reicht.
- **Audio-Mastering-Pipeline** (Loudness-Normalisierung, De-Esser): falls Pro-Modell trotzdem zu wabbelig, als Stage 2.

## Verifikation

- Eine bestehende Szene mit Lipsync neu rendern, Vorher/Nachher-Frame vergleichen (sollte Identität locken, keine Wangen-Morphs)
- Credit-Refund testen mit absichtlich fehlerhaftem Audio
- Multi-Speaker bleibt korrekt 409 (kein Verhaltenswechsel)

## Risiken

- **Replicate-Preis**: lipsync-2-pro kostet pro Sekunde mehr — daher COST 8→14. Wallet-Check ist bereits vorhanden.
- **Längere Render-Zeit**: ~1.5× lipsync-2. Background-Trigger in `compose-clip-webhook` läuft via `EdgeRuntime.waitUntil`, also kein UI-Blocker.
- **Rollback einfach**: ein-Zeilen-Revert auf `sync/lipsync-2` falls Pro-Modell bei einem Edge-Case bricht.

Soll ich umsetzen?
