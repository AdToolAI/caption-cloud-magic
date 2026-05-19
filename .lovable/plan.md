
## Hintergrund: Sync.so Creator Pricing

Auf dem **Creator $19/mo** Plan kostet `sync/lipsync-2-pro`:
- **~$0.08 / Sekunde** (entspricht $0.40 für 5s @ 24fps, $0.80 für 10s, $1.20 für 15s)
- ≈ **€0.074 / Sekunde** echte Kosten an Sync.so

Unser aktueller Flatrate-Preis (14 / 28 Credits) deckt das nur für ≤2s-Clips und macht bei 5-15s-Szenen **Verlust**.

(Reminder: 1 Credit = €0.01 — bestätigt durch `featureCosts.ts: composer_clip_ai: 30 // €0.30`.)

## Ziel: Duration-basiertes Pricing, max. 10-20% Marge

Neue Formel: **9 Credits pro Sekunde Lipsync-Output**
- €0.09/s an User → €0.074/s an Sync.so = **~22% Bruttomarge** (deckt Edge-Function-Overhead + leichte Schwankung)
- Alternativ **8 Credits/s** = €0.08/s = **~8% Marge** (Break-even-nah, sicherer Polster)

Empfehlung: **9 Credits/s** als sauberer Mittelweg. Aufrunden auf ganze Sekunden (`Math.ceil`).

## Beispiel-Kosten (User-Sicht)

| Szene-Dauer | Single Lipsync | Two-Shot (2 Passes) |
|---|---|---|
| 3s | 27 Credits (€0.27) | 54 Credits (€0.54) |
| 5s | 45 Credits (€0.45) | 90 Credits (€0.90) |
| 8s | 72 Credits (€0.72) | 144 Credits (€1.44) |
| 10s | 90 Credits (€0.90) | 180 Credits (€1.80) |
| 15s | 135 Credits (€1.35) | 270 Credits (€2.70) |

Single bisher: 14 → ~3-10× höher. Two-shot bisher: 28 → ~2-10× höher. Reflektiert die echten Provider-Kosten.

## Änderungen

### 1. `supabase/functions/compose-lipsync-scene/index.ts`
- Konstante `COST = 14` ersetzen durch Funktion `computeCost(durationSec)` → `Math.max(9, Math.ceil(durationSec) * 9)` (Min-Floor 9 Credits für Edge-Cases)
- VO-Dauer ist in der Scene bereits bekannt (oder via `ffprobe`/audio-meta) — bestehende Logik nutzen, sonst `scene.vo_duration_seconds` lesen
- Alle 4 Stellen wo `COST` referenziert wird (Reserve, Insufficient-Check, Refund x2) auf berechneten Wert umstellen
- Response `credits_used` = berechneter Wert

### 2. `supabase/functions/compose-twoshot-lipsync/index.ts`
- Konstante `COST = 28` ersetzen durch `computeCost(durationSec) = Math.max(18, Math.ceil(durationSec) * 9 * 2)`
- Gleiche Stellen anpassen (Reserve, Check, Refunds, `credits_reserved` in Response)
- Two-Shot rendert 2 Passes → daher × 2

### 3. `supabase/functions/lip-sync-video/index.ts`
- `COST = 14` → gleiche `computeCost(durationSec)` Logik
- Duration aus Input-Audio ableiten (existiert bereits oder via head-fetch + duration extract)

### 4. UI: Preis-Anzeige aktualisieren
- `src/components/composer/lipsync/*` oder wo Lipsync-Buttons sitzen → Tooltip / Confirm-Modal zeigt dynamisch berechnete Credits statt hardcoded "14"
- Suche nach `14` / `28` als hardcoded Kostenanzeige und ersetzen durch `Math.ceil(duration * 9)`

### 5. Optional: 429-Quota-Hinweis verfeinern
- Bei `429`-Response von Sync.so im `compose-twoshot-lipsync` einen klareren Toast: "Sync.so Creator-Kontingent erreicht — bitte Top-up im Sync.so Dashboard oder warte 60s."
- Bereits in vorheriger Iteration angekündigt, kann mit reingebaut werden.

## Memory-Update

`mem://architecture/lipsync/sync-so-pro-model-policy` aktualisieren:
- Alte Zeile: `COST 14 (single) / 28 (two-shot)`
- Neu: `COST = ceil(duration_sec) × 9 credits per pass (Single = 1 pass, Two-shot = 2 passes); reflects Sync.so Creator pricing $0.08/s with ~22% margin`

## Was nicht geändert wird

- Model bleibt `sync/lipsync-2-pro` mit `temperature:0.5`, `active_speaker:true`
- Refund-Logik bleibt idempotent
- MIN_VO_DURATION 0.4s bleibt
- Keine Plan-Gating-Änderungen (Free-User können weiterhin nutzen, Wallet-Balance entscheidet)

## Verifikation nach Build

1. `compose-lipsync-scene` mit 5s VO → erwartet 45 Credits Abzug
2. `compose-twoshot-lipsync` mit 8s VO → erwartet 144 Credits Abzug
3. Insufficient-credits-Check triggert korrekt bei niedrigem Balance
4. UI-Tooltip zeigt vor Klick die korrekte Credit-Schätzung
