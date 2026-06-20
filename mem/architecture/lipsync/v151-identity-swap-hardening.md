---
name: v151 Plate-Identity Swap Hardening
description: Pflicht-Cross-Check für N≥4, schärfere Ambiguity-Schwellen (0.70/0.25), Legacy-Multi-Call Tie-Breaker bei reject — verhindert vertauschte Speaker→Face Mappings im bbox-url-pro Pfad
type: feature
---

**Problem (v150 → v151):** bbox-url-pro funktioniert; aber bei N=4 Speakern (Sarah/Mann/Frau/Matthew) hat Hungarian-Assignment Speaker 1 ↔ Speaker 4 vertauscht. v133 cross-check sprang nicht an, weil minConf≈0.70 und minMargin≈0.20 oberhalb des Gates (0.55/0.15) lagen.

**Fix in `supabase/functions/_shared/plate-face-identity.ts`:**
1. **Forced cross-check für N≥4**: `forceCrossCheck = N >= 4` ⇒ `isAmbiguous` ist immer true.
2. **Schwellen verschärft**: `minConf < 0.70 || minMargin < 0.25` (vorher 0.55/0.15).
3. **Legacy-Tie-Breaker**: bei `crossCheck === "rejected"` + N≥3 wird `askGeminiForPlateIdentity` als zweite Meinung gerufen. Wenn Legacy >=2 Slots anders zuordnet, wird Legacy übernommen (`identityMethod = "legacy-multi-tiebreak"`, `crossCheck = "tiebreak-legacy"`).

**Was bleibt:** bbox-url-pro PRIMARY (v147), v148 NOOP-Bypass, v150 Voiced-Ratio-Gate, v149 Master-Watchdog, ASD-Logik, Refunds.

**Kosten:** +1 Gemini-Vision Call pro N≥4-Szene (~$0.002), +1 weiterer bei reject.

**Recovery:** Bei bereits gerenderten swap-Szenen ist "Sauber neu starten" nötig — der Plate-Identity-Pfad cached nicht, läuft also beim nächsten Lauf automatisch mit v151-Logik.
