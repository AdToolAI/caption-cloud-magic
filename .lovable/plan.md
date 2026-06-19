## Problem

Bei der 4-Sprecher-Szene wurde Lip-Sync technisch sauber gerendert, aber **Charakter 1 und Charakter 4 wurden vertauscht** (beide mit der jeweils falschen Stimme). Charakter 2 und 3 stimmten. Das ist kein Sync.so-Bug, sondern ein **Identity-Mapping-Bug** in `_shared/plate-face-identity.ts`.

## Root Cause

`askGeminiForPlateIdentity()` schickt EINEN Multi-Image-Prompt an Gemini ("welcher Slot = welcher Charakter?"). Bei 4 ähnlichen Plate-Faces produziert Gemini regelmäßig partielle Verwechslungen — typischerweise an den Rändern (Slot 0 ↔ Slot N-1), weil die Reference-Portraits in einer Liste durchgereicht werden und Position-Bias entsteht.

Zusätzlich:
- **Slot-Order-Fallback (v117)** ordnet Faces nach `slot` L→R und Speakers nach Array-Position. Wenn `speakers[]` aber NICHT in Bildreihenfolge sortiert ist (z. B. nach Dialog-Reihenfolge), entsteht garantiert ein Swap.
- Es gibt **keine Verifikation** des Gemini-Outputs — niedrige Confidence (z. B. 0.5) wird genauso behandelt wie 0.95.
- Die Coords pro Speaker werden direkt aus `plateIdentityMap.faces[].center` übernommen — ein einziger Mismatch verteilt sich auf den gesamten Pass.

## Fix-Plan v133

### 1. Per-Character Identity-Probe (statt 1× Multi-Slot)

Neuer Helper `probeCharacterOnPlate()` in `_shared/plate-face-identity.ts`:
- Pro Charakter EIN separater Gemini-Call: "Im Plate-Frame siehst du N Boxen (1..N). Welche Box zeigt dieselbe Person wie das Portrait? Antworte `{slot, confidence}`."
- N Charaktere × 1 Call = N Calls parallel (Promise.all). Bei 4 Speakern: 4 parallele Calls statt 1 Combined-Call.
- Position-Bias entfällt, weil jeder Charakter isoliert mit allen Boxen verglichen wird.

### 2. Hungarian-Assignment statt Greedy

Aus den N×N Confidence-Werten eine Score-Matrix bauen und mit **Munkres / Hungarian-Algorithmus** die global-optimale 1:1-Zuordnung lösen.
- Verhindert dass 2 Charaktere demselben Slot zugewiesen werden.
- Verhindert dass ein lokal-bester Match einen anderen Charakter "blockiert" der diesen Slot eigentlich braucht.
- Kleine 4×4-Matrix → triviale Implementierung inline (~40 LOC).

### 3. Confidence-Gate + Cross-Check

- Wenn `min(assignedConfidence) < 0.55` oder `max - secondBest < 0.15` (ambiguous) bei ≥3 Speakern:
  - Zweite Gemini-Pass als **Cross-Check**: "Hier sind die finalen Zuordnungen Slot→CharacterId. Ist das korrekt? Antworte nur `confirmed` oder `swap:slotA<->slotB`."
  - Bei `swap:`-Antwort die zwei Slots tauschen und neu validieren.
  - Bei wiederholter Ambiguität → **Hard-Fail + Refund** mit klarer Meldung ("Charaktere auf dem Plate nicht eindeutig unterscheidbar — bitte Szene neu rendern mit deutlicheren Posen/Outfits").

### 4. Slot-Order-Fallback für ≥3 Speaker entfernen

Der v117-Fallback (`L→R Slot = L→R Speaker-Array-Order`) ist bei ≥3 Speakern eine ~17% Swap-Wahrscheinlichkeit. Stattdessen:
- Bei 1 Speaker: behalten (trivial).
- Bei 2 Speakern: behalten (50/50 ist schon falsch, aber mit Cross-Check abgefangen).
- Bei ≥3 Speakern: **entfernen** — wenn Per-Character-Probe fehlschlägt, kein Dispatch, sondern Refund + UI-Hinweis.

### 5. Forensik & Cache

- `plate_face_cache` um `identity_method` (`per-char-hungarian` | `slot-order` | `single`), `min_confidence`, `cross_check_result` erweitern.
- Beim "Sauber neu starten" Button: Cache-Eintrag für die Szene löschen damit ein neuer Probe-Lauf startet (statt verstauten Identity-Mismatch aus dem Cache zu ziehen).

### 6. UI

`SceneInlinePlayer` Forensics-Panel zeigt:
- Identity-Methode (`per-char-hungarian@conf=0.87`)
- Bei ambiguösem Match: gelbes Warning-Badge "Identity-Confidence niedrig — bei Voice-Swap bitte neu rendern".

## Technische Details

**Dateien:**
- `supabase/functions/_shared/plate-face-identity.ts` — neuer `probeCharacterOnPlate`, Hungarian-Solver, Cross-Check, refactor `resolvePlateFaceIdentities`
- `supabase/functions/compose-dialog-segments/index.ts` — Hard-Fail-Branch bei `identity_ambiguous` (Refund + Status-Update analog v132 Turn-Visibility-Gate)
- `supabase/functions/lipsync-reset-scene/index.ts` (oder Äquivalent) — `plate_face_cache` row mit-löschen
- `src/components/video-composer/SceneInlinePlayer.tsx` — Forensics-Anzeige für `identity_method` + Confidence
- Migration: `plate_face_cache` Spalten `identity_method TEXT`, `min_confidence NUMERIC`, `cross_check_result TEXT`
- Memory: `mem/architecture/lipsync/v133-per-character-identity-matching.md` + Index-Eintrag

**Kosten-Impact:**
- 4 Gemini-Calls statt 1 pro Szene → ~$0.004 statt $0.001 → vernachlässigbar.
- Spart aber ~30€ Re-Renders pro Voice-Swap-Vorfall.

**Backward-Compat:**
- Single-Speaker und 2-Speaker-Pfade verhalten sich identisch (kein Regression-Risk).
- Nur 3+ Speaker bekommen die neue Pipeline aktiviert.

## Was NICHT in v133

- Sync.so-Pipeline-Änderungen (läuft bereits korrekt).
- Watchdog/Retry-Logik (v131.8/v132 bleiben).
- Pre-Clip-Generation (v107) bleibt unverändert.

## Validierung

Nach Deploy: User rendert dieselbe 4-Sprecher-Szene neu mit "Sauber neu starten". Erwartung: Identity-Methode = `per-char-hungarian`, alle 4 Stimmen korrekt zugeordnet. Im Forensics-Panel sichtbar welche Confidence pro Charakter erzielt wurde.
