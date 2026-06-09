# Masterplan — Absolute AI Video Mode

## 0. Ausgangslage (faktisch, belegt)

**Sync.so-Status (offiziell, Juni 2026):**
- `sync-3` ist **offizieller Default für alle User**, 4K nativ, full-shot global, Profile/Occlusion/Still-Frame nativ, volle Cadence/Emotion-Preservation.
- `lipsync-2-pro` & `lipsync-2` aktiv, aber legacy-Architektur (2-Sek-Chunks, 512×512, Still-Frame bricht).
- `react-1`: 6 Emotionen, ≤15 s, kein ASD — Spezialfall.
- **Kein** automatischer Webhook-Retry → Polling-Fallback Pflicht.
- ASD: 3 Modi — `auto_detect`, Point, `bounding_boxes_url` (für lange Videos / multi-speaker präzise).
- Pricing in **USD/s**, nicht Credits. sync-3: $0.107–0.133/s, lipsync-2-pro: $0.067–0.083/s.

**Artlist-Realität:** Kein eigener Lipsync — sie hängen HeyGen rein. Ihr Filmic-Edge liegt vor dem Lipsync (Artlist Original 1.0 Image, Studio Multi-Shot, Kling 3.0 Motion Control). **Unser sync-3 schlägt Artlist beim Lipsync** (4K vs. 1080p, native Profile, native Occlusion). Wir haben Gap **vor dem Lipsync**: Multi-Shot-Continuity, Camera Control, Reference Motion Transfer.

**Pipeline-Status (Audit-Ergebnis):**
- ✅ `sync-3` ist bereits seit v62 universaler Primary (frühere Annahme falsch).
- 🗑️ Großer Dead-Code-Block (v41/v56 single-call, ~470 Zeilen in compose-dialog-segments).
- 🗑️ `compose-dialog-scene` ist 100% leerer Forwarder.
- 🗑️ v4-Reste in `sync-so-webhook` (`dispatchModeForShot`, `prepareRetryFromWebhook`, 13-fach OR-Branch).
- 🗑️ Watchdog prüft 3 legacy audio_plan-Schemas.
- 🔁 5 echte Duplikationen: `CLIP_COSTS`, `countDialogSpeakers`, 2× Gemini-Face-Prompts, 3× Inline-Refund-Logik in webhook.
- ⚠️ RETRY_VARIANTS-Drift: `coords-pro-lp2pro` nur in webhook, nicht in dispatcher → silent fallback auf `coords-pro`.
- ⚠️ Strict-Face-Gate (v77) blockt hart, auch wenn `plateIdentityMap` leer ist → aktueller User-Bug.

---

## Phase 1 — Cleanup & Doc-Alignment (3–4 Tage, niedriges Risiko)

Ziel: Pipeline auf einen Branch ohne Legacy bringen, exakt 1:1 mit Sync.so-Doku.

### 1.1 Dead Code entfernen
- Migration: alle `dialog_shots.version IN (41..56)` Scenes zurücksetzen oder als terminal markieren.
- `compose-dialog-segments`: kompletten `useV41Official`-Block (`:942-1444`) löschen inkl. `v41PrevState`, `force_v56`, `LIPSYNC_FALLBACK_MODEL`.
- `sync-so-webhook`: v41-v56 Mega-Branch + `dispatchModeForShot` + `prepareRetryFromWebhook` + `MAX_SHOT_RETRIES` + `RETRY_TEMPERATURES` löschen.
- `compose-dialog-scene/index.ts`: löschen, Caller (`compose-clip-webhook:356`) direkt auf `compose-dialog-segments` umschreiben.
- `lipsync-watchdog`: legacy audio_plan-Felder (`replicate_prediction_id startsWith "sync:"`, `plan.twoshot.syncJobs.jobs`, `plan.twoshot.heartbeat.syncJobId`) entfernen.
- `withDialogLock` Import in compose-dialog-segments entfernen.

### 1.2 Duplikate konsolidieren
- Neu: `_shared/clip-costs.ts` (CLIP_COSTS-Tabelle).
- Neu: `_shared/speaker-count.ts` (`countDialogSpeakers`).
- Neu: `_shared/gemini-faces.ts` (`detectFaces`, `matchIdentities`) — ersetzt 2× duplizierte Prompts in `twoshot-face-map.ts` und `plate-face-*`.
- `sync-so-webhook`: alle 3 Inline-Refunds durch `failLipSync` ersetzen.
- `RETRY_VARIANTS` als shared const aus `_shared/lipsync-retry-ladder.ts`.

### 1.3 v77 Hard-Gate-Regression fixen (User-Bug, höchste Prio)
- `compose-dialog-segments` Strict-Gate Bedingung: `speakers.length >= 3 && !!plateDims && havePlateIdentity` (nicht nur `>=3 && plateDims`).
- Fallback: ohne plateIdentity → soft-pass + face-repair (alter v76-Pfad).
- `plate-face-detect.ts`: 2nd-try via `validate-frame-face` (ffmpeg) wenn direkter MP4-Frame-Extract scheitert (Hailuo ohne moov-atom).
- Migration: Scene `c5d4db3e-37a9-422a-9261-6ffbe5bc3241` reset + 324 Credits refund (idempotent via `dialog_shots.refunded`).

### 1.4 Doc-Alignment Sync.so
- **`sync_mode` explizit setzen** statt Default `bounce` — für Dialog `cut_off` (deterministischer Cut bei Audio-Overrun).
- **Polling-Fallback** in `lipsync-watchdog` verifizieren (existiert, aber TTLs 4/10/20 min auf Sync.so-Plan-Limits ausrichten).
- **Webhook-Signaturprüfung** auf `Sync-Signature` (timestamp+v1) bestätigen, nicht nur `X-Signature-Primary`.
- Pricing-Doku in `mem/architecture/lipsync/sync-so-pro-model-policy.md` auf reale USD/s umstellen (nicht Credits/s).

---

## Phase 2 — Sync-3 Multi-Speaker Robustheit (4–6 Tage)

### 2.1 `bounding_boxes_url`-Pfad (statt Point-ASD bei ≥2 Sprechern)
- Pro Speaker: aus `plate-face-identity` per-Frame-Boxes interpolieren.
- JSON `{bounding_boxes: ([x1,y1,x2,y2]|null)[]}` mit **exakt frame-count Einträgen** in `composer-frames` Bucket schreiben.
- An Sync.so via `bounding_boxes_url` übergeben → deterministisches Targeting pro Sprecher-Pass.
- Point-ASD bleibt Fallback (Variant `coords-pro`), Box-URL ist neuer Primary (`bbox-url-pro`).
- Behebt strukturell „Lipsync hat keinen Avatar getroffen".

### 2.2 Plate-Prompt Sync.so-Konform
- Anchor + Plate-Prompts: Suffix „person speaking naturally with subtle mouth/jaw movement" (Sync.so FAQ — verhindert Still-Frame-Artefakte auch wenn wir auf sync-3 sind, future-proof falls Fallback auf lipsync-2-pro).
- Two-Shot-Framing: Frontal-Zwang lockern, Profile/OTS erlaubt (sync-3 kann's nativ).

### 2.3 Retry-Ladder vereinheitlichen
Neue klare Reihenfolge (sync-3 only, lipsync-2-pro nur als Notfall):
1. `bbox-url-pro` (sync-3, bounding_boxes_url)
2. `coords-pro-box` (sync-3, inline boxes)
3. `coords-pro` (sync-3, single point)
4. `auto-pro` (sync-3, auto_detect)
5. `coords-pro-lp2pro` (lipsync-2-pro, single point) — letzter Versuch
6. fail + refund

### 2.4 Color/HDR Pre-Flight
- Vor Sync-Dispatch: ffprobe → wenn HDR/BT.2020 → automatisch auf BT.709 SDR konvertieren (Sync.so normalisiert sonst und zerstört Grading).
- Max 4096×2160 enforcen, Audio-Stream auf #0 reduzieren.

---

## Phase 3 — Filmic Control Layer (Absolute AI Video Mode, 2–3 Wochen)

Hier schließen wir den Artlist-Gap **vor** dem Lipsync. Sync-3 liefert dann den Lipsync — und schlägt Artlist (4K, Profile, Occlusion).

### 3.1 Shot-Director (Director-DSL)
Erweiterung von `scene-director`:
- **Shot-Liste pro Scene** statt nur ein Master-Prompt: Shot 1 (Wide establishing) → Shot 2 (CU Speaker A) → Shot 3 (OTS Reaction B) → Shot 4 (2-Shot).
- Pro Shot strukturiert: `composition` (ECU/CU/MS/WS/XWS), `angle` (eye/low/high/OTS/dutch), `camera_move` (static/pan/dolly/arc/handheld), `lens` (35mm/50mm/85mm/anamorphic), `lighting` (natural/golden/noir/neon).
- Output: JSON-Schema `Shot[]` — wird vom Composer zu N Hailuo-Calls expandiert.

### 3.2 Multi-Shot Continuity Engine
- `continuity-guardian` (existiert bereits, ausbauen):
  - Pro Charakter persistenter „identity lock" über alle Shots (Portrait-Embeddings, deterministische seed).
  - Pro Location persistente world-refs.
  - Frame-to-Shot: letzter Frame Shot N → Anchor-Input Shot N+1 (kontinuierliche Augenlinie, Wardrobe, Beleuchtung).
  - Wir haben das teilweise (last-frame Chain in compose-clip-webhook) — formalisieren auf Shot-Director-Ebene.

### 3.3 Auto-Coverage für Dialog ≥3 Sprecher
- Statt 1× 4-Sprecher-Plate (= Lipsync-Albtraum):
  - Director splittet automatisch in: 1 establishing 2-/3-shot + N close-ups (1 pro Sprecher) + Reaction-Cuts.
  - Jeder CU = 1 Sprecher → Lipsync trivial (single-face, sync-3 auto_detect).
  - Audio bleibt eine Master-Spur, Cuts per Remotion-Edit nach Speaker-Onset (haben wir via `dialog_shots`).
- Eliminiert die strukturelle Hauptursache aller Multi-Face-Lipsync-Fails.

### 3.4 Reference-Motion (Artlist-Parität)
- Optional Per-Shot: User lädt Reference-Video → wir extrahieren Motion-Tokens (camera trajectory + body-rhythm) und injecten als Hailuo/Kling Conditioning.
- v1: Kling 3.0 Motion Control via Replicate als Engine-Option neben Hailuo.

### 3.5 Emotion-Layer
- Pro Dialog-Turn optional `emotion` Tag aus Director (happy/sad/angry/surprised/disgusted/neutral).
- Für Reaction-Shots ≤15s → `react-1` Modell mit Emotion-Prompt (besser als Lipsync für stille Reaction-Cuts).
- ElevenLabs v3 mit `[whispers]/[laughs]/[pause]/[sigh]` Director-Tags in Audio-Synth.

### 3.6 Brand/Style Lock
- Per-Projekt persistente Style-Tokens (LUT-Name, Aspect, Lens-Preset, Wardrobe-Lock).
- Auto-injected in jeden Shot-Prompt + Anchor-Cache-Key.
- Artlist hat das nicht offiziell — wir gewinnen.

---

## Phase 4 — UX: „Absolute Control"-Interface (1–2 Wochen)

- **Shot-Timeline** (statt nur Scene-Liste): pro Scene Drag&Drop Shots, jeder Shot mit Composition/Angle/Move/Lens-Dropdowns wie Artlist Studio.
- **Director-Modus Toggle**: „Auto" (LLM macht Coverage) vs. „Manual" (User klickt Shots zusammen).
- **Per-Speaker Face-Pin**: User kann auf einem Frame klicken, um ASD-Coordinate manuell zu setzen (override unserer Auto-Detection).
- **Live-Cost-Estimate**: real USD/s nach Sync.so-Pricing, nicht Credits-Phantasie.
- **Render-Profile**: „Draft" (Hailuo + sync-3 auto), „Cinematic" (Kling + sync-3 bbox-url + emotion), „Reaction" (react-1).

---

## Reihenfolge & Risiko

| Phase | Dauer | Risiko | Liefert |
|-------|-------|--------|---------|
| 1 | 3–4 d | niedrig | Saubere Codebasis + akuter Bug weg |
| 2 | 4–6 d | mittel | Multi-Speaker Lipsync trifft jeden Avatar |
| 3 | 2–3 w | hoch | Echte filmische Kontrolle, Artlist-Parität+ |
| 4 | 1–2 w | mittel | Interface, das die Kontrolle nutzbar macht |

**Nicht gemacht:** Eigene Lipsync-Engine, eigenes Video-Model, manueller Frame-Editor pro Shot, Hailuo-Wechsel (bleibt Default-Engine).

**Was wir nach Phase 3 haben:** sync-3 (4K, Profile, Occlusion native) übertrifft Artlist+HeyGen beim Lipsync. Shot-Director + Continuity + Auto-Coverage schließt den Gap beim Pre-Lipsync. Plus Brand-Lock & Cost-Transparenz, die beide bei Artlist fehlen.

---

## Sofortiger nächster Schritt (zur Freigabe)

**Phase 1 starten** — Cleanup + v77-Gate-Fix + Doc-Alignment. Das löst den aktuellen „Lipsync trifft keinen Avatar"-Bug, entfernt ~600 Zeilen Dead Code, refundet die 324 Credits, und macht alle weiteren Phasen sauber baubar.

Soll ich mit Phase 1 anfangen?
